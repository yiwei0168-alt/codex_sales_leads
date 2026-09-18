"""Build compact contact sheets for exact Docling unit review."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument("--review-dir", default="tmp/rag-v3-visual-review")
args = parser.parse_args()
root = Path(args.review_dir)
manifest_path = root / "review-manifest.json"
labels = {}
if manifest_path.is_file():
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    labels = {
        Path(item["image"]).resolve(): f"{item['reviewId']} | {Path(item['storageKey']).name} | {item['status']}"
        for item in manifest["items"] if item.get("image")
    }
images = sorted(path for path in root.rglob("*.png") if not path.name.startswith("review-sheet-"))
cell_width, cell_height, label_height = 420, 300, 24
for sheet_index, start in enumerate(range(0, len(images), 9), start=1):
    sheet = Image.new("RGB", (cell_width * 3, (cell_height + label_height) * 3), "white")
    draw = ImageDraw.Draw(sheet)
    for offset, path in enumerate(images[start : start + 9]):
        row, column = divmod(offset, 3)
        source = Image.open(path).convert("RGB")
        fitted = ImageOps.contain(source, (cell_width, cell_height))
        x = column * cell_width + (cell_width - fitted.width) // 2
        y = row * (cell_height + label_height) + (cell_height - fitted.height) // 2
        sheet.paste(fitted, (x, y))
        label = labels.get(path.resolve(), path.relative_to(root).as_posix())
        draw.text((column * cell_width + 5, row * (cell_height + label_height) + cell_height + 4), label[:65], fill="black")
    output = root / f"review-sheet-{sheet_index:02d}.png"
    sheet.save(output)
    print(output)
