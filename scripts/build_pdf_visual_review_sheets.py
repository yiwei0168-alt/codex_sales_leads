"""Build page-numbered contact sheets from a source-bound PDF review package."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review-dir", required=True)
    parser.add_argument("--pages-per-sheet", type=int, default=9)
    args = parser.parse_args()
    review_dir = Path(args.review_dir).resolve()
    workspace = Path.cwd().resolve()
    if workspace not in review_dir.parents or not 1 <= args.pages_per_sheet <= 12:
        raise ValueError("Workspace review directory and 1-12 pages per sheet required")

    manifest_path = review_dir / "review.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get("schema") != "pdf-visual-review-candidates-v1":
        raise ValueError("PDF visual review package required")
    records = manifest["records"]
    pages = [record["unitIndex"] for record in records]
    if len(set(pages)) != len(pages) or pages != sorted(pages):
        raise ValueError("Unique ascending PDF page numbers required")

    columns = 3
    cell_width, cell_height, label_height = 360, 270, 24
    sheet_paths = []
    for start in range(0, len(records), args.pages_per_sheet):
        selection = records[start : start + args.pages_per_sheet]
        rows = (len(selection) + columns - 1) // columns
        sheet = Image.new("RGB", (cell_width * columns,
                                  (cell_height + label_height) * rows), "white")
        draw = ImageDraw.Draw(sheet)
        for offset, record in enumerate(selection):
            file_name = record["imageFile"]
            if Path(file_name).name != file_name or not file_name.endswith(".png"):
                raise ValueError("Unsafe review image path")
            image_path = review_dir / file_name
            image_bytes = image_path.read_bytes()
            if hashlib.sha256(image_bytes).hexdigest() != record["reviewImageSha256"]:
                raise ValueError(f"Page {record['unitIndex']} render changed")
            with Image.open(image_path) as opened:
                fitted = ImageOps.contain(opened.convert("RGB"),
                                          (cell_width, cell_height))
            row, column = divmod(offset, columns)
            x = column * cell_width + (cell_width - fitted.width) // 2
            y = row * (cell_height + label_height) + (cell_height - fitted.height) // 2
            sheet.paste(fitted, (x, y))
            draw.text((column * cell_width + 6,
                       row * (cell_height + label_height) + cell_height + 4),
                      f"Physical PDF page {record['unitIndex']}", fill="black")
        output = review_dir / f"contact-{selection[0]['unitIndex']:03d}-{selection[-1]['unitIndex']:03d}.png"
        sheet.save(output)
        sheet_paths.append(output.name)
    print(json.dumps({"reviewPackageSha256": hashlib.sha256(manifest_bytes).hexdigest(),
                      "pageCount": len(records), "contactSheets": sheet_paths}))


if __name__ == "__main__":
    main()
