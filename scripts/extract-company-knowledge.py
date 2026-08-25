from datetime import datetime, timezone
from pathlib import Path
import json
import re
import sys
import zipfile
from xml.etree import ElementTree

from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path("knowledge/company")
OUTPUT_DIR = ROOT / "processed"
MANIFEST_PATH = OUTPUT_DIR / "company-manifest.json"

PROFILES = {
    "Cudy Profile Company.pdf": ("company-brand-profile", 5, "Cudy 公司与品牌能力"),
    "Factory Introduction  for OEM, ODM business.pdf": ("oem-odm-manufacturing", 5, "Cudy OEM/ODM 制造能力"),
    "Cudy_Distribution_Policy.pptx": ("distribution-policy", 5, "Cudy 分销政策"),
}


def clean_text(value):
    text = str(value or "").replace("\x00", "")
    text = re.sub(r"[\t ]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def natural_slide_key(name):
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else 0


def extract_sections(path):
    if path.suffix.lower() == ".pdf":
        reader = PdfReader(path)
        return [clean_text(page.extract_text() or "") for page in reader.pages], "page"
    if path.suffix.lower() == ".pptx":
        with zipfile.ZipFile(path) as archive:
            slide_names = sorted(
                (name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
                key=natural_slide_key,
            )
            sections = []
            for name in slide_names:
                root = ElementTree.fromstring(archive.read(name))
                text_nodes = [clean_text(node.text) for node in root.iter()
                              if node.tag.endswith("}t") and clean_text(node.text)]
                sections.append("\n".join(text_nodes))
            return sections, "slide"
    raise ValueError(f"Unsupported company source: {path}")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    documents = []
    for filename, (topic, authority, title) in PROFILES.items():
        path = ROOT / filename
        if not path.exists():
            continue
        extracted, unit = extract_sections(path)
        sections = [f"## Source {unit} {index}\n\n{text or '[Visual-only or no extractable text]'}"
                    for index, text in enumerate(extracted, start=1)]
        content = "\n\n".join([
            f"# {title}",
            "## Source metadata",
            f"- Source file: {filename}\n- Topic: {topic}\n- Material type: official company material\n- Authority level: {authority}/5\n- Source units: {len(extracted)}",
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
            "pageCount": len(extracted),
            "capturedAt": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(),
        })
    MANIFEST_PATH.write_text(json.dumps({"documents": documents}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"documents": len(documents), "pages": sum(item["pageCount"] for item in documents), "manifest": str(MANIFEST_PATH)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
