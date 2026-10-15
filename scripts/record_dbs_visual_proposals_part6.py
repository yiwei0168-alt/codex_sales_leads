"""Bind DBS physical pages 95-112 visual proposals to source bytes."""

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
         for n in (1, 2, 3, 4, 5)]
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part6-2026-10-16.json"

VISUAL_FEATURES = {
    101: "Table 11 associates non-executive directors with two years of salary, benefits-in-kind, totals and the audited footnotes.",
    103: "Table 12 begins a two-page audited executive-director salary table; this page contains names, roles, salary and bonus columns.",
    104: "Table 12 continues the same rows with pension, benefits-in-kind and total columns plus numbered footnotes; preserve the cross-page row alignment with page 103.",
    105: "Table 13 associates directors with accrued pension, annual increase, CETV at two dates and real CETV increase.",
    108: "Tables 14.1 and 14.2 separately compare highest-paid director total remuneration and salary-only ratios to workforce percentiles across two years.",
    109: "Table 15 associates staff cost categories with permanent, other and prior-year total columns.",
    110: "Table 16 gives three years of headcount by employment type; Figure 13 plots monthly rolling sickness days.",
}
DECORATION_NOTES = {
    95: "Remuneration and staff report opening narrative; no independent chart or table.",
    96: "Wellbeing, leadership and reward narrative; no independent chart or table.",
    97: "Reward and future-outlook narrative with decorative photograph.",
    98: "Equality, diversity and inclusion narrative; no independent chart or table.",
    99: "Remuneration policy narrative; Table 11 follows on page 101.",
    100: "Full-page decorative photograph; no independent report data.",
    102: "Full-page decorative photograph; no independent report data.",
    106: "Civil Service pension and CETV explanatory narrative; no independent chart or table.",
    107: "Fair pay disclosure narrative with decorative photograph; comparison tables follow on page 108.",
    111: "Employee offer, equality duty and customer narrative; no independent chart or table.",
    112: "Gender pay gap and accessibility narrative with decorative photograph.",
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
    assert prior[-1]["priorPartSha256"]["4"] == sha(PARTS[3])
    assert prior[-1]["counts"]["remainingPendingPages"] == 61
    pages = [record for record in review["records"] if 95 <= record["unitIndex"] <= 112]
    assert [record["unitIndex"] for record in pages] == list(range(95, 113))
    assert set(VISUAL_FEATURES) | set(DECORATION_NOTES) == set(range(95, 113))
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
        "schema": "ma24-g14-dbs-visual-proposals-part6-v1",
        "date": "2026-10-16",
        "scope": "Original-size page review for all 18 pending visual blocks on physical PDF pages 95-112; proposals only",
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
        "crossPageRelationship": "The audited director remuneration Table 12 spans physical pages 103-104. Names and salary/bonus columns on page 103 must remain aligned by row with pension, benefits and totals on page 104.",
        "textCheckBoundary": "For eleven proposed decoration pages, successful extracted text word counts equal PDF text-layer counts. This does not establish reading order or semantic correctness; all pages were inspected at original size.",
        "finalWholePdfReview": False,
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    assert result["counts"] == {
        "reviewedPendingPages": 18, "evidence": 7, "decoration": 11,
        "cumulativeReviewedPendingPages": 108, "remainingPendingPages": 43,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {result['counts']}")


if __name__ == "__main__":
    main()
