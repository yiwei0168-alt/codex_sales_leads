"""Try PageIndex OSS on a synthetic PDF with a loopback-only local model."""

import json
import hashlib
import importlib.metadata
import os
import socket
import tempfile
from pathlib import Path


def make_pdf(path: Path):
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    ]
    for sentence in (b"Atlas Router has eight LAN ports.", b"Beacon Switch has sixteen PoE ports."):
        stream = b"BT /F1 16 Tf 72 700 Td (" + sentence + b") Tj ET"
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, body in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{index} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = len(data)
    data.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    path.write_bytes(data)


original_connect = socket.socket.connect
original_connect_ex = socket.socket.connect_ex
original_getaddrinfo = socket.getaddrinfo
blocked = set()
resolved = {}
requested_urls = set()
cache_at_request = set()


def getaddrinfo(host, *args, **kwargs):
    rows = original_getaddrinfo(host, *args, **kwargs)
    for row in rows:
        resolved[str(row[4][0])] = str(host)
    return rows


def local_address(address):
    if not isinstance(address, tuple) or address[0] not in ("127.0.0.1", "::1", "localhost"):
        target = str(address[0]) if isinstance(address, tuple) else "non-tcp"
        blocked.add(resolved.get(target, target))
        raise RuntimeError("PageIndex trial blocked a nonlocal network connection")
    return address


def connect(self, address):
    return original_connect(self, local_address(address))


def connect_ex(self, address):
    return original_connect_ex(self, local_address(address))


socket.socket.connect = connect
socket.socket.connect_ex = connect_ex
socket.getaddrinfo = getaddrinfo
import requests  # noqa: E402

original_request = requests.sessions.Session.request


def request(self, method, url, *args, **kwargs):
    if str(url).startswith("https://openaipublic.blob.core.windows.net/encodings/"):
        requested_urls.add(str(url))
        cache_at_request.add(os.environ.get("TIKTOKEN_CACHE_DIR", "unset"))
    return original_request(self, method, url, *args, **kwargs)


requests.sessions.Session.request = request
os.environ["OPENAI_API_KEY"] = "ollama-local-only"
os.environ.pop("PAGEINDEX_API_KEY", None)
os.environ["NO_PROXY"] = "127.0.0.1,localhost,::1"
os.environ["LITELLM_TELEMETRY"] = "False"
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
token_cache = Path(__file__).resolve().parents[1] / ".venv-pageindex-local/Lib/site-packages/litellm/litellm_core_utils/tokenizers"
for name, expected in (
    ("9b5ad71b2ce5302211f9c61530b329a4922fc6a4", "223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7"),
    ("fb374d419588a4632f3f557e76b4b70aebbca790", "446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d"),
):
    asset = token_cache / name
    if not asset.is_file() or hashlib.sha256(asset.read_bytes()).hexdigest() != expected:
        raise RuntimeError(f"Pinned public tokenizer cache missing or changed: {name}")
if importlib.metadata.version("pageindex") != "0.2.19":
    raise RuntimeError("PageIndex 0.2.19 required for this isolated probe")
os.environ["CUSTOM_TIKTOKEN_CACHE_DIR"] = str(token_cache)
os.environ["TIKTOKEN_CACHE_DIR"] = str(token_cache)

from pageindex import PageIndexClient  # noqa: E402
from pageindex.flash import page_index_flash  # noqa: E402


with tempfile.TemporaryDirectory(prefix="ma24-pageindex-") as root:
    pdf = Path(root) / "synthetic.pdf"
    make_pdf(pdf)
    backend = {"api_key": "ollama-local-only", "base_url": "http://127.0.0.1:11434/v1"}
    client = PageIndexClient(index={"model": "openai/qwen3:8b", "backend": backend,
                                    "storage_path": str(Path(root) / "index")})
    try:
        submitted = client.submit_document(str(pdf), wait=True)
        sdk_status = submitted.get("status")
    except Exception as error:
        submitted = {}
        sdk_status = "local-summary-failed"
        if "Summary generation failed for all nodes" not in str(error):
            raise
    flash = page_index_flash(str(pdf), summary=False, optimize=False)
    nodes = flash["structure"]
    if not nodes or any("summary" in node for node in nodes):
        raise RuntimeError("PageIndex deterministic tree unavailable")
    sdk_structure = client.get_document_structure(submitted["doc_id"]) if submitted.get("doc_id") else []
    print(json.dumps({"local": True, "synthetic": True, "pageindexVersion": "0.2.19",
                      "documentId": submitted.get("doc_id"), "sdkStatus": sdk_status,
                      "tocSource": flash.get("toc_source"), "treeNodes": len(nodes),
                      "sdkTreeNodes": len(sdk_structure),
                      "summaryEvidence": False, "externalConnectionsAllowed": 0,
                      "blockedNonlocalTargets": sorted(blocked)[:10],
                      "publicAssetRequestsBlocked": sorted(requested_urls)[:10],
                      "tokenCacheAtRequest": sorted(cache_at_request)[:2],
                      "storageTransient": True}))
