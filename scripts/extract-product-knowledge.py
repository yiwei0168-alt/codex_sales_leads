from pathlib import Path
import json
import re
import sys
from openpyxl import load_workbook
from pypdf import PdfReader

ROOT = Path("knowledge/product")
ROUTER_DIR = ROOT / "Wi-Fi Router"
OUTPUT_DIR = ROOT / "processed" / "wifi-router"
CATALOG_PATH = ROOT / "processed" / "product-catalog.json"


def clean_text(value):
    text = str(value or "").replace("\x00", "")
    text = text.replace("¡Á", "×").replace("Â×", "×")
    text = re.sub(r"[\t ]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def read_catalog():
    workbook = load_workbook(ROOT / "Cudy products list.xlsx", read_only=True, data_only=True)
    sheet = workbook["Price List"]
    category = None
    products = []
    for row in sheet.iter_rows(values_only=True):
        values = [clean_text(value) for value in row]
        first, second, third = (values + ["", "", ""])[:3]
        if not first or first in {"Quotation", "Model No."}:
            continue
        if first and not second and not third:
            category = first
            continue
        if not category or not second:
            continue
        products.append({
            "model": first,
            "productName": second,
            "category": category,
            "description": third,
            "brand": "Cudy Technology",
            "lifecycleStatus": "unknown",
            "sourceFile": "Cudy products list.xlsx",
        })
    return products


def parse_filename(path):
    match = re.match(r"(?P<model>[^_]+)(?:_(?P<version>V?\d+(?:\.\d+)?))?_Datasheet", path.stem, re.I)
    if not match:
        return path.stem.split("_")[0], None
    return match.group("model"), match.group("version")


def extract_datasheet(path):
    reader = PdfReader(path)
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        text = clean_text(page.extract_text() or "")
        if text:
            pages.append(f"## Datasheet page {index}\n\n{text}")
    return "\n\n".join(pages), len(reader.pages)


def main():
    products = read_catalog()
    by_model = {product["model"].upper(): product for product in products}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    router_records = []
    for path in sorted(ROUTER_DIR.glob("*.pdf")):
        model, version = parse_filename(path)
        catalog = by_model.get(model.upper(), {
            "model": model,
            "productName": f"{model} Wi-Fi Router",
            "category": "Wi-Fi Router",
            "description": "",
            "brand": "Cudy Technology",
            "lifecycleStatus": "unknown",
            "sourceFile": "Cudy products list.xlsx",
        })
        content, page_count = extract_datasheet(path)
        markdown = "\n\n".join([
            f"# {model} - {catalog['productName']}",
            "## Product identity",
            f"- Brand: Cudy Technology\n- Model: {model}\n- Category: Wi-Fi Router\n- Datasheet version: {version or 'Unknown'}\n- Source file: {path.name}\n- Source pages: {page_count}",
            "## Catalog description",
            catalog["description"] or "Unknown",
            content,
        ]) + "\n"
        output_path = OUTPUT_DIR / f"{model}.md"
        output_path.write_text(markdown, encoding="utf-8")
        router_records.append({
            **catalog,
            "model": model,
            "category": "Wi-Fi Router",
            "datasheetVersion": version,
            "datasheetFile": path.name,
            "knowledgeFile": output_path.as_posix(),
            "pageCount": page_count,
        })

    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_PATH.write_text(json.dumps({"allProducts": products, "wifiRouters": router_records}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"catalogProducts": len(products), "wifiRouterDatasheets": len(router_records), "output": str(CATALOG_PATH)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Product extraction failed: {error}", file=sys.stderr)
        raise
