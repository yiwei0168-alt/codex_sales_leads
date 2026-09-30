/** Read-only exact-source audit for supplemental PPTX/XLSX cases outside the frozen Gold corpus. */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool} from "../src/lib/rag/db";
import {readEvidence,searchDocuments} from "../src/lib/knowledge/vectorless";

type Source={nodeId:string;unitType:string;unitIndex:number;sheetName?:string;rowStart?:number;rowEnd?:number;quote:string};
type Case={id:string;query:string;expectedAnswer:string;file:string;sourceSha256:string;documentId:string;sources:Source[]};
type Manifest={status:string;cases:Case[]};
nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const manifest=JSON.parse(await readFile("docs/evidence/ma24-supplemental-format-cases-2026-09-30.json","utf8")) as Manifest;
if(manifest.status!=="assistant-source-checked-supplemental"||manifest.cases.length!==2)throw new Error("Unexpected supplemental manifest");
try{
  const results=[];
  for(const item of manifest.cases){
    const hash=createHash("sha256").update(await readFile(item.file)).digest("hex");
    if(hash!==item.sourceSha256||!item.expectedAnswer.trim())throw new Error(`${item.id}: original or answer changed`);
    const candidates=await searchDocuments(OWNER_USER_ID,item.query);
    if(!candidates.some(candidate=>candidate.documentId===item.documentId))throw new Error(`${item.id}: current candidate missed`);
    for(const source of item.sources){
      const node=await readEvidence(OWNER_USER_ID,source.nodeId);
      const location=node?.source_location;
      if(!node||node.documentId!==item.documentId||node.source_sha256!==hash||!node.content.includes(source.quote)
        ||location?.unitType!==source.unitType||location?.unitIndex!==source.unitIndex
        ||(source.sheetName!==undefined&&location?.sheetName!==source.sheetName)
        ||(source.rowStart!==undefined&&location?.rowStart!==source.rowStart)
        ||(source.rowEnd!==undefined&&location?.rowEnd!==source.rowEnd))throw new Error(`${item.id}: current exact evidence mismatch`);
    }
    results.push({id:item.id,candidateCount:candidates.length,sourceCoordinates:item.sources.length,originalHashMatches:true,currentEvidenceMatches:true});
  }
  console.log(JSON.stringify({local:true,readOnly:true,results,externalCalls:0,answerGenerationCompared:false}));
}finally{await getPool().end();}
