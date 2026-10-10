import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { Pool } from 'pg';
import { getPool } from '../src/lib/rag/db';
import { modeModelConfig } from '../src/lib/assistant/main/mode-config';
import { type AgentMode } from '../src/lib/assistant/main/mode-prompts';
import { type ExecutionContext, type ModelToolCall, result } from '../src/lib/assistant/main/contracts';
import { boundary, beginCall, completeCall, finishRun, getRun } from '../src/lib/assistant/main/repository';
import { buildMainAgentGraph } from '../src/lib/assistant/main/graph';
import { dispatchTool } from '../src/lib/assistant/main/executor';
import { encryptMailboxContent } from '../src/lib/mailbox/crypto';
import { orderedModeDecision } from '../src/lib/assistant/main/mode-fallback';
import { ModelWaitError } from '../src/lib/assistant/main/model-stream';

nextEnv.loadEnvConfig(process.cwd());
process.env.LANGSMITH_TRACING='false';
process.env.LANGCHAIN_TRACING_V2='false';
const url=process.env.DATABASE_MIGRATION_URL;
assert(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local database required');
const target=new URL(url),application=new URL(process.env.DATABASE_URL??'http://invalid');
assert.equal(`${application.hostname}:${application.port||'5432'}${application.pathname}`,`${target.hostname}:${target.port||'5432'}${target.pathname}`,'Same local application database required');
// Any accidentally reached HTTP provider fails before transmission.
globalThis.fetch=async()=>{throw new Error('External HTTP disabled for local mode acceptance');};
const admin=new Pool({connectionString:url});
const owners=[randomUUID(),randomUUID()],workspace=randomUUID(),company=randomUUID(),draft=randomUUID();
const connections=[randomUUID(),randomUUID()],mailIds=[randomUUID(),randomUUID()];
const external=`mode-fixture-${randomUUID()}`;
let created=false;
const checks:string[]=[];
const call=(id:string,tool:string,args:unknown):ModelToolCall=>({id,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool,arguments:args})}});
async function context(mode:AgentMode):Promise<ExecutionContext>{
  const id=randomUUID(),conversation=randomUUID(),leaseToken=randomUUID();
  const client=await admin.connect();
  try{
    await client.query('begin');
    await client.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Isolated mode fixture')",[conversation,owners[0]]);
    // A non-production execution version excludes even expired fixture leases from workers.
    await client.query("insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,execution_version,status,lease_token,lease_until) values($1::uuid,$2,$3,$1::uuid::text,'fixture',$4,$5,'mode-local-fixture','running',$6,now()+interval '10 minutes')",[id,owners[0],conversation,JSON.stringify({content:'Synthetic local mode acceptance',requestKey:id,attachments:[],mode}),JSON.stringify(modeModelConfig(mode)),leaseToken]);
    await client.query('commit');
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
  return {userId:owners[0],runId:id,leaseToken,role:'member',mode};
}
try{
  const claimDefinition=(await admin.query("select pg_get_functiondef('claim_next_agent_run(text)'::regprocedure) as definition")).rows[0].definition as string;
  assert.match(claimDefinition,/execution_version\s*=\s*'main-agent-v1'/,'Worker must exclude fixture execution versions');
  const client=await admin.connect();
  try{
    await client.query('begin');
    for(const [i,id] of owners.entries()){
      await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic mode business fixture','member','active')",[id,`${id}@example.invalid`]);
      await client.query("insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext) values($1,$2,'alimail-imap',$3,'Mode fixture','unusable-synthetic')",[connections[i],id,`${id}@example.invalid`]);
      const encrypted=encryptMailboxContent(id,{subject:`Fixture ${i}`,bodyText:`SYNTHETIC_BODY_${i}`,sender:['sender@example.invalid'],recipients:['recipient@example.invalid']});
      await client.query("insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_sha256,content_ciphertext) values($1,$2,$3,'INBOX','fixture',1,'inbound',$4,$5)",[mailIds[i],id,connections[i],'0'.repeat(64),encrypted]);
    }
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code) values($1,$2,'global-sales','Mode fixture','Germany','DE')",[workspace,owners[0]]);
    await client.query("insert into sales_company(id,external_id,canonical_name,domain,country_code) values($1,$2,'Mode fixture',$3,'DE')",[company,external,`${external}.invalid`]);
    await client.query("insert into outreach_draft(id,user_id,workspace_id,company_id,strategy,body,model,prompt_version,market_country_code) values($1,$2,$3,$4,'{}','Original synthetic draft','fixture','fixture','DE')",[draft,owners[0],workspace,company]);
    await client.query('commit');created=true;
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
  const quick=await context('quick');
  const actions=[call('read-own','mail_read',{messageId:mailIds[0]}),call('read-other','mail_read',{messageId:mailIds[1]}),call('reject-edit','draft_edit',{draftId:draft,body:'Forbidden edit',expectedRevision:1}),call('reject-sync','mail_sync',{connectionId:connections[0]})];
  let modelStep=0;
  const graph=buildMainAgentGraph({boundary:()=>boundary(quick),tool:(c,ids)=>dispatchTool(c,{...quick,instructionIds:ids}),model:async messages=>{
    if(modelStep<actions.length)return {role:'assistant',content:null,tool_calls:[actions[modelStep++]]};
    const outputs=messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content!));
    assert.equal(outputs[0].data.bodyText,'SYNTHETIC_BODY_0');
    assert.equal(outputs[1].data,null);
    assert.equal(outputs[2].status,'unavailable');assert.equal(outputs[3].status,'unavailable');
    return {role:'assistant',content:'Synthetic local read completed; writes blocked.'};
  }});
  const final=await graph.invoke({messages:[{role:'user',content:'Synthetic fixture'}],pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[]});
  assert.equal(final.status,'completed');await finishRun(quick,final.status,final.reply);
  assert.equal((await getRun(owners[0],quick.runId))?.result?.reply,final.reply);
  assert.equal(await getRun(owners[1],quick.runId),null);
  checks.push('quick-owned-encrypted-mail','quick-cross-account-denied','quick-writes-and-sync-blocked','graph-result-persisted-and-isolated');

  const standard=await context('standard');
  const edit=call('edit-once','draft_edit',{draftId:draft,body:'Edited synthetic draft',expectedRevision:1});
  const first=await dispatchTool(edit,standard),reused=await dispatchTool(edit,standard);
  assert.equal(first.status,'success');assert.equal(first.callId,reused.callId);
  assert.equal((await admin.query('select revision from outreach_draft where id=$1',[draft])).rows[0].revision,2);
  const stale=await dispatchTool(call('edit-stale','draft_edit',{draftId:draft,body:'Stale synthetic edit',expectedRevision:1}),standard);
  assert.equal(stale.status,'missing_input');
  const researchInput={companyName:'Mode fixture',domain:`${external}.invalid`,countryCode:'DE',countryName:'Germany',roles:['Distributor']};
  assert.equal((await dispatchTool(call('reject-research','company_research',researchInput),standard)).status,'unavailable');
  checks.push('standard-draft-edit','durable-tool-receipt-reused','stale-draft-revision-rejected','standard-research-blocked');

  const deep=await context('deep');
  const research=await dispatchTool(call('saved-research','company_research',researchInput),deep);
  assert.equal(research.status,'success',JSON.stringify(research.missing));assert.equal((research.data as {publication:string}).publication,'research-only');
  const pending=await dispatchTool(call('send-approval','mail_send',{connectionId:connections[0],to:'recipient@example.invalid',subject:'Synthetic',body:'Not sent'}),deep);
  assert.equal(pending.status,'waiting_approval');
  assert.equal((await admin.query('select count(*)::int n from outbound_mail where user_id=any($1::uuid[])',[owners])).rows[0].n,0);
  checks.push('deep-saved-evidence-research','deep-send-still-requires-approval');

  let requests=0;
  const fallback={begin:(index:number)=>beginCall(standard,{key:`fixture-model:${index}`,tool:'main_model',version:'fixture',input:{index},effect:'model'}),request:async(index:number)=>{requests++;if(index===0)throw new ModelWaitError('total');return 'SAVED_LOCAL_RESPONSE';},save:async(id:string,_index:number,outcome:{status:'success';value:string}|{status:'unavailable';retryable:boolean})=>completeCall(standard,id,outcome.status==='success'?result({value:outcome.value}):result({retryable:outcome.retryable},{status:'unavailable'}),{synthetic:true})};
  assert.equal(await orderedModeDecision(fallback),'SAVED_LOCAL_RESPONSE');
  assert.equal(await orderedModeDecision(fallback),'SAVED_LOCAL_RESPONSE');assert.equal(requests,2);
  assert.equal((await admin.query('select count(*)::int n from paid_call_reservation where user_id=any($1::uuid[])',[owners])).rows[0].n,0);
  checks.push('fallback-journal-recovery-no-repeated-request','zero-paid-reservations');
}finally{
  if(created){const client=await admin.connect();try{
    await client.query('begin');
    const verified=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Synthetic mode business fixture' and email=id::text||'@example.invalid' for update",[owners]);assert.equal(verified.rowCount,2);
    for(const table of ['agent_memory_extraction_job','agent_run_event','agent_tool_call','agent_approval','agent_run','assistant_message','assistant_conversation'])await client.query(`delete from ${table} where ${table==='agent_memory_extraction_job'?'owner_id':'user_id'}=any($1::uuid[])`,[owners]);
    await client.query('delete from market_workspace where id=$1 and owner_id=$2',[workspace,owners[0]]);
    await client.query('delete from sales_company where id=$1 and external_id=$2',[company,external]);
    await client.query('delete from app_user where id=any($1::uuid[])',[owners]);
    await client.query('commit');
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}}
  await admin.end();await getPool().end();
}
const report={synthetic:true,model:'scripted-local',graph:'production LangGraph factory',database:'local PostgreSQL with application RLS',checks,passed:checks.length,externalCalls:0,realMailSent:0,fixtureCleaned:true};
await writeFile('docs/evidence/mode-business-local-2026-10-10.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
