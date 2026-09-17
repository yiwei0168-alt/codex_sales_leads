import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery, tenantTransaction } from "../src/lib/rag/db";
import { assertResolvedInsideKnowledgeRoot, safeKnowledgeStorageKey } from "../src/lib/knowledge/document-repository";

nextEnv.loadEnvConfig(process.cwd());
const limit=Math.min(100,Math.max(1,Number(process.argv.find(value=>value.startsWith("--limit="))?.split("=")[1]??10)));

function runPython(source:string,artifact:string):Promise<Record<string,unknown>>{
  return new Promise((resolveRun,reject)=>{
    const child=spawn(process.env.PYTHON_BINARY?.trim()||"python",["scripts/extract-uploaded-knowledge.py",source,artifact],{cwd:process.cwd(),windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let stdout="";let stderr="";const timer=setTimeout(()=>child.kill(),120_000);
    child.stdout.on("data",chunk=>{stdout+=String(chunk);});child.stderr.on("data",chunk=>{stderr+=String(chunk);});
    child.once("error",reject);child.once("exit",code=>{clearTimeout(timer);if(code!==0)return reject(new Error(stderr.slice(-500)||`extractor-exit-${code}`));
      try{resolveRun(JSON.parse(stdout.trim()) as Record<string,unknown>);}catch{reject(new Error("extractor-invalid-json"));}});
  });
}

let completed=0;let failed=0;
try{
  for(let index=0;index<limit;index++){
    const job=await tenantTransaction(OWNER_USER_ID,async client=>{
      const selected=await client.query<{id:string;storageKey:string}>(`select id,storage_key as "storageKey" from knowledge_upload_job where status='pending' order by created_at for update skip locked limit 1`);
      if(!selected.rows[0])return null;
      await client.query("update knowledge_upload_job set status='running',updated_at=now(),error_code=null where id=$1",[selected.rows[0].id]);return selected.rows[0];
    },"admin");
    if(!job)break;
    const storageKey=safeKnowledgeStorageKey(job.storageKey);const source=resolve(storageKey);assertResolvedInsideKnowledgeRoot(source);
    const artifactKey=safeKnowledgeStorageKey(`knowledge/uploads/${OWNER_USER_ID}/${job.id}.extraction.json`);
    const artifact=resolve(artifactKey);assertResolvedInsideKnowledgeRoot(artifact);await mkdir(resolve("knowledge","uploads",OWNER_USER_ID),{recursive:true});
    const started=Date.now();
    try{
      const output=await runPython(source,artifact);
      await tenantQuery(OWNER_USER_ID,`update knowledge_upload_job set status='extracted',extraction_artifact_key=$2,extractor_version=$3,updated_at=now(),metrics=metrics||$4::jsonb where id=$1`,[job.id,artifactKey,String(output.extractorVersion??"unknown"),JSON.stringify({validOutputItems:Number(output.blocks??0),downstreamUsedItems:0,latencyMs:Date.now()-started,retries:0,qualitySummary:output.qualitySummary??{},artifactSha256:output.artifactSha256??null,usageBoundary:"local-extraction-awaiting-review-and-indexing",optimizationOpportunity:"Review extracted units before indexing"})],"admin");completed++;
    }catch(error){await tenantQuery(OWNER_USER_ID,"update knowledge_upload_job set status='failed',error_code=$2,updated_at=now(),metrics=metrics||$3::jsonb where id=$1",[job.id,error instanceof Error?error.name:"unknown",JSON.stringify({validOutputItems:0,downstreamUsedItems:0,latencyMs:Date.now()-started,retries:0,discardedReasonCounts:{extractionFailed:1}})],"admin");failed++;}
  }
  console.log(JSON.stringify({inputJobs:completed+failed,completed,failed,embeddingCalls:0,modelCalls:0,externalCalls:0},null,2));
}finally{await getPool().end();}
