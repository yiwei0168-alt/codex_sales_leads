from datetime import datetime, timezone
from pathlib import Path
import json
import re
import sys

from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path("knowledge/company")
OUTPUT_DIR = ROOT / "processed"
MANIFEST_PATH = OUTPUT_DIR / "company-manifest.json"

PROFILES = {
    "Cudy Profile Company.pdf": ("company-brand-profile", 5, "Cudy 公司与品牌能力"),
    "Factory Introduction  for OEM, ODM business.pdf": ("oem-odm-manufacturing", 5, "Cudy OEM/ODM 制造能力"),
}


def clean_text(value):
    text = str(value or "").replace("\x00", "")
    text = re.sub(r"[\t ]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    documents = []
    for filename, (topic, authority, title) in PROFILES.items():
        path = ROOT / filename
        if not path.exists():
            continue
        reader = PdfReader(path)
        sections = []
        for index, page in enumerate(reader.pages, start=1):
            text = clean_text(page.extract_text() or "")
            sections.append(f"## Source page {index}\n\n{text or '[Visual-only or no extractable text]'}")
        content = "\n\n".join([
            f"# {title}",
            "## Source metadata",
            f"- Source file: {filename}\n- Topic: {topic}\n- Material type: official company material\n- Authority level: {authority}/5\n- Page count: {len(reader.pages)}",
            *sections,
        ]) + "\n"
        output_path = OUTPUT_DIR / f"{topic}.md"
        output_path.write_text(content, encoding="utf-8")
        documents.append({
            "externalId": f"company:{topic}",
            "title": title,
            "topic": topic,
            "authorityLevel": authority,
            "language": "en",
            "sourceFile": filename,
            "sourceType": "official-company-material",
            "knowledgeFile": output_path.as_posix(),
            "pageCount": len(reader.pages),
            "capturedAt": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(),
        })
    MANIFEST_PATH.write_text(json.dumps({"documents": documents}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"documents": len(documents), "pages": sum(item["pageCount"] for item in documents), "manifest": str(MANIFEST_PATH)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
