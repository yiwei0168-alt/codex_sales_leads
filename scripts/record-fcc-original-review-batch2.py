"""Bind the second 29 FCC appendix original-size reviews to source renders."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "tmp/ma24-independent-quarantine/fcc-26-55-visual-review"
SOURCE = ROOT / "tmp/ma24-independent-candidates/fcc-26-55.pdf"
EXTRACTION = ROOT / "tmp/ma24-independent-quarantine/fcc-26-55.layout-v2.0.10.extraction.json"
PRIOR = ROOT / "docs/evidence/ma24-g14-fcc-706-whole-pdf-visual-final-review-2026-10-15.json"
BATCH1 = ROOT / "docs/evidence/ma24-g14-fcc-706-original-size-appendix-batch1-2026-10-16.json"
OUTPUT = ROOT / "docs/evidence/ma24-g14-fcc-706-original-size-appendix-batch2-2026-10-16.json"
PAGES = list(range(98, 112)) + list(range(113, 128))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    review_path = REVIEW / "review.json"
    review, prior, batch1 = read(review_path), read(PRIOR), read(BATCH1)
    assert sha(SOURCE) == review["sourceSha256"] == prior["sourceSha256"] == batch1["sourceSha256"]
    assert sha(EXTRACTION) == prior["extractionArtifactSha256"] == batch1["extractionArtifactSha256"]
    assert sha(review_path) == prior["renderPackageSha256"] == batch1["renderPackageSha256"]
    assert sha(PRIOR) == batch1["priorWholePdfReviewSha256"]
    assert len(PAGES) == len(set(PAGES)) == 29
    assert not set(PAGES) & {r["physicalPage"] for r in batch1["records"]}
    original = {x["unitIndex"]: x for x in review["records"]}
    judgments = {x["physicalPage"]: x for x in prior["judgments"]}
    records = []
    for page in PAGES:
        candidate, old = original[page], judgments[page]
        assert not old["originalSizeChecked"] and old["decision"] == "evidence"
        assert candidate["blockId"] == old["blockId"]
        assert sha(REVIEW / candidate["imageFile"]) == candidate["reviewImageSha256"] == old["originalRenderSha256"]
        records.append({
            "physicalPage": page,
            "blockId": old["blockId"],
            "originalRenderSha256": old["originalRenderSha256"],
            "originalSizeChecked": True,
            "priorDecision": old["decision"],
            "reviewedDecision": "evidence",
            "finding": "Appendix A-5 continued county table contains geography rows and distinct evaluated-population, fixed-terrestrial, fixed-wireline, mobile-5G-NR, population-density and per-capita-income columns.",
            "productDecisionSaved": False,
        })
    remaining = batch1["counts"]["previouslyContactSheetOnlyRemaining"] - len(records)
    assert remaining == 36
    output = {
        "schema": "ma24-g14-fcc-706-original-size-appendix-batch2-v1",
        "date": "2026-10-16",
        "scope": "Second 29 previously contact-sheet-only FCC appendix pages checked at original size; source-bound amendment, no product replay",
        "sourceSha256": sha(SOURCE),
        "extractionArtifactSha256": sha(EXTRACTION),
        "renderPackageSha256": sha(review_path),
        "priorWholePdfReviewSha256": sha(PRIOR),
        "priorBatch1Sha256": sha(BATCH1),
        "records": records,
        "counts": {
            "newlyOriginalSizeChecked": len(records),
            "retainEvidence": len(records),
            "reclassifyAsDecoration": 0,
            "previouslyContactSheetOnlyRemaining": remaining,
        },
        "decisionOverride": {},
        "reviewBoundary": "The other 36 previously contact-sheet-only pages still require original-size inspection. County-table numeric cells are not individually accepted by this page-type review.",
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {output['counts']}")


if __name__ == "__main__":
    main()
