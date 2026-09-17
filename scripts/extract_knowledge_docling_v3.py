"""Local-only Docling extraction to a versioned JSON artifact.

This setup intentionally refuses URLs and remote services. Model downloads must be
performed as a separate, audited setup step before normal extraction.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from time import perf_counter

from docling.chunking import HybridChunker
from docling.backend.docling_parse_backend import DoclingParseDocumentBackend
from docling.datamodel.base_models import ConversionStatus, InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions, TableFormerMode
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
from transformers import AutoTokenizer


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def page_number(item: object) -> int:
    provenance = getattr(item, "prov", None) or []
    return int(getattr(provenance[0], "page_no", 1)) if provenance else 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--profile", default="config/knowledge/docling-profile.v3.json")
    parser.add_argument("--allow-model-download", action="store_true")
    args = parser.parse_args()

    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    workspace = Path.cwd().resolve()
    if not source.is_file() or source.as_posix().startswith(("http:/", "https:/")):
        raise SystemExit("Input must be an existing local file")
    if workspace not in output.parents:
        raise SystemExit("Output must remain inside the workspace")

    profile = json.loads(Path(args.profile).read_text(encoding="utf-8"))
    if profile.get("enableRemoteServices") is not False:
        raise SystemExit("Docling v3 profile must keep remote services disabled")
    artifacts = Path(profile["modelArtifacts"]["directory"]).resolve()
    tokenizer_id = profile["chunking"]["tokenizer"]
    tokenizer = AutoTokenizer.from_pretrained(
        tokenizer_id,
        cache_dir=artifacts / "tokenizers",
        local_files_only=not args.allow_model_download,
    )
    chunk_tokenizer = HuggingFaceTokenizer(tokenizer=tokenizer, max_tokens=int(profile["chunking"]["maxTokens"]))

    pdf_options = PdfPipelineOptions(
        do_ocr=True,
        do_table_structure=True,
        enable_remote_services=False,
        artifacts_path=artifacts,
        ocr_options=RapidOcrOptions(
            lang=[profile["ocr"]["languageModel"]],
            backend=profile["ocr"]["backend"],
            text_score=float(profile["ocr"]["textScore"]),
        ),
    )
    pdf_options.table_structure_options.mode = TableFormerMode.ACCURATE
    converter = DocumentConverter(
        allowed_formats=[InputFormat.PDF, InputFormat.PPTX, InputFormat.XLSX, InputFormat.DOCX, InputFormat.MD],
        # The threaded docling-parse backend cannot initialize reliably when the
        # Windows user profile contains non-ASCII characters. Serialized page
        # parsing keeps all model and document I/O local and avoids that native
        # filesystem conversion path.
        format_options={
            InputFormat.PDF: PdfFormatOption(
                pipeline_options=pdf_options,
                backend=DoclingParseDocumentBackend,
            )
        },
    )

    started = perf_counter()
    result = converter.convert(source, raises_on_error=False)
    elapsed_ms = round((perf_counter() - started) * 1000)
    if result.status not in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
        raise SystemExit(f"Docling conversion failed: {result.status}: {result.errors}")

    suffix = source.suffix.lower()
    unit_type = "page" if suffix == ".pdf" else "slide" if suffix == ".pptx" else "sheet" if suffix == ".xlsx" else "document"
    items_by_unit: dict[int, list[str]] = {}
    for item, _level in result.document.iterate_items():
        text = getattr(item, "text", None)
        if isinstance(text, str) and text.strip():
            items_by_unit.setdefault(page_number(item), []).append(text.strip())
    unit_count = len(result.document.pages) if getattr(result.document, "pages", None) else max(items_by_unit.keys(), default=1)
    units = []
    for index in range(1, unit_count + 1):
        text = "\n".join(items_by_unit.get(index, []))
        units.append({
            "unitType": unit_type,
            "unitIndex": index,
            "status": "success" if text.strip() else "blank",
            "contentSha256": sha256_bytes(text.encode("utf-8")) if text else None,
            "textLength": len(text),
        })

    chunker = HybridChunker(
        tokenizer=chunk_tokenizer,
        merge_peers=bool(profile["chunking"]["mergePeers"]),
        repeat_table_header=bool(profile["chunking"]["repeatTableHeader"]),
    )
    chunks = []
    for index, chunk in enumerate(chunker.chunk(result.document)):
        embed_text = chunker.contextualize(chunk)
        doc_items = chunk.meta.doc_items or []
        unit_index = page_number(doc_items[0]) if doc_items else 1
        chunks.append({
            "index": index,
            "headingPath": list(chunk.meta.headings or []),
            "unitType": unit_type,
            "unitIndex": unit_index,
            "content": chunk.text,
            "canonicalEmbeddingText": embed_text,
            "tokenEstimate": chunk_tokenizer.count_tokens(embed_text),
            "contentSha256": sha256_bytes(chunk.text.encode("utf-8")),
        })

    artifact = {
        "schemaVersion": "knowledge-docling-v3.0.0",
        "profileKey": profile["profileKey"],
        "sourceSha256": sha256_bytes(source.read_bytes()),
        "sourceBytes": source.stat().st_size,
        "conversionStatus": str(result.status.value),
        "unitType": unit_type,
        "units": units,
        "chunks": chunks,
        "metrics": {
            "inputAssets": 1, "validAssets": 1, "units": len(units), "chunks": len(chunks),
            "latencyMs": elapsed_ms, "retries": 0, "modelCalls": 0, "embeddingCalls": 0,
            "externalDocumentCalls": 0,
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output.relative_to(workspace)), **artifact["metrics"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
