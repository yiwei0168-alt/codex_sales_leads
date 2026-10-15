"""Bind DBS physical pages 59-76 visual proposals to source bytes."""

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
         for n in (1, 2, 3)]
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part4-2026-10-15.json"

VISUAL_FEATURES = {
    59: "Figures 9 and 10 use labelled bubbles to pair income and spending categories with amounts; several values sit inside the bubbles.",
    62: "Table 6 associates sustainability metrics and units with six reporting years and a restatement note.",
    63: "Table 7 associates Greening Government Commitment targets with measured performance, achievement status, exceptions and the baseline footnote.",
    70: "Figure 11 combines board gender-diversity counts with a separate tenure-length bar chart.",
    72: "Figure 12 connects ministers and HOSU, the DBS Board, SLT and their committees or groups by branches.",
}
DECORATION_NOTES = {
    60: "Financial-summary narrative and numerical text; no independent chart or table.",
    61: "Sustainability data-quality and commitment narrative; Tables 6 and 7 follow on pages 62-63.",
    64: "Climate disclosure narrative and bullets; no independent chart or table.",
    65: "Sustainability narrative, signature and decorative photograph; no independent chart or table.",
    66: "Full-page recycling photograph; no independent report data.",
    67: "Accountability-report heading and narrative with credited decorative photograph.",
    68: "Governance narrative and decorative photographs; no independent chart or table.",
    69: "Accounting Officer responsibilities narrative; no independent chart or table.",
    71: "Board governance narrative with decorative photograph; no independent chart or table.",
    73: "Board work and effectiveness narrative; no independent chart or table.",
    74: "Governance framework and committee narrative; no independent chart or table.",
    75: "Committee activities narrative with decorative photograph; no independent chart or table.",
    76: "Committee activities narrative; no independent chart or table.",
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
    assert prior[-1]["priorPart2Sha256"] == sha(PARTS[1])
    assert prior[-1]["counts"]["remainingPendingPages"] == 97
    pages = [record for record in review["records"] if 59 <= record["unitIndex"] <= 76]
    assert [record["unitIndex"] for record in pages] == list(range(59, 77))
    assert set(VISUAL_FEATURES) | set(DECORATION_NOTES) == set(range(59, 77))
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
        "schema": "ma24-g14-dbs-visual-proposals-part4-v1",
        "date": "2026-10-15",
        "scope": "Original-size page review for all 18 pending visual blocks on physical PDF pages 59-76; proposals only",
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
        "textCheckBoundary": "For thirteen proposed decoration pages, successful extracted text word counts equal PDF text-layer counts. This does not establish reading order or semantic correctness; all pages were inspected at original size.",
        "finalWholePdfReview": False,
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    assert result["counts"] == {
        "reviewedPendingPages": 18, "evidence": 5, "decoration": 13,
        "cumulativeReviewedPendingPages": 72, "remainingPendingPages": 79,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {result['counts']}")


if __name__ == "__main__":
    main()
