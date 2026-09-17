from pathlib import Path
import json
from knowledge_extraction_v2 import extract_file,write_artifact,EXTRACTOR_VERSION

product=json.loads(Path("knowledge/product/processed/product-catalog.json").read_text(encoding="utf-8"))
company=json.loads(Path("knowledge/company/processed/company-manifest.json").read_text(encoding="utf-8"))
industry=json.loads(Path("knowledge/industry/processed/industry-manifest.json").read_text(encoding="utf-8"))
sources=[]
for item in product["datasheets"][:22]: sources.append(f"knowledge/product/{item['sourceFile']}")
sources += [f"knowledge/product/{item['sourceFile']}" for item in product["references"][:3]]
sources.append("knowledge/product/Cudy products list.xlsx")
sources += [f"knowledge/company/{item['sourceFile']}" for item in company["documents"]]
sources += [f"knowledge/industry/{item['sourceFile']}" for item in industry["documents"]]
sources=list(dict.fromkeys(sources))
synthetic_text=Path("tmp/knowledge-shadow-text.txt");synthetic_text.parent.mkdir(parents=True,exist_ok=True);synthetic_text.write_text("Controlled plain-text knowledge sample with an explicit negative condition.",encoding="utf-8");sources.append(synthetic_text.as_posix())
documents=[extract_file(Path(source),source.replace("\\","/")) for source in sources]
artifact=Path("tmp/knowledge-shadow-v2.json");artifact_hash=write_artifact(artifact,documents)
summary={key:sum(doc["qualitySummary"][key] for doc in documents) for key in ("success","blank","pending-ocr","failed")}
print(json.dumps({"mode":"shadow","extractorVersion":EXTRACTOR_VERSION,"documents":len(documents),"types":{ext:sum(Path(s).suffix.lower()==ext for s in sources) for ext in (".pdf",".pptx",".xlsx",".txt")},"units":summary,"artifact":str(artifact),"artifactSha256":artifact_hash,"externalCalls":0},ensure_ascii=False,indent=2))
