"""Render local PDF originals for review; no OCR inference or automatic approval."""
import argparse
import json
import math
import socket
from hashlib import sha256
from pathlib import Path
import pymupdf

def main():
    parser=argparse.ArgumentParser()
    for name in ('input','artifact','output'): parser.add_argument('--'+name,required=True)
    args=parser.parse_args(); root=Path.cwd().resolve()
    source,artifact,output=(Path(value).resolve() for value in (args.input,args.artifact,args.output))
    if any(root not in p.parents for p in (source,artifact,output)) or source.suffix.lower()!='.pdf':
        raise ValueError('Workspace PDF and output required')
    if (output/'review.json').exists(): raise ValueError('Use a new output directory')
    source_hash=sha256(source.read_bytes()).hexdigest(); artifact_bytes=artifact.read_bytes()
    payload=json.loads(artifact_bytes); documents=payload.get('documents',[payload])
    if len(documents)!=1 or documents[0]['sourceSha256']!=source_hash: raise ValueError('Source identity changed')
    pending=[b for b in documents[0]['blocks'] if b['quality']=='pending-ocr']
    if not pending or any(b['unitType']!='page' for b in pending): raise ValueError('Pending PDF pages required')
    def deny(*_args,**_kwargs): raise RuntimeError('Network disabled during PDF review')
    socket.socket.connect=deny; socket.create_connection=deny
    records=[]; output.mkdir(parents=True,exist_ok=True)
    with pymupdf.open(source) as document:
        if any(not isinstance(b['unitIndex'],int) or not 1<=b['unitIndex']<=len(document) for b in pending):
            raise ValueError('Invalid source page')
        for block in pending:
            page=document[block['unitIndex']-1]
            scale=min(1.5,math.sqrt(8_000_000/max(1,page.rect.width*page.rect.height)))
            pixmap=page.get_pixmap(matrix=pymupdf.Matrix(scale,scale),alpha=False,annots=True)
            image=pixmap.tobytes('png'); digest=sha256(image).hexdigest(); (output/f'{digest}.png').write_bytes(image)
            records.append(dict(blockId=block['id'],unitIndex=block['unitIndex'],unitType='page',status='review-required',
                reason='original-page-render-requires-review',imageFile=f'{digest}.png',reviewImageSha256=digest,
                coordinateSpace='pdf-page-render',pageRect=list(page.rect),imageWidth=pixmap.width,imageHeight=pixmap.height))
    if sha256(source.read_bytes()).hexdigest()!=source_hash or artifact.read_bytes()!=artifact_bytes: raise ValueError('Source changed during render')
    result=dict(schema='pdf-visual-review-candidates-v1',sourceSha256=source_hash,extractionArtifactSha256=sha256(artifact_bytes).hexdigest(),
                records=records,externalCalls=0,qualityAccepted=False,extractionStatusChanged=False)
    (output/'review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(renderedPages=len(records),externalCalls=0,qualityAccepted=False)))

if __name__=='__main__': main()
