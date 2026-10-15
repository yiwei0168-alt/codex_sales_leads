"""Merge source-bound original-size amendments into the FCC 178-page review."""

import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence"
PRIOR = EVIDENCE / "ma24-g14-fcc-706-whole-pdf-visual-final-review-2026-10-15.json"
BATCHES = [EVIDENCE / f"ma24-g14-fcc-706-original-size-appendix-batch{i}-2026-10-16.json" for i in (1, 2, 3)]
OUTPUT = EVIDENCE / "ma24-g14-fcc-706-whole-pdf-visual-final-review-v2-2026-10-16.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    prior, batches = read(PRIOR), [read(p) for p in BATCHES]
    assert len(prior["judgments"]) == prior["sourcePhysicalPages"] == 178
    assert prior["counts"]["evidenceContactSheetOnly"] == 89
    assert all(batch["sourceSha256"] == prior["sourceSha256"] for batch in batches)
    assert all(batch["extractionArtifactSha256"] == prior["extractionArtifactSha256"] for batch in batches)
    assert all(batch["renderPackageSha256"] == prior["renderPackageSha256"] for batch in batches)
    assert all(batch["priorWholePdfReviewSha256"] == sha(PRIOR) for batch in batches)
    assert batches[1]["priorBatch1Sha256"] == batches[2]["priorBatch1Sha256"] == sha(BATCHES[0])
    assert batches[2]["priorBatch2Sha256"] == sha(BATCHES[1])
    amendments = {}
    for batch in batches:
        for row in batch["records"]:
            page = row["physicalPage"]
            assert page not in amendments
            amendments[page] = row
    assert len(amendments) == 89
    judgments = []
    for old in prior["judgments"]:
        row = old.copy()
        amendment = amendments.get(row["physicalPage"])
        if amendment:
            assert not row["originalSizeChecked"] and row["decision"] == amendment["priorDecision"]
            assert row["blockId"] == amendment["blockId"]
            assert row["originalRenderSha256"] == amendment["originalRenderSha256"]
            row["decision"] = amendment["reviewedDecision"]
            row["originalSizeChecked"] = True
            row["note"] = "Original-size page checked: " + amendment["finding"]
            if row["decision"] == "decoration":
                row["evidenceText"] = ""
            assert not amendment["productDecisionSaved"]
        judgments.append(row)
    assert {row["physicalPage"] for row in judgments} == set(range(1, 179))
    assert all(row["originalSizeChecked"] for row in judgments)
    assert all(not row["productDecisionSaved"] for row in judgments)
    counts = Counter(row["decision"] for row in judgments)
    assert counts == {"evidence": 122, "decoration": 56}
    assert judgments[75]["decision"] == "decoration" and judgments[75]["successfulTextBlocksOnPage"] == 3
    output = {
        "schema": "ma24-g14-fcc-706-whole-pdf-visual-final-review-v2",
        "date": "2026-10-16",
        "stage": "All 178 page types reviewed at original size; complete decision manifest prepared for isolated product replay",
        "sourceSha256": prior["sourceSha256"],
        "extractionArtifactSha256": prior["extractionArtifactSha256"],
        "renderPackageExtractionArtifactSha256": prior["renderPackageExtractionArtifactSha256"],
        "renderPackageSha256": prior["renderPackageSha256"],
        "priorWholePdfReviewSha256": sha(PRIOR),
        "amendmentBatchSha256": [sha(path) for path in BATCHES],
        "sourcePhysicalPages": prior["sourcePhysicalPages"],
        "visualReviewRecords": prior["visualReviewRecords"],
        "counts": {
            "evidence": counts["evidence"],
            "decoration": counts["decoration"],
            "unresolved": 0,
            "evidenceOriginalSizeChecked": counts["evidence"],
            "evidenceContactSheetOnly": 0,
            "originalSizePagesChecked": 178,
        },
        "reviewBoundary": "Page-level visual retention decisions only. Numeric cells require question-specific validation. Page 76 contains only the previous table's source-footnote continuation and successful extracted text; it has no independent visual evidence. Product decisions have not yet been saved.",
        "judgments": judgments,
        "privateGoldApprovedByThisReview": False,
        "g15ReadyForPaidCalls": False,
        "realDualArmRuns": 0,
        "g17ToG20Advanced": False,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {output['counts']}")


if __name__ == "__main__":
    main()
