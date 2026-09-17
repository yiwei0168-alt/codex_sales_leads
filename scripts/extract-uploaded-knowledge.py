from pathlib import Path
import json
import sys

from knowledge_extraction_v2 import EXTRACTOR_VERSION, extract_file, write_artifact

if len(sys.argv) != 3:
    raise SystemExit("usage: extract-uploaded-knowledge.py INPUT OUTPUT")

source = Path(sys.argv[1])
output = Path(sys.argv[2])
document = extract_file(source, source.as_posix())
artifact_hash = write_artifact(output, [document])
print(json.dumps({
    "extractorVersion": EXTRACTOR_VERSION,
    "artifactSha256": artifact_hash,
    "qualitySummary": document["qualitySummary"],
    "blocks": len(document["blocks"]),
    "externalCalls": 0,
}, ensure_ascii=False))
