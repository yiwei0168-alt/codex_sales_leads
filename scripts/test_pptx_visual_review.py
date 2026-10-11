from io import BytesIO
from types import SimpleNamespace
import unittest
import xml.etree.ElementTree as ET
from PIL import Image
from pptx import Presentation
from pptx.util import Inches
from pptx.enum.shapes import MSO_CONNECTOR
from prepare_pptx_visual_review import connector_candidate, diagram_candidate, resolve_shape, visible_image


class VisualReviewTest(unittest.TestCase):
    def test_connector_keeps_native_geometry_without_inventing_attachments(self):
        deck = Presentation(); slide = deck.slides.add_slide(deck.slide_layouts[6])
        line = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, 100, 200, 400, 600)
        result = connector_candidate(line)
        self.assertEqual(result["offset"], {"x": "100", "y": "200"})
        self.assertEqual(result["extent"], {"cx": "300", "cy": "400"})
        self.assertEqual(result["coordinateSpace"], "parent-group-emu")
        self.assertIsNone(result["startAttachment"])
        self.assertIsNone(result["endAttachment"])
        target = slide.shapes.add_textbox(0, 0, Inches(1), Inches(1))
        line.begin_connect(target, 0)
        attached = connector_candidate(line)
        self.assertEqual(attached["startAttachment"]["id"], str(target.shape_id))
        self.assertIsNone(connector_candidate(target))

    def test_native_diagram_binding_and_external_rejection(self):
        element = ET.fromstring('''<shape xmlns:d="http://schemas.openxmlformats.org/drawingml/2006/diagram"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><d:relIds r:dm="data1"/></shape>''')
        blob = b'''<d:dataModel xmlns:d="http://schemas.openxmlformats.org/drawingml/2006/diagram"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><d:ptLst>
          <d:pt modelId="node-a"><d:t><a:p><a:r><a:t>Label</a:t></a:r></a:p></d:t></d:pt>
          </d:ptLst><d:cxnLst><d:cxn srcId="node-a" destId="node-b"/></d:cxnLst></d:dataModel>'''
        relation = SimpleNamespace(is_external=False, target_part=SimpleNamespace(blob=blob))
        shape = SimpleNamespace(element=element, part=SimpleNamespace(rels={"data1": relation}))
        result = diagram_candidate(shape)
        self.assertEqual(result["points"][0]["text"], "Label")
        self.assertEqual(result["connections"][0]["srcId"], "node-a")
        relation.is_external = True
        with self.assertRaises(ValueError): diagram_candidate(shape)

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
