"""Render selected real development PDF pages, not an independent quality evaluation."""
from pathlib import Path
import json
import subprocess
import sys
from hashlib import sha256
from knowledge_extraction_v2 import extract_file
from PIL import Image

root=Path.cwd().resolve(); source=root/'tmp/ma24-public-eval-candidates/itu-handbook-2020.pdf'
folder=root/'tmp/pdf-preview-local'; folder.mkdir(parents=True,exist_ok=True)
document=extract_file(source,str(source))
document['blocks']=[b for b in document['blocks'] if b['quality']=='pending-ocr'][:2]
artifact=folder/'artifact.json'; artifact.write_text(json.dumps({'documents':[document]}),encoding='utf-8')
# New immutable attempt directory; retained for visual inspection.
from uuid import uuid4
output=folder/uuid4().hex
subprocess.run([sys.executable,str(root/'scripts/prepare_pdf_visual_review.py'),'--input',str(source),'--artifact',str(artifact),'--output',str(output)],check=True,timeout=120)
result=json.loads((output/'review.json').read_text(encoding='utf-8'))
assert result['sourceSha256']==sha256(source.read_bytes()).hexdigest()
assert len(result['records'])==2 and not result['qualityAccepted'] and result['externalCalls']==0
for record,block in zip(result['records'],document['blocks']):
    assert record['blockId']==block['id'] and record['unitIndex']==block['unitIndex']
    image=output/record['imageFile']; assert sha256(image.read_bytes()).hexdigest()==record['reviewImageSha256']
    with Image.open(image) as opened:
        assert opened.width*opened.height<=8_010_000
evidence=dict(realDevelopmentPDF=True,pages=[r['unitIndex'] for r in result['records']],hashesVerified=True,externalCalls=0,qualityAccepted=False,output=str(output.relative_to(root)))
(root/'tmp/pdf-preview-local-result.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
print(json.dumps(evidence))
