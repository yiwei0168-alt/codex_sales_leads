"""Bind DBS physical pages 131-148 visual proposals to source bytes."""

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
    ROOT / f"docs/evidence/ma24-g14-dbs-visual-proposals-part{n}-2026-10-16.json"
    for n in (6, 7)]
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part8-2026-10-16.json"

VISUAL_FEATURES = {
    131: "Statement of Comprehensive Net Expenditure aligns income, expenditure, note references, totals and two financial years; parentheses denote negative amounts.",
    132: "Statement of Financial Position aligns asset, liability and taxpayers' equity categories with 2024-25 and 2023-24 columns and note references.",
    133: "Statement of Cash Flows aligns operating, investing and financing flows with two years, note references and opening/closing balances.",
    134: "Statement of Changes in Taxpayers' Equity tracks general fund, revaluation reserve and total through two reporting years.",
    137: "Performance-obligations table maps four income streams to service descriptions, fulfilment and payment terms; preserve each row's column association.",
    141: "Operating-segment table maps five directorates to expenditure, revenue and net figures; retain the description-to-amount row association.",
    143: "Notes 3 and 4 compare staff and other operating cost categories across 2024-25 and 2023-24; preserve the professional-fees footnote.",
    144: "Note 5 compares five revenue streams and total revenue across 2024-25 and 2023-24.",
    145: "Note 6 property, plant and equipment table tracks asset classes, cost, depreciation, net book value and financing for the current year.",
    146: "Note 6 comparative asset table continues the same classes on page 145. Preserve its printed date labels as source text; some labels appear inconsistent with the comparative-year context and require separate review before interpretation.",
    147: "Note 7 intangible-assets table tracks asset classes, cost, amortisation and net book value for the current year. Preserve its printed final net-book-value date label pending separate review.",
    148: "Note 7 comparative intangible-assets table continues the same classes on page 147; keep the year context and row alignment.",
}
DECORATION_NOTES = {
    135: "Accounting policies and going-concern narrative; no independent chart or table.",
    136: "Accounting policy and estimation narrative; no independent chart or table.",
    138: "Income, pension, VAT and financial-instrument policy narrative; no independent chart or table.",
    139: "Financial-instrument, lease and provisions policy narrative; no independent chart or table.",
    140: "Inventory and standards narrative with decorative photograph; operating-segment table follows on page 141.",
    142: "Full-page decorative photograph; no independent report data.",
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
    assert prior[-1]["priorPartSha256"]["6"] == sha(PARTS[5])
    assert prior[-1]["counts"]["remainingPendingPages"] == 25
    pages = [record for record in review["records"] if 131 <= record["unitIndex"] <= 148]
    assert [record["unitIndex"] for record in pages] == list(range(131, 149))
    assert set(VISUAL_FEATURES) | set(DECORATION_NOTES) == set(range(131, 149))
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
        "schema": "ma24-g14-dbs-visual-proposals-part8-v1",
        "date": "2026-10-16",
        "scope": "Original-size page review for all 18 pending visual blocks on physical PDF pages 131-148; proposals only",
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
        "crossPageRelationship": "Notes 6 and 7 have current-year and comparator pages (145-146 and 147-148). Asset-class columns must remain aligned across each pair. Printed date labels that appear inconsistent are retained verbatim, not silently corrected.",
        "textCheckBoundary": "For six proposed decoration pages, successful extracted text word counts equal PDF text-layer counts. This does not establish reading order or semantic correctness; all pages were inspected at original size.",
        "finalWholePdfReview": False,
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    assert result["counts"] == {
        "reviewedPendingPages": 18, "evidence": 12, "decoration": 6,
        "cumulativeReviewedPendingPages": 144, "remainingPendingPages": 7,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {result['counts']}")


if __name__ == "__main__":
    main()
