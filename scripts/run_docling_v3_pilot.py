"""Run the fixed 30-file Docling pilot with resumable local checkpoints."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from time import perf_counter


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="config/knowledge/docling-pilot.v3.json")
    parser.add_argument("--output-dir", default="tmp/rag-v3-pilot-30")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    workspace = Path.cwd().resolve()
    manifest_path = Path(args.manifest).resolve()
    output_dir = Path(args.output_dir).resolve()
    if workspace not in output_dir.parents:
        raise SystemExit("Pilot output must remain inside the workspace")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assets = manifest["assets"][: args.limit] if args.limit else manifest["assets"]
    if len(set(assets)) != len(assets):
        raise SystemExit("Pilot manifest contains duplicate physical files")
    missing = [value for value in assets if not (workspace / value).is_file()]
    if missing:
        raise SystemExit(f"Pilot sources are missing: {missing!r}")

    output_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for index, storage_key in enumerate(assets, start=1):
        source = workspace / storage_key
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        artifact = output_dir / f"{index:02d}-{source_hash[:12]}.json"
        if artifact.is_file():
            parsed = json.loads(artifact.read_text(encoding="utf-8"))
            if parsed.get("sourceSha256") == source_hash:
                print(json.dumps({"index": index, "status": "checkpoint", "storageKey": storage_key}), flush=True)
                results.append(parsed)
                continue
        started = perf_counter()
        completed = subprocess.run(
            [sys.executable, "scripts/extract_knowledge_docling_v3.py", "--input", str(source), "--output", str(artifact)],
            cwd=workspace,
            text=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
        )
        if completed.returncode != 0:
            print(completed.stdout, end="")
            print(completed.stderr, file=sys.stderr, end="")
            raise SystemExit(f"Pilot extraction failed at {index}: {storage_key}")
        parsed = json.loads(artifact.read_text(encoding="utf-8"))
        results.append(parsed)
        print(json.dumps({
            "index": index,
            "status": parsed["conversionStatus"],
            "storageKey": storage_key,
            "units": len(parsed["units"]),
            "chunks": len(parsed["chunks"]),
            "wallMs": round((perf_counter() - started) * 1000),
        }, ensure_ascii=False), flush=True)

    summary = {
        "pilotKey": manifest["pilotKey"],
        "inputAssets": len(assets),
        "validAssets": sum(item["conversionStatus"] in ("success", "partial_success") for item in results),
        "units": sum(len(item["units"]) for item in results),
        "blankUnits": sum(sum(unit["status"] == "blank" for unit in item["units"]) for item in results),
        "reviewRequiredUnits": sum(sum(unit["status"] == "review-required" for unit in item["units"]) for item in results),
        "chunks": sum(len(item["chunks"]) for item in results),
        "latencyMs": sum(item["metrics"]["latencyMs"] for item in results),
        "retries": 0,
        "modelCalls": 0,
        "embeddingCalls": 0,
        "externalDocumentCalls": 0,
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
