"""Download the pinned BGE-M3 inference snapshot and write a hash manifest."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from huggingface_hub import snapshot_download

MODEL = "BAAI/bge-m3"
REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
TARGET = Path(".models/bge-m3") / REVISION
ALLOW = [
    "1_Pooling/config.json",
    "config.json",
    "config_sentence_transformers.json",
    "pytorch_model.bin",
    "modules.json",
    "sentence_bert_config.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    snapshot_download(repo_id=MODEL, revision=REVISION, local_dir=TARGET, allow_patterns=ALLOW)
    files = [{"path": path.relative_to(TARGET).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}
             for path in sorted(TARGET.rglob("*")) if path.is_file() and ".cache" not in path.parts
             and path.name != "bge-m3-artifact-manifest.json"]
    if not any(item["path"] == "pytorch_model.bin" and item["bytes"] > 2_000_000_000 for item in files):
        raise RuntimeError("Pinned BGE-M3 weight file is missing or incomplete")
    canonical = json.dumps(files, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    manifest = {"model": MODEL, "revision": REVISION, "files": files,
                "artifactSha256": hashlib.sha256(canonical).hexdigest(),
                "bytes": sum(item["bytes"] for item in files)}
    (TARGET / "bge-m3-artifact-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in manifest.items() if key != "files"}, indent=2))


if __name__ == "__main__":
    main()
