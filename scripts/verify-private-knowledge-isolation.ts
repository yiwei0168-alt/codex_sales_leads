import nextEnv from "@next/env";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
nextEnv.loadEnvConfig(process.cwd());
const app=process.env.DATABASE_URL,adminUrl=process.env.DATABASE_MIGRATION_URL;
if(!app||!adminUrl)throw new Error("Both database connections required");
const a=new URL(app),b=new URL(adminUrl);
if(a.hostname!==b.hostname||(a.port||"5432")!==(b.port||"5432")||a.pathname!==b.pathname)throw new Error("Database target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(adminUrl),ssl:databaseSslConfiguration(adminUrl)});
const {getPool,tenantQuery,tenantTransaction}=await import("../src/lib/rag/db");
const {hashPassword}=await import("../src/lib/auth/password");
const {searchOutreachKnowledge}=await import("../src/lib/outreach/knowledge-repository");
const {hybridSearch}=await import("../src/lib/rag/repository");
const {reviewMailboxCandidate}=await import("../src/lib/mailbox/candidate-review");
const {encryptMailboxContent}=await import("../src/lib/mailbox/crypto");
const users=[randomUUID(),randomUUID()],workspaces=[randomUUID(),randomUUID()];
const emails=users.map(id=>`knowledge-isolation-${id}@example.invalid`);
let created=false;
try{
  const columns=await admin.query<{type:string}>(`select format_type(atttypid,atttypmod) as type from pg_attribute
    where attrelid='user_outreach_memory'::regclass and attname='embedding'`);
  const dimensions=Number(/^vector\((\d+)\)$/.exec(columns.rows[0]?.type??"")?.[1]);
  if(!Number.isSafeInteger(dimensions)||dimensions<1||dimensions>10000)throw new Error("Unknown embedding contract");
  const vector=Array<number>(dimensions).fill(0);vector[0]=1;
  const definitions=[
    {owner:0,country:"GB",kind:"email-style",status:"active",role:"SI"},
    {owner:0,country:"MX",kind:"email-style",status:"active",role:"SI"},
    {owner:0,country:"GB",kind:"email-style",status:"archived",role:"SI"},
    {owner:0,country:"GB",kind:"user-approved-marketing-claim",status:"active",role:"SI"},
    {owner:0,country:"GB",kind:"company-classification",status:"active",role:"SI"},
    {owner:1,country:"GB",kind:"email-style",status:"active",role:"SI"},
  ];
  const ids=definitions.map(()=>randomUUID());
  const documentIds=Array.from({length:5},()=>randomUUID());
  const chunkIds=documentIds.map(()=>randomUUID());
  const companyScope=`isolation:${randomUUID()}`;
  const connectionId=randomUUID(),messageId=randomUUID(),candidateId=randomUUID(),rejectedId=randomUUID();
  const chunkColumn=await admin.query<{type:string}>(`select format_type(atttypid,atttypmod) as type from pg_attribute
    where attrelid='knowledge_chunk'::regclass and attname='embedding'`);
  const chunkDimensions=Number(/^vector\((\d+)\)$/.exec(chunkColumn.rows[0]?.type??"")?.[1]);
  if(!Number.isSafeInteger(chunkDimensions)||chunkDimensions<1||chunkDimensions>10000)throw new Error("Unknown chunk embedding contract");
  const chunkVector=Array<number>(chunkDimensions).fill(0);chunkVector[0]=1;
  const client=await admin.connect();
  try{
    await client.query("begin");
    for(let i=0;i<users.length;i++){
      await client.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Knowledge isolation fixture',$3,'member','disabled')",
        [users[i],emails[i],hashPassword(randomBytes(24).toString("hex"))]);
      await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Knowledge fixture','Global','WW','Synthetic isolation verification')",[workspaces[i],users[i]]);
    }
    for(const [index,item] of definitions.entries())await client.query(`insert into user_outreach_memory
      (id,user_id,workspace_id,kind,external_id,title,content,market_codes,channel_roles,status,usage_scope,embedding)
      values($1,$2,$3,$4,$5,'Synthetic isolation fixture','Synthetic isolation token',$6,$7,$8,'internal-learning',$9::vector)`,
      [ids[index],users[item.owner],workspaces[item.owner],item.kind,`fixture:${ids[index]}`,[item.country],[item.role],item.status,JSON.stringify(vector)]);
    for(let index=0;index<documentIds.length;index++){
      await client.query(`insert into knowledge_document
        (id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility,market,company_id,status)
        values($1::uuid,(select id from knowledge_collection where slug='company'),($1::uuid)::text,'Synthetic RAG isolation','fixture',($1::uuid)::text,$2,$3,$4,$5,$6)`,
        [documentIds[index],users[index===2||index===3?1:0],index===3?"shared":"private",index===1?"MX":"GB",companyScope,index===4?"archived":"active"]);
      await client.query(`insert into knowledge_chunk(id,document_id,chunk_index,content,token_estimate,content_sha256,embedding)
        values($1::uuid,$2,0,'Synthetic isolation token',4,($1::uuid)::text,$3::vector)`,[chunkIds[index],documentIds[index],JSON.stringify(chunkVector)]);
    }
    await client.query(`insert into mailbox_connection(id,user_id,provider,email,credential_ciphertext,status)
      values($1,$2,'alimail-imap',$3,'','disabled')`,[connectionId,users[0],emails[0]]);
    await client.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_sha256,content_ciphertext)
      values($1,$2,$3,'fixture','1',1,'inbound','synthetic',$4)`,[messageId,users[0],connectionId,
      encryptMailboxContent(users[0],{subject:"Synthetic fixture",bodyText:"Synthetic isolation token",sender:[],recipients:[]})]);
    for(const [index,id] of [candidateId,rejectedId].entries())await client.query(`insert into mailbox_artifact_candidate(id,user_id,message_id,kind,title,content)
      values($1,$2,$3,$4,'Synthetic RAG isolation','Synthetic isolation token')`,[id,users[0],messageId,index===0?'company-policy':'customer-signal']);
    // Represents a previously saved approval whose candidate status did not commit.
    await client.query("update knowledge_document set external_id=$2,content_sha256=$3 where id=$1",
      [documentIds[0],`mailbox-artifact:${candidateId}`,createHash('sha256').update('Synthetic isolation token').digest('hex')]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  const {readKnowledgeLibraryItem}=await import("../src/lib/knowledge/library-service");
  assert.equal((await readKnowledgeLibraryItem(users[0],documentIds[0],"private"))?.content,"Synthetic isolation token");
  assert.equal(await readKnowledgeLibraryItem(users[1],documentIds[0],"private"),null);
  assert.equal(await readKnowledgeLibraryItem(users[1],documentIds[0],"shared"),null);
  assert.equal((await readKnowledgeLibraryItem(users[0],documentIds[3],"shared"))?.content,"Synthetic isolation token");
  if (process.argv.includes("--library-only")) {
    console.log("Knowledge library full-text: owner read, foreign read denied, scope spoof denied, shared read passed.");
  } else {
  const privateIds=async(owner:number,country:string,role="SI")=>(await searchOutreachKnowledge(users[owner],"Synthetic isolation token",vector,[country],[role],5))
    .filter(item=>item.sourceRefs.privateUserMemory===true).map(item=>item.id);
  assert.deepEqual(await privateIds(0,"GB"),[ids[0]]);
  assert.deepEqual(await privateIds(0,"MX"),[ids[1]]);
  assert.deepEqual(await privateIds(1,"GB"),[ids[5]]);
  assert.deepEqual(await privateIds(0,"GB","Retailer"),[]);
  const raw=await tenantQuery<{id:string}>(users[0],"select id from user_outreach_memory where id=any($1::uuid[])",[ids]);
  assert.equal(raw.length,5);assert(!raw.some(row=>row.id===ids[5]));
  const ragIds=async(owner:number,market?:string)=>(await hybridSearch(users[owner],"Synthetic isolation token",chunkVector,
    {collections:["company"],companyId:companyScope,market},20)).map(item=>item.id).sort();
  assert.deepEqual(await ragIds(0,"GB"),[chunkIds[0],chunkIds[3]].sort());
  assert.deepEqual(await ragIds(0,"MX"),[chunkIds[1]]);
  assert.deepEqual(await ragIds(1,"GB"),[chunkIds[2],chunkIds[3]].sort());
  assert.deepEqual(await ragIds(0),[chunkIds[0],chunkIds[1],chunkIds[3]].sort());
  const visibleChunks=await tenantQuery<{id:string}>(users[0],"select id from knowledge_chunk where id=any($1::uuid[])",[chunkIds]);
  assert.equal(visibleChunks.length,4);assert(!visibleChunks.some(row=>row.id===chunkIds[2]));
  assert.deepEqual(await reviewMailboxCandidate(users[1],candidateId,"approved"),{kind:"missing"});
  assert.deepEqual(await reviewMailboxCandidate(users[0],candidateId,"rejected"),{kind:"approval-incomplete"});
  await tenantTransaction(users[0],async lockClient=>{
    await lockClient.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`mailbox-review:${users[0]}:${candidateId}`]);
    assert.deepEqual(await reviewMailboxCandidate(users[0],candidateId,"approved"),{kind:"busy"});
  });
  assert.deepEqual(await reviewMailboxCandidate(users[0],candidateId,"approved"),{kind:"saved",status:"approved",reused:false});
  const reviewState=()=>tenantQuery<{review_status:string;reviewed_at:string}>(users[0],
    "select review_status,reviewed_at::text from mailbox_artifact_candidate where id=$1",[candidateId]);
  const savedState=await reviewState();assert.equal(savedState[0].review_status,"approved");
  assert.deepEqual(await reviewMailboxCandidate(users[0],candidateId,"approved"),{kind:"saved",status:"approved",reused:true});
  assert.deepEqual(await reviewState(),savedState);
  assert.deepEqual(await reviewMailboxCandidate(users[0],candidateId,"rejected"),{kind:"conflict"});
  const racing=await Promise.all([reviewMailboxCandidate(users[0],rejectedId,"rejected"),reviewMailboxCandidate(users[0],rejectedId,"rejected")]);
  assert.equal(racing.filter(result=>result.kind==="saved"&&!result.reused).length,1);
  assert(racing.every(result=>result.kind==="saved"||result.kind==="busy"));
  assert.deepEqual(await ragIds(0,"GB"),[chunkIds[0],chunkIds[3]].sort());
  const metrics=await tenantQuery<{metrics:{outputItems:number;validOutputItems:number;downstreamUsedItems:number|null};status:string}>(users[0],
    "select metrics,status from product_operation_metric where stage='mailbox-candidate-review' and user_id=$1",[users[0]]);
  assert.equal(metrics.length,7);assert(metrics.every(row=>row.status==="completed"&&row.metrics.downstreamUsedItems===null));
  assert.equal(metrics.reduce((sum,row)=>sum+row.metrics.outputItems,0),2);
  assert.equal(metrics.reduce((sum,row)=>sum+row.metrics.validOutputItems,0),2);
  assert(!JSON.stringify(metrics).includes("Synthetic isolation token"));
  const calls=await admin.query("select id from paid_call_reservation where user_id=any($1::uuid[])",[users]);
  assert.equal(calls.rows.length,0);
  console.log(JSON.stringify({privateKnowledgeIsolation:"passed",owners:2,fixtureMemories:6,
    userCountryRoleStatusAndUsageScope:true,classificationExcluded:true,rlsEnforced:true,genericRagIsolation:true,
    sharedKnowledgeVisible:true,optionalCountryFilterVerified:true,fixtureDocuments:5,mailboxCandidates:2,
    reviewLockAndConcurrentIdempotency:true,interruptedApprovalRecovered:true,realEmbeddingCalls:0,paidCalls:0}));
  }
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      for(let i=0;i<users.length;i++){
        const owner=await client.query("select id from app_user where id=$1 and email=$2 and display_name='Knowledge isolation fixture' for update",[users[i],emails[i]]);
        if(owner.rowCount!==1)throw new Error("Fixture identity mismatch");
      }
      const paid=await client.query("select id from paid_call_reservation where user_id=any($1::uuid[]) limit 1",[users]);
      if(paid.rowCount)throw new Error("Unexpected paid work; preserve fixture");
      await client.query("delete from user_outreach_memory where user_id=any($1::uuid[])",[users]);
      await client.query("delete from knowledge_document where owner_id=any($1::uuid[])",[users]);
      await client.query("delete from market_workspace where id=any($1::uuid[]) and owner_id=any($2::uuid[])",[workspaces,users]);
      await client.query("delete from app_user where id=any($1::uuid[])",[users]);
      await client.query("commit");console.log("Synthetic knowledge fixtures removed; no customer data changed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await admin.end();await getPool().end();
}
