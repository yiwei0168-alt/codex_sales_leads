"""Recheck existing pilot blank candidates with the v3.0.1 unit classifier."""

from __future__ import annotations

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
from extract_knowledge_docling_v3 import classify_empty_unit  # noqa: E402

pilot = json.loads(Path("config/knowledge/docling-pilot.v3.json").read_text(encoding="utf-8"))
artifact_dir = Path("tmp/rag-v3-pilot-30")
outcomes = []
for index, storage_key in enumerate(pilot["assets"], start=1):
    artifact = json.loads(next(artifact_dir.glob(f"{index:02d}-*.json")).read_text(encoding="utf-8"))
    for unit in artifact["units"]:
        if unit["status"] != "blank":
            continue
        status, reason, visual_ratio = classify_empty_unit(Path(storage_key), unit["unitIndex"])
        outcomes.append({
            "assetIndex": index,
            "unitIndex": unit["unitIndex"],
            "status": status,
            "reason": reason,
            "visualContentRatio": visual_ratio,
        })

summary = {
    "candidates": len(outcomes),
    "reviewRequired": sum(item["status"] == "review-required" for item in outcomes),
    "confirmedBlank": sum(item["status"] == "blank" for item in outcomes),
    "outcomes": outcomes,
}
print(json.dumps(summary, ensure_ascii=False, indent=2))
if summary["reviewRequired"] != 29 or summary["confirmedBlank"] != 0:
    raise SystemExit("Pilot blank classification contract changed")
