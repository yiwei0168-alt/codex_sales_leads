import {expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {modeModelConfig} from './mode-config';
import {modelFunctions} from './model';
import {modelRequestManifest} from './model-request-manifest';
import {createSkillModelJournal,type SkillCollectorTransaction} from './skill-model-journal';
import {auditModelProtocol} from './model-protocol-audit';
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
it.each(['valid','empty','duplicate','wrong-role'])('hashes persisted JSON and retains %s response without qualifying rejected completion',async(kind)=>{
 const ownerId='11111111-1111-4111-8111-111111111111',evaluationId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
 let attempt:Record<string,unknown>|undefined,outcome:Record<string,unknown>|undefined;
 const query=vi.fn(async(sql:string,args:unknown[]=[])=>{
  if(sql.includes('current_user'))return {rows:[{name:'network_copilot_skill_collector',super:false,bypass:false}]};
  if(sql.startsWith('insert into agent_skill_model_attempt')){
   if(attempt)return {rows:[]};
   attempt={id,owner_id:args[0],evaluation_id:args[1],arm:args[2],step:args[3],route_index:args[4],source_kind:args[5],snapshot_hash:args[6],input:JSON.parse(String(args[7])),input_hash:args[8],freeze_id:args[9]};return {rows:[{id}]};
  }
  if(sql.startsWith('select * from agent_skill_model_attempt'))return {rows:[attempt]};
  if(sql.startsWith('insert into agent_skill_model_outcome')){outcome={output:JSON.parse(String(args[2])),output_hash:args[3]};return {rows:[]};}
  if(sql.startsWith('select output,output_hash'))return {rows:outcome?[outcome]:[]};
  throw new Error('Unexpected fixture SQL');
 });
 const transaction:SkillCollectorTransaction=async(_owner,work)=>work({query} as unknown as Parameters<Parameters<SkillCollectorTransaction>[1]>[0]);
 const journal=createSkillModelJournal(transaction,{ownerId,evaluationId,arm:'candidate',step:0,snapshotHash:digest('snapshot'),sourceKind:'synthetic-fixture'});
 const profile=modeModelConfig('standard').profile!,input={messages:[{role:'user',content:'Synthetic request',reasoning:undefined}],profile,index:0};
 const started=await journal.begin(input);expect(attempt!.input_hash).toBe(digest(attempt!.input));
 if(kind!=='valid'){
  const message=kind==='empty'?{role:'assistant',content:''}:kind==='wrong-role'?{role:'user',content:'Invalid provider role'}:
   {role:'assistant',content:null,tool_calls:[0,1].map(()=>({id:'duplicate',type:'function',function:{name:'discover_tools',arguments:'{}'}}))};
  const raw={message,transportReceipt:{synthetic:'preserved-untrusted-receipt'}};
  await expect(journal.save(started.id,0,{status:'unavailable',retryable:true,reason:'completed-response-rejected',rejectedCompletedResponse:raw})).rejects.toThrow('must require reconciliation');
  await expect(journal.save(started.id,0,{status:'unavailable',retryable:false,reason:'http-503',rejectedCompletedResponse:raw})).rejects.toThrow('must require reconciliation');
  await journal.save(started.id,0,{status:'unavailable',retryable:false,reason:'completed-response-rejected',rejectedCompletedResponse:raw});
  const recovered=await journal.begin(input);expect(recovered.fresh).toBe(false);
  expect(recovered.output).toEqual({status:'unavailable',data:{retryable:false,reason:'completed-response-rejected',rejectedCompletedResponse:raw}});
  expect(outcome!.output_hash).toBe(digest(outcome!.output));
  expect(auditModelProtocol({input:attempt!.input,input_hash:String(attempt!.input_hash),output:recovered.output}).bound).toBe(false);
  return;
 }
 const body={model:profile.routes[0].model,messages:[{role:'user',content:'Synthetic request'}],tools:modelFunctions,stream:true,reasoning:{effort:profile.routes[0].effort}};
 await journal.save(started.id,0,{status:'success',value:{message:{role:'assistant',content:'Synthetic reply'},usage:undefined,
  requestManifest:modelRequestManifest(body,{model:profile.routes[0].model,provider:'synthetic',id:'synthetic-generation'})}});
 expect(outcome!.output_hash).toBe(digest(outcome!.output));
 const recovered=await journal.begin(input);expect(recovered.fresh).toBe(false);
 expect((recovered.output as {data:{value:unknown}}).data.value).not.toHaveProperty('usage');
});
