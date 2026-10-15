"""Check original NIST sources and retire a flawed provisional question."""

import hashlib
import json
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / "tmp/ma24-independent-quarantine"
PDF = PRIVATE / "nist-tn-2363-industrial-5g.pdf"
PDF_EXTRACTION = PRIVATE / "nist-tn-2363.layout-v2.0.10.extraction.json"
DECISIONS = PRIVATE / "nist-tn2363-visual-package/decisions.json"
WORKBOOK = PRIVATE / "nist-smartmanufacturing-metadata.xlsx"
XLSX_EXTRACTION = PRIVATE / "nist-smartmanufacturing-metadata.layout-v2.0.10.extraction.json"
OUTPUT = ROOT / "docs/evidence/ma24-g14-nist-cross-source-candidate-correction-2026-10-16.json"
OLD_POOL = PRIVATE / "g14-current-draft-pool-v7-dbs-current-2026-10-16.json"
NEW_POOL = PRIVATE / "g14-current-draft-pool-v8-nist-corrected-2026-10-16.json"
NEIGHBORS = PRIVATE / "g14-current-pool-neighbors-v8-nist-corrected-2026-10-16.json"
CASE_ID = "nist-ran-propagation-vs-dipole-range-alignment"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


assert digest(PDF) == "65e333dac9975f4ca9a952a966fb212ce7ccb161ec60b48bf45c3dfd7adbd6a9"
assert digest(WORKBOOK) == "0132c779ab57132ae5b5718b1b1440b52ed66bd48bc62d953336c90f7f2cb814"
decisions = read_json(DECISIONS)
figure = next(item for item in decisions["decisions"] if item["blockId"] == "page-21-visual-review")
assert figure["decision"] == "evidence"
assert "radio transmission delay" in figure["evidenceText"]
assert "propagation delay" in figure["evidenceText"]
pdf_extraction = read_json(PDF_EXTRACTION)["documents"][0]
assert pdf_extraction["sourceSha256"] == digest(PDF)
pdf_block = next(item for item in pdf_extraction["blocks"] if item["id"] == figure["blockId"])
assert (pdf_block["unitType"], pdf_block["unitIndex"]) == ("page", 21)

workbook = load_workbook(WORKBOOK, read_only=True, data_only=True)
sheet = workbook["Ray Tracing Results"]
expected = {
    "B4": "Free Space Ray Tracing Results for Horn",
    "M4": "Free Space Ray Tracing Results for  dipoles ",
    "T4": "Ground Bounce Ray Tracing Results for infinitesimal dipoles (Antenna Gain = 1.94 dBi for 2.245 Ghz and 5.4 Ghz) at OATS (z = 1.97m)",
    "B6": "Range (m)",
    "M6": "Range (m)",
    "N6": "Coupling (dB) at 2.245 Ghz",
    "T6": "Coupling (dB) at 2.245 Ghz",
    "B23": 1.999988,
    "M23": 2.4238829097429604,
    "N23": -47.5,
    "T23": -47.75,
}
for cell, value in expected.items():
    assert sheet[cell].value == value, f"Original workbook cell drift: {cell}"
workbook.close()

xlsx_extraction = read_json(XLSX_EXTRACTION)["documents"][0]
assert xlsx_extraction["sourceSha256"] == digest(WORKBOOK)
table = next(item["table"] for item in xlsx_extraction["blocks"] if item["id"] == "sheet-5-table")
assert (table["startRow"], table["startColumn"], table["cellRange"]) == (2, 1, "A1:X3242")
for address, original in expected.items():
    column = 0
    for letter in address.rstrip("0123456789"):
        column = column * 26 + ord(letter) - ord("A") + 1
    row = int(address[len(address.rstrip("0123456789")):])
    extracted = table["rows"][row - table["startRow"]][column - table["startColumn"]]
    assert " ".join(str(original).split()) == " ".join(str(extracted).split()), f"Extracted cell drift: {address}"

