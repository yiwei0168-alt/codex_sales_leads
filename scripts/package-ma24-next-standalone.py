"""Copy a Next standalone build into a package without workspace junctions."""

import hashlib
import json
import os
import shutil
import stat
import sys
from pathlib import Path


def is_link(path: Path) -> bool:
    info = os.lstat(path)
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inventory(root: Path) -> tuple[list[tuple[str, int, str]], list[Path]]:
    rows: list[tuple[str, int, str]] = []
    links: list[Path] = []
    for parent, directories, files in os.walk(root, followlinks=False):
        directory = Path(parent)
        for name in list(directories):
            path = directory / name
            if is_link(path):
                links.append(path.relative_to(root))
                directories.remove(name)
        for name in files:
            path = directory / name
            if is_link(path) or not path.is_file():
                raise ValueError(f"Nonregular package file: {path}")
            rows.append((path.relative_to(root).as_posix(), path.stat().st_size, sha256(path)))
    return sorted(rows), links


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: package-ma24-next-standalone.py BUILD_DIR OUTPUT_DIR")
    workspace = Path.cwd().resolve(strict=True)
    build = Path(sys.argv[1]).resolve(strict=True)
    source = build / ".next" / "standalone"
    static = build / ".next" / "static"
    output = Path(sys.argv[2]).resolve(strict=False)
    if not build.is_relative_to(workspace) or not output.is_relative_to(workspace) or output.is_relative_to(build):
        raise SystemExit("Build and output must stay inside the workspace")
    if not source.is_dir() or not static.is_dir() or output.exists():
        raise SystemExit("Standalone source/static missing or output already exists")
    source_rows, links = inventory(source)
    static_rows, static_links = inventory(static)
    public_rows, public_links = inventory(build / "public") if (build / "public").is_dir() else ([], [])
    if static_links or public_links or any(Path(name).name.startswith(".env")
        for name, _, _ in [*source_rows, *static_rows, *public_rows]):
        raise SystemExit("Build input contains an unexpected link or environment file")
    output.mkdir(parents=True)
    for relative, _, _ in source_rows:
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / relative, target)
    apps = [path.parent for path in output.rglob("server.js")
            if (path.parent / ".next" / "BUILD_ID").is_file()]
    if len(apps) != 1:
        raise SystemExit(f"Expected one standalone app, found {len(apps)}")
    app = apps[0]
    shutil.copytree(static, app / ".next" / "static")
    if (build / "public").is_dir():
        shutil.copytree(build / "public", app / "public")
    app_relative = app.relative_to(output)
    handled: list[str] = []
    for relative in links:
        target = (source / relative).resolve(strict=True)
        if relative == app_relative / "node_modules":
            if target != (build / "node_modules").resolve(strict=True):
                raise SystemExit("Unexpected standalone application dependency junction")
        elif relative.parent == app_relative / ".next" / "node_modules":
            dependency_root = (build / "node_modules").resolve(strict=True)
            if not target.is_relative_to(dependency_root):
                raise SystemExit("Alias dependency points outside build dependencies")
            packaged = output / "node_modules" / target.relative_to(dependency_root)
            if not packaged.is_dir():
                raise SystemExit(f"Alias dependency absent from package: {relative}")
            shutil.copytree(packaged, output / relative)
        else:
            raise SystemExit(f"Unexpected standalone junction: {relative}")
        handled.append(relative.as_posix())
    package_rows, remaining_links = inventory(output)
    if remaining_links or any(Path(name).name.startswith(".env") for name, _, _ in package_rows):
        raise SystemExit("Package contains a junction or environment file")
    copied = {name: (size, digest) for name, size, digest in package_rows}
    if any(copied.get(name) != (size, digest) for name, size, digest in source_rows):
        raise SystemExit("A copied standalone source file differs from the build")
    print(json.dumps({
        "schema": "ma24-next-standalone-package-v1",
        "buildId": (app / ".next" / "BUILD_ID").read_text(encoding="utf8").strip(),
        "appRelativePath": app_relative.as_posix(),
        "sourceFilesMatched": len(source_rows),
        "materializedJunctions": handled,
        "regularFiles": len(package_rows),
        "regularBytes": sum(size for _, size, _ in package_rows),
        "treeSha256": hashlib.sha256(json.dumps(package_rows, separators=(",", ":"),
            ensure_ascii=False).encode("utf8")).hexdigest(),
        "remainingJunctions": len(remaining_links),
        "environmentFiles": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
