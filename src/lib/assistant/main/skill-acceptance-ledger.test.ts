import {beforeEach,expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {digest} from './contracts';
const m=vi.hoisted(()=>({query:vi.fn(),freeze:vi.fn(),origins:vi.fn(),captures:[] as unknown[],attempts:[] as unknown[],declarations:[] as unknown[],available:true,mutate:false,reads:0}));
vi.mock('@/lib/rag/db',()=>({withBoundTenantTransaction:async(_client:unknown,_user:string,work:()=>Promise<unknown>)=>work()}));
vi.mock('./skill-acceptance-freeze',()=>({lockSkillAcceptanceFreeze:m.freeze}));
vi.mock('./skill-acceptance-run-locks',async original=>({...await original<typeof import('./skill-acceptance-run-locks')>(),lockRecordedTaskRunJournals:m.origins}));
import {captureSkillAcceptanceLedger} from './skill-acceptance-ledger';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const artifact={sourceKind:'production-runner-pending-verification',plan:{cases:[{id:'case',provenance:'historical-task'}]},observations:[],
 rawReceipts:{collector:{freezeId:id(4)},baselineSources:{case:{runId:id(5)}},candidateSources:{case:{runId:id(5)}}}};
const row={owner_id:id(1),skill_id:id(3),version:1,source_kind:artifact.sourceKind,plan:artifact.plan,observations:[],raw_receipts:artifact.rawReceipts,artifact_hash:digest(artifact)};
const client={query:m.query} as unknown as PoolClient;
const capture=()=>captureSkillAcceptanceLedger(client,id(1),id(2),row.artifact_hash);
beforeEach(()=>{
 vi.resetAllMocks();m.captures=[];m.attempts=[];m.declarations=[];m.available=true;m.mutate=false;m.reads=0;
 m.query.mockImplementation(async(sql:string)=>{
  if(sql.startsWith('select lock_skill_knowledge')||sql.startsWith('select pg_advisory'))return {rows:[]};
  if(sql.startsWith('select owner_id'))return {rows:[row]};
  if(sql.startsWith('select j.id')){m.reads++;return {rows:m.mutate&&m.reads>1?[{changed:true}]:m.captures};}
  if(sql.startsWith('select lock_skill_shadow'))return {rows:[{n:m.captures.length}]};
  if(sql.startsWith('select to_jsonb(a) attempt'))return {rows:m.attempts};
  if(sql.startsWith('select to_regclass'))return {rows:[{available:m.available}]};
  if(sql.startsWith('select to_jsonb(a) declaration'))return {rows:m.declarations};
  throw new Error('Unexpected ledger query');
 });
});
it('retains freeze -> origins -> capture order and returns hashes/counts only',async()=>{
 m.captures=[{id:id(6),run_id:id(5),capture:{private:'capture body'},campaign:{private:'config'}}];
 const result=await capture();expect(result).toMatchObject({acceptanceLedgerRevalidated:true,acceptanceLedgerCaptureCount:1});
 expect(result).toMatchObject({acceptanceLedgerRuntimeExecutionPoliciesRevalidated:false,acceptanceLedgerRuntimeExecutionPolicyCount:0});
 expect(JSON.stringify(result)).not.toContain('private');expect(m.freeze.mock.invocationCallOrder[0]).toBeLessThan(m.origins.mock.invocationCallOrder[0]);
 const lock=m.query.mock.calls.findIndex(([sql])=>sql.startsWith('select lock_skill_shadow'));
 expect(m.origins.mock.invocationCallOrder[0]).toBeLessThan(m.query.mock.invocationCallOrder[lock]);
});
it.each(['attempt','outcome','capture','declaration'])('detects %s changes without treating them as quality approval',async kind=>{
 const before=(await capture()).acceptanceLedgerHash;
 if(kind==='attempt')m.attempts=[{attempt:{id:id(8)},outcome:null}];
 if(kind==='outcome')m.attempts=[{attempt:{id:id(8)},outcome:{changed:true}}];
 if(kind==='capture')m.captures=[{id:id(6),run_id:id(5),capture:{changed:true}}];
 if(kind==='declaration')m.declarations=[{declaration:{changed:true}}];
 expect((await capture()).acceptanceLedgerHash).not.toBe(before);
});
it('refuses a changed capture binding while acquiring locks',async()=>{
 m.mutate=true;await expect(capture()).rejects.toThrow('changed while locking');
});
it('requires declaration storage for pending production evidence',async()=>{
 m.available=false;await expect(capture()).rejects.toThrow('declaration schema unavailable');
});
it('refuses a caller artifact hash mismatch before reading private journals',async()=>{
 await expect(captureSkillAcceptanceLedger(client,id(1),id(2),digest('foreign artifact'))).rejects.toThrow('bundle unavailable');
 expect(m.origins).not.toHaveBeenCalled();
});
