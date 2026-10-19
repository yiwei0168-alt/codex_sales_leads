import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {Agent} from 'undici';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {type ExecutionContext,result} from '../src/lib/assistant/main/contracts';
import {beginCall,completeCall} from '../src/lib/assistant/main/repository';
import {orderedModeDecision} from '../src/lib/assistant/main/mode-fallback';
import {collectModelStream} from '../src/lib/assistant/main/model-stream';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const nativeFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('External HTTP disabled for synthetic SSE recovery fixture');};
const agent=new Agent(),pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),checks:unknown[]=[];
const responses=new Map<string,string>();let requests=0;
type StreamValue={choices:Array<{message:{content:string}}> ;usage?:{completion_tokens?:number}};
const server=createServer((request,response)=>{
  const body=responses.get(request.url??'');if(!body){response.writeHead(404).end();return;}
  requests++;response.writeHead(200,{'content-type':'text/event-stream'});response.end(body);
});
await new Promise<void>(accept=>server.listen(0,'127.0.0.1',accept));
const address=server.address();assert(address&&typeof address!=='string');
try{
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic SSE recovery','!','member','active')",[owner,`${owner}@example.invalid`]);
  for(const mode of ['quick','standard','deep'] as const)for(const scenario of ['identity-drift','late-delta','valid-usage','unknown-started'] as const){
    const run=randomUUID(),conversation=randomUUID(),lease=randomUUID(),config=modeModelConfig(mode);
    await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic SSE recovery')",[conversation,owner]);
    await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,execution_version,status,lease_token,lease_until)
      values($1,$2,$3,$1::uuid::text,'synthetic-stream','{}',$4,'mode-local-fixture','running',$5,now()+interval '10 minutes')`,[run,owner,conversation,JSON.stringify(config),lease]);
    const context:ExecutionContext={userId:owner,runId:run,leaseToken:lease,role:'member',mode};
    const base={id:'synthetic-generation',model:config.model,provider:'synthetic-local-peer'};
    const frame=(delta:unknown,finish_reason:string|null,override:Record<string,unknown>={})=>`data: ${JSON.stringify({...base,...override,choices:[{index:0,delta,finish_reason}]})}\n\n`;
    const body=scenario==='identity-drift'?frame({content:'first'},null)+frame({content:'second'},'stop',{id:'other-generation'}):
      scenario==='late-delta'?frame({content:'finished'},'stop')+frame({tool_calls:[{index:0,id:'late-tool',type:'function',function:{name:'execute_tool',arguments:'{}'}}]},null):
      frame({content:'synthetic complete answer'},'stop')+frame({content:'',role:'assistant'},'stop',{usage:{prompt_tokens:3,completion_tokens:2}});
    responses.set(`/${run}`,body+'data: [DONE]\n\n');
    const before=requests;
    const dependencies={
      begin:(index:number)=>beginCall(context,{key:`fixture-stream:${index}`,tool:'main_model',version:'fixture',input:{index,scenario},effect:'model'}),
      request:async():Promise<StreamValue>=>{
        const endpoint=`http://127.0.0.1:${address.port}/${run}`;
        const wire=await nativeFetch(endpoint,{dispatcher:agent} as RequestInit);
        return (await collectModelStream(wire,new AbortController().signal,()=>{})).json();
      },
      save:async(id:string,_index:number,outcome:{status:'success';value:unknown}|{status:'unavailable';retryable:boolean;reason:string})=>completeCall(context,id,
        outcome.status==='success'?result({value:outcome.value}):result({retryable:outcome.retryable,reason:outcome.reason},{status:'unavailable'}),{synthetic:true}),
    };
    if(scenario==='unknown-started'){
      assert.equal((await dependencies.begin(0)).fresh,true);
      await assert.rejects(orderedModeDecision(dependencies),/routes exhausted or require reconciliation/);
      await assert.rejects(orderedModeDecision(dependencies),/routes exhausted or require reconciliation/);
    }else if(scenario==='valid-usage'){
      const first=await orderedModeDecision(dependencies);
      assert.deepEqual(await orderedModeDecision(dependencies),first);
      assert.equal(first.choices[0].message.content,'synthetic complete answer');
      assert.equal(first.usage?.completion_tokens,2);
    }else{
      await assert.rejects(orderedModeDecision(dependencies),/invalid model stream/);
      await assert.rejects(orderedModeDecision(dependencies),/routes exhausted or require reconciliation/);
    }
    const expectedRequests=scenario==='unknown-started'?0:1;
    assert.equal(requests-before,expectedRequests,'recovery must not repeat HTTP or start a fallback route');
    const calls=(await pool.query('select tool_id,output from agent_tool_call where user_id=$1 and run_id=$2',[owner,run])).rows;
    assert.equal(calls.length,1);assert.equal(calls[0].tool_id,'main_model');
    if(scenario==='unknown-started')assert.equal(calls[0].output,null);
    else{
      assert.equal(calls[0].output.status,scenario==='valid-usage'?'success':'unavailable');
      if(scenario!=='valid-usage')assert.equal(calls[0].output.data.retryable,false);
    }
    checks.push({mode,scenario,loopbackRequests:expectedRequests,durableAttemptCount:1,recoveryDidNotRepeatOrFallback:true,toolEffectsExecuted:0});
  }
}finally{
  await new Promise<void>(accept=>{server.close(()=>accept());server.closeAllConnections();});await agent.close();
  const client=await pool.connect();
  try{
    await client.query('begin');await client.query('set local session_replication_role=replica');
    for(const table of ['agent_tool_call','agent_run_event','agent_approval','assistant_message','agent_run','assistant_conversation'])
      await client.query(`delete from ${table} where user_id=$1`,[owner]);
    await client.query('delete from app_user where id=$1',[owner]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
const receipt={passed:true,checks,syntheticLoopbackSse:true,actualExternalProviderCalls:0,actualModelCalls:0,fixtureCleanupCompleted:true};
await writeFile('tmp/ma24-mode-stream-recovery-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
