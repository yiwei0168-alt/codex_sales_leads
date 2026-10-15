"""Bind final DBS physical pages 149-155 visual proposals to source bytes."""

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
    for n in (6, 7, 8)]
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part9-2026-10-16.json"

VISUAL_FEATURES = {
    149: "Notes 9-11 compare inventories, receivables and cash balances across 2024-25 and 2023-24; keep each amount with its note and year.",
    150: "Note 12 compares trade payables and current-liability categories across two columns. The second printed header reads 2023-22, inconsistent with surrounding comparator context; retain the source label pending separate review.",
    151: "Note 13 provisions table tracks 2024-25 balances, movements and maturity by dilapidations, legal costs, other provision and total.",
    152: "Note 13 comparative provisions table continues page 151 for 2023-24 with the same category columns and movement rows.",
    153: "Note 14 related-party table maps parties, two financial years, amounts and transaction descriptions by row.",
    154: "Notes 15-16 distinguish operating-lease commitments from finance-lease obligations and their two-year maturity and movement figures.",
    155: "Note 17 financial commitments table groups 2024-25 amounts by maturity; notes 18-20 are prose and do not add independent visual data.",
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
    assert prior[-1]["priorPartSha256"]["7"] == sha(PARTS[6])
    assert prior[-1]["counts"]["remainingPendingPages"] == 7
    pages = [record for record in review["records"] if 149 <= record["unitIndex"] <= 155]
    assert [record["unitIndex"] for record in pages] == list(range(149, 156))
    assert set(VISUAL_FEATURES) == set(range(149, 156))

    judgments = []
    with pymupdf.open(SOURCE) as pdf:
        assert len(pdf) == 157
        for record in pages:
            page = record["unitIndex"]
            assert sha(REVIEW / record["imageFile"]) == record["reviewImageSha256"]
            successful = [block for block in blocks if block["unitIndex"] == page
                          and block["quality"] == "success" and block.get("text", "").strip()]
            source_words = len(re.findall(r"\w+", pdf[page - 1].get_text()))
            extracted_words = len(re.findall(r"\w+", " ".join(block["text"] for block in successful)))
            judgments.append({
                "blockId": record["blockId"],
                "physicalPage": page,
                "originalRenderSha256": record["reviewImageSha256"],
                "originalSizeChecked": True,
                "proposal": "evidence",
                "visualFeature": VISUAL_FEATURES[page],
                "note": "Retain substantive visual content.",
                "successfulTextBlocksOnPage": len(successful),
                "sourceTextWordCount": source_words,
                "successfulExtractedTextWordCount": extracted_words,
                "productDecisionSaved": False,
            })

    result = {
        "schema": "ma24-g14-dbs-visual-proposals-part9-v1",
        "date": "2026-10-16",
        "scope": "Original-size page review for the final seven pending visual blocks on physical PDF pages 149-155; proposals only",
        "sourceSha256": sha(SOURCE),
        "extractionArtifactSha256": sha(ARTIFACT),
        "renderPackageSha256": sha(REVIEW / "review.json"),
        "priorTriageSha256": sha(TRIAGE),
        "priorPartSha256": {str(n): sha(path) for n, path in enumerate(PARTS, 1)},
        "judgments": judgments,
        "counts": {
            "reviewedPendingPages": len(judgments),
            "evidence": len(judgments),
            "decoration": 0,
            "cumulativeReviewedPendingPages": sum(len(item["judgments"]) for item in prior) + len(judgments),
            "remainingPendingPages": len(review["records"]) - sum(len(item["judgments"]) for item in prior) - len(judgments),
        },
        "crossPageRelationship": "Note 13 spans pages 151-152 with current-year and prior-year provisions in the same category columns. Page 150's printed comparative header is retained verbatim as a source discrepancy for later interpretation.",
        "textCheckBoundary": "All seven pages contain substantive tables, so no page was proposed as text-only decoration. Original-size inspection establishes proposal coverage, not product save/readback or semantic acceptance.",
        "finalWholePdfReview": True,
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    assert result["counts"] == {
        "reviewedPendingPages": 7, "evidence": 7, "decoration": 0,
        "cumulativeReviewedPendingPages": 151, "remainingPendingPages": 0,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {result['counts']}")


if __name__ == "__main__":
    main()
