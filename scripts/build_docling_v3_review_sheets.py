"""Build compact contact sheets for human review of blank candidates."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

root = Path("tmp/rag-v3-visual-review")
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
        draw.text((column * cell_width + 5, row * (cell_height + label_height) + cell_height + 4), path.relative_to(root).as_posix(), fill="black")
    output = root / f"review-sheet-{sheet_index:02d}.png"
    sheet.save(output)
    print(output)
