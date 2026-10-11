"""Append local OCR to unbound page renders. Never accepts evidence or contacts a cloud."""
from pathlib import Path
from hashlib import sha256
import argparse
import json
import os
import re
import socket
import uuid
import numpy as np
from PIL import Image
from prepare_pptx_visual_review import checkpoint_lines

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--review',required=True); parser.add_argument('--checkpoint-dir',required=True)
    args=parser.parse_args(); root=Path.cwd().resolve(); path=Path(args.review).resolve(); checkpoint_root=Path(args.checkpoint_dir).resolve()
    if any(root not in p.parents for p in (path,checkpoint_root)): raise ValueError('Workspace paths required')
    original=path.read_bytes(); review=json.loads(original)
    if (review['schema'] not in {'pdf-visual-review-candidates-v1','xlsx-visual-review-candidates-v1'} or review['qualityAccepted'] is not False
            or review['extractionStatusChanged'] is not False or review['externalCalls']!=0 or not review['records']):
        raise ValueError('Unreviewed local visual candidate package required')
    if any(record['status']!='review-required' for record in review['records']): raise ValueError('Unreviewed objects required')
    images=review['records'] if review['schema']=='pdf-visual-review-candidates-v1' else [image for record in review['records'] for obj in record.get('sheetObjects',[]) for image in obj.get('images',[])]
    if not images:
        print(json.dumps(dict(images=0,executed=0,reused=0,externalCalls=0,qualityAccepted=False))); return
    for record in images:
        digest=record['reviewImageSha256']
        if not re.fullmatch('[a-f0-9]{64}',digest) or record['imageFile']!=digest+'.png':
            raise ValueError('Invalid render identity')
        image=path.parent/record['imageFile']
        if sha256(image.read_bytes()).hexdigest()!=digest: raise ValueError('Rendered image changed')
    models=root/'.models/docling-v3/RapidOcr'
    names=['PP-OCRv6_det_small.onnx','ch_ppocr_mobile_v2.0_cls_mobile.onnx','PP-OCRv6_rec_small.onnx']
    hashes={name:sha256((models/name).read_bytes()).hexdigest() for name in names}
    identity=dict(source=review['sourceSha256'],artifact=review['extractionArtifactSha256'],models=hashes,
                  implementation=sha256(Path(__file__).read_bytes()+Path(checkpoint_lines.__code__.co_filename).read_bytes()).hexdigest())
    checkpoint=checkpoint_root/'rendered-ocr'/sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest(); checkpoint.mkdir(parents=True,exist_ok=True)
    def deny(*_args,**_kwargs): raise RuntimeError('Network disabled during local OCR')
    socket.socket.connect=deny; socket.create_connection=deny
    from rapidocr import RapidOCR, EngineType, LangRec
    engine=RapidOCR(params={'Det.model_path':models/names[0],'Cls.model_path':models/names[1],'Rec.model_path':models/names[2],
        'Det.engine_type':EngineType.ONNXRUNTIME,'Cls.engine_type':EngineType.ONNXRUNTIME,'Rec.engine_type':EngineType.ONNXRUNTIME,
        'Rec.lang_type':LangRec.CH,'Global.text_score':0.35})
    executed=reused=0
    for record in images:
        image_path=path.parent/record['imageFile']
        if sha256(image_path.read_bytes()).hexdigest()!=record['reviewImageSha256']: raise ValueError('Rendered image changed')
        def produce():
            with Image.open(image_path) as image:
                result=engine(np.asarray(image.convert('RGB')),text_score=0.35)
            return [dict(text=text,confidence=float(score),box=np.asarray(box).tolist()) for text,score,box in zip(
                result.txts if result.txts is not None else [],result.scores if result.scores is not None else [],result.boxes if result.boxes is not None else [])]
        lines,hit=checkpoint_lines(checkpoint,record['reviewImageSha256'],produce)
        record['ocrLines']=lines; record['ocrCoordinateSpace']='rendered-image-pixels'
        executed+=int(not hit); reused+=int(hit)
    review.update(ocrComplete=True,modelSha256=hashes,ocrImageExecutions=executed,ocrCheckpointReuses=reused)
    if path.read_bytes()!=original: raise ValueError('Candidate package changed during OCR')
    temporary=path.with_suffix('.'+uuid.uuid4().hex+'.tmp')
    try:
        with temporary.open('x',encoding='utf-8') as stream:
            stream.write(json.dumps(review,ensure_ascii=False,indent=2,allow_nan=False)); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary,path)
    finally: temporary.unlink(missing_ok=True)
    print(json.dumps(dict(images=len(images),executed=executed,reused=reused,externalCalls=0,qualityAccepted=False)))

if __name__=='__main__': main()
