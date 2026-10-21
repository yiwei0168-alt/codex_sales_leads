import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile,unlink,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction} from '../src/lib/rag/db';
import {digest,result,type ModelMessage} from '../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {assertSkillRuntimeModelDisclosure} from '../src/lib/assistant/main/skill-runtime-disclosure';
import {revalidateLockedSkillKnowledgeReceiptBytes} from '../src/lib/assistant/main/skill-knowledge-receipt-bytes';

nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.MA24_DISPOSABLE_RUNTIME_DISCLOSURE,'1');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!),appUrl=new URL(process.env.DATABASE_URL!);
assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.pathname,'/network_copilot_local');
assert.equal(appUrl.host+appUrl.pathname,adminUrl.host+adminUrl.pathname);
const pool=new Pool({connectionString:adminUrl.toString()}),owner=randomUUID(),peer=randomUUID(),document=randomUUID(),asset=randomUUID(),foreignDocument=randomUUID(),foreignAsset=randomUUID(),legacy=randomUUID();
const storage=`knowledge/ma24-runtime-disclosure-${randomUUID()}.txt`,file=resolve(storage),root=await realpath('knowledge');
const within=relative(root,file);assert(within&&!within.startsWith('..')&&!isAbsolute(within));
const bytes=Buffer.from('Synthetic public evidence for an isolated disclosure boundary check.'),sha=createHash('sha256').update(bytes).digest('hex');
const candidate=randomUUID(),files={'SKILL.md':'Synthetic instruction-only candidate.'};
const listing={id:candidate,name:'Synthetic boundary candidate',scope:'account',current_version:1,enabled:false,published:false,owned:true};
// Component fixture only: no captured task, provider, review or activation proof.
const snapshot:Parameters<typeof assertSkillRuntimeModelDisclosure>[2]={context:{userId:owner,role:'member',mode:'standard'},
 initialMessages:[{role:'system',content:'Synthetic task'},{role:'system',content:'Synthetic memory'}],profile:modeModelConfig('standard').profile!,skills:[listing],
 candidate:{listing,value:{skill_id:candidate,version:1,files,content_hash:digest(files),dependencies:[],owner_id:owner,scope:'account'}},receipts:[]};
const original=result({documents:[{id:asset,sha256:sha,title:'Synthetic public evidence'}]},{cost:'known'});
const frame=(tool:string,output:unknown):ModelMessage[]=>[
 {role:'assistant',content:null,tool_calls:[{id:'synthetic-read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool,arguments:{}})}}]},
 {role:'tool',tool_call_id:'synthetic-read',content:JSON.stringify(output)},
];
const verify=(output:unknown=original,tool='knowledge_originals')=>assertSkillRuntimeModelDisclosure({userId:owner},frame(tool,output),snapshot);
const verifyBytes=()=>tenantTransaction(owner,client=>revalidateLockedSkillKnowledgeReceiptBytes(client,owner,[{tool:'knowledge_originals',output:original}]));
const denied=(output:unknown=original,tool='knowledge_originals')=>assert.rejects(verify(output,tool),/explicit external disclosure authorization/);
let created=false;
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 assert.equal((await pool.query('select count(*)::int n from knowledge_asset')).rows[0].n,0);
 await writeFile(file,bytes,{flag:'wx'});created=true;
 for(const user of [owner,peer])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic disclosure','member','active')",[user,`${user}@example.invalid`]);
 for(const [doc,id,user,visibility] of [[document,asset,owner,'shared'],[foreignDocument,foreignAsset,peer,'private']]){
  await pool.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
   values($1,(select id from knowledge_collection where slug='product'),$1::uuid::text,'Synthetic disclosure source','text',$2,$3,$4)`,[doc,sha,user,visibility]);
  await pool.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature,externally_disclosable)
   values($1,$2,$3,$4,'text/plain',$5,'TXT','public-synthetic-fixture',true)`,[id,doc,storage,sha,bytes.length]);
 }
 await verify();const good=await verifyBytes();assert.equal(good.knowledgeReceiptAssetCount,1);assert.equal(good.knowledgeReceiptImmutableSnapshotCount,0);
 for(const [sql,restore] of [
  ["update knowledge_asset set externally_disclosable=false where id=$1","update knowledge_asset set externally_disclosable=true where id=$1"],
  ["update knowledge_asset set source_nature='internal-synthetic' where id=$1","update knowledge_asset set source_nature='public-synthetic-fixture' where id=$1"],
  ["update knowledge_asset set registration_status='withdrawn' where id=$1","update knowledge_asset set registration_status='registered' where id=$1"],
 ]){
  await pool.query(sql,[asset]);await denied();await pool.query(restore,[asset]);await verify();
 }
 for(const [sql,restore] of [
  ["update knowledge_document set visibility='private' where id=$1","update knowledge_document set visibility='shared' where id=$1"],
  ["update knowledge_document set status='archived' where id=$1","update knowledge_document set status='active' where id=$1"],
 ]){
  await pool.query(sql,[document]);await denied();await pool.query(restore,[document]);await verify();
 }
 await denied(result({documents:[{id:foreignAsset,sha256:sha,title:'Claimed public evidence'}]}));
 await denied(result({documents:[{id:asset,sha256:sha,title:'private-person@example.invalid'}]}));
 await pool.query(`insert into knowledge_chunk(id,document_id,chunk_index,content,token_estimate,content_sha256)
  values($1,$2,0,'Synthetic database-only claim',4,$3)`,[legacy,document,sha]);
 await denied(result([{id:legacy,content:'Synthetic database-only claim'}]),'knowledge_search');
 await writeFile(file,Buffer.alloc(bytes.length,88));await assert.rejects(verifyBytes(),/attachment bytes changed/);
 await writeFile(file,bytes);assert.deepEqual(await verifyBytes(),good);
 assert.equal(snapshot.receipts.length,0,'No original receipt may authorize this new knowledge');
 console.log(JSON.stringify({runtimeDisclosureDatabase:'passed',newPublicAssetGrantVerified:true,permissionNatureStatusAndVisibilityRevocationRejected:true,
  foreignPrivateAssetRejected:true,piiRejected:true,databaseOnlyEvidenceRejected:true,originalByteMutationRejected:true,restoredBytesAccepted:true,
  currentMetadataCheckedWithoutOriginalReceipts:true,syntheticFixture:true,actualModelCalls:0,formalToolDispatches:0,wholeLifecycleVerified:false,
  sourcePromotion:false,productionQualified:false,automaticActivation:false}));
}finally{
 try{if(created){const current=await realpath(file);assert.equal(current,file);await unlink(file);}}
 finally{await Promise.all([pool.end(),getPool().end()]);}
}
