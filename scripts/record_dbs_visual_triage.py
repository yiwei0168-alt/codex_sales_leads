"""Record conservative DBS PDF contact-sheet triage without approving page decisions."""

import hashlib
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp/ma24-independent-quarantine/dbs-2024-25-ara-corrected.pdf"
ARTIFACT = ROOT / "tmp/ma24-independent-quarantine/dbs-2024-25-ara-corrected.layout-extraction.json"
REVIEW = ROOT / "tmp/ma24-independent-quarantine/dbs-2024-25-visual-review"
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-whole-pdf-visual-triage-2026-10-15.json"

# Manual contact-sheet screen: pages where a chart, table, matrix, infographic,
# or organisational diagram is visible. Other pages remain unresolved, not decorative.
VISUAL_CANDIDATE_PAGES = [
    14, 17, 18, 22, 25, 26, 29, 30, 32, 34, 35, 36, 38, 41, 42, 44, 45, 46,
    47, 49, 58, 59, 62, 63, 70, 72, 80, 84, 85, 86, 92, 101, 103, 104, 105,
    108, 109, 110, 113, 114, 115, 116, 117, 118, 119, 120, 123, 124, 131,
    132, 133, 134, 137, 141, 143, 144, 145, 146, 147, 148, 149, 150, 151,
    152, 153, 154,
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    original = json.loads((REVIEW / "review.json").read_text(encoding="utf-8"))
    records = original["records"]
    pages = [record["unitIndex"] for record in records]
    with pymupdf.open(SOURCE) as pdf:
        assert len(pdf) == 157
    assert original["sourceSha256"] == sha(SOURCE)
    assert original["extractionArtifactSha256"] == sha(ARTIFACT)
    assert len(pages) == 151 and len(set(pages)) == 151
    assert set(VISUAL_CANDIDATE_PAGES) <= set(pages)
    assert VISUAL_CANDIDATE_PAGES == sorted(set(VISUAL_CANDIDATE_PAGES))
    assert all(sha(REVIEW / record["imageFile"]) == record["reviewImageSha256"]
               for record in records)
    sheets = sorted(REVIEW.glob("contact-*.png"))
    assert len(sheets) == 17
    assert sheets[0].name == "contact-001-013.png"
    assert sheets[-1].name == "contact-149-155.png"
    targets = {record["unitIndex"]: record for record in records
               if record["unitIndex"] in (7, 41)}
    assert set(targets) == {7, 41}
    assert targets[7]["reviewImageSha256"] == (
        "2db9ed49511acfa6a28cc71e712213f538f1cb325b7ff5f6eeba87074a8e629b")
    assert targets[41]["reviewImageSha256"] == (
        "9027191afa271055d1029450d13830c973e269e6d6be8e0eacc7e56baeb2cd70")
    result = {
        "schema": "ma24-g14-dbs-whole-pdf-visual-triage-v1",
        "date": "2026-10-15",
        "scope": "All currently pending visual pages rendered and contact-sheet screened; no final page decisions or product registration",
        "sourceSha256": sha(SOURCE),
        "extractionArtifactSha256": sha(ARTIFACT),
        "renderPackageSha256": sha(REVIEW / "review.json"),
        "sourcePhysicalPages": 157,
        "pendingVisualPagesRendered": len(records),
        "contactSheetsInspected": len(sheets),
        "contactSheetSha256s": {sheet.name: sha(sheet) for sheet in sheets},
        "conservativeVisualEvidenceCandidates": {
            "physicalPages": VISUAL_CANDIDATE_PAGES,
            "count": len(VISUAL_CANDIDATE_PAGES),
            "basis": "A substantive chart, table, matrix, infographic or organisational diagram is visible in the page-numbered contact sheets. Retain provisionally; exact values and labels require original-size review.",
        },
        "otherPendingPages": {
            "count": len(records) - len(VISUAL_CANDIDATE_PAGES),
            "decision": "unresolved; inspect at original size before any decoration or text-only exclusion",
        },
        "targetOriginalSizeReview": {
            "physicalPage7": "Correction 2 explicitly exchanges Basic DBS checks for 2021-22 and 2022-23: 2,657,121 and 2,642,272 respectively.",
            "physicalPage41": "Figure 2 still labels those years 2,642,272 and 2,657,121 respectively; the plotted chart contradicts the correction slip.",
            "renderSha256s": {str(page): targets[page]["reviewImageSha256"]
                             for page in (7, 41)},
        },
        "finalPageJudgments": 0,
        "productReviewDecisionsSaved": 0,
        "independentGoldAdded": 0,
        "providerCalls": 0,
        "g17ToG20Advanced": False,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {len(records)} rendered, "
          f"{len(VISUAL_CANDIDATE_PAGES)} conservative candidates")


if __name__ == "__main__":
    main()
