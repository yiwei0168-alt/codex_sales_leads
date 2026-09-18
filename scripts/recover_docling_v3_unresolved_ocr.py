"""Retry only unresolved zero-text units with higher-resolution local OCR.

This is an offline, resumable rescue pass. Recovered text stays candidate
evidence and the source unit stays review-required until an exact human decision
is recorded. Existing parsed text and decided decorative units are untouched.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
from transformers import AutoTokenizer

from extract_knowledge_docling_v3 import recover_local_ocr_text


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def chunk_candidate(text: str, tokenizer: HuggingFaceTokenizer, max_tokens: int) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    for line in [*text.splitlines(), ""]:
        proposed = "\n".join([*current, line]).strip()
        if current and tokenizer.count_tokens(proposed) > max_tokens:
            chunks.append("\n".join(current).strip())
            current = []
        if line.strip():
            current.append(line.strip())
    if current:
        chunks.append("\n".join(current).strip())
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="tmp/knowledge-v3-manifest.json")
    parser.add_argument("--artifact-dir", default="tmp/rag-v3-full")
    parser.add_argument("--profile", default="config/knowledge/docling-profile.v3.json")
    parser.add_argument("--pdf-scale", type=float, default=4.5)
    parser.add_argument("--text-score", type=float, default=0.15)
    parser.add_argument("--max-existing-chars", type=int, default=149)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    workspace = Path.cwd().resolve()
    artifact_dir = Path(args.artifact_dir).resolve()
    if workspace not in artifact_dir.parents:
        raise SystemExit("Artifact directory must remain inside the workspace")
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    profile = json.loads(Path(args.profile).read_text(encoding="utf-8"))
    source_by_sha = {source["sourceSha256"]: source for source in manifest["sources"]}
    artifacts_path = Path(profile["modelArtifacts"]["directory"]).resolve()
    base_tokenizer = AutoTokenizer.from_pretrained(
        profile["chunking"]["tokenizer"],
        cache_dir=artifacts_path / "tokenizers",
        local_files_only=True,
    )
    tokenizer = HuggingFaceTokenizer(tokenizer=base_tokenizer, max_tokens=int(profile["chunking"]["maxTokens"]))

    attempted = 0
    recovered = 0
    recovered_characters = 0
    added_chunks = 0
    sources_changed = 0
    unresolved: list[dict] = []
    not_improved: list[dict] = []
    improved: list[dict] = []
    for artifact_path in sorted(artifact_dir.glob("*.json")):
        if len(artifact_path.stem) != 64:
            continue
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        source_entry = source_by_sha.get(artifact.get("sourceSha256"))
        if source_entry is None:
            raise SystemExit(f"Artifact is absent from manifest: {artifact_path.name}")
        source = (workspace / source_entry["storageKey"]).resolve()
        changed = False
        source_recovered = 0
        for unit in artifact.get("units", []):
            if (
                unit.get("status") != "review-required"
                or int(unit.get("textLength", 0)) > args.max_existing_chars
                or unit.get("humanReviewDecision")
            ):
                continue
            attempted += 1
            existing_length = int(unit.get("textLength", 0))
            text = recover_local_ocr_text(
                source,
                int(unit["unitIndex"]),
                artifacts_path,
                pdf_scale=args.pdf_scale,
                text_score=args.text_score,
            )
            if not text.strip() or len(text.strip()) <= existing_length:
                if existing_length:
                    not_improved.append({
                        "sourceSha256": artifact["sourceSha256"],
                        "unitIndex": unit["unitIndex"],
                        "existingCharacters": existing_length,
                        "retryCharacters": len(text.strip()),
                    })
                    continue
                unresolved.append({
                    "sourceSha256": artifact["sourceSha256"],
                    "storageKey": source_entry["storageKey"],
                    "unitType": unit["unitType"],
                    "unitIndex": unit["unitIndex"],
                    "reviewReason": unit.get("reviewReason"),
                })
                continue
            text = text.strip()
            artifact["chunks"] = [
                chunk for chunk in artifact["chunks"]
                if not (
                    int(chunk.get("unitIndex", -1)) == int(unit["unitIndex"])
                    and chunk.get("evidenceStatus") == "candidate"
                    and any("OCR" in heading for heading in chunk.get("headingPath", []))
                )
            ]
            for index, chunk in enumerate(artifact["chunks"]):
                chunk["index"] = index
            recovered += 1
            source_recovered += 1
            recovered_characters += len(text)
            improved.append({
                "sourceSha256": artifact["sourceSha256"],
                "storageKey": source_entry["storageKey"],
                "unitType": unit["unitType"],
                "unitIndex": unit["unitIndex"],
                "previousCharacters": existing_length,
                "recoveredCharacters": len(text),
            })
            unit.update({
                "reviewReason": "local-high-resolution-ocr-candidate-requires-review",
                "contentSha256": sha256_text(text),
                "textLength": len(text),
            })
            for content in chunk_candidate(text, tokenizer, int(profile["chunking"]["maxTokens"])):
                artifact["chunks"].append({
                    "index": len(artifact["chunks"]),
                    "headingPath": ["High-resolution OCR review required"],
                    "unitType": unit["unitType"],
                    "unitIndex": unit["unitIndex"],
                    "content": content,
                    "canonicalEmbeddingText": content,
                    "tokenEstimate": tokenizer.count_tokens(content),
                    "contentSha256": sha256_text(content),
                    "evidenceStatus": "candidate",
                })
                added_chunks += 1
            changed = True
        if changed:
            sources_changed += 1
            metrics = artifact.setdefault("metrics", {})
            metrics["highResolutionOcrCalls"] = metrics.get("highResolutionOcrCalls", 0) + source_recovered
            metrics["highResolutionOcrProfile"] = {
                "pdfScale": args.pdf_scale,
                "textScore": args.text_score,
                "remoteServices": False,
            }
            metrics["chunks"] = len(artifact["chunks"])
            if args.write:
                temporary = artifact_path.with_suffix(".json.tmp")
                temporary.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
                temporary.replace(artifact_path)

    print(json.dumps({
        "mode": "local-write" if args.write else "dry-run-read-only",
        "attemptedUnits": attempted,
        "recoveredUnits": recovered,
        "recoveredCharacters": recovered_characters,
        "addedCandidateChunks": added_chunks,
        "sourcesChanged": sources_changed,
        "improved": improved,
        "remainingZeroTextUnits": len(unresolved),
        "remaining": unresolved,
        "notImprovedUnits": len(not_improved),
        "notImproved": not_improved,
        "externalCalls": 0,
        "paidCalls": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
