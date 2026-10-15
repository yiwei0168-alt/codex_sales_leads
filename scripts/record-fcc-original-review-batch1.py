"""Bind the first 24 FCC appendix original-size reviews to source renders."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "tmp/ma24-independent-quarantine/fcc-26-55-visual-review"
SOURCE = ROOT / "tmp/ma24-independent-candidates/fcc-26-55.pdf"
EXTRACTION = ROOT / "tmp/ma24-independent-quarantine/fcc-26-55.layout-v2.0.10.extraction.json"
PRIOR = ROOT / "docs/evidence/ma24-g14-fcc-706-whole-pdf-visual-final-review-2026-10-15.json"
OUTPUT = ROOT / "docs/evidence/ma24-g14-fcc-706-original-size-appendix-batch1-2026-10-16.json"
PAGES = [68, 69, 70, 71, 72, 73, 74, 76, 78, 79, 80, 81,
         83, 84, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    review_path = REVIEW / "review.json"
    review, prior, extraction = read(review_path), read(PRIOR), read(EXTRACTION)
    assert sha(SOURCE) == review["sourceSha256"] == prior["sourceSha256"]
    assert sha(EXTRACTION) == prior["extractionArtifactSha256"]
    assert sha(review_path) == prior["renderPackageSha256"]
    assert len(PAGES) == len(set(PAGES)) == 24
    original = {x["unitIndex"]: x for x in review["records"]}
    judgments = {x["physicalPage"]: x for x in prior["judgments"]}
    blocks = extraction["documents"][0]["blocks"]
    records = []
    for page in PAGES:
        candidate, old = original[page], judgments[page]
        assert not old["originalSizeChecked"] and old["decision"] == "evidence"
        assert candidate["blockId"] == old["blockId"]
        assert sha(REVIEW / candidate["imageFile"]) == candidate["reviewImageSha256"] == old["originalRenderSha256"]
        if 68 <= page <= 74:
            finding = "Appendix A-1 continued state/urban/rural table retains distinct fixed-wireline, fixed-terrestrial, any-fixed and mobile-5G-NR population and percent columns."
        elif page == 76:
            finding = "Only a continuation of the previous table's source footnote and page furniture is visible; no chart or table remains on this page."
        elif 78 <= page <= 81:
            finding = "Appendix A-3 continued state/urban/rural table combines mobile 5G-NR at least 35/3 Mbps with any-fixed, fixed-terrestrial and fixed-wireline services."
        elif 83 <= page <= 84:
            finding = "Appendix A-4 longitudinal table separates June 2023, December 2023, June 2024, December 2024 and June 2025, with population and percent columns."
        else:
            finding = "Appendix A-5 county table associates each geography with evaluated population, fixed-terrestrial, fixed-wireline and mobile-5G-NR percentages, density and per-capita income."
        if page == 76:
            success = [b for b in blocks if b["unitIndex"] == page and b["quality"] == "success"]
            assert any("2023; Staff Block Estimates; 2020 Census." in b.get("text", "") for b in success)
        records.append({
            "physicalPage": page,
            "blockId": old["blockId"],
            "originalRenderSha256": old["originalRenderSha256"],
            "originalSizeChecked": True,
            "priorDecision": old["decision"],
            "reviewedDecision": "decoration" if page == 76 else "evidence",
            "finding": finding,
            "productDecisionSaved": False,
        })
    output = {
        "schema": "ma24-g14-fcc-706-original-size-appendix-batch1-v1",
        "date": "2026-10-16",
        "scope": "First 24 previously contact-sheet-only FCC appendix pages checked at original size; source-bound amendment, no product replay",
        "sourceSha256": sha(SOURCE),
        "extractionArtifactSha256": sha(EXTRACTION),
        "renderPackageSha256": sha(review_path),
        "priorWholePdfReviewSha256": sha(PRIOR),
        "records": records,
        "counts": {
            "newlyOriginalSizeChecked": 24,
            "retainEvidence": 23,
            "reclassifyAsDecoration": 1,
            "previouslyContactSheetOnlyRemaining": prior["counts"]["evidenceContactSheetOnly"] - 24,
        },
        "decisionOverride": {"page-76-visual-review": "decoration"},
        "reviewBoundary": "The other 65 previously contact-sheet-only pages still require original-size inspection. No appendix numerical cell is accepted solely from this page-type review.",
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    assert output["counts"] == {
        "newlyOriginalSizeChecked": 24, "retainEvidence": 23,
        "reclassifyAsDecoration": 1, "previouslyContactSheetOnlyRemaining": 65,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {output['counts']}")


if __name__ == "__main__":
    main()
