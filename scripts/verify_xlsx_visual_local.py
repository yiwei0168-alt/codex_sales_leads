"""Synthetic native chart boundary probe; not independent document quality acceptance."""
from pathlib import Path
from unittest.mock import patch
import json
import zipfile
import xml.etree.ElementTree as ET
from uuid import uuid4
from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.drawing.image import Image as SheetImage
from PIL import Image
from knowledge_extraction_v2 import extract_file
from prepare_xlsx_visual_review import main,related,C

root=Path.cwd().resolve(); folder=root/'tmp/xlsx-visual-local'; folder.mkdir(parents=True,exist_ok=True)
source=folder/'source.xlsx'; picture=folder/'image.png'; Image.new('RGB',(10,10),'black').save(picture)
book=Workbook(); sheet=book.active; sheet.title='Chart'; sheet.append(['Value']); sheet.append([0]); sheet.append([5])
chart=BarChart(); chart.add_data(Reference(sheet,min_col=1,min_row=1,max_row=3),titles_from_data=True); sheet.add_chart(chart,'D2')
sheet.add_image(SheetImage(str(picture)),'H4'); book.save(source); book.close()
with zipfile.ZipFile(source) as archive: files={name:archive.read(name) for name in archive.namelist()}
chart_xml=ET.fromstring(files['xl/charts/chart1.xml']); values=chart_xml.find('.//{'+C+'}val/{'+C+'}numRef')
cache=ET.SubElement(values,'{'+C+'}numCache')
for index,value in enumerate(['0','5']):
    point=ET.SubElement(cache,'{'+C+'}pt',idx=str(index)); ET.SubElement(point,'{'+C+'}v').text=value
files['xl/charts/chart1.xml']=ET.tostring(chart_xml)
with zipfile.ZipFile(source,'w') as archive:
    for name,data in files.items(): archive.writestr(name,data)
document=extract_file(source,str(source)); artifact=folder/'artifact.json'; artifact.write_text(json.dumps({'documents':[document]}),encoding='utf-8')
output=folder/uuid4().hex
with patch('sys.argv',['prepare','--input',str(source),'--artifact',str(artifact),'--output',str(output)]): main()
result=json.loads((output/'review.json').read_text(encoding='utf-8')); assert len(result['records'])==1
objects=result['records'][0]['sheetObjects']; assert len(objects)==2
text='\n'.join(item['text'] for item in objects)
assert 'val[0] cached: 0' in text and 'val[1] cached: 5' in text and 'source formula:' in text
assert any(item['kind']=='image' for item in objects)
class ExternalArchive:
    def read(self,_path): return b'<Relationships><Relationship Id="rId1" Target="https://example.invalid/private" TargetMode="External"/></Relationships>'
try: related(ExternalArchive(),'xl/drawings/drawing1.xml','rId1'); raise AssertionError('External relationship accepted')
except ValueError: pass
evidence=dict(syntheticFixture=True,objects=len(objects),nativeChartCacheZeroPreserved=True,formulasNotEvaluated=True,externalRelationshipRejected=True,qualityAccepted=False,externalCalls=0,output=str(output.relative_to(root)))
(root/'tmp/xlsx-visual-local-result.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8'); print(json.dumps(evidence))
