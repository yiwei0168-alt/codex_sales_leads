"""Verify the isolated local Docling environment without reading documents."""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
from pathlib import Path

PROFILE = Path("config/knowledge/docling-profile.v3.json")
profile = json.loads(PROFILE.read_text(encoding="utf-8"))
expected: dict[str, str] = profile["runtime"]
actual = {name: importlib.metadata.version(name) for name in expected if name != "python"}
actual["python"] = ".".join(map(str, __import__("sys").version_info[:3]))
if actual != expected:
    raise SystemExit(f"Docling environment mismatch: expected={expected!r} actual={actual!r}")

fingerprint = hashlib.sha256(
    "\n".join(f"{name}=={actual[name]}" for name in sorted(actual)).encode("utf-8")
).hexdigest()
artifacts = Path(profile["modelArtifacts"]["directory"])
artifact_files = sorted(
    (path for path in artifacts.rglob("*") if path.is_file() and ".cache" not in path.parts),
    key=lambda path: path.relative_to(artifacts).as_posix(),
)
artifact_hash = hashlib.sha256()
for path in artifact_files:
    artifact_hash.update(path.relative_to(artifacts).as_posix().encode("utf-8"))
    artifact_hash.update(b"\0")
    artifact_hash.update(hashlib.sha256(path.read_bytes()).digest())
artifact_bytes = sum(path.stat().st_size for path in artifact_files)
expected_artifacts = profile["modelArtifacts"]
artifact_actual = {
    "fileCountExcludingCaches": len(artifact_files),
    "bytesExcludingCaches": artifact_bytes,
    "aggregateSha256": artifact_hash.hexdigest(),
}
for key, value in artifact_actual.items():
    if expected_artifacts.get(key) != value:
        raise SystemExit(f"Docling model artifact mismatch for {key}: expected={expected_artifacts.get(key)!r} actual={value!r}")
print(json.dumps({
    "profile": profile["profileKey"],
    "versions": actual,
    "versionSetSha256": fingerprint,
    "modelArtifacts": artifact_actual,
    "remoteServicesEnabled": profile["enableRemoteServices"],
    "documentsRead": 0,
    "externalCalls": {"model": 0, "embedding": 0, "search": 0, "smtp": 0},
}, ensure_ascii=False, indent=2))
