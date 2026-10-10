import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {knowledgeCompareTool} from '../src/lib/assistant/main/knowledge-compare-tool';
import {importSkill} from '../src/lib/assistant/main/skills';
import {prepareHistoricalSkillReplay} from '../src/lib/assistant/main/skill-replay-snapshot';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),conversation=randomUUID(),run=randomUUID(),call=randomUUID();
globalThis.fetch=async()=>{throw new Error('Network disabled in snapshot probe');};
try{
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
  await pool.query('update agent_tool_call set output=$2 where id=$1',[call,JSON.stringify(output)]);
  assert.equal((await prepareHistoricalSkillReplay(context,input)).suiteHash,snapshot.suiteHash);
  console.log(JSON.stringify({clone:true,actualComparisonReceipt:true,currentSourcesChecked:true,stableHashes:true,crossAccountDenied:true,
    cancelledRunDenied:true,nonReadReceiptDenied:true,inputTamperingDenied:true,changedEvidenceDenied:true,modelCalls:0,externalCalls:0}));
}finally{
  const client=await pool.connect();try{
    await client.query('begin');await client.query('set local session_replication_role=replica');
    await client.query('delete from agent_skill_version where skill_id in(select id from agent_skill where owner_id=$1)',[owner]);
    await client.query('delete from agent_skill where owner_id=$1',[owner]);
    for(const table of ['agent_tool_call','agent_run_event','assistant_message','agent_run','assistant_conversation'])await client.query(`delete from ${table} where user_id=$1`,[owner]);
    await client.query('delete from app_user where id=$1',[owner]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
