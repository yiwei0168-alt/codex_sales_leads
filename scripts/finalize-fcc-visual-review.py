"""Bind the FCC 26-55 conservative visual decisions to the reviewed original."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW_DIR = ROOT / "tmp/ma24-independent-quarantine/fcc-26-55-visual-review"
REVIEW_PATH = REVIEW_DIR / "review.json"
SOURCE_PATH = ROOT / "tmp/ma24-independent-candidates/fcc-26-55.pdf"
EXTRACTION_PATH = ROOT / "tmp/ma24-independent-quarantine/fcc-26-55.layout-v2.0.10.extraction.json"
OUTPUT_PATH = ROOT / "docs/evidence/ma24-g14-fcc-706-whole-pdf-visual-final-review-2026-10-15.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    review = read_json(REVIEW_PATH)
    proposals = [
        read_json(ROOT / f"docs/evidence/ma24-g14-fcc-706-visual-proposals-part{part}-2026-10-15.json")
        for part in range(1, 7)
    ]
    assert sha256(SOURCE_PATH) == review["sourceSha256"]
    assert all(p["sourceSha256"] == review["sourceSha256"] for p in proposals)
    assert all(p["extractionArtifactSha256"] == sha256(EXTRACTION_PATH) for p in proposals)
    assert all(p["renderPackageSha256"] == sha256(REVIEW_PATH) for p in proposals)
    triage = read_json(ROOT / "docs/evidence/ma24-g14-fcc-706-whole-pdf-visual-triage-2026-10-15.json")
    assert triage["privateReviewPackageSha256"] == sha256(REVIEW_PATH)
    assert triage["currentExtractorReplay"]["artifactSha256"] == sha256(EXTRACTION_PATH)
    assert triage["currentExtractorReplay"]["blockIdPageTypeTextQualityAndBBoxEqualToV2_0_9"]
    proposed = [entry for packet in proposals for entry in packet["judgments"]]
    assert [entry["physicalPage"] for entry in proposed] == list(range(1, 179))
    assert [entry["unitIndex"] for entry in review["records"]] == list(range(1, 179))

    # These 46 pages were inspected at original size after the six proposals.
    newly_checked = set(range(1, 17)) | set(range(33, 53)) | set(range(55, 65))
    judgments = []
    for entry, original in zip(proposed, review["records"], strict=True):
        page = entry["physicalPage"]
        image_path = REVIEW_DIR / original["imageFile"]
        assert entry["blockId"] == original["blockId"]
        assert entry["originalRenderSha256"] == original["reviewImageSha256"] == sha256(image_path)
        decision = entry["proposal"]
        full_size = entry["originalSizeChecked"] or page in newly_checked
        assert decision in {"evidence", "decoration"}
        if decision == "decoration":
            assert full_size and entry["successfulTextBlocksOnPage"] > 0
            evidence_text = ""
            note = "Original-size page checked: no separate chart, table, map or diagram; successful extracted text remains available."
        else:
            evidence_text = entry["visualFeature"]
            assert evidence_text
            note = (
                "Original-size page checked; retain page visual evidence."
                if full_size
                else "Contact-sheet triage identifies a table or figure; retain the whole page conservatively. Numerical interpretation still requires original-size source review."
            )
        judgments.append(
            {
                "blockId": entry["blockId"],
                "physicalPage": page,
                "originalRenderSha256": entry["originalRenderSha256"],
                "decision": decision,
                "evidenceText": evidence_text,
                "note": note,
                "successfulTextBlocksOnPage": entry["successfulTextBlocksOnPage"],
                "originalSizeChecked": full_size,
                "productDecisionSaved": False,
            }
        )

    counts = {
        "evidence": sum(item["decision"] == "evidence" for item in judgments),
        "decoration": sum(item["decision"] == "decoration" for item in judgments),
        "unresolved": 0,
        "evidenceOriginalSizeChecked": sum(
            item["decision"] == "evidence" and item["originalSizeChecked"] for item in judgments
        ),
        "evidenceContactSheetOnly": sum(
            item["decision"] == "evidence" and not item["originalSizeChecked"] for item in judgments
        ),
    }
    assert counts == {
        "evidence": 123,
        "decoration": 55,
        "unresolved": 0,
        "evidenceOriginalSizeChecked": 34,
        "evidenceContactSheetOnly": 89,
    }
    output = {
        "schema": "ma24-g14-fcc-706-whole-pdf-visual-final-review-v1",
        "date": "2026-10-15",
        "stage": "Conservative page-level decisions prepared for isolated product replay; no product decisions saved",
        "sourceSha256": review["sourceSha256"],
        "extractionArtifactSha256": sha256(EXTRACTION_PATH),
        "renderPackageExtractionArtifactSha256": review["extractionArtifactSha256"],
        "renderPackageSha256": sha256(REVIEW_PATH),
        "sourcePhysicalPages": 178,
        "visualReviewRecords": 178,
        "counts": counts,
        "reviewBoundary": (
            "All 55 decoration pages were checked at original size and retain successful text. "
            "All 123 pages with apparent figures or tables are retained as visual evidence. "
            "The 89 contact-sheet-only evidence pages have not had numerical content or table headings "
            "individually accepted at original size; page-level retention is conservative."
        ),
        "judgments": judgments,
        "privateGoldApprovedByThisReview": False,
        "g15ReadyForPaidCalls": False,
        "realDualArmRuns": 0,
        "g17ToG20Advanced": False,
    }
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{OUTPUT_PATH.relative_to(ROOT)}: {counts}")


if __name__ == "__main__":
    main()
