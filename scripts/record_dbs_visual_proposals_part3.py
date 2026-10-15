"""Bind DBS physical pages 41-58 visual proposals to source bytes."""

import hashlib
import json
import re
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp/ma24-independent-quarantine/dbs-2024-25-ara-corrected.pdf"
ARTIFACT = ROOT / "tmp/ma24-independent-quarantine/dbs-2024-25-ara-corrected.layout-extraction.json"
REVIEW = ROOT / "tmp/ma24-independent-quarantine/dbs-2024-25-visual-review"
TRIAGE = ROOT / "docs/evidence/ma24-g14-dbs-whole-pdf-visual-triage-2026-10-15.json"
PART1 = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part1-2026-10-15.json"
PART2 = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part2-2026-10-15.json"
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part3-2026-10-15.json"

VISUAL_FEATURES = {
    41: "Figure 2 visually assigns Basic DBS checks 2,642,272 to 2021-22 and 2,657,121 to 2022-23. Correction 2 on physical page 7 explicitly reverses these year/value assignments; preserve both pages and do not treat the old labels as corrected counts.",
    42: "Table 3 pairs certificate types with 2023-24 and 2024-25 issue-time targets, attainment and averages.",
    44: "Figure 3 stacked bars compare disclosure-information, autobarring and referral routes across three years.",
    45: "Figure 4 line chart compares monthly case closures in 2023-24 and 2024-25.",
    46: "Figures 5 and 6 plot monthly aged cases and barring work in progress against operating thresholds.",
    47: "Table 4 pairs appeal outcomes with 2023-24, 2024-25 and percentage change, including explanatory footnotes.",
    49: "Table 5 pairs complaint counts by year; Figure 7 distinguishes complaint resolution and escalation series.",
    58: "Figure 8 distinguishes cumulative inflation and price-reduction savings from annual components for 2018-25.",
}
DECORATION_NOTES = {
    43: "Disclosure and barring narrative with decorative photograph; no independent chart or table.",
    48: "Full-page decorative photograph; no independent report data.",
    50: "Customer and external engagement narrative; no independent chart or table.",
    51: "External engagement and registered-bodies narrative with decorative photograph.",
    52: "Registered-bodies, external inquiries and digital-identity narrative; no independent chart or table.",
    53: "Quality-account and safeguarding narrative; no independent chart or table.",
    54: "Quality-assurance narrative with decorative photograph; no independent chart or table.",
    55: "Full-page decorative photograph; no independent report data.",
    56: "Quality-account and user-experience narrative; no independent chart or table.",
    57: "Financial-performance and balance-sheet narrative; Figure 8 is on physical page 58.",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    triage = json.loads(TRIAGE.read_text(encoding="utf-8"))
    part1 = json.loads(PART1.read_text(encoding="utf-8"))
    part2 = json.loads(PART2.read_text(encoding="utf-8"))
    review = json.loads((REVIEW / "review.json").read_text(encoding="utf-8"))
    extraction = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    blocks = extraction.get("documents", [extraction])[0]["blocks"]
    assert sha(SOURCE) == triage["sourceSha256"] == review["sourceSha256"] == part2["sourceSha256"]
    assert sha(ARTIFACT) == triage["extractionArtifactSha256"] == part2["extractionArtifactSha256"]
    assert sha(REVIEW / "review.json") == triage["renderPackageSha256"] == part2["renderPackageSha256"]
    assert part2["priorPart1Sha256"] == sha(PART1)
    assert part2["counts"]["remainingPendingPages"] == 115
    pages = [record for record in review["records"] if 41 <= record["unitIndex"] <= 58]
    assert [record["unitIndex"] for record in pages] == list(range(41, 59))
    assert set(VISUAL_FEATURES) | set(DECORATION_NOTES) == set(range(41, 59))
    assert not set(VISUAL_FEATURES) & set(DECORATION_NOTES)

    page7_text = " ".join(block.get("text", "") for block in blocks
                          if block["unitIndex"] == 7 and block["quality"] == "success")
    for token in ("Correction 2:", "2,657,121", "2,642,272"):
        assert token in page7_text

    judgments = []
    with pymupdf.open(SOURCE) as pdf:
        assert len(pdf) == 157
        for record in pages:
            page = record["unitIndex"]
            assert sha(REVIEW / record["imageFile"]) == record["reviewImageSha256"]
            successful = [block for block in blocks if block["unitIndex"] == page
                          and block["quality"] == "success" and block.get("text", "").strip()]
            decision = "evidence" if page in VISUAL_FEATURES else "decoration"
            source_words = len(re.findall(r"\w+", pdf[page - 1].get_text()))
            extracted_words = len(re.findall(r"\w+", " ".join(block["text"] for block in successful)))
            if decision == "decoration":
                assert source_words == extracted_words, page
            judgments.append({
                "blockId": record["blockId"],
                "physicalPage": page,
                "originalRenderSha256": record["reviewImageSha256"],
                "originalSizeChecked": True,
                "proposal": decision,
                "visualFeature": VISUAL_FEATURES.get(page, ""),
                "note": DECORATION_NOTES.get(page, "Retain substantive visual content."),
                "successfulTextBlocksOnPage": len(successful),
                "sourceTextWordCount": source_words,
                "successfulExtractedTextWordCount": extracted_words,
                "productDecisionSaved": False,
            })

    result = {
        "schema": "ma24-g14-dbs-visual-proposals-part3-v1",
        "date": "2026-10-15",
        "scope": "Original-size page review for all 18 pending visual blocks on physical PDF pages 41-58; proposals only",
        "sourceSha256": sha(SOURCE),
        "extractionArtifactSha256": sha(ARTIFACT),
        "renderPackageSha256": sha(REVIEW / "review.json"),
        "priorTriageSha256": sha(TRIAGE),
        "priorPart1Sha256": sha(PART1),
        "priorPart2Sha256": sha(PART2),
        "judgments": judgments,
        "counts": {
            "reviewedPendingPages": len(judgments),
            "evidence": sum(item["proposal"] == "evidence" for item in judgments),
            "decoration": sum(item["proposal"] == "decoration" for item in judgments),
            "cumulativeReviewedPendingPages": len(part1["judgments"]) + len(part2["judgments"]) + len(judgments),
            "remainingPendingPages": len(review["records"]) - len(part1["judgments"]) - len(part2["judgments"]) - len(judgments),
        },
        "correctionRelationship": "Physical page 41 Figure 2 retains old year/value labels. Physical page 7 Correction 2 controls the corrected 2021-22 and 2022-23 Basic DBS check counts. Both pages must be cited for the draft conflict question.",
        "textCheckBoundary": "For ten proposed decoration pages, successful extracted text word counts equal PDF text-layer counts. This does not establish reading order or semantic correctness; all pages were inspected at original size.",
        "finalWholePdfReview": False,
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    assert result["counts"] == {
        "reviewedPendingPages": 18, "evidence": 8, "decoration": 10,
        "cumulativeReviewedPendingPages": 54, "remainingPendingPages": 97,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {result['counts']}")


if __name__ == "__main__":
    main()