report = {
    "schema": "ma24-g14-nist-cross-source-candidate-correction-v1",
    "date": "2026-10-16",
    "supersedesCandidateReceipt": "docs/evidence/ma24-g14-nist-two-source-delay-vs-coupling-draft-2026-10-15.json",
    "candidateId": CASE_ID,
    "disposition": "retired-from-provisional-pool-pending-substantive-redraft",
    "reason": "B23 is under the free-space horn section, whereas M23 is under the free-space dipole section. Their inequality cannot establish that the N23 and T23 dipole coupling values were measured at different ranges. The candidate answer made that unsupported inference. The report delay diagram and ray-tracing coupling table also do not establish a measured millisecond conversion.",
    "originalSourceChecks": {
        "pdfSha256": digest(PDF),
        "pdfExtractionSha256": digest(PDF_EXTRACTION),
        "pdfFigure3Block": figure["blockId"],
        "pdfPhysicalPage": pdf_block["unitIndex"],
        "pdfFigure3Decision": figure["decision"],
        "xlsxSha256": digest(WORKBOOK),
        "xlsxExtractionSha256": digest(XLSX_EXTRACTION),
        "sheet": "Ray Tracing Results",
        "checkedCells": list(expected),
        "freeSpaceHornRangeB23Meters": expected["B23"],
        "freeSpaceDipoleRangeM23Meters": expected["M23"],
        "freeSpaceDipoleCouplingN23Db": expected["N23"],
        "groundBounceDipoleCouplingT23Db": expected["T23"],
        "originalAndExtractionCellsEqual": True,
    },
    "acceptanceBoundary": {
        "figure3ProductEvidenceDecisionExists": True,
        "figure3ExactReadEvidenceCheckedInThisAudit": False,
        "newGoldApproved": False,
        "fullG14SetFrozen": False,
        "g15PaidCalls": 0,
        "g16RealRuns": 0,
    },
}
pool = read_json(OLD_POOL)
assert pool["schema"] == "ma24-g14-current-draft-pool-v7"
assert (pool["draftCount"], pool["publicationDraftCount"], pool["syntheticSecurityDraftCount"]) == (28, 25, 3)
removed = [row for row in pool["publicationRows"] if row["id"] == CASE_ID]
assert len(removed) == 1
assert removed[0]["primaryFormat"] == "xlsx" and removed[0]["wholeQuestionCrossDocument"]
pool["publicationRows"] = [row for row in pool["publicationRows"] if row["id"] != CASE_ID]
pool["schema"] = "ma24-g14-current-draft-pool-v8"
pool["priorSha256"] = digest(OLD_POOL)
pool["nistCorrectionReceipt"] = str(OUTPUT.relative_to(ROOT)).replace("\\", "/")
pool["draftCount"] -= 1
pool["publicationDraftCount"] -= 1
pool["primaryFormatDrafts"]["xlsx"] -= 1
pool["hardCaseDrafts"]["cross-document"] -= 1
pool["unmetHardCaseTargets"]["cross-document"] += 1
assert (pool["draftCount"], pool["publicationDraftCount"], pool["primaryFormatDrafts"]["xlsx"],
        pool["hardCaseDrafts"]["cross-document"]) == (27, 24, 5, 1)
assert sum(pool["primaryFormatDrafts"].values()) == pool["draftCount"]
NEW_POOL.write_text(json.dumps(pool, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
report["poolCorrection"] = {
    "priorPoolSha256": digest(OLD_POOL),
    "correctedPoolPath": str(NEW_POOL.relative_to(ROOT)).replace("\\", "/"),
    "correctedPoolSha256": digest(NEW_POOL),
    "drafts": pool["draftCount"],
    "publicationDrafts": pool["publicationDraftCount"],
    "syntheticSecurityDrafts": pool["syntheticSecurityDraftCount"],
    "crossDocumentDrafts": pool["hardCaseDrafts"]["cross-document"],
}
neighbors = read_json(NEIGHBORS)
assert neighbors["inputSha256"] == digest(NEW_POOL)
assert neighbors["rows"] == pool["draftCount"]
assert all(row["id"] != CASE_ID for row in neighbors["results"])
report["poolCorrection"]["localNeighborOutputSha256"] = digest(NEIGHBORS)
report["poolCorrection"]["semanticIndependenceProven"] = False
OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"receipt": str(OUTPUT.relative_to(ROOT)), "disposition": report["disposition"],
                  "originalAndExtractionCellsEqual": True}))
