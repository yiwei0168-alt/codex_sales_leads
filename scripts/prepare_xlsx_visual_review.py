"""Read native OOXML drawing/chart candidates without evaluating formulas or external links."""
from pathlib import Path
from hashlib import sha256
import argparse
import json
import posixpath
import zipfile
import xml.etree.ElementTree as ET
from knowledge_extraction_v2 import xlsx_visual_references

R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
C='http://schemas.openxmlformats.org/drawingml/2006/chart'
X='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
A='http://schemas.openxmlformats.org/drawingml/2006/main'

def related(archive,part,relationship_id):
    rels=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
    rows=ET.fromstring(archive.read(rels))
    matches=[row for row in rows if row.get('Id')==relationship_id]
    if len(matches)!=1: raise ValueError('Missing or duplicate internal relationship')
    row=matches[0]
    if row.get('TargetMode')=='External': raise ValueError('External relationship is not fetched')
    target=row.get('Target','')
    path=posixpath.normpath(target.lstrip('/') if target.startswith('/') else posixpath.join(posixpath.dirname(part),target))
    if not path.startswith('xl/') or ':' in path or '\\' in path: raise ValueError('Invalid internal part')
    return path

def chart_text(archive,part):
    chart=ET.fromstring(archive.read(part)); lines=[]
    title=chart.find('.//{'+C+'}title')
    if title is not None: lines.append('Title: '+' '.join(node.text or '' for node in title.findall('.//{'+A+'}t')))
    for ordinal,series in enumerate(chart.findall('.//{'+C+'}ser'),1):
        lines.append(f'Series {ordinal}')
        for field in ['tx','cat','val','xVal','yVal','bubbleSize']:
            node=series.find('{'+C+'}'+field)
            if node is None: continue
            for formula in node.findall('.//{'+C+'}f'): lines.append(f'{field} source formula: {formula.text or ""}')
            points=node.findall('.//{'+C+'}pt')
            for point in points:
                value=point.find('{'+C+'}v'); lines.append(f'{field}[{point.get("idx")}] cached: {value.text if value is not None else ""}')
            if not points: lines.append(f'{field}: no cached points; formula not evaluated')
    return '\n'.join(lines) or 'No supported native series; inspect original chart'

def drawing_objects(archive,part):
    objects=[]
    for ordinal,anchor in enumerate(ET.fromstring(archive.read(part)),1):
        positions=[]
        for end in ['from','to']:
            node=anchor.find('{'+X+'}'+end)
            if node is not None: positions.append(end+': '+', '.join(child.tag.rsplit('}',1)[-1]+'='+str(child.text) for child in node))
        text=[]; kind='unsupported'
        for chart in anchor.findall('.//{'+C+'}chart'):
            chart_part=related(archive,part,chart.get('{'+R+'}id'))
            text.append('Chart part: '+chart_part+'\n'+chart_text(archive,chart_part)); kind='chart'
        for picture in anchor.findall('.//{'+A+'}blip'):
            image_part=related(archive,part,picture.get('{'+R+'}embed') or picture.get('{'+R+'}link'))
            text.append('Embedded image part: '+image_part+'\nSHA-256: '+sha256(archive.read(image_part)).hexdigest()); kind='image' if kind=='unsupported' else 'mixed'
        native=' '.join(node.text or '' for node in anchor.findall('.//{'+A+'}t'))
        if native: text.append('Native text: '+native)
        objects.append(dict(kind=kind,objectIndex=ordinal,anchor='; '.join(positions) or 'No cell anchor (absolute placement)',
                            text='\n'.join(text) or 'Unsupported drawing; inspect original',sourcePart=part))
    return objects

def main():
    parser=argparse.ArgumentParser()
    for name in ['input','artifact','output']: parser.add_argument('--'+name,required=True)
    args=parser.parse_args(); root=Path.cwd().resolve()
    source,artifact,output=(Path(value).resolve() for value in [args.input,args.artifact,args.output])
    if any(root not in path.parents for path in [source,artifact,output]) or source.suffix.lower()!='.xlsx': raise ValueError('Workspace XLSX required')
    if (output/'review.json').exists(): raise ValueError('Use a new output directory')
    source_hash=sha256(source.read_bytes()).hexdigest(); artifact_bytes=artifact.read_bytes(); payload=json.loads(artifact_bytes)
    documents=payload.get('documents',[payload]); assert len(documents)==1
    document=documents[0]
    if document['sourceSha256']!=source_hash: raise ValueError('Source identity changed')
    originals=xlsx_visual_references(source); records=[]
    with zipfile.ZipFile(source) as archive:
        for block in document['blocks']:
            if block['quality']!='pending-ocr': continue
            reference=block['visualReference']
            if block['unitType']!='sheet' or reference not in originals.get(block['section'],[]): raise ValueError('Visual reference changed')
            record=dict(blockId=block['id'],unitIndex=block['unitIndex'],unitType='sheet',status='review-required',
                reason='native-sheet-visual-requires-review',sheetName=block['section'],visualReference=reference,sheetObjects=[])
            if reference['kind']=='drawing':
                try:
                    part=related(archive,reference['worksheetPart'],reference['relationshipId'])
                    record['sheetObjects']=drawing_objects(archive,part)
                except (KeyError,ValueError,ET.ParseError): record['reason']='unsupported-sheet-visual-reference'
            else: record['reason']='unsupported-sheet-visual-reference'
            records.append(record)
    if not records: raise ValueError('Pending sheet visuals required')
    if sha256(source.read_bytes()).hexdigest()!=source_hash or artifact.read_bytes()!=artifact_bytes: raise ValueError('Source changed')
    output.mkdir(parents=True,exist_ok=True)
    result=dict(schema='xlsx-visual-review-candidates-v1',sourceSha256=source_hash,extractionArtifactSha256=sha256(artifact_bytes).hexdigest(),records=records,externalCalls=0,qualityAccepted=False,extractionStatusChanged=False)
    (output/'review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(objects=len(records),externalCalls=0,qualityAccepted=False)))

if __name__=='__main__': main()
