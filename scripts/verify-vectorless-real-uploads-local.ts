import {createHash,randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {readFile,rm} from "node:fs/promises";
import {resolve} from "node:path";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {createKnowledgeUploadJob,listKnowledgeUploadJobs} from "../src/lib/knowledge/upload";
import {registerVectorlessUpload} from "../src/lib/knowledge/vectorless-registration";
import {browseTree,readEvidence} from "../src/lib/knowledge/vectorless";

nextEnv.loadEnvConfig(process.cwd());
const databaseUrl=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!databaseUrl||!["localhost","127.0.0.1","::1"].includes(new URL(databaseUrl).hostname))throw new Error("Local PostgreSQL required");
const cleanup=new Pool({connectionString:databaseUrl});
const accountRoot=resolve("knowledge","uploads",OWNER_USER_ID);
const samples=[
  {path:"knowledge/product/Bluetooth USB Adapter/BU530C_V1.0__Datasheet.pdf",type:"application/pdf",unit:"page"},
  {path:"knowledge/industry/网络产品品牌与行业研究报告.pptx",type:"application/vnd.openxmlformats-officedocument.presentationml.presentation",unit:"slide"},
  {path:"knowledge/product/Cudy products list.xlsx",type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",unit:"sheet"},
] as const;
const created:Array<{id:string;source:string;artifact:string}>=[];
const digest=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
function extract(source:string,artifact:string):Promise<Record<string,unknown>>{
  return new Promise((done,reject)=>{
    const child=spawn(process.env.PYTHON_BINARY?.trim()||"python",["scripts/extract-uploaded-knowledge.py",source,artifact],
      {cwd:process.cwd(),windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let output="",errors="";
    const timer=setTimeout(()=>child.kill(),120_000);
    child.stdout.on("data",chunk=>{output+=String(chunk);});
    child.stderr.on("data",chunk=>{errors+=String(chunk);});
    child.once("error",error=>{clearTimeout(timer);reject(error);});
    child.once("exit",code=>{clearTimeout(timer);if(code!==0)return reject(new Error(errors.slice(-500)||`extractor-exit-${code}`));
      try{done(JSON.parse(output.trim()) as Record<string,unknown>);}catch{reject(new Error("extractor-invalid-json"));}});
  });
}
try{
  const results=[];
  for(const sample of samples){
    const bytes=await readFile(resolve(sample.path));
    const job=await createKnowledgeUploadJob(OWNER_USER_ID,{collection:"industry",title:`MA24 local ${sample.unit} ${randomUUID()}`,
      originalFilename:sample.path.split("/").at(-1)!,mimeType:sample.type,bytes,visibility:"private"});
    const source=resolve(accountRoot,`${job.id}.${sample.path.split(".").at(-1)}`);
    const artifact=resolve(accountRoot,`${job.id}.extraction.json`);
    if(!source.startsWith(accountRoot+"\\")||!artifact.startsWith(accountRoot+"\\"))throw new Error("Unexpected upload path");
    created.push({id:job.id,source,artifact});
    const output=await extract(source,artifact);
    const artifactBytes=await readFile(artifact);
    await tenantQuery(OWNER_USER_ID,`update knowledge_upload_job set status='extracted',extraction_artifact_key=$2,extractor_version=$3,
      metrics=metrics||$4::jsonb where id=$1`,[job.id,`knowledge/uploads/${OWNER_USER_ID}/${job.id}.extraction.json`,
      String(output.extractorVersion),JSON.stringify({artifactSha256:digest(artifactBytes),qualitySummary:output.qualitySummary})]);
    const registered=await registerVectorlessUpload(OWNER_USER_ID,job.id,{language:"und",authorityLevel:2,expectedSourceSha256:job.sourceSha256});
    if(registered.treeStatus!=="searchable")throw new Error(`${sample.unit}: ${registered.treeError}`);
    const replay=await registerVectorlessUpload(OWNER_USER_ID,job.id,{language:"und",authorityLevel:2});
    if(replay.treeStatus!=="searchable"||!replay.reused||replay.versionId!==registered.versionId)throw new Error(`${sample.unit}: replay changed version`);
    const units=await browseTree(OWNER_USER_ID,registered.documentId);
    const unit=units.find(item=>item.unit_type===sample.unit);
    if(!unit)throw new Error(`${sample.unit}: source unit missing`);
    const leaves=await browseTree(OWNER_USER_ID,registered.documentId,unit.id);
    const evidence=await readEvidence(OWNER_USER_ID,leaves[0]?.id??randomUUID());
    if(!evidence?.content||evidence.source_location.unitType!==sample.unit||!evidence.source_location.blockId)
      throw new Error(`${sample.unit}: source evidence missing`);
    if(await readEvidence(randomUUID(),evidence.id))throw new Error(`${sample.unit}: cross-account evidence leaked`);
    const listed=(await listKnowledgeUploadJobs(OWNER_USER_ID)).find(item=>item.id===job.id);
    if(listed?.treeStatus!=="searchable")throw new Error(`${sample.unit}: upload state missing`);
    await tenantQuery(OWNER_USER_ID,"update knowledge_asset set registration_status='withdrawn' where id=$1",[registered.assetId]);
    if(await readEvidence(OWNER_USER_ID,evidence.id))throw new Error(`${sample.unit}: withdrawn evidence remained citable`);
    results.push({type:sample.unit,blocks:output.blocks,units:units.length,evidence:leaves.length,sourceCoordinates:true,
      idempotent:true,crossAccountDenied:true,withdrawnCitationDenied:true,treeStatus:listed.treeStatus});
  }
  console.log(JSON.stringify({local:true,externalCalls:0,embeddingCalls:0,results},null,2));
}finally{
  try{
    for(const item of created){
      await cleanup.query("delete from knowledge_upload_job where id=$1",[item.id]);
      const rows=await cleanup.query<{id:string}>("select id from knowledge_document where owner_id=$1 and external_id=$2",[OWNER_USER_ID,`upload:${item.id}`]);
      for(const row of rows.rows){
        await cleanup.query("update knowledge_document set current_tree_version_id=null where id=$1",[row.id]);
        await cleanup.query("delete from knowledge_tree_node where version_id in(select id from knowledge_tree_version where document_id=$1)",[row.id]);
        await cleanup.query("delete from knowledge_tree_version where document_id=$1",[row.id]);
        await cleanup.query("delete from knowledge_document where id=$1",[row.id]);
      }
    }
  }finally{
    await cleanup.end();await getPool().end();
    for(const item of created){
      if(!item.source.startsWith(accountRoot+"\\")||!item.artifact.startsWith(accountRoot+"\\"))throw new Error("Refusing cleanup outside upload root");
      await rm(item.source,{force:true});await rm(item.artifact,{force:true});
    }
  }
}
