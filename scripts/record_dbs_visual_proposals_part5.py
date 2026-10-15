"""Bind DBS physical pages 77-94 visual proposals to source bytes."""

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
         for n in (1, 2, 3, 4)]
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part5-2026-10-15.json"

VISUAL_FEATURES = {
    80: "Table 8 pairs each board member's role and tenure with attendance at board and six committee meetings.",
    84: "Five-level risk-rating legend pairs colour with likelihood thresholds and impact descriptions.",
    85: "Table 9 pairs twelve strategic risk IDs and titles with risk-appetite classes.",
    86: "Strategic risk matrix locates IDs by impact and likelihood and uses cell colour to communicate rating.",
    92: "Table 10 pairs internal audit reviews with months and opinions; adjacent legend defines four opinion grades.",
}
DECORATION_NOTES = {
    77: "Committee and people narrative; no independent chart or table.",
    78: "Full-page decorative photograph; no independent report data.",
    79: "People and quality committee narrative; no independent chart or table.",
    81: "Quality and remuneration committee narrative; no independent chart or table.",
    82: "Remuneration committee narrative with decorative photograph.",
    83: "Executive governance and internal control narrative; no independent chart or table.",
    87: "Strategic risk mitigations narrative; no independent chart or table.",
    88: "Strategic risk mitigations narrative; no independent chart or table.",
    89: "Full-page decorative photograph; no independent report data.",
    90: "Strategic risk mitigations and delegation narrative; no independent chart or table.",
    91: "Delegation, assurance and audit narrative; no independent chart or table.",
    93: "Financial management narrative with decorative photograph.",
    94: "Climate, whistleblowing and information-management narrative with signature decoration.",
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
    assert prior[-1]["priorPartSha256"]["3"] == sha(PARTS[2])
    assert prior[-1]["counts"]["remainingPendingPages"] == 79
    pages = [record for record in review["records"] if 77 <= record["unitIndex"] <= 94]
    assert [record["unitIndex"] for record in pages] == list(range(77, 95))
    assert set(VISUAL_FEATURES) | set(DECORATION_NOTES) == set(range(77, 95))
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
        "schema": "ma24-g14-dbs-visual-proposals-part5-v1",
        "date": "2026-10-15",
        "scope": "Original-size page review for all 18 pending visual blocks on physical PDF pages 77-94; proposals only",
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
        "cumulativeReviewedPendingPages": 90, "remainingPendingPages": 61,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {result['counts']}")


if __name__ == "__main__":
    main()
