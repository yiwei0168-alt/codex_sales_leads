"""Bind DBS physical pages 23-40 visual proposals to source bytes."""

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
PRIOR = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part1-2026-10-15.json"
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part2-2026-10-15.json"

# Each page was inspected at its original render size. These remain proposals.
VISUAL_FEATURES = {
    25: "Strategic objective 1 achievements table: promised actions and achieved status must stay associated by row.",
    26: "Strategic objective 1 achievements table continues with completed and not completed work.",
    29: "Strategic objective 2 achievements table associates commitments with outcomes.",
    30: "Strategic objective 2 achievements table continues across the page.",
    32: "Strategic objective 3 achievements table associates commitments with outcomes.",
    34: "Strategic objective 4 achievements table associates commitments with outcomes.",
    35: "Strategic objective 4 achievements table continues across the page.",
    36: "Strategic objective 4 achievements table continues across the page.",
    38: "Table 2 maps eleven published service standards to three years of results, 2024-25 targets and achieved status.",
}
DECORATION_NOTES = {
    23: "Strategic objective 1 introduction and decorative photograph; substantive wording is successful text.",
    24: "Full-page decorative photograph; no independent report data.",
    27: "Strategic objective 2 introduction and decorative photograph; substantive wording is successful text.",
    28: "Full-page decorative photograph; no independent report data.",
    31: "Strategic objective 3 introduction and decorative photograph; substantive wording is successful text.",
    33: "Strategic objective 4 introduction and decorative photograph; substantive wording is successful text.",
    37: "Chief Executive's performance narrative; no independent chart or table.",
    39: "Going-concern narrative and decorative photograph; no independent chart or table.",
    40: "Full-page decorative photograph; no independent report data.",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    triage = json.loads(TRIAGE.read_text(encoding="utf-8"))
    prior = json.loads(PRIOR.read_text(encoding="utf-8"))
    review = json.loads((REVIEW / "review.json").read_text(encoding="utf-8"))
    extraction = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    document = extraction.get("documents", [extraction])[0]
    assert sha(SOURCE) == triage["sourceSha256"] == review["sourceSha256"] == prior["sourceSha256"]
    assert sha(ARTIFACT) == triage["extractionArtifactSha256"] == prior["extractionArtifactSha256"]
    assert sha(REVIEW / "review.json") == triage["renderPackageSha256"] == prior["renderPackageSha256"]
    assert prior["counts"]["remainingPendingPages"] == 133
    pages = [record for record in review["records"] if 23 <= record["unitIndex"] <= 40]
    assert [record["unitIndex"] for record in pages] == list(range(23, 41))
    assert set(VISUAL_FEATURES) | set(DECORATION_NOTES) == set(range(23, 41))
    assert not (set(VISUAL_FEATURES) & set(DECORATION_NOTES))

    judgments = []
    with pymupdf.open(SOURCE) as pdf:
        assert len(pdf) == 157
        for record in pages:
            page = record["unitIndex"]
            assert sha(REVIEW / record["imageFile"]) == record["reviewImageSha256"]
            successful = [block for block in document["blocks"] if block["unitIndex"] == page
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
        "schema": "ma24-g14-dbs-visual-proposals-part2-v1",
        "date": "2026-10-15",
        "scope": "Original-size page review for all 18 pending visual blocks on physical PDF pages 23-40; proposals only",
        "sourceSha256": sha(SOURCE),
        "extractionArtifactSha256": sha(ARTIFACT),
        "renderPackageSha256": sha(REVIEW / "review.json"),
        "priorTriageSha256": sha(TRIAGE),
        "priorPart1Sha256": sha(PRIOR),
        "judgments": judgments,
        "counts": {
            "reviewedPendingPages": len(judgments),
            "evidence": sum(item["proposal"] == "evidence" for item in judgments),
            "decoration": sum(item["proposal"] == "decoration" for item in judgments),
            "cumulativeReviewedPendingPages": len(prior["judgments"]) + len(judgments),
            "remainingPendingPages": len(review["records"]) - len(prior["judgments"]) - len(judgments),
        },
        "textCheckBoundary": "For the nine proposed decoration pages, successful extracted text word counts equal PDF text-layer counts. This does not establish reading order or semantic correctness; all pages were inspected at original size.",
        "finalWholePdfReview": False,
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    assert result["counts"] == {
        "reviewedPendingPages": 18, "evidence": 9, "decoration": 9,
        "cumulativeReviewedPendingPages": 36, "remainingPendingPages": 115,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {result['counts']}")


if __name__ == "__main__":
    main()
