"""Render PDF blank candidates and emit a small PPTX review manifest."""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf

workspace = Path.cwd().resolve()
pilot = json.loads(Path("config/knowledge/docling-pilot.v3.json").read_text(encoding="utf-8"))
artifact_dir = Path("tmp/rag-v3-pilot-30")
review_dir = Path("tmp/rag-v3-visual-review")
review_dir.mkdir(parents=True, exist_ok=True)
review_items = []

for index, storage_key in enumerate(pilot["assets"], start=1):
    artifact_path = next(artifact_dir.glob(f"{index:02d}-*.json"))
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    blank_units = [unit["unitIndex"] for unit in artifact["units"] if unit["status"] == "blank"]
    if not blank_units:
        continue
    source = workspace / storage_key
    item = {"index": index, "source": str(source), "blankUnits": blank_units, "images": []}
    if source.suffix.lower() == ".pdf":
        document = pymupdf.open(source)
        for unit_index in blank_units:
            output = review_dir / f"{index:02d}-page-{unit_index:03d}.png"
            document[unit_index - 1].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False).save(output)
            item["images"].append(str(output.resolve()))
        document.close()
    review_items.append(item)

manifest_path = review_dir / "blank-review-manifest.json"
manifest_path.write_text(json.dumps({"items": review_items}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"manifest": str(manifest_path), "items": len(review_items), "blankUnits": sum(len(item["blankUnits"]) for item in review_items)}, ensure_ascii=False))
