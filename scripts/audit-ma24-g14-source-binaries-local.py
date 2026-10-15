"""Verify original G14 draft binaries and source exposure connections locally."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
POOL_PATH = ROOT / "tmp/ma24-independent-quarantine/g14-current-draft-pool-v9-metadata-2026-10-16.json"
EXPECTED_POOL_SHA = "96459f096b17bafdd32dfedc18db924e0339ae53dd4b563ea1d2d7f78b88b9ed"
REPORT_PATH = ROOT / "tmp/ma24-independent-quarantine/g14-source-binary-closure-v9-2026-10-16.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def receipt(name: str) -> dict:
    assert name == Path(name).name and name.endswith(".json"), name
    return json.loads((ROOT / "docs/evidence" / name).read_text(encoding="utf-8"))


def source_refs(row: dict) -> list[dict]:
    data = receipt(row["file"])
    if row["id"] == "govuk-bduk-taking-part-premises-vs-regional-ability":
        return [dict(path=source["localOriginal"], sha256=digest, family=source["family"])
                for source, digest in zip(data["sources"], data["sourceSha256s"], strict=True)]
    if row["id"] == "etsi-38901-v194-v195-zod-reference-revision":
        audit = receipt("ma24-g14-etsi-zod-revision-source-audit-2026-10-15.json")
        assert data["sourceSha256s"] == [source["sha256"] for source in audit["sources"]]
        return [dict(path=source["localQuarantinePath"], sha256=source["sha256"],
                     family=row["families"][0]) for source in audit["sources"]]
    if "sourceReceipt" in data:
        declared_digest = data["sha256"]
        data = receipt(Path(data["sourceReceipt"]).name)
        assert declared_digest == data["sha256"], row["id"]
    if "source" in data and isinstance(data["source"], dict):
        source = data["source"]
        return [dict(path=source["localOriginal"], sha256=source["sha256"],
                     family=row["families"][0])]
    path = next(data[key] for key in ("localQuarantinePath", "quarantinePath",
                                    "sourceLocalPath", "sourcePath") if key in data)
    digest = next(data[key] for key in ("originalSha256", "sourceSha256", "sha256")
                  if key in data)
    return [dict(path=path, sha256=digest, family=row["families"][0])]


assert sha256(POOL_PATH) == EXPECTED_POOL_SHA, "Draft pool changed"
pool = json.loads(POOL_PATH.read_text(encoding="utf-8"))
assert pool["schema"] == "ma24-g14-current-draft-pool-v9"
assert len(pool["publicationRows"]) == pool["publicationDraftCount"] == 24
assert len({row["id"] for row in pool["publicationRows"]}) == 24

sources: dict[str, dict] = {}
case_sources: list[dict] = []
for row in pool["publicationRows"]:
    refs = source_refs(row)
    assert refs, row["id"]
    assert set(row["families"]) == {ref["family"] for ref in refs}, row["id"]
    for ref in refs:
        source_path = (ROOT / ref["path"]).resolve()
        assert source_path.is_relative_to(ROOT / "tmp/ma24-independent-quarantine") or source_path.is_relative_to(ROOT / "tmp/ma24-independent-candidates"), ref["path"]
        assert source_path.is_file(), ref["path"]
        assert sha256(source_path) == ref["sha256"], ref["path"]
        existing = sources.setdefault(ref["sha256"], dict(path=ref["path"],
                                                           families=set(), cases=set()))
        assert existing["path"] == ref["path"], ref["sha256"]
        existing["families"].add(ref["family"])
        existing["cases"].add(row["id"])
    case_sources.append(dict(caseId=row["id"], sourceSha256s=[ref["sha256"] for ref in refs]))

cross_label = {digest: sorted(item["families"]) for digest, item in sources.items()
               if len(item["families"]) > 1}
assert not cross_label, f"One binary has multiple declared families: {cross_label}"
report = dict(schema="ma24-g14-source-binary-closure-v1", poolSha256=EXPECTED_POOL_SHA,
              publicationDrafts=len(case_sources), distinctOriginalBinaries=len(sources),
              declaredFamilyLabels=len({family for item in sources.values() for family in item["families"]}),
              crossLabelBinaryConflicts=cross_label,
              originals=[dict(sha256=digest, path=item["path"],
                              families=sorted(item["families"]), caseIds=sorted(item["cases"]))
                         for digest, item in sorted(sources.items())],
              caseSources=case_sources,
              limitation="Binary identity and declared family links only; derivative or semantic overlap, rights and Gold eligibility require separate review.",
              fullSetFrozen=False, realDualArmRuns=0, g17ToG20Advanced=False)
REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(dict(report=str(REPORT_PATH.relative_to(ROOT)), reportSha256=sha256(REPORT_PATH),
                      publicationDrafts=len(case_sources), distinctOriginalBinaries=len(sources),
                      declaredFamilyLabels=report["declaredFamilyLabels"],
                      crossLabelBinaryConflicts=len(cross_label)), indent=2))
