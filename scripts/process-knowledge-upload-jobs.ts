import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { getPool, query, tenantQuery, tenantTransaction } from "../src/lib/rag/db";
import { assertResolvedInsideKnowledgeRoot, safeKnowledgeStorageKey } from "../src/lib/knowledge/document-repository";
import { registerVectorlessUpload } from "../src/lib/knowledge/vectorless-registration";

nextEnv.loadEnvConfig(process.cwd());
const limit=Math.min(100,Math.max(1,Number(process.argv.find(value=>value.startsWith("--limit="))?.split("=")[1]??10)));
const onlyJobId=process.argv.find(value=>value.startsWith("--job-id="))?.split("=")[1]??null;
if(onlyJobId&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(onlyJobId))throw new Error("Invalid job ID");

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
  const accounts=await query<{id:string}>("select id from app_user where status='active' order by id");
  for(let index=0;index<limit;index++){
    let job:{id:string;storageKey:string;visibility:string;userId:string;leaseToken:string}|null=null;
    for(const account of accounts){
      job=await tenantTransaction(account.id,async client=>{
        const selected=await client.query<{id:string;storageKey:string;visibility:string}>(`select id,storage_key as "storageKey",visibility from knowledge_upload_job
          where user_id=$1 and ($2::uuid is null or id=$2) and (status='pending' or (status='running' and lease_until<now()))
          order by created_at for update skip locked limit 1`,[account.id,onlyJobId]);
        if(!selected.rows[0])return null;
        const leaseToken=randomUUID();
        await client.query("update knowledge_upload_job set status='running',lease_token=$3,lease_until=now()+interval '4 minutes',updated_at=now(),error_code=null where id=$1 and user_id=$2",[selected.rows[0].id,account.id,leaseToken]);
        return {...selected.rows[0],userId:account.id,leaseToken};
      });
      if(job)break;
    }
    if(!job)break;
    const storageKey=safeKnowledgeStorageKey(job.storageKey);const source=resolve(storageKey);assertResolvedInsideKnowledgeRoot(source);
    const artifactKey=safeKnowledgeStorageKey(`knowledge/uploads/${job.userId}/${job.id}.${job.leaseToken}.extraction.json`);
    const artifact=resolve(artifactKey);assertResolvedInsideKnowledgeRoot(artifact);await mkdir(resolve("knowledge","uploads",job.userId),{recursive:true});
    const started=Date.now();
    try{
      const output=await runPython(source,artifact);
      const saved=await tenantQuery<{id:string}>(job.userId,`update knowledge_upload_job set status='extracted',extraction_artifact_key=$2,extractor_version=$3,
        lease_token=null,lease_until=null,updated_at=now(),metrics=metrics||$4::jsonb where id=$1 and user_id=$5 and status='running'
        and lease_token=$6 and lease_until>now() returning id`,[job.id,artifactKey,String(output.extractorVersion??"unknown"),JSON.stringify({validOutputItems:Number(output.blocks??0),downstreamUsedItems:0,latencyMs:Date.now()-started,retries:0,qualitySummary:output.qualitySummary??{},artifactSha256:output.artifactSha256??null,usageBoundary:"local-extraction-awaiting-review-and-indexing",optimizationOpportunity:"Review extracted units before indexing"}),job.userId,job.leaseToken]);
      if(!saved[0])throw new Error("Upload lease expired or changed");
      if(job.visibility==="private"){
        const registration=await registerVectorlessUpload(job.userId,job.id,{language:"und",authorityLevel:2});
        if(registration.treeStatus!=="searchable")throw new Error("Private tree indexing failed");
      }
      completed++;
    }catch(error){await tenantQuery(job.userId,`update knowledge_upload_job set status='failed',lease_token=null,lease_until=null,error_code=$2,
      updated_at=now(),metrics=metrics||$3::jsonb where id=$1 and user_id=$4 and
      ((status='running' and lease_token=$5 and lease_until>now()) or (status='extracted' and extraction_artifact_key=$6))`,
      [job.id,error instanceof Error?error.name:"unknown",JSON.stringify({validOutputItems:0,downstreamUsedItems:0,latencyMs:Date.now()-started,retries:0,discardedReasonCounts:{extractionFailed:1}}),job.userId,job.leaseToken,artifactKey]);failed++;}
  }
  console.log(JSON.stringify({inputJobs:completed+failed,completed,failed,embeddingCalls:0,modelCalls:0,externalCalls:0},null,2));
}finally{await getPool().end();}
