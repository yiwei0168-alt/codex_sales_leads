"""Loopback-only BGE-M3 embedding service for RAG v3.

The service never downloads a model at runtime and never logs request text. Set
BGE_M3_MODEL_PATH to a pre-downloaded snapshot whose revision/hash was verified.
"""

from __future__ import annotations

import json
import os
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HOST = "127.0.0.1"
PORT = int(os.environ.get("BGE_M3_PORT", "8765"))
EXPECTED_DIMENSIONS = 1024
MAX_BATCH = 64
MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
EXPECTED_ARTIFACT_SHA256 = "4f2ef0a2c9b4250206e9ddc202a2bbe01718aacd2a06f87e3e09887b2a076c28"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _verify_snapshot(model_path: Path) -> None:
    manifest_path = model_path / "bge-m3-artifact-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("revision") != MODEL_REVISION or manifest.get("artifactSha256") != EXPECTED_ARTIFACT_SHA256:
        raise RuntimeError("BGE-M3 snapshot manifest does not match the pinned profile")
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise RuntimeError("BGE-M3 snapshot manifest has no files")
    for item in files:
        path = (model_path / item["path"]).resolve(strict=True)
        if model_path not in path.parents or path.stat().st_size != item["bytes"] or _sha256(path) != item["sha256"]:
            raise RuntimeError("BGE-M3 snapshot file verification failed")
    canonical = json.dumps(files, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if hashlib.sha256(canonical).hexdigest() != EXPECTED_ARTIFACT_SHA256:
        raise RuntimeError("BGE-M3 aggregate artifact hash verification failed")


def _load_model() -> Any:
    model_path_value = os.environ.get("BGE_M3_MODEL_PATH", "").strip()
    if not model_path_value:
        raise RuntimeError("BGE_M3_MODEL_PATH must point to a verified local model snapshot")
    model_path = Path(model_path_value).resolve(strict=True)
    if not model_path.is_dir():
        raise RuntimeError("BGE_M3_MODEL_PATH must be a local directory")
    _verify_snapshot(model_path)
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(str(model_path), local_files_only=True)


class Handler(BaseHTTPRequestHandler):
    model: Any = None

    def log_message(self, _format: str, *_args: object) -> None:
        # Request bodies and paths are deliberately absent from application logs.
        return

    def _json(self, status: int, value: dict[str, Any]) -> None:
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self._json(404, {"error": "not-found"})
            return
        self._json(200, {
            "status": "ready", "model": "BAAI/bge-m3", "revision": MODEL_REVISION,
            "dimensions": EXPECTED_DIMENSIONS,
        })

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/embed":
            self._json(404, {"error": "not-found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > 2_000_000:
                raise ValueError("invalid-content-length")
            body = json.loads(self.rfile.read(length))
            inputs = body.get("inputs") if isinstance(body, dict) else None
            if not isinstance(inputs, list) or not 1 <= len(inputs) <= MAX_BATCH:
                raise ValueError("inputs must contain 1 to 64 strings")
            if any(not isinstance(item, str) or not item.strip() or len(item) > 100_000 for item in inputs):
                raise ValueError("each input must be a non-empty bounded string")
            vectors = self.model.encode(
                inputs, batch_size=min(len(inputs), 16), normalize_embeddings=True,
                convert_to_numpy=True, show_progress_bar=False,
            ).tolist()
            if len(vectors) != len(inputs) or any(len(vector) != EXPECTED_DIMENSIONS for vector in vectors):
                raise RuntimeError("unexpected embedding dimensions")
            self._json(200, {"model": "BAAI/bge-m3", "revision": MODEL_REVISION,
                             "dimensions": EXPECTED_DIMENSIONS, "embeddings": vectors})
        except (ValueError, json.JSONDecodeError) as error:
            self._json(400, {"error": str(error)})
        except Exception:
            self._json(500, {"error": "embedding-failed"})


def main() -> None:
    if PORT < 1024 or PORT > 65535:
        raise RuntimeError("BGE_M3_PORT must be between 1024 and 65535")
    Handler.model = _load_model()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
