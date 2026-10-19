import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {captureImmutableKnowledgeAsset,readImmutableKnowledgeAsset} from '../src/lib/knowledge/immutable-asset-snapshot';
import {revalidateLockedKnowledgeAssetBytes} from '../src/lib/assistant/main/skill-attachment-bytes';
import {revalidateLockedSkillKnowledgeReceiptBytes} from '../src/lib/assistant/main/skill-knowledge-receipt-bytes';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;
globalThis.fetch=async()=>{throw new Error('External network disabled');};
const pool=new Pool({connectionString:url.toString()}),client=await pool.connect();
const owner=randomUUID(),peer=randomUUID(),collection=randomUUID(),document=randomUUID(),asset=randomUUID();
const key=`knowledge/ma24-snapshot-${asset}.txt`,bytes=Buffer.from('Synthetic immutable original\n'),sha=createHash('sha256').update(bytes).digest('hex');
const results:string[]=[];
const actor=async(id:string)=>{await client.query('reset role');await client.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[id]);await client.query('set local role network_copilot_app');};
const rejected=async(sql:string,params:unknown[]=[])=>{
 await client.query('savepoint expected_rejection');let failed=false;
 try{await client.query(sql,params);}catch{failed=true;}finally{await client.query('rollback to savepoint expected_rejection');}
 assert(failed,`Expected rejection: ${sql}`);
};
try{
 await mkdir('knowledge',{recursive:true});await writeFile(key,bytes,{flag:'wx'});
 await client.query('begin');await client.query("set local lock_timeout='3s'");
 // Install exact production admission dependencies inside this rollback-only
 // transaction. The older replay clone must not use stub lock functions.
 for(const name of ['148_skill_decision_memory_source_locks.sql','149_skill_knowledge_source_locks.sql']){
  await client.query(await readFile(`db/migrations/${name}`,'utf8'));
 }
 await client.query(await readFile('db/migrations/156_knowledge_asset_immutable_snapshot.sql','utf8'));
 for(const id of [owner,peer])await client.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic snapshot','!','member','active')",[id,`${id}@example.invalid`]);
 await client.query("insert into knowledge_collection(id,slug,name,base_type) values($1,$1::uuid::text,'Synthetic snapshot','industry')",[collection]);
 await client.query("insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility,status) values($1,$2,$1::uuid::text,'Synthetic snapshot','text',$3,$4,'private','active')",[document,collection,sha,owner]);
 await client.query("insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature) values($1,$2,$3,$4,'text/plain',$5,'TXT','synthetic-test')",[asset,document,key,sha,bytes.length]);
 await actor(owner);
 const captured=await captureImmutableKnowledgeAsset(client,owner,asset);
 assert.equal((await captureImmutableKnowledgeAsset(client,owner,asset)).snapshotId,captured.snapshotId);
 assert.deepEqual((await readImmutableKnowledgeAsset(client,owner,asset,sha))?.bytes,bytes);results.push('actual-file-capture-and-idempotent-read');
 const attachment=await revalidateLockedKnowledgeAssetBytes(client,owner,[asset]);
 const receipt=await revalidateLockedSkillKnowledgeReceiptBytes(client,owner,[{tool:'knowledge_originals',output:{status:'success',data:{documents:[{id:asset}]}}}]);
 assert.equal(attachment.immutableSnapshotCount,1);assert.equal(receipt.knowledgeReceiptImmutableSnapshotCount,1);
 assert.equal(attachment.immutableSnapshotManifestHash,receipt.knowledgeReceiptImmutableSnapshotManifestHash);
 results.push('actual-acceptance-attachment-and-knowledge-receipt-snapshot-binding');
 await rejected('select capture_immutable_asset_snapshot($1,$2,$3)',[asset,sha,Buffer.from('wrong')]);
 await rejected('select capture_immutable_asset_snapshot($1,$2,$3)',[asset,'0'.repeat(64),bytes]);
 for(const sql of ['update knowledge_asset_immutable_snapshot set body=body','delete from knowledge_asset_immutable_snapshot','truncate knowledge_asset_immutable_snapshot',"insert into knowledge_asset_immutable_snapshot(asset_id,source_sha256,byte_size,body,captured_by) values($1,$2,$3,$4,$5)"]){await rejected(sql,sql.startsWith('insert')?[asset,sha,bytes.length,bytes,owner]:[]);}
 results.push('hash-size-and-direct-write-rejection');
 await actor(peer);assert.equal(await readImmutableKnowledgeAsset(client,peer,asset,sha),null);
 await rejected('select capture_immutable_asset_snapshot($1,$2,$3)',[asset,sha,bytes]);results.push('private-peer-read-and-capture-denied');
 await client.query('reset role');await client.query("update knowledge_document set visibility='shared' where id=$1",[document]);
 await actor(peer);assert.deepEqual((await readImmutableKnowledgeAsset(client,peer,asset,sha))?.bytes,bytes);
 await client.query('reset role');await client.query("update knowledge_document set visibility='private' where id=$1",[document]);
 await actor(peer);assert.equal(await readImmutableKnowledgeAsset(client,peer,asset,sha),null);results.push('shared-to-private-current-visibility');
 await actor(owner);
 await writeFile(key,'tampered file');
 await assert.rejects(captureImmutableKnowledgeAsset(client,owner,asset),/matches approved hash/);
 assert.deepEqual((await readImmutableKnowledgeAsset(client,owner,asset,sha))?.bytes,bytes);results.push('filesystem-tamper-rejected-existing-snapshot-unchanged');
 const retained=await revalidateLockedKnowledgeAssetBytes(client,owner,[asset]);
 assert.equal(retained.immutableSnapshotManifestHash,attachment.immutableSnapshotManifestHash);
 await unlink(key);
 const missing=await revalidateLockedSkillKnowledgeReceiptBytes(client,owner,[{tool:'knowledge_originals',output:{status:'success',data:{documents:[{id:asset}]}}}]);
 assert.equal(missing.knowledgeReceiptImmutableSnapshotManifestHash,receipt.knowledgeReceiptImmutableSnapshotManifestHash);
 assert.equal(missing.knowledgeReceiptReadOnlyMountVerified,false);
 await writeFile(key,bytes,{flag:'wx'});results.push('acceptance-uses-identical-canonical-snapshot-after-file-tamper-and-removal');
 for(const [change,restore] of [
  ["update knowledge_document set status='archived' where id=$1","update knowledge_document set status='active' where id=$1"],
  ["update knowledge_asset set source_sha256=repeat('0',64) where document_id=$1","update knowledge_asset set source_sha256=$2 where document_id=$1"],
  ["update knowledge_asset set byte_size=byte_size+1 where document_id=$1","update knowledge_asset set byte_size=byte_size-1 where document_id=$1"],
 ]){
  await client.query('reset role');await client.query(change,[document]);await actor(owner);
  assert.equal(await readImmutableKnowledgeAsset(client,owner,asset,sha),null);
  await client.query('reset role');await client.query(restore,restore.includes('$2')?[document,sha]:[document]);
 }
 results.push('archived-hash-and-size-changes-deny-stale-read');
 await actor(owner);
 await client.query('reset role');await client.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[asset]);
 await actor(owner);assert.equal(await readImmutableKnowledgeAsset(client,owner,asset,sha),null);
 await rejected('select capture_immutable_asset_snapshot($1,$2,$3)',[asset,sha,bytes]);results.push('withdrawal-denies-existing-snapshot');
 await client.query('reset role');
 for(const sql of ['update knowledge_asset_immutable_snapshot set body=body','delete from knowledge_asset_immutable_snapshot','truncate knowledge_asset_immutable_snapshot'])await rejected(sql);
 results.push('privileged-ordinary-mutation-trigger-rejection');
 await client.query('delete from knowledge_asset where id=$1',[asset]);await actor(owner);
 assert.equal(await readImmutableKnowledgeAsset(client,owner,asset,sha),null);results.push('metadata-deletion-unblocked-orphan-inaccessible');
}finally{
 await client.query('rollback');client.release();await pool.end();await unlink(key);
}
const result={passed:true,results,migrationAndFixturesRolledBack:true,modelAndNetworkCalls:0,productionQualified:false,activationEnabled:false};
await writeFile('tmp/ma24-immutable-snapshot-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
