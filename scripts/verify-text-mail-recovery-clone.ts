import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {upsertKnowledgeDocument,KnowledgeConflictError} from '../src/lib/rag/repository';
import {sha256} from '../src/lib/rag/chunker';
import {browseTree,readEvidence} from '../src/lib/knowledge/vectorless';
import {reviewMailboxCandidate} from '../src/lib/mailbox/candidate-review';
import type {KnowledgeDocumentInput} from '../src/lib/rag/types';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const {database}=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};assert(/^ma11_replay_[a-f0-9]{12}$/.test(database));
const url=new URL(base);url.pathname=`/${database}`;process.env.DATABASE_URL=url.toString();
if(process.argv.includes('--child')){
 const {owner,input,candidate}=JSON.parse(await readFile(process.env.TEXT_CRASH_INPUT!,'utf8'));
 try{if(candidate)await reviewMailboxCandidate(owner,candidate,'approved');else await upsertKnowledgeDocument(owner,input);}
 finally{await getPool().end();}
}else{
 const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID();
 const input:KnowledgeDocumentInput={collection:'industry',externalId:`text-${randomUUID()}`,title:'Text fixture',content:'Original local evidence 😀\n'+'Unicode 文本。'.repeat(500),sourceType:'private-text',authorityLevel:3,visibility:'private'};
 async function crash(payload:unknown){
  await mkdir('tmp/text-crash',{recursive:true});const key=randomUUID(),file=`tmp/text-crash/${key}.json`,marker=`tmp/text-crash/${key}.marker`;
  await writeFile(file,JSON.stringify(payload));
  const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--require','./scripts/fixtures/text-crash-preload.cjs','--import','tsx','scripts/verify-text-mail-recovery-clone.ts','--child'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,DATABASE_URL:url.toString(),TEXT_CRASH_MARKER:marker,TEXT_CRASH_INPUT:file}});
  let stderr='';child.stderr.on('data',data=>{stderr+=data;});const exited=new Promise<void>(done=>child.once('exit',()=>done()));
  try{
   const deadline=Date.now()+30000;let reached=false;
   while(Date.now()<deadline&&child.exitCode===null){if(await readFile(marker,'utf8').catch(()=>'')){reached=true;break;}await new Promise(done=>setTimeout(done,100));}
   assert(reached,`Crash checkpoint not reached: ${stderr.slice(-500)}`);
  }finally{child.kill();await exited;}
 }
 async function snapshot(){return (await pool.query('select id,current_tree_version_id,content_sha256 from knowledge_document where owner_id<>$1 order by id',[owner])).rows;}
 const before=await snapshot(),v3=(await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind')).rows;
 try{
  for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Text recovery fixture','!','member','active')",[id,`${id}@example.invalid`]);
  const batch=await Promise.all(Array.from({length:8},()=>upsertKnowledgeDocument(owner,input)));
  assert.equal(new Set(batch.map(row=>row.documentId)).size,1);assert.equal(batch.filter(row=>!row.skipped).length,1);
  const id=batch[0].documentId,tree=await browseTree(owner,id),leaves=await browseTree(owner,id,tree[0].id),old=leaves[0].id;
  assert((await readEvidence(owner,old))?.content);assert.equal(await readEvidence(other,old),null);
  assert.equal((await pool.query('select count(*)::int n from knowledge_tree_version where document_id=$1',[id])).rows[0].n,1);
  await assert.rejects(()=>upsertKnowledgeDocument(owner,{...input,title:'Stale title'},'member','0'.repeat(64)),KnowledgeConflictError);
  const updated={...input,content:'Revised content 😀\n'+'Precise second revision. '.repeat(200)};
  await crash({owner,input:updated});assert((await readEvidence(owner,old))?.content);
  assert.equal((await pool.query('select content_sha256 from knowledge_document where id=$1',[id])).rows[0].content_sha256,sha256(input.content));
  const contenders=await Promise.allSettled([upsertKnowledgeDocument(owner,updated,'member',sha256(input.content)),upsertKnowledgeDocument(owner,{...updated,content:'Competing revision'},'member',sha256(input.content))]);
  assert.equal(contenders.filter(row=>row.status==='fulfilled').length,1);assert.equal(contenders.filter(row=>row.status==='rejected'&&row.reason instanceof KnowledgeConflictError).length,1);
  assert.equal(await readEvidence(owner,old),null);
  // Missing tree after a historical partial registration is repaired from exact input.
  const current=(await pool.query('select content_sha256 from knowledge_document where id=$1',[id])).rows[0].content_sha256;
  const winner=current===sha256(updated.content)?updated:{...updated,content:'Competing revision'};
  await pool.query('update knowledge_document set current_tree_version_id=null where id=$1',[id]);await upsertKnowledgeDocument(owner,{...winner,title:'Renamed'});
  assert((await browseTree(owner,id)).length);assert.equal((await pool.query('select title from knowledge_document where id=$1',[id])).rows[0].title,'Renamed');
  await assert.rejects(()=>upsertKnowledgeDocument(owner,{...winner,content:''}));assert((await browseTree(owner,id)).length);
  await pool.query("update knowledge_document set status='archived' where id=$1",[id]);await assert.rejects(()=>upsertKnowledgeDocument(owner,winner),KnowledgeConflictError);assert.equal((await browseTree(owner,id)).length,0);
  const connection=randomUUID(),message=randomUUID(),candidate=randomUUID();
  await pool.query("insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext) values($1,$2,'alimail-imap',$3,'Recovery fixture','unusable')",[connection,owner,`${owner}@example.invalid`]);
  await pool.query("insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_ciphertext,content_sha256) values($1,$2,$3,'INBOX','fixture',1,'inbound','synthetic-unreadable',$4)",[message,owner,connection,sha256('fixture')]);
  await pool.query("insert into mailbox_artifact_candidate(id,user_id,message_id,kind,title,content) values($1,$2,$3,'customer-signal','Approved fixture','Exact approved synthetic email knowledge 😀')",[candidate,owner,message]);
  assert.equal((await reviewMailboxCandidate(other,candidate,'approved')).kind,'missing');
  await crash({owner,candidate});assert.equal((await pool.query('select review_status from mailbox_artifact_candidate where id=$1',[candidate])).rows[0].review_status,'pending');
  assert.equal((await pool.query('select count(*)::int n from knowledge_document where owner_id=$1 and external_id=$2',[owner,`mailbox-artifact:${candidate}`])).rows[0].n,0);
  assert.equal((await reviewMailboxCandidate(owner,candidate,'approved')).kind,'saved');assert.deepEqual(await reviewMailboxCandidate(owner,candidate,'approved'),{kind:'saved',status:'approved',reused:true});
  const mailDoc=(await pool.query('select id from knowledge_document where owner_id=$1 and external_id=$2',[owner,`mailbox-artifact:${candidate}`])).rows[0].id;
  const mailTree=await browseTree(owner,mailDoc),mailLeaves=await browseTree(owner,mailDoc,mailTree[0].id);assert.equal((await readEvidence(owner,mailLeaves[0].id))?.content,'Exact approved synthetic email knowledge 😀');assert.equal(await readEvidence(other,mailLeaves[0].id),null);
  assert.deepEqual(await snapshot(),before);assert.deepEqual((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind')).rows,v3);
  await writeFile('tmp/text-mail-recovery-result.json',JSON.stringify({cloneOnly:true,modelCalls:0,concurrentTextWrites:8,treeVersionsPerIdenticalContent:1,staleIdenticalContentRejected:true,titleUpdated:true,competingRevisionSingleWinner:true,processKillsBeforeCommit:2,textOldVersionRetainedOnCrash:true,mailApprovalAtomic:true,mailRetryReused:true,missingTreeRepaired:true,emptyInputKeepsOld:true,withdrawnNotReactivated:true,crossAccountDenied:true,otherDocumentsUnchanged:true,v3Unchanged:true},null,2));
  console.log('Text/mail clone recovery passed');
 }finally{
  await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_tree_node where version_id in(select v.id from knowledge_tree_version v join knowledge_document d on d.id=v.document_id where d.owner_id=$1)',[owner]);
  await pool.query('delete from knowledge_tree_version where document_id in(select id from knowledge_document where owner_id=$1)',[owner]);
  await pool.query('delete from knowledge_document where owner_id=$1',[owner]);await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);await pool.end();await getPool().end();
 }
}
