"""Bind conservative DBS page decisions to the reviewed original and proposals."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW_DIR = ROOT / "tmp/ma24-independent-quarantine/dbs-2024-25-visual-review"
SOURCE = ROOT / "tmp/ma24-independent-quarantine/dbs-2024-25-ara-corrected.pdf"
ARTIFACT = ROOT / "tmp/ma24-independent-quarantine/dbs-2024-25-ara-corrected.layout-extraction.json"
TRIAGE = ROOT / "docs/evidence/ma24-g14-dbs-whole-pdf-visual-triage-2026-10-15.json"
OUTPUT = ROOT / "docs/evidence/ma24-g14-dbs-whole-pdf-visual-page-decisions-2026-10-16.json"
PARTS = [ROOT / f"docs/evidence/ma24-g14-dbs-visual-proposals-part{n}-2026-10-15.json"
         for n in range(1, 6)] + [
    ROOT / f"docs/evidence/ma24-g14-dbs-visual-proposals-part{n}-2026-10-16.json"
    for n in range(6, 10)]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    review_path = REVIEW_DIR / "review.json"
    review, triage = read(review_path), read(TRIAGE)
    proposals = [read(path) for path in PARTS]
    source_sha, artifact_sha, render_sha = sha(SOURCE), sha(ARTIFACT), sha(review_path)
    assert source_sha == review["sourceSha256"] == triage["sourceSha256"]
    assert artifact_sha == review["extractionArtifactSha256"] == triage["extractionArtifactSha256"]
    assert render_sha == triage["renderPackageSha256"]
    assert all(p["sourceSha256"] == source_sha and p["extractionArtifactSha256"] == artifact_sha
               and p["renderPackageSha256"] == render_sha for p in proposals)
    assert proposals[1]["priorPart1Sha256"] == sha(PARTS[0])
    assert proposals[2]["priorPart1Sha256"] == sha(PARTS[0])
    assert proposals[2]["priorPart2Sha256"] == sha(PARTS[1])
    assert all(proposals[n]["priorPartSha256"][str(n)] == sha(PARTS[n - 1])
               for n in range(3, len(proposals)))
    entries = [item for batch in proposals for item in batch["judgments"]]
    assert len(entries) == len(review["records"]) == 151
    assert [x["physicalPage"] for x in entries] == [x["unitIndex"] for x in review["records"]]

    judgments = []
    for entry, original in zip(entries, review["records"], strict=True):
        assert entry["blockId"] == original["blockId"]
        assert entry["originalRenderSha256"] == original["reviewImageSha256"] == sha(REVIEW_DIR / original["imageFile"])
        assert entry["originalSizeChecked"] and not entry["productDecisionSaved"]
        decision = entry["proposal"]
        assert decision in {"evidence", "decoration"}
        if decision == "evidence":
            evidence_text = entry["visualFeature"]
            assert evidence_text
        else:
            assert entry["successfulTextBlocksOnPage"] > 0 or entry["sourceTextWordCount"] == 0
            assert entry["sourceTextWordCount"] == entry["successfulExtractedTextWordCount"]
            evidence_text = ""
        judgments.append({
            "blockId": entry["blockId"],
            "physicalPage": entry["physicalPage"],
            "originalRenderSha256": entry["originalRenderSha256"],
            "decision": decision,
            "evidenceText": evidence_text,
            "note": entry["note"],
            "originalSizeChecked": True,
            "productDecisionSaved": False,
        })

    counts = {
        "evidence": sum(x["decision"] == "evidence" for x in judgments),
        "decoration": sum(x["decision"] == "decoration" for x in judgments),
        "unresolved": 0,
    }
    assert counts == {"evidence": 67, "decoration": 84, "unresolved": 0}
    assert judgments[[x["physicalPage"] for x in judgments].index(41)]["evidenceText"].startswith(
        "Figure 2 visually assigns Basic DBS checks 2,642,272 to 2021-22")
    output = {
        "schema": "ma24-g14-dbs-whole-pdf-visual-page-decisions-v1",
        "date": "2026-10-16",
        "stage": "Conservative page decisions prepared for isolated product save/readback; no product decisions saved",
        "sourceSha256": source_sha,
        "extractionArtifactSha256": artifact_sha,
        "renderPackageSha256": render_sha,
        "triageSha256": sha(TRIAGE),
        "proposalSha256s": {str(n): sha(path) for n, path in enumerate(PARTS, 1)},
        "sourcePhysicalPages": 157,
        "visualReviewRecords": len(judgments),
        "counts": counts,
        "reviewBoundary": "Every pending visual page was checked at original size. Evidence text is a concise page description; numeric interpretations still require source-page verification. Decoration pages retain successful extracted text. This manifest does not prove product save, citation readback or Gold.",
        "judgments": judgments,
        "productReviewDecisionsSaved": 0,
        "privateGoldApprovedByThisReview": False,
        "g15ReadyForPaidCalls": False,
        "realDualArmRuns": 0,
        "g17ToG20Advanced": False,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: {counts}")


if __name__ == "__main__":
    main()
