import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {modeModelConfig} from './mode-config';
import {modelFunctions} from './model';
import {modelRequestManifest} from './model-request-manifest';
import {verifyOwnedTaskModelTransports} from './task-model-transport-journal';
const m=vi.hoisted(()=>({query:vi.fn(),success:vi.fn(),failure:vi.fn(),rows:[] as Array<Record<string,unknown>>,task:true}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(_user:string,work:(client:unknown)=>Promise<unknown>)=>work({query:m.query})}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./task-model-transport-receipt',()=>({verifyConfiguredTaskTransportReceipt:m.success}));
vi.mock('./task-model-transport-failure-receipt',()=>({verifyConfiguredTaskTransportFailure:m.failure}));
vi.mock('./skill-runner-attestation',()=>({loadConfiguredSkillRunnerTrustRegistry:async()=>({keys:[]})}));
const context={userId:'11111111-1111-4111-8111-111111111111'},input={runId:'22222222-2222-4222-8222-222222222222'};
function row(index:number,success:boolean){
 const profile=modeModelConfig('quick').profile!,messages=[{role:'user' as const,content:'Synthetic question'}],request={messages,profile,index};
 const route=profile.routes[index],manifest=modelRequestManifest({model:route.model,messages,tools:modelFunctions,stream:true,reasoning:{effort:route.effort}},
  {model:route.model,provider:'synthetic',id:'generation-'+index});
 return {id:'33333333-3333-4333-8333-33333333333'+index,call_key:'mode-model:0:0:'+index,tool_id:'main_model',effect:'model',status:'completed',
  input:request,input_hash:digest(request),started_at:`2026-10-17T00:0${index*2}:00Z`,completed_at:`2026-10-17T00:0${index*2+1}:00Z`,
  output:success?{status:'success',data:{value:{message:{role:'assistant',content:'reply'},requestManifest:manifest,transportReceipt:{test:true}}}}
   :{status:'unavailable',data:{retryable:true,reason:'http-503',transportFailureReceipt:{test:true}}}};
}
beforeEach(()=>{
 vi.stubEnv('TASK_MODEL_TRANSPORT_COLLECTOR_ID','synthetic');vi.stubEnv('TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256',digest('deployment'));
 m.task=true;m.rows=[row(0,false),row(1,true)];m.query.mockReset().mockImplementation(async(sql:string)=>({rows:sql.includes('from agent_run')?(m.task?[{created_at:'2026-10-17T00:00:00Z'}]:[]):m.rows}));
 const checked={validBefore:'2026-10-20T00:00:00.000Z',registryHash:digest({keys:[]}),statementHash:digest('statement')};m.success.mockReset().mockResolvedValue(checked);m.failure.mockReset().mockResolvedValue(checked);
});
it('loads owned completed rows and verifies every predecessor before success without claiming full provenance',async()=>{
 expect(await verifyOwnedTaskModelTransports(context,input)).toMatchObject({storedModeChainsVerified:true,completeTaskProvenanceVerified:false,automaticActivation:false});
 expect(m.query.mock.calls[0][1]).toEqual([input.runId,context.userId]);
 expect(m.failure).toHaveBeenCalledOnce();expect(m.success).toHaveBeenCalledOnce();
 expect(m.failure.mock.calls[0][1]).toMatchObject({binding:{ownerId:context.userId,runId:input.runId,callId:m.rows[0].id},callCompletedAt:'2026-10-17T00:01:00.000Z'});
});
it('forwards database time to every fallback signature and retains the earliest expiry',async()=>{
 const now=new Date('2026-10-19T01:00:00.000Z');
 m.failure.mockResolvedValue({validBefore:'2026-10-19T02:00:00.000Z',registryHash:digest({keys:[]}),statementHash:digest('failure')});
 const result=await verifyOwnedTaskModelTransports(context,input,now);
 expect(m.failure.mock.calls[0][2]).toBe(now);expect(m.success.mock.calls[0][2]).toBe(now);
 expect(result.transportValidBefore).toBe('2026-10-19T02:00:00.000Z');
});
it.each(['missing-task','empty','gap','incomplete','legacy','changed-hash','no-success','early-success','changed-request','overlap'] as const)('rejects %s journals',async kind=>{
 if(kind==='missing-task')m.task=false;
 if(kind==='empty')m.rows=[];
 if(kind==='gap')m.rows.shift();
 if(kind==='incomplete')m.rows[0].status='started';
 if(kind==='legacy')m.rows[0].call_key='model:0:0';
 if(kind==='changed-hash')m.rows[0].input_hash=digest('changed');
 if(kind==='no-success')m.rows[1].output=row(1,false).output;
 if(kind==='early-success')m.rows[0]=row(0,true);
 if(kind==='changed-request'){
  const request=m.rows[1].input as {messages:unknown[]};request.messages=[{role:'user',content:'changed'}];m.rows[1].input_hash=digest(request);
 }
 if(kind==='overlap')m.rows[1].started_at=m.rows[0].started_at;
 await expect(verifyOwnedTaskModelTransports(context,input)).rejects.toThrow();
});
it('rejects unsigned failures and changed rows observed at final reread',async()=>{
 m.failure.mockRejectedValueOnce(new Error('unsigned'));await expect(verifyOwnedTaskModelTransports(context,input)).rejects.toThrow('unsigned');
 m.failure.mockResolvedValue({registryHash:digest({keys:[]}),statementHash:digest('statement')});
 m.success.mockImplementation(async()=>{m.rows=[row(0,true)];return {registryHash:digest({keys:[]}),statementHash:digest('statement')};});
 await expect(verifyOwnedTaskModelTransports(context,input)).rejects.toThrow('journal or trust changed');
});
