import type {PoolClient} from 'pg';
import {expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {lockSkillRuntimeMaterialSources} from './skill-runtime-material-sources';

vi.mock('@/lib/rag/db',()=>({withBoundTenantTransaction:async(_client:unknown,_owner:unknown,work:()=>Promise<unknown>)=>work()}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sha='a'.repeat(64),owner=id(1),taskId=id(3);
function fixture(tool_id:string,input:unknown){
 const identity={runtimeHash:sha,promptHash:sha,toolSchemaHash:sha,modelConfigHash:sha,scopeHash:sha};
 const plan={protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:id(4),version:1,contentHash:sha,sourceHash:sha},
  frozenAt:'2026-10-21T00:00:00.000Z',expiresAt:'2026-10-22T00:00:00.000Z',identity,
  cases:(['replay','negative','injection','permissions','shadow'] as const).map((category,index)=>({id:index===0?'case':category,category,
   provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture',inputHash:sha,sourceHash:sha}))};
 const spec={schema:'skill-candidate-task-v1',freezeId:id(5),planHash:digest(plan),caseId:'case',evaluationId:id(6),arm:'candidate',
  originalRunId:id(2),skillId:id(4),version:1,contentHash:sha,snapshotHash:sha,inputHash:sha,sourceHash:sha,identityHash:digest(identity)};
 const task={id:taskId,user_id:owner,status:'completed',execution_kind:'main-agent-evaluation',execution_spec:spec,snapshot:{result:{reply:'synthetic'}}};
 const row={user_id:owner,run_id:taskId,tool_id,input,input_hash:digest(input),effect:'read',status:'completed',approval_id:null,snapshot:{tool_id,input}};
 const artifact={plan,rawReceipts:{collector:{freezeId:id(5)},candidateSources:{case:{runId:id(2),evaluationId:id(6),taskId,projectionHash:sha}}}};
 return {task,row,artifact};
}
function database(data:ReturnType<typeof fixture>,mailIds:string[]=[],timelineCount=0){
 const query=vi.fn(async(...args:[string,unknown[]?])=>{
  const sql=args[0];
  if(sql.includes('from agent_run r'))return {rows:[data.task]};
  if(sql.includes('from agent_tool_call c'))return {rows:[data.row]};
  if(sql.includes('lock_skill_timeline_sources'))return {rows:[{n:timelineCount}]};
  if(sql.includes('from mailbox_message'))return {rows:mailIds.map(id=>({id}))};
  throw new Error('Unexpected source query');
 });
 return {client:{query} as unknown as PoolClient,query};
}
it('rejects a candidate-only mail source absent from the tenant, even when task and journal match',async()=>{
 const data=fixture('mail_read',{messageId:id(7)}),db=database(data);
 await expect(lockSkillRuntimeMaterialSources(db.client,owner,data.artifact)).rejects.toThrow('mail source unavailable');
});
it('does not accept a different mail row merely because the count matches',async()=>{
 const data=fixture('mail_read',{messageId:id(7)}),db=database(data,[id(8)]);
 await expect(lockSkillRuntimeMaterialSources(db.client,owner,data.artifact)).rejects.toThrow('mail source unavailable');
});
it('locks candidate mail by the current tenant without looking up original task receipts',async()=>{
 const data=fixture('mail_read',{messageId:id(7)}),db=database(data,[id(7)]);
 await expect(lockSkillRuntimeMaterialSources(db.client,owner,data.artifact)).resolves.toMatchObject({runtimePrivateReadSourcesLocked:true,runtimeMailCount:1});
 const mail=db.query.mock.calls.find(([sql])=>sql.includes('from mailbox_message'));
 expect(mail).toBeDefined();expect(mail![0]).toContain('user_id=$1');expect(mail![1]).toEqual([owner,[id(7)]]);
});
it('rejects a missing candidate-only explicit customer before returning material success',async()=>{
 const data=fixture('customer_timeline',{customerId:id(9)}),db=database(data);
 await expect(lockSkillRuntimeMaterialSources(db.client,owner,data.artifact)).rejects.toThrow('timeline source lock incomplete');
});
it('protects the whole-account candidate list independently of original journal selection',async()=>{
 const data=fixture('customer_timeline',{}),db=database(data,[],3);
 await expect(lockSkillRuntimeMaterialSources(db.client,owner,data.artifact)).resolves.toMatchObject({runtimeTimelineCustomerCount:3,runtimePrivateReadSourcesLocked:true});
});
it('rejects a foreign candidate journal before attempting any private source lock',async()=>{
 const data=fixture('mail_read',{messageId:id(7)});data.row.user_id=id(99);const db=database(data,[id(7)]);
 await expect(lockSkillRuntimeMaterialSources(db.client,owner,data.artifact)).rejects.toThrow('journal binding changed');
 expect(db.query.mock.calls.some(([sql])=>sql.includes('mailbox_message'))).toBe(false);
});
