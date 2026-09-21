import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile,rm,rmdir} from "node:fs/promises";
import {expect,it,vi} from "vitest";
import nextEnv from "@next/env";

vi.mock("@/lib/rag/openai-provider",()=>({embedTexts:async(inputs:string[])=>inputs.map(()=>Array(1536).fill(0.001))}));
vi.mock("@/lib/billing/context",()=>({withProductSpend:async(_user:string,_kind:string,work:()=>Promise<unknown>)=>work()}));
vi.mock("@/lib/tracked-operation",()=>({trackedOperation:async(_user:string,_kind:string,_count:number,_bytes:number,work:()=>Promise<unknown>)=>work()}));

const localTest=process.env.MA14_LOCAL_BINARY_ACCEPTANCE==="1"?it:it.skip;
localTest("registers a synthetic binary through actual clone persistence with local embeddings",async()=>{
  Object.assign(process.env,{NODE_ENV:"development"});
  nextEnv.loadEnvConfig(process.cwd(),true,undefined,true);
  const state=JSON.parse(await readFile("tmp/ma11-replay-state.json","utf8")) as {database:string};
  expect(state.database).toMatch(/^ma11_replay_[a-f0-9]{12}$/);
  const url=new URL(process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL||"");
  expect(["localhost","127.0.0.1","::1"]).toContain(url.hostname);
  url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
  const {OWNER_USER_ID}=await import("@/lib/auth/config");
  const {tenantQuery,getPool}=await import("@/lib/rag/db");
  const {registerExtractedSharedBinary}=await import("./binary-registration");
  const id=randomUUID(),directory=`knowledge/ma14-local-${id}`,original=`${directory}/original.txt`,artifactPath=`${directory}/extracted.json`;
  const source=Buffer.from("Local synthetic knowledge evidence for MA14 acceptance.\n");
  const sha=(value:Uint8Array)=>createHash("sha256").update(value).digest("hex");
  const sourceSha256=sha(source);
  const artifact=Buffer.from(JSON.stringify({documents:[{sourceSha256,blocks:[{id:"line-1",unitType:"page",unitIndex:1,blockType:"paragraph",text:"Local synthetic knowledge evidence for MA14 acceptance.",quality:"success"}]}]}));
  let inserted=false;
  await mkdir(directory,{recursive:true});
  try{
    await writeFile(original,source);await writeFile(artifactPath,artifact);
    await tenantQuery(OWNER_USER_ID,`insert into knowledge_upload_job(id,user_id,collection_slug,status,title,original_filename,storage_key,extraction_artifact_key,mime_type,byte_size,source_sha256,visibility,metrics)
      values($1,$2,'industry','extracted','MA14 local binary','original.txt',$3,$4,'text/plain',$5,$6,'private',$7)`,[id,OWNER_USER_ID,original,artifactPath,source.length,sourceSha256,JSON.stringify({artifactSha256:sha(artifact)})],"admin");inserted=true;
    const first=await registerExtractedSharedBinary(OWNER_USER_ID,{jobId:id,sourceSha256,language:"en",authorityLevel:3});
    expect(first).toMatchObject({status:"registered",ragV3:"pending-release",reused:false});
    if(first.status!=="registered")throw new Error("Registration failed");
    expect(await registerExtractedSharedBinary(OWNER_USER_ID,{jobId:id,sourceSha256,language:"en",authorityLevel:3})).toMatchObject({reused:true,assetId:first.assetId});
    const rows=await tenantQuery<{status:string;visibility:string;published_document_id:string;published_asset_id:string}>(OWNER_USER_ID,"select status,visibility,published_document_id,published_asset_id from knowledge_upload_job where id=$1",[id]);
    expect(rows[0]).toMatchObject({status:"registered",visibility:"shared",published_document_id:first.documentId,published_asset_id:first.assetId});
    console.log(JSON.stringify({clone:true,syntheticBinary:true,localEmbeddings:true,registered:true,replayReused:true,ragV3:"pending-release",externalEffects:0}));
  }finally{
    if(inserted)await tenantQuery(OWNER_USER_ID,"delete from knowledge_upload_job where id=$1",[id],"admin");
    const documents=await tenantQuery<{id:string}>(OWNER_USER_ID,"select id from knowledge_document where owner_id=$1 and external_id=$2",[OWNER_USER_ID,`upload:${id}`],"admin");
    for(const document of documents)await tenantQuery(OWNER_USER_ID,"delete from knowledge_document where id=$1",[document.id],"admin");
    await rm(original,{force:true});await rm(artifactPath,{force:true});await rmdir(directory);
    await getPool().end();
  }
});
