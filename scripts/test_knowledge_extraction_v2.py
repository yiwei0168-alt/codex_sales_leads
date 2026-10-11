"""Regression checks for original spreadsheet values and physical row positions."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from openpyxl import Workbook
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


if __name__ == "__main__":
    unittest.main()
