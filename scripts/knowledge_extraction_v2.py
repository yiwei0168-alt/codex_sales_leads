from __future__ import annotations
from pathlib import Path
from hashlib import sha256
import json
import pymupdf
from pptx import Presentation
from openpyxl import load_workbook

EXTRACTOR_VERSION = "layout-v2.0.0"

def _clean(value):
    return " ".join(str(value or "").replace("\x00", "").split()).strip()

def _block(block_id, unit_type, unit_index, block_type, text="", quality="success", **extra):
    return {"id": block_id, "unitType": unit_type, "unitIndex": unit_index, "blockType": block_type,
            "text": text, "extractorVersion": EXTRACTOR_VERSION, "quality": quality, **extra}

def extract_pdf(path: Path):
    blocks=[]; statuses=[]
    for index,page in enumerate(pymupdf.open(path),1):
        try:
            page_blocks=[]
            for block_index,item in enumerate(page.get_text("blocks",sort=True),1):
                x0,y0,x1,y1,text,*_=item
                text=text.strip()
                if text: page_blocks.append(_block(f"page-{index}-block-{block_index}","page",index,"paragraph",text,bbox=[x0,y0,x1,y1]))
            if page_blocks:
                blocks.extend(page_blocks)
                statuses.append("success")
            else:
                blocks.append(_block(f"page-{index}-ocr","page",index,"pending-ocr","",quality="pending-ocr"))
                statuses.append("pending-ocr")
        except Exception as error:
            blocks.append(_block(f"page-{index}-failed","page",index,"note",type(error).__name__,quality="failed"))
            statuses.append("failed")
    return blocks,statuses

def extract_pptx(path: Path):
    blocks=[];statuses=[]
    for index,slide in enumerate(Presentation(path).slides,1):
        found=False
        for shape_index,shape in enumerate(slide.shapes,1):
            if getattr(shape,"has_table",False):
                rows=[[_clean(cell.text) for cell in row.cells] for row in shape.table.rows]
                if rows:
                    blocks.append(_block(f"slide-{index}-table-{shape_index}","slide",index,"table",table={"headers":rows[0],"rows":rows[1:],"startRow":2}))
                    found=True
            elif getattr(shape,"has_text_frame",False):
                text="\n".join(_clean(p.text) for p in shape.text_frame.paragraphs if _clean(p.text))
                if text: blocks.append(_block(f"slide-{index}-text-{shape_index}","slide",index,"paragraph",text));found=True
        statuses.append("success" if found else "blank")
    return blocks,statuses

def extract_xlsx(path: Path):
    workbook=load_workbook(path,read_only=False,data_only=True);blocks=[];statuses=[]
    for index,sheet in enumerate(workbook.worksheets,1):
        rows=[[_clean(cell) for cell in row] for row in sheet.iter_rows(values_only=True)]
        rows=[row for row in rows if any(row)]
        merged=[str(item) for item in sheet.merged_cells.ranges]
        if rows:
            width=max(len(row) for row in rows);headers=(rows[0]+[""]*width)[:width]
            blocks.append(_block(f"sheet-{index}-table","sheet",index,"table",section=sheet.title,table={"headers":headers,"rows":[(row+[""]*width)[:width] for row in rows[1:]],"startRow":2},metadata={"mergedRanges":merged}))
            statuses.append("success")
        else: statuses.append("blank")
    return blocks,statuses

def extract_file(path: Path, storage_key: str):
    suffix=path.suffix.lower()
    if suffix==".pdf": blocks,statuses=extract_pdf(path)
    elif suffix==".pptx": blocks,statuses=extract_pptx(path)
    elif suffix==".xlsx": blocks,statuses=extract_xlsx(path)
    elif suffix in {".txt",".md"}:
        text=path.read_text(encoding="utf-8");blocks=[_block("document-text","document",1,"paragraph",text)];statuses=["success" if text.strip() else "blank"]
    else: raise ValueError(f"Unsupported controlled asset: {suffix}")
    return {"storageKey":storage_key,"sourceSha256":sha256(path.read_bytes()).hexdigest(),"extractorVersion":EXTRACTOR_VERSION,"blocks":blocks,
            "qualitySummary":{key:statuses.count(key) for key in ("success","blank","pending-ocr","failed")}}

def write_artifact(path: Path, documents):
    payload={"extractorVersion":EXTRACTOR_VERSION,"documents":documents};path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    return sha256(path.read_bytes()).hexdigest()
