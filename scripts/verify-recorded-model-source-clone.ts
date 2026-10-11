import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {modelFunctions,transportMessages} from '../src/lib/assistant/main/model';
import {modelRequestManifest} from '../src/lib/assistant/main/model-request-manifest';
import {loadRecordedModeRequest,revalidateRecordedModeRequest} from '../src/lib/assistant/main/model-request-source';
nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID(),conversation=randomUUID(),runId=randomUUID(),callId=randomUUID();
globalThis.fetch=async()=>{throw Error('No network in clone verification');};
try{
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Model source fixture','!','member','active')",[id,`${id}@example.invalid`]);
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Model source fixture')",[conversation,owner]);
 const config=modeModelConfig('standard'),profile=config.profile!,messages=[{role:'user' as const,content:'Synthetic original task'}],input={profile,index:1,messages};
 const body={model:profile.routes[1].model,messages:transportMessages(messages),tools:modelFunctions,stream:true,reasoning:{effort:profile.routes[1].effort}};
 const output={status:'success',data:{value:{requestManifest:modelRequestManifest(body,{model:body.model,provider:'fixture',id:'synthetic-generation'})}}};
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
 values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,$5,'completed','main-agent')`,[runId,owner,conversation,JSON.stringify({content:'Synthetic original task'}),JSON.stringify(config)]);
 await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
 values($1,$2,$3,$1::uuid::text,'main_model','1',$4,$5,'model','completed',$6)`,[callId,owner,runId,digest(input),JSON.stringify(input),JSON.stringify(output)]);
 const context={userId:owner},selection={runId,callId},snapshot=await loadRecordedModeRequest(context,selection);
 assert.equal(snapshot.serverProvenanceVerified,true);assert.equal(snapshot.executionAuthorized,false);assert.equal(snapshot.sourcePermissionsRevalidated,false);assert.deepEqual(snapshot.body,body);
 await assert.rejects(loadRecordedModeRequest({userId:other},selection));
 await assert.rejects(loadRecordedModeRequest(context,{runId:randomUUID(),callId}));
 await pool.query("update agent_run set instructions=$2 where id=$1",[runId,JSON.stringify([{content:'new instruction'}])]);
 await assert.rejects(revalidateRecordedModeRequest(context,selection,snapshot.sourceHash));
 await pool.query("update agent_run set status='cancelled' where id=$1",[runId]);await assert.rejects(loadRecordedModeRequest(context,selection));
 await pool.query("update agent_run set status='completed' where id=$1",[runId]);
 await pool.query('update agent_tool_call set input_hash=$2 where id=$1',[callId,'0'.repeat(64)]);await assert.rejects(loadRecordedModeRequest(context,selection));
 console.log(JSON.stringify({cloneOnly:true,exactRequest:true,tenantIsolation:true,wrongRunDenied:true,changedInstructionsDenied:true,cancelledRunDenied:true,inputHashTamperingDenied:true,modelCalls:0,sourcePermissionsRevalidated:false,executionAuthorized:false,qualityAccepted:false}));
}finally{
 await pool.query('delete from agent_tool_call where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from agent_run_event where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from agent_run where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from assistant_conversation where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);
 await pool.end();await getPool().end();
}
