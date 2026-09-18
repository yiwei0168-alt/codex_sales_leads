"""Build an exact, source-hash-scoped visual review package for v3 units.

The package contains only exceptional units which do not already have a human
decision. PDF pages are rendered locally. PPTX/XLSX coordinates are emitted for
the companion Office export script so that no document body leaves the host.
"""

from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from pathlib import Path

import pypdfium2 as pdfium


EXCEPTIONAL_STATUSES = {"blank", "review-required", "failed"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="tmp/knowledge-v3-manifest.json")
    parser.add_argument("--artifact-dir", default="tmp/rag-v3-full")
    parser.add_argument("--output-dir", default="tmp/rag-v3-full-review")
    parser.add_argument("--scale", type=float, default=1.5)
    args = parser.parse_args()

    workspace = Path.cwd().resolve()
    artifact_dir = Path(args.artifact_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    if workspace not in artifact_dir.parents or workspace not in output_dir.parents:
        raise SystemExit("Review inputs and outputs must remain inside the workspace")
    if output_dir.exists():
        shutil.rmtree(output_dir)
    image_dir = output_dir / "images"
    image_dir.mkdir(parents=True)

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    source_by_sha = {source["sourceSha256"]: source for source in manifest["sources"]}
    items: list[dict] = []
    artifact_count = 0

    for artifact_path in sorted(artifact_dir.glob("*.json")):
        if len(artifact_path.stem) != 64:
            continue
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        source_sha = artifact["sourceSha256"]
        source_entry = source_by_sha.get(source_sha)
        if source_entry is None:
            raise SystemExit(f"Artifact source is absent from manifest: {source_sha}")
        artifact_count += 1
        storage_key = source_entry["storageKey"]
        source_path = (workspace / storage_key).resolve()
        if workspace not in source_path.parents or not source_path.is_file():
            raise SystemExit(f"Review source is unavailable: {storage_key}")
        chunks_by_unit: dict[int, list[str]] = {}
        for chunk in artifact.get("chunks", []):
            chunks_by_unit.setdefault(int(chunk["unitIndex"]), []).append(chunk.get("content", ""))

        unresolved = [
            unit for unit in artifact.get("units", [])
            if unit.get("status") in EXCEPTIONAL_STATUSES and not unit.get("humanReviewDecision")
        ]
        if not unresolved:
            continue

        document = pdfium.PdfDocument(str(source_path)) if source_path.suffix.lower() == ".pdf" else None
        try:
            for unit in unresolved:
                unit_index = int(unit["unitIndex"])
                review_id = f"{source_sha[:12]}-{artifact['unitType']}-{unit_index:04d}"
                image_path = image_dir / f"{review_id}.png"
                rendered = False
                if document is not None:
                    if unit_index < 1 or unit_index > len(document):
                        raise SystemExit(f"Unit outside PDF bounds: {storage_key}#{unit_index}")
                    page = document[unit_index - 1]
                    try:
                        page.render(scale=args.scale).to_pil().convert("RGB").save(image_path)
                    finally:
                        page.close()
                    rendered = True
                text = "\n\n".join(chunks_by_unit.get(unit_index, []))
                items.append({
                    "reviewId": review_id,
                    "sourceSha256": source_sha,
                    "storageKey": storage_key,
                    "sourcePath": str(source_path),
                    "sourceType": source_path.suffix.lower().lstrip("."),
                    "unitType": unit["unitType"],
                    "unitIndex": unit_index,
                    "status": unit["status"],
                    "reviewReason": unit.get("reviewReason"),
                    "textLength": unit.get("textLength", 0),
                    "contentSha256": unit.get("contentSha256"),
                    "extractedTextPreview": text[:1200],
                    "image": str(image_path.resolve()) if rendered else None,
                    "suggestedDecisions": [
                        "accept-candidate",
                        "decorative-no-body",
                        "ocr-review-required",
                        "source-replacement-required",
                    ],
                })
        finally:
            if document is not None:
                document.close()

    counts = Counter(f"{item['sourceType']}:{item['status']}" for item in items)
    package = {
        "schemaVersion": "docling-v3-full-review-package-1",
        "scope": "Exact source SHA-256 and unit coordinates only; decisions are never inherited.",
        "artifactCount": artifact_count,
        "manifestPhysicalSources": len(manifest["sources"]),
        "unresolvedUnits": len(items),
        "counts": dict(sorted(counts.items())),
        "items": items,
    }
    review_path = output_dir / "review-manifest.json"
    review_path.write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "manifest": str(review_path),
        "artifactCount": artifact_count,
        "unresolvedUnits": len(items),
        "renderedImages": sum(bool(item["image"]) for item in items),
        "officeUnits": sum(not item["image"] for item in items),
        "counts": package["counts"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
