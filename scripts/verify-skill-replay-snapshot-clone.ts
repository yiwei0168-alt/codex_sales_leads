import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {knowledgeCompareTool} from '../src/lib/assistant/main/knowledge-compare-tool';
import {importSkill} from '../src/lib/assistant/main/skills';
import {prepareHistoricalSkillReplay} from '../src/lib/assistant/main/skill-replay-snapshot';
import {runSkillReplay} from '../src/lib/assistant/main/skill-replay';
import {prepareSkillReview} from '../src/lib/assistant/main/skill-replay-review';
import {storeHistoricalSkillReplay,readSkillReplayReview,appendSkillReplayReview} from '../src/lib/assistant/main/skill-review-store';
import {getMailboxMessageForReview} from '../src/lib/mailbox/repository';
import {readCustomerTimeline} from '../src/lib/mailbox/customer-timeline';
import {assertCurrentPrivateReplayMessages} from '../src/lib/assistant/main/private-replay-guard';
import type {ModelMessage} from '../src/lib/assistant/main/contracts';
import {encryptMailboxContent} from '../src/lib/mailbox/crypto';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
// Process-local synthetic content key. Never decrypt any real cloned mailbox content.
process.env.MAILBOX_CREDENTIAL_KEY=randomBytes(32).toString('base64url');
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),conversation=randomUUID(),run=randomUUID(),call=randomUUID();
globalThis.fetch=async()=>{throw new Error('Network disabled in snapshot probe');};
try{
  for(const [table,migration] of [['mailbox_work_job','118_mailbox_work_queue.sql'],['mailbox_customer','119_mailbox_customer_timeline.sql']]){
    if(!(await pool.query('select to_regclass($1) as present',[table])).rows[0].present)await pool.query(await readFile(`db/migrations/${migration}`,'utf8'));
  }
  await pool.query(await readFile('db/migrations/122_skill_replay_reviews.sql','utf8'));
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Replay fixture','!','member','active')",[owner,`${owner}@example.invalid`]);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Replay fixture')",[conversation,owner]);
  const question='Compare AP3000 and AP3600 interface tables.';
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
    values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,'{}','completed','main-agent')`,[run,owner,conversation,JSON.stringify({content:question})]);
  await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",[owner,conversation,question,JSON.stringify({runId:run})]);
  const args={entities:['AP3000','AP3600'],attributes:['ethernet_ports']};
  const output=await knowledgeCompareTool.execute(args,{userId:owner,runId:run,leaseToken:randomUUID(),role:'member'});
  await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
    values($1,$2,$3,$1::uuid::text,'knowledge_compare','1',$4,$5,'read','completed',$6)`,[call,owner,run,digest(args),JSON.stringify(args),JSON.stringify(output)]);
  const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic snapshot method',source:'synthetic-probe',files:{'SKILL.md':'Read original interface tables independently.'},dependencies:[]});
  assert(skill.id);const input={skillId:skill.id,version:1,runIds:[run]},context={userId:owner};
  const snapshot=await prepareHistoricalSkillReplay(context,input);
  assert.equal(snapshot.suite.cases[0].provenance,'historical');assert.equal(snapshot.bindings[0].calls[0].id,call);
  assert.equal(snapshot.suiteHash,(await prepareHistoricalSkillReplay(context,input)).suiteHash);
  // Deterministic model substitute verifies persistence only, not natural task quality.
  const result=await runSkillReplay(snapshot.suite,async()=>({kind:'answer',text:'Synthetic storage test answer.'}));
  const stored=await storeHistoricalSkillReplay(context,snapshot,result);
  assert.equal((await storeHistoricalSkillReplay(context,snapshot,result)).id,stored.id);
  assert.equal((await readSkillReplayReview(context,stored.id)).revision,0);
  await assert.rejects(()=>readSkillReplayReview({userId:randomUUID()},stored.id));
  const template=prepareSkillReview(snapshot.suite,result),verdict={answer:false,citation:false,permission:true,injection:true,rationale:'Storage fixture only; no quality acceptance.'};
  const reviewInput={id:stored.id,expectedRevision:0,suiteHash:template.suiteHash,resultHash:template.resultHash,
    judgment:{caseId:template.reviews[0].caseId,pairHash:template.reviews[0].pairHash,baseline:verdict,candidate:verdict}};
  const concurrent=await Promise.allSettled([appendSkillReplayReview(context,reviewInput),appendSkillReplayReview(context,reviewInput)]);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(concurrent.filter(r=>r.status==='rejected').length,1);
  const revision2=await appendSkillReplayReview(context,{...reviewInput,expectedRevision:1});
  assert.equal(revision2.revision,2);assert.equal(revision2.grade.autoEnable,false);
  const history=await pool.query('select revision,reviewer_id from agent_skill_replay_review where replay_id=$1 order by revision',[stored.id]);
  assert.deepEqual(history.rows.map(r=>r.revision),[1,2]);assert(history.rows.every(r=>r.reviewer_id===owner));
  for(const table of ['agent_skill_replay','agent_skill_replay_review']){
    const key=table==='agent_skill_replay'?'id':'replay_id';
    await assert.rejects(()=>tenantTransaction(owner,c=>c.query(`delete from ${table} where ${key}=$1`,[stored.id])));
    await assert.rejects(()=>tenantTransaction(owner,c=>c.query(`update ${table} set owner_id=owner_id where ${key}=$1`,[stored.id])));
    const other=await tenantTransaction(randomUUID(),c=>c.query(`select * from ${table} where ${key}=$1`,[stored.id]));assert.equal(other.rowCount,0);
  }
  await assert.rejects(()=>appendSkillReplayReview(context,{...reviewInput,expectedRevision:2,resultHash:digest('stale')}));
  await assert.rejects(()=>prepareHistoricalSkillReplay({userId:randomUUID()},input));
  await pool.query("update agent_run set status='cancelled' where id=$1",[run]);await assert.rejects(()=>prepareHistoricalSkillReplay(context,input));
  await pool.query("update agent_run set status='completed' where id=$1",[run]);
  await pool.query("update agent_tool_call set effect='send' where id=$1",[call]);await assert.rejects(()=>prepareHistoricalSkillReplay(context,input));
  await pool.query("update agent_tool_call set effect='read',input_hash='tampered' where id=$1",[call]);await assert.rejects(()=>prepareHistoricalSkillReplay(context,input));
  await pool.query('update agent_tool_call set input_hash=$2 where id=$1',[call,digest(args)]);
  // Alter only the synthetic saved receipt, never the shared development original.
  const tampered=JSON.parse(JSON.stringify(output));assert(tampered.data.entities[0].evidence.length);
  tampered.data.entities[0].evidence[0].content='Forged old evidence';
  await pool.query('update agent_tool_call set output=$2 where id=$1',[call,JSON.stringify(tampered)]);
  await assert.rejects(()=>prepareHistoricalSkillReplay(context,input),/source validation failed/);
  await assert.rejects(()=>readSkillReplayReview(context,stored.id));
  await assert.rejects(()=>appendSkillReplayReview(context,{...reviewInput,expectedRevision:2}));
  await pool.query('update agent_tool_call set output=$2 where id=$1',[call,JSON.stringify(output)]);
  assert.equal((await prepareHistoricalSkillReplay(context,input)).suiteHash,snapshot.suiteHash);
  const connection=randomUUID(),message=randomUUID(),customer=randomUUID();
  await pool.query("insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext) values($1,$2,'alimail-imap',$3,'Synthetic replay mailbox','synthetic-unusable')",[connection,owner,`${owner}@example.invalid`]);
  const mailPayload={subject:'Synthetic discussion',bodyText:'Synthetic original body',sender:[],recipients:[]};
  await pool.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_ciphertext,content_sha256)
    values($1,$2,$3,'INBOX','synthetic',1,'inbound',$4,$5)`,[message,owner,connection,encryptMailboxContent(owner,mailPayload),digest(mailPayload)]);
  await pool.query("insert into mailbox_customer(id,user_id,identity_key,name,notes) values($1,$2,'synthetic:replay','Synthetic customer','Original company notes')",[customer,owner]);
  await pool.query("insert into mailbox_customer_message(user_id,customer_id,message_id,source) values($1,$2,$3,'confirmed')",[owner,customer,message]);
  const mail=await getMailboxMessageForReview(owner,message),timeline=await readCustomerTimeline(owner,customer);
  const privateMessages=(tool:string,args:unknown,data:unknown):ModelMessage[]=>[
    {role:'assistant',content:null,tool_calls:[{id:'private-read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool,arguments:args})}}]},
    {role:'tool',tool_call_id:'private-read',content:JSON.stringify({status:'success',data})},
  ];
  const mailMessages=privateMessages('mail_read',{messageId:message},mail),timelineMessages=privateMessages('customer_timeline',{customerId:customer,offset:0},timeline);
  await assertCurrentPrivateReplayMessages(owner,mailMessages);await assertCurrentPrivateReplayMessages(owner,timelineMessages);
  await assert.rejects(()=>assertCurrentPrivateReplayMessages(randomUUID(),mailMessages));
  await assert.rejects(()=>assertCurrentPrivateReplayMessages(randomUUID(),timelineMessages));
  await pool.query("update mailbox_customer set notes='Changed notes',revision=revision+1 where id=$1",[customer]);
  await assert.rejects(()=>assertCurrentPrivateReplayMessages(owner,timelineMessages),/changed/);
  await pool.query("update mailbox_customer set archived=true where id=$1",[customer]);
  await assert.rejects(()=>assertCurrentPrivateReplayMessages(owner,timelineMessages),/unavailable/);
  await pool.query("update mailbox_message set metadata=jsonb_build_object('rawContentPurged',true) where id=$1",[message]);
  await assert.rejects(()=>assertCurrentPrivateReplayMessages(owner,mailMessages),/unavailable/);
  await pool.query("update mailbox_message set metadata='{}',content_ciphertext=$2 where id=$1",[message,encryptMailboxContent(owner,{...mailPayload,bodyText:'Changed private body'})]);
  await assert.rejects(()=>assertCurrentPrivateReplayMessages(owner,mailMessages),/changed/);
  console.log(JSON.stringify({clone:true,actualComparisonReceipt:true,currentSourcesChecked:true,stableHashes:true,crossAccountDenied:true,
    cancelledRunDenied:true,nonReadReceiptDenied:true,inputTamperingDenied:true,changedEvidenceDenied:true,
    replayIdempotent:true,concurrentReviewConflict:true,appendOnly:true,reviewerFromAccount:true,reviewRls:true,
    staleReviewDenied:true,changedSourceReviewDenied:true,privateMailAndTimelineSourceChecked:true,privateCrossAccountDenied:true,
    companyNoteChangeDenied:true,archiveDenied:true,purgedMailDenied:true,changedMailDenied:true,automaticActivation:false,modelCalls:0,externalCalls:0}));
}finally{
  const client=await pool.connect();try{
    await client.query('begin');await client.query('set local session_replication_role=replica');
    await client.query('delete from agent_skill_replay_review where owner_id=$1',[owner]);
    await client.query('delete from agent_skill_replay where owner_id=$1',[owner]);
    await client.query('delete from agent_skill_version where skill_id in(select id from agent_skill where owner_id=$1)',[owner]);
    await client.query('delete from agent_skill where owner_id=$1',[owner]);
    for(const table of ['mailbox_customer_message','mailbox_customer_revision','mailbox_timeline_note','mailbox_customer','mailbox_message','mailbox_connection']){
      if((await client.query('select to_regclass($1) as present',[table])).rows[0].present)await client.query(`delete from ${table} where user_id=$1`,[owner]);
    }
    for(const table of ['agent_tool_call','agent_run_event','assistant_message','agent_run','assistant_conversation'])await client.query(`delete from ${table} where user_id=$1`,[owner]);
    await client.query('delete from app_user where id=$1',[owner]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
