"""Bind the original-size DBS pages 1-22 visual proposals to source bytes."""

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
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-visual-proposals-part1-2026-10-15.json"

# Each listed page was inspected at original render size. These are proposals;
# product decisions are not yet saved.
VISUAL_FEATURES = {
    14: "DBS: Our Year infographic tiles show performance measures; most tile labels and values are not in successful text blocks.",
    17: "Figure 1 bar chart of individuals on the Barred Lists. Correction 1 on physical page 6 changes the colour key and final category wording; interpret the chart with that slip, not its unchanged legend alone.",
    18: "Governance structure diagram links Home Office, DBS, Board, Strategic Leadership Team and executive roles.",
    22: "Table 1 maps four strategic objectives to achieved and deferred or not completed actions, including footnotes.",
}
DECORATION_NOTES = {
    1: "Cover photograph and design; title and reporting period are successful text.",
    4: "Licence and publication text; no independent chart or table.",
    6: "Correction slip text, including Correction 1, is present in successful blocks; no independent visual data.",
    7: "Correction 2 and later correction text are present in successful blocks; no independent visual data.",
    9: "Contents text and decorative photograph; no independent chart or table.",
    10: "Full-page decorative photograph; page furniture remains in successful text.",
    11: "Chairman's foreword is readable text; no independent chart or table.",
    12: "Foreword continuation and decorative photograph; no independent chart or table.",
    13: "Foreword continuation and portrait/signature decoration; no independent chart or table.",
    15: "Performance report narrative and decorative photograph; no independent chart or table.",
    16: "Descriptions of check types and decorative photograph; no independent chart or table.",
    19: "Performance overview narrative; no independent chart or table.",
    20: "Full-page decorative photograph; page furniture remains in successful text.",
    21: "Performance overview narrative; no independent chart or table.",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    triage = json.loads(TRIAGE.read_text(encoding="utf-8"))
    review = json.loads((REVIEW / "review.json").read_text(encoding="utf-8"))
    extraction = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    document = extraction.get("documents", [extraction])[0]
    assert sha(SOURCE) == triage["sourceSha256"] == review["sourceSha256"]
    assert sha(ARTIFACT) == triage["extractionArtifactSha256"]
    assert sha(REVIEW / "review.json") == triage["renderPackageSha256"]
    pages = [record for record in review["records"] if record["unitIndex"] <= 22]
    assert [record["unitIndex"] for record in pages] == sorted(
        set(VISUAL_FEATURES) | set(DECORATION_NOTES))
    blocks = document["blocks"]
    page7_text = " ".join(block.get("text", "") for block in blocks
                          if block["unitIndex"] == 7 and block["quality"] == "success")
    for value in ("2,642,272", "2,657,121", "Correction 2:"):
        assert value in page7_text
    page6_text = " ".join(block.get("text", "") for block in blocks
                          if block["unitIndex"] == 6 and block["quality"] == "success")
    assert "Correction 1:" in page6_text

    judgments = []
    with pymupdf.open(SOURCE) as pdf:
        assert len(pdf) == 157
        for record in pages:
            page = record["unitIndex"]
            assert sha(REVIEW / record["imageFile"]) == record["reviewImageSha256"]
            successful = [block for block in blocks if block["unitIndex"] == page
                          and block["quality"] == "success" and block.get("text", "").strip()]
            decision = "evidence" if page in VISUAL_FEATURES else "decoration"
            assert successful or decision == "evidence"
            source_word_count = len(re.findall(r"\w+", pdf[page - 1].get_text()))
            extracted_word_count = len(re.findall(r"\w+", " ".join(
                block["text"] for block in successful)))
            if decision == "decoration":
                assert source_word_count == extracted_word_count, page
            judgments.append({
                "blockId": record["blockId"],
                "physicalPage": page,
                "originalRenderSha256": record["reviewImageSha256"],
                "originalSizeChecked": True,
                "proposal": decision,
                "visualFeature": VISUAL_FEATURES.get(page, ""),
                "note": DECORATION_NOTES.get(page, "Retain substantive visual content."),
                "successfulTextBlocksOnPage": len(successful),
                "sourceTextWordCount": source_word_count,
                "successfulExtractedTextWordCount": extracted_word_count,
                "productDecisionSaved": False,
            })

    result = {
        "schema": "ma24-g14-dbs-visual-proposals-part1-v1",
        "date": "2026-10-15",
        "scope": "Original-size page review for all 18 pending visual blocks on physical PDF pages 1-22; proposals only",
        "sourceSha256": sha(SOURCE),
        "extractionArtifactSha256": sha(ARTIFACT),
        "renderPackageSha256": sha(REVIEW / "review.json"),
        "priorTriageSha256": sha(TRIAGE),
        "judgments": judgments,
        "counts": {
            "reviewedPendingPages": len(judgments),
            "evidence": sum(item["proposal"] == "evidence" for item in judgments),
            "decoration": sum(item["proposal"] == "decoration" for item in judgments),
            "remainingPendingPages": len(review["records"]) - len(judgments),
        },
        "correctionRelationship": "Physical page 6 Correction 1 governs the unchanged Figure 1 legend on page 17; physical page 7 Correction 2 governs the unchanged Figure 2 year/value assignment on page 41. The page-7 correction text is complete in successful extraction blocks.",
        "textCheckBoundary": "For the 14 proposed decoration pages, the successful extracted text has the same word count as the PDF text layer. This checks completeness by count, not reading order or factual correctness; each page was also inspected at original size.",
        "finalWholePdfReview": False,
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    assert result["counts"] == {"reviewedPendingPages": 18, "evidence": 4,
                                "decoration": 14, "remainingPendingPages": 133}
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {result['counts']}")


if __name__ == "__main__":
    main()
