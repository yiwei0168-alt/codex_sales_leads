"""Run every unique physical source in a database-exported v3 manifest.

Parsing is local, resumable, and intentionally separated from database writes.
Each completed artifact is keyed by source hash and extractor version.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from time import perf_counter


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_decisions(path: Path) -> tuple[dict[tuple[str, int], str], str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    decisions: dict[tuple[str, int], str] = {}
    for source in payload["sources"]:
        sha = source["sourceSha256"]
        for unit in source["candidateUnits"]:
            decisions[(sha, int(unit))] = "accept-candidate"
        for unit in source["decorativeUnits"]:
            decisions[(sha, int(unit))] = "decorative-no-body"
    return decisions, payload["confirmedAt"]


def apply_decisions(artifact: dict, decisions: dict[tuple[str, int], str], confirmed_at: str) -> None:
    source_sha = artifact["sourceSha256"]
    for unit in artifact["units"]:
        key = (source_sha, int(unit["unitIndex"]))
        decision = decisions.get(key)
        if decision == "accept-candidate":
            if unit["status"] != "review-required":
                raise ValueError(f"Candidate decision no longer matches review-required unit: {key}")
            unit["humanReviewDecision"] = decision
            unit["reviewedAt"] = confirmed_at
        elif decision == "decorative-no-body":
            if unit["status"] not in ("blank", "review-required"):
                raise ValueError(f"Decorative decision unexpectedly contains parsed text: {key}")
            unit.update({
                "status": "blank",
                "reviewReason": "human-confirmed-decorative-no-body",
                "humanReviewDecision": decision,
                "reviewedAt": confirmed_at,
                "contentSha256": None,
                "textLength": 0,
            })
    artifact["reviewDecisionSet"] = "docling-v3-pilot-review-2026-09-18"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="tmp/knowledge-v3-manifest.json")
    parser.add_argument("--output-dir", default="tmp/rag-v3-full")
    parser.add_argument("--decisions", default="config/knowledge/docling-review-decisions.v3.json")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--shard-index", type=int, default=0)
    parser.add_argument("--shard-count", type=int, default=1)
    args = parser.parse_args()

    workspace = Path.cwd().resolve()
    output_dir = Path(args.output_dir).resolve()
    if workspace not in output_dir.parents:
        raise SystemExit("Full extraction output must remain inside the workspace")
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    profile = json.loads(Path("config/knowledge/docling-profile.v3.json").read_text(encoding="utf-8"))
    decisions, confirmed_at = load_decisions(Path(args.decisions))
    if args.shard_count < 1 or args.shard_index < 0 or args.shard_index >= args.shard_count:
        raise SystemExit("Shard index must be within [0, shard-count)")
    all_sources = manifest["sources"][: args.limit] if args.limit else manifest["sources"]
    sources = [(index, source) for index, source in enumerate(all_sources, start=1)
               if (index - 1) % args.shard_count == args.shard_index]
    output_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []
    failures: list[dict] = []
    for shard_position, (index, entry) in enumerate(sources, start=1):
        storage_key = entry["storageKey"]
        source = workspace / storage_key
        expected_sha = entry["sourceSha256"]
        if not source.is_file() or sha256_file(source) != expected_sha:
            failures.append({"index": index, "storageKey": storage_key, "reason": "source-missing-or-changed"})
            print(json.dumps({"index": index, "status": "failed", "storageKey": storage_key, "reason": failures[-1]["reason"]}), flush=True)
            continue
        artifact_path = output_dir / f"{expected_sha}.json"
        if artifact_path.is_file():
            parsed = json.loads(artifact_path.read_text(encoding="utf-8"))
            if parsed.get("sourceSha256") == expected_sha and parsed.get("extractorVersion") == profile["extractorVersion"]:
                try:
                    apply_decisions(parsed, decisions, confirmed_at)
                except ValueError as error:
                    failures.append({"index": index, "storageKey": storage_key, "reason": "review-decision-mismatch", "detail": str(error)})
                    artifact_path.unlink(missing_ok=True)
                    print(json.dumps({"index": index, "shardPosition": shard_position, "shardTotal": len(sources), "status": "failed", "storageKey": storage_key, "reason": "review-decision-mismatch"}, ensure_ascii=False), flush=True)
                    continue
                artifact_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
                results.append(parsed)
                print(json.dumps({"index": index, "shardPosition": shard_position, "shardTotal": len(sources), "status": "checkpoint", "storageKey": storage_key}), flush=True)
                continue

        started = perf_counter()
        completed = subprocess.run(
            [sys.executable, "scripts/extract_knowledge_docling_v3.py", "--input", str(source), "--output", str(artifact_path)],
            cwd=workspace, text=True, capture_output=True, encoding="utf-8", errors="replace",
        )
        if completed.returncode != 0:
            failures.append({
                "index": index, "storageKey": storage_key, "reason": "extractor-failed",
                "stderrTail": completed.stderr[-2000:],
            })
            print(json.dumps({"index": index, "shardPosition": shard_position, "shardTotal": len(sources), "status": "failed", "storageKey": storage_key, "reason": "extractor-failed"}, ensure_ascii=False), flush=True)
            continue
        parsed = json.loads(artifact_path.read_text(encoding="utf-8"))
        try:
            apply_decisions(parsed, decisions, confirmed_at)
        except ValueError as error:
            failures.append({"index": index, "storageKey": storage_key, "reason": "review-decision-mismatch", "detail": str(error)})
            artifact_path.unlink(missing_ok=True)
            print(json.dumps({"index": index, "shardPosition": shard_position, "shardTotal": len(sources), "status": "failed", "storageKey": storage_key, "reason": "review-decision-mismatch"}, ensure_ascii=False), flush=True)
            continue
        artifact_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
        results.append(parsed)
        print(json.dumps({
            "index": index, "shardPosition": shard_position, "shardTotal": len(sources), "status": parsed["conversionStatus"], "storageKey": storage_key,
            "units": len(parsed["units"]), "chunks": len(parsed["chunks"]),
            "wallMs": round((perf_counter() - started) * 1000),
        }, ensure_ascii=False), flush=True)

    summary = {
        "schemaVersion": "knowledge-v3-full-extraction-1",
        "manifestAssets": manifest["registeredAssets"],
        "manifestPhysicalSources": len(all_sources),
        "shardIndex": args.shard_index,
        "shardCount": args.shard_count,
        "inputPhysicalSources": len(sources),
        "validPhysicalSources": len(results),
        "failedPhysicalSources": len(failures),
        "units": sum(len(item["units"]) for item in results),
        "successUnits": sum(sum(unit["status"] == "success" for unit in item["units"]) for item in results),
        "blankUnits": sum(sum(unit["status"] == "blank" for unit in item["units"]) for item in results),
        "reviewRequiredUnits": sum(sum(unit["status"] == "review-required" for unit in item["units"]) for item in results),
        "chunks": sum(len(item["chunks"]) for item in results),
        "latencyMs": sum(item["metrics"]["latencyMs"] for item in results),
        "localOcrModelCalls": sum(item["metrics"].get("localOcrModelCalls", 0) for item in results),
        "retries": 0,
        "externalDocumentCalls": 0,
        "modelCalls": 0,
        "embeddingCalls": 0,
        "failures": failures,
    }
    summary_name = "summary.json" if args.shard_count == 1 else f"summary-shard-{args.shard_index}-of-{args.shard_count}.json"
    (output_dir / summary_name).write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    if failures:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
