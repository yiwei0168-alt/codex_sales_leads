from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch
from hashlib import sha256
import json
import unittest
from PIL import Image
from ocr_rendered_visual_review import main

class RenderedOCRTest(unittest.TestCase):
    def test_identity_replay_and_tamper(self):
        with TemporaryDirectory(dir=Path.cwd()/'tmp') as temp:
            folder=Path(temp); image=folder/'image.png'; Image.new('RGB',(10,10),'white').save(image)
            digest=sha256(image.read_bytes()).hexdigest(); image.rename(folder/(digest+'.png'))
            path=folder/'review.json'
            payload=dict(schema='pdf-visual-review-candidates-v1',sourceSha256='a'*64,extractionArtifactSha256='b'*64,
                qualityAccepted=False,extractionStatusChanged=False,externalCalls=0,
                records=[dict(blockId='p1',unitIndex=1,unitType='page',status='review-required',imageFile=digest+'.png',reviewImageSha256=digest)])
            path.write_text(json.dumps(payload),encoding='utf-8'); calls=[]
            def engine(*_args,**_kwargs):
                calls.append(1); return SimpleNamespace(txts=['Candidate'],scores=[.9],boxes=[[[0,0],[1,0],[1,1],[0,1]]])
            module=SimpleNamespace(RapidOCR=lambda **_kwargs:engine,EngineType=SimpleNamespace(ONNXRUNTIME=1),LangRec=SimpleNamespace(CH=1))
            argv=['ocr','--review',str(path),'--checkpoint-dir',str(folder/'checkpoints')]
            with patch('sys.argv',argv),patch.dict('sys.modules',{'rapidocr':module}),patch('socket.socket.connect'),patch('socket.create_connection'):
                main(); first=json.loads(path.read_text(encoding='utf-8')); self.assertEqual(len(calls),1)
                main(); replay=json.loads(path.read_text(encoding='utf-8')); self.assertEqual(len(calls),1)
                self.assertEqual(replay['ocrCheckpointReuses'],1); self.assertEqual(first['records'],replay['records'])
                self.assertFalse(replay['qualityAccepted'])
                (folder/(digest+'.png')).write_bytes(b'changed')
                with self.assertRaisesRegex(ValueError,'image changed'): main()
                payload['records'][0]['imageFile']='../other.png'; path.write_text(json.dumps(payload),encoding='utf-8')
                with self.assertRaisesRegex(ValueError,'render identity'): main()

if __name__=='__main__': unittest.main()
