"""Bind DBS physical pages 113-130 visual proposals to source bytes."""

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
PARTS = [ROOT / f"docs/evidence/ma24-g14-dbs-visual-proposals-part{n}-2026-10-15.json"
         for n in (1, 2, 3, 4, 5)] + [
    ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part6-2026-10-16.json"]
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part7-2026-10-16.json"

VISUAL_FEATURES = {
    113: "Tables 17 and 18 associate staff headcounts with gender and age categories; retain row and year alignment.",
    114: "Tables 19, 20 and 21 associate staff headcounts with ethnicity, disability and sexual-orientation categories.",
    115: "Table 22 associates exit-package cost bands with current and parenthesized prior-year comparators.",
    116: "Table 23 groups off-payroll engagements by length at 31 March 2025.",
    117: "Tables 24 and 25 report new off-payroll engagements and board or senior-official responsibilities for 2024-25; distinguish the repeated 2023-24 tables on page 119.",
    118: "Table 26 reports facility time and pay-bill measures for 2024-25; distinguish the repeated 2023-24 table on page 120.",
    119: "Tables 24 and 25 repeat the layouts from page 117 for the 2023-24 comparator year, not the current year.",
    120: "Table 26 repeats the layout from page 118 for the 2023-24 comparator year, not the current year.",
    123: "Table 27 aligns DBS fees and charges with 2024-25 income, cost and recovery measures and a 2023-24 surplus comparator; preserve footnotes.",
    124: "Tables 28 and 29 use distinct paid-application and paid-plus-volunteer-application notional-cost denominators; preserve footnotes and column alignment.",
}
DECORATION_NOTES = {
    121: "Parliamentary Accountability and Audit Report opening narrative; no independent chart or table.",
    122: "Parliamentary accountability narrative and disclosures; no independent chart or table.",
    125: "Comptroller and Auditor General certificate opening narrative; no independent chart or table.",
    126: "Audit conclusions and other-information narrative; no independent chart or table.",
    127: "Accounting officer and auditor responsibilities narrative; no independent chart or table.",
    128: "Audit risk and procedure narrative; no independent chart or table.",
    129: "Audit response, report and signature narrative; no independent chart or table.",
    130: "Full-page decorative photograph; no independent report data.",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    triage = json.loads(TRIAGE.read_text(encoding="utf-8"))
    prior = [json.loads(path.read_text(encoding="utf-8")) for path in PARTS]
    review = json.loads((REVIEW / "review.json").read_text(encoding="utf-8"))
    extraction = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    blocks = extraction.get("documents", [extraction])[0]["blocks"]
    assert sha(SOURCE) == triage["sourceSha256"] == review["sourceSha256"] == prior[-1]["sourceSha256"]
    assert sha(ARTIFACT) == triage["extractionArtifactSha256"] == prior[-1]["extractionArtifactSha256"]
    assert sha(REVIEW / "review.json") == triage["renderPackageSha256"] == prior[-1]["renderPackageSha256"]
    assert prior[-1]["priorPartSha256"]["5"] == sha(PARTS[4])
    assert prior[-1]["counts"]["remainingPendingPages"] == 43
    pages = [record for record in review["records"] if 113 <= record["unitIndex"] <= 130]
    assert [record["unitIndex"] for record in pages] == list(range(113, 131))
    assert set(VISUAL_FEATURES) | set(DECORATION_NOTES) == set(range(113, 131))
    assert not set(VISUAL_FEATURES) & set(DECORATION_NOTES)

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
        "schema": "ma24-g14-dbs-visual-proposals-part7-v1",
        "date": "2026-10-16",
        "scope": "Original-size page review for all 18 pending visual blocks on physical PDF pages 113-130; proposals only",
        "sourceSha256": sha(SOURCE),
        "extractionArtifactSha256": sha(ARTIFACT),
        "renderPackageSha256": sha(REVIEW / "review.json"),
        "priorTriageSha256": sha(TRIAGE),
        "priorPartSha256": {str(n): sha(path) for n, path in enumerate(PARTS, 1)},
        "judgments": judgments,
        "counts": {
            "reviewedPendingPages": len(judgments),
            "evidence": sum(item["proposal"] == "evidence" for item in judgments),
            "decoration": sum(item["proposal"] == "decoration" for item in judgments),
            "cumulativeReviewedPendingPages": sum(len(item["judgments"]) for item in prior) + len(judgments),
            "remainingPendingPages": len(review["records"]) - sum(len(item["judgments"]) for item in prior) - len(judgments),
        },
        "crossPageRelationship": "Tables 24-26 appear twice: pages 117-118 cover 2024-25 and pages 119-120 cover 2023-24. The repeated table numbers must retain their year context. Tables 28 and 29 on page 124 use distinct application denominators.",
        "textCheckBoundary": "For eight proposed decoration pages, successful extracted text word counts equal PDF text-layer counts. This does not establish reading order or semantic correctness; all pages were inspected at original size.",
        "finalWholePdfReview": False,
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    assert result["counts"] == {
        "reviewedPendingPages": 18, "evidence": 10, "decoration": 8,
        "cumulativeReviewedPendingPages": 126, "remainingPendingPages": 25,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {result['counts']}")


if __name__ == "__main__":
    main()
