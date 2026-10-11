"""Regression checks for original spreadsheet values and physical row positions."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from openpyxl import Workbook
import pymupdf
from pptx import Presentation
from pptx.util import Inches
from knowledge_extraction_v2 import extract_file


class SpreadsheetCoordinatesTest(unittest.TestCase):
    def test_blank_rows_zero_and_false_keep_original_positions(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "coordinates.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "Original"
            sheet["B2"] = "Value"
            sheet["B4"] = 0
            sheet["C4"] = False
            sheet["B6"] = -1.5
            workbook.create_sheet("Blank")
            workbook.save(path)
            workbook.close()
            artifact = extract_file(path, "coordinates.xlsx")
            self.assertEqual(artifact["qualitySummary"]["success"], 1)
            self.assertEqual(artifact["qualitySummary"]["blank"], 1)
            block = artifact["blocks"][0]
            self.assertEqual(block["section"], "Original")
            self.assertEqual(block["unitIndex"], 1)
            table = block["table"]
            self.assertEqual(table["startRow"], 2)
            self.assertEqual(table["cellRange"], "A1:C6")
            self.assertEqual(table["headerRow"], 1)
            self.assertEqual(table["startColumn"], 1)
            self.assertEqual(table["headers"], ["", "", ""])
            physical_rows = [table["headers"], *table["rows"]]
            self.assertEqual(len(physical_rows), 6)
            self.assertEqual(physical_rows[1][1], "Value")
            self.assertEqual(physical_rows[2], ["", "", ""])
            self.assertEqual(physical_rows[3][1:], ["0", "False"])
            self.assertEqual(physical_rows[4], ["", "", ""])
            self.assertEqual(physical_rows[5][1], "-1.5")

    def test_zero_only_sheet_is_not_blank(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "zero.xlsx"
            workbook = Workbook()
            workbook.active["A1"] = 0
            workbook.save(path)
            workbook.close()
            artifact = extract_file(path, "zero.xlsx")
            self.assertEqual(artifact["qualitySummary"]["success"], 1)
            self.assertEqual(artifact["blocks"][0]["table"]["headers"], ["0"])


class PptxGroupTest(unittest.TestCase):
    def test_nested_text_has_unique_order_and_native_object_paths(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "groups.pptx"
            deck = Presentation()
            slide = deck.slides.add_slide(deck.slide_layouts[6])
            direct = slide.shapes.add_textbox(0, 0, Inches(1), Inches(1))
            direct.text = "Direct"
            group = slide.shapes.add_group_shape()
            child = group.shapes.add_textbox(0, 0, Inches(1), Inches(1))
            child.text = "Grouped"
            nested = group.shapes.add_group_shape()
            inner = nested.shapes.add_textbox(0, 0, Inches(1), Inches(1))
            inner.text = "Deep"
            deck.save(path)
            artifact = extract_file(path, "groups.pptx")
            blocks = artifact["blocks"]
            self.assertEqual([b["text"] for b in blocks], ["Direct", "Grouped", "Deep"])
            self.assertEqual([b["shapePath"] for b in blocks], [[1], [2, 1], [2, 2, 1]])
            self.assertEqual(blocks[2]["shapeIdPath"], [group.shape_id, nested.shape_id, inner.shape_id])
            self.assertEqual(len(set(b["id"] for b in blocks)), 3)


class PdfBlankPageTest(unittest.TestCase):
    def test_only_structurally_empty_pages_are_blank(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "pages.pdf"
            document = pymupdf.open()
            document.new_page()  # No page content.
            document.new_page().insert_text((50, 50), "Original text")
            page = document.new_page()
            page.draw_rect(pymupdf.Rect(10, 10, 100, 100), color=(0, 0, 0))
            document.new_page().add_text_annot((50, 50), "Visible annotation")
            document.save(path)
            document.close()
            artifact = extract_file(path, "pages.pdf")
            self.assertEqual(artifact["qualitySummary"], {
                "success": 1, "blank": 1, "pending-ocr": 2, "failed": 0})
            self.assertEqual(artifact["blocks"][0]["quality"], "blank")
            self.assertEqual(artifact["blocks"][0]["unitIndex"], 1)


if __name__ == "__main__":
    unittest.main()
