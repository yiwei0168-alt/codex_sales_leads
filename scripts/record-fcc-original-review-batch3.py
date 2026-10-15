"""Bind the final 36 FCC appendix original-size reviews to source renders."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "tmp/ma24-independent-quarantine/fcc-26-55-visual-review"
SOURCE = ROOT / "tmp/ma24-independent-candidates/fcc-26-55.pdf"
EXTRACTION = ROOT / "tmp/ma24-independent-quarantine/fcc-26-55.layout-v2.0.10.extraction.json"
PRIOR = ROOT / "docs/evidence/ma24-g14-fcc-706-whole-pdf-visual-final-review-2026-10-15.json"
BATCH1 = ROOT / "docs/evidence/ma24-g14-fcc-706-original-size-appendix-batch1-2026-10-16.json"
BATCH2 = ROOT / "docs/evidence/ma24-g14-fcc-706-original-size-appendix-batch2-2026-10-16.json"
OUTPUT = ROOT / "docs/evidence/ma24-g14-fcc-706-original-size-appendix-batch3-2026-10-16.json"
COUNTY = list(range(130, 144)) + list(range(145, 156))
OTHER = [158, 159, 162, 163, 164, 165, 166, 167, 169, 170, 171]
PAGES = COUNTY + OTHER


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    review_path = REVIEW / "review.json"
    review, prior = read(review_path), read(PRIOR)
    batch1, batch2 = read(BATCH1), read(BATCH2)
    assert sha(SOURCE) == review["sourceSha256"] == prior["sourceSha256"] == batch1["sourceSha256"] == batch2["sourceSha256"]
    assert sha(EXTRACTION) == prior["extractionArtifactSha256"] == batch1["extractionArtifactSha256"] == batch2["extractionArtifactSha256"]
    assert sha(review_path) == prior["renderPackageSha256"] == batch1["renderPackageSha256"] == batch2["renderPackageSha256"]
    assert sha(PRIOR) == batch1["priorWholePdfReviewSha256"] == batch2["priorWholePdfReviewSha256"]
    assert sha(BATCH1) == batch2["priorBatch1Sha256"]
    assert len(PAGES) == len(set(PAGES)) == 36
    assert not set(PAGES) & {r["physicalPage"] for b in (batch1, batch2) for r in b["records"]}
    original = {x["unitIndex"]: x for x in review["records"]}
    judgments = {x["physicalPage"]: x for x in prior["judgments"]}
    findings = {
        158: "Appendix A-6 table continues at top, followed by Appendix A-7 tribal-lands 5G-NR and fixed-service table; retain both structures.",
        159: "Appendix A-8 tribal-lands 4G-LTE and fixed-service table is present.",
        162: "Appendix A-11 tribal-lands in-vehicle 4G-LTE and fixed-service table is present.",
        163: "Appendix A-12 5G-NR census-block-group quartile table separates population, density and income categories.",
        164: "Appendix A-13 4G-LTE census-block-group quartile table separates population, density and income categories.",
        165: "Appendix A-14 in-vehicle 5G-NR 35/3 census-block-group quartile table is present.",
        166: "Appendix A-15 in-vehicle 5G-NR 7/1 census-block-group quartile table is present.",
        167: "Appendix A-16 in-vehicle 4G-LTE census-block-group quartile table is present.",
        169: "Appendix A-18 served/unserved demographic comparison table is present.",
        170: "Appendix A-19 served/unserved in-vehicle 5G-NR 35/3 demographic comparison table is present.",
        171: "Appendix A-20 served/unserved in-vehicle 5G-NR 7/1 demographic comparison table is present.",
    }
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
            "finding": "Appendix A-5 county table continues with geography rows and service-availability, population, density and income columns." if page in COUNTY else findings[page],
            "productDecisionSaved": False,
        })
    remaining = batch2["counts"]["previouslyContactSheetOnlyRemaining"] - len(records)
    assert remaining == 0
    output = {
        "schema": "ma24-g14-fcc-706-original-size-appendix-batch3-v1",
        "date": "2026-10-16",
        "scope": "Final 36 previously contact-sheet-only FCC appendix pages checked at original size; source-bound amendment, no product replay",
        "sourceSha256": sha(SOURCE),
        "extractionArtifactSha256": sha(EXTRACTION),
        "renderPackageSha256": sha(review_path),
        "priorWholePdfReviewSha256": sha(PRIOR),
        "priorBatch1Sha256": sha(BATCH1),
        "priorBatch2Sha256": sha(BATCH2),
        "records": records,
        "counts": {
            "newlyOriginalSizeChecked": len(records),
            "countyTablePages": len(COUNTY),
            "otherAppendixTablePages": len(OTHER),
            "retainEvidence": len(records),
            "reclassifyAsDecoration": 0,
            "previouslyContactSheetOnlyRemaining": remaining,
        },
        "decisionOverride": {},
        "reviewBoundary": "All 89 formerly contact-sheet-only pages now have original-size page-type decisions across the three batch receipts. Numeric cells and any apparent source repetition are not validated or corrected by this review.",
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {output['counts']}")


if __name__ == "__main__":
    main()
