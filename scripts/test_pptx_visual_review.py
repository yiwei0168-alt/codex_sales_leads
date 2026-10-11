from io import BytesIO
from types import SimpleNamespace
import unittest
from PIL import Image
from pptx import Presentation
from pptx.util import Inches
from prepare_pptx_visual_review import resolve_shape, visible_image


class VisualReviewTest(unittest.TestCase):
    def test_source_crop_excludes_hidden_pixels(self):
        image = Image.new("RGB", (100, 50), "white")
        stream = BytesIO(); image.save(stream, format="PNG")
        shape = SimpleNamespace(image=SimpleNamespace(blob=stream.getvalue()),crop_left=.2,crop_top=0,
                                crop_right=.1,crop_bottom=.2,rotation=90)
        cropped, info = visible_image(shape)
        self.assertEqual(cropped.size, (70, 40))
        self.assertEqual(info["coordinateSpace"], "cropped-image-pixels")
        self.assertEqual(info["rotation"], 90)
        shape.crop_left = -.1
        with self.assertRaises(ValueError): visible_image(shape)

    def test_nested_native_id_must_match(self):
        deck = Presentation(); slide = deck.slides.add_slide(deck.slide_layouts[6])
        group = slide.shapes.add_group_shape()
        child = group.shapes.add_textbox(0, 0, Inches(1), Inches(1))
        block = {"unitIndex": 1, "shapePath": [1, 1], "shapeIdPath": [group.shape_id, child.shape_id]}
        self.assertEqual(resolve_shape(deck, block).shape_id, child.shape_id)
        block["shapeIdPath"] = [group.shape_id, child.shape_id + 1]
        with self.assertRaises(ValueError): resolve_shape(deck, block)
        block["shapePath"] = [0, 1]
        with self.assertRaises(ValueError): resolve_shape(deck, block)


if __name__ == "__main__":
    unittest.main()
