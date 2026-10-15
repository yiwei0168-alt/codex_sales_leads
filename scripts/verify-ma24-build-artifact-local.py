"""Read-only inventory of an isolated Next build and its traced dependencies."""

import hashlib
import json
import os
import stat
import sys
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def is_reparse(path: Path) -> bool:
    attributes = getattr(os.lstat(path), "st_file_attributes", 0)
    return bool(attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)


def inventory(root: Path) -> tuple[list[Path], list[str], list[tuple[str, int, str]]]:
    files: list[Path] = []
    linked_directories: list[str] = []
    for directory, child_dirs, child_files in os.walk(root, followlinks=False):
        parent = Path(directory)
        for name in list(child_dirs):
            path = parent / name
            if is_reparse(path):
                linked_directories.append(path.relative_to(root).as_posix())
                child_dirs.remove(name)
        for name in child_files:
            path = parent / name
            if is_reparse(path) or not path.is_file():
                raise SystemExit("Nonregular build file requires separate review")
            files.append(path)

    rows = sorted(
        (path.relative_to(root).as_posix(), path.stat().st_size, sha256(path))
        for path in files
    )
    return files, linked_directories, rows


def main() -> None:
    if len(sys.argv) not in (2, 3):
        raise SystemExit(
            "usage: verify-ma24-build-artifact-local.py BUILD_DIRECTORY [REFERENCE_BUILD_DIRECTORY]"
        )
    root = Path(sys.argv[1]).resolve(strict=True)
    build_id = root / "BUILD_ID"
    manifest = root / "build-manifest.json"
    if not build_id.is_file() or not manifest.is_file():
        raise SystemExit("Next build identity files missing")

    files, linked_directories, rows = inventory(root)
    trace_files = [path for path in files if path.name.endswith(".nft.json")]
    traced_paths = 0
    missing_paths = 0
    for trace in trace_files:
        payload = json.loads(trace.read_text(encoding="utf-8"))
        for relative in payload.get("files", []):
            traced_paths += 1
            if not (trace.parent / relative).resolve().exists():
                missing_paths += 1
    reference_mismatches = 0
    reference_regular_files = 0
    if len(sys.argv) == 3:
        reference = Path(sys.argv[2]).resolve(strict=True)
        _, _, reference_rows = inventory(reference)
        reference_regular_files = len(reference_rows)
        copied = {row[0]: row[1:] for row in rows}
        reference_mismatches = sum(
            copied.get(path) != (size, digest)
            for path, size, digest in reference_rows
        )
    result = {
        "schema": "ma24-local-next-build-inventory-v1",
        "buildId": build_id.read_text(encoding="utf-8").strip(),
        "buildManifestSha256": sha256(manifest),
        "regularFiles": len(rows),
        "regularBytes": sum(row[1] for row in rows),
        "treeSha256": hashlib.sha256(
            json.dumps(rows, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        ).hexdigest(),
        "linkedDirectories": sorted(linked_directories),
        "parentNodeModulesLinked": (root.parent / "node_modules").exists()
        and is_reparse(root.parent / "node_modules"),
        "traceManifests": len(trace_files),
        "tracedDependencyPaths": traced_paths,
        "missingTracedDependencyPaths": missing_paths,
        "envNamedFiles": [row[0] for row in rows if Path(row[0]).name.startswith(".env")],
        "referenceRegularFiles": reference_regular_files,
        "referenceMismatches": reference_mismatches,
    }
    print(json.dumps(result, ensure_ascii=False))
    if not trace_files or missing_paths or reference_mismatches or result["envNamedFiles"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
