import {beforeEach,expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {digest,result} from './contracts';
import {revalidateSkillRuntimeLiveSources} from './skill-runtime-live-source-lifecycle';
import {lockSkillRuntimeMaterialSources} from './skill-runtime-material-sources';
const m=vi.hoisted(()=>({sources:vi.fn(),bytes:vi.fn(),original:vi.fn(),disclosure:vi.fn()}));
vi.mock('./skill-runtime-read-sources',()=>({assertSkillRuntimeReadSources:m.sources}));
vi.mock('./skill-knowledge-receipt-bytes',()=>({revalidateLockedSkillKnowledgeReceiptBytes:m.bytes}));
vi.mock('./skill-runtime-candidate-source',()=>({prepareSkillRuntimeCandidateSource:m.original}));
vi.mock('./skill-runtime-disclosure',()=>({assertSkillRuntimeModelDisclosure:m.disclosure}));
vi.mock('@/lib/rag/db',()=>({withBoundTenantTransaction:async(_client:unknown,_user:string,work:()=>Promise<unknown>)=>work()}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sha='a'.repeat(64),client={} as PoolClient;
const spec={schema:'skill-candidate-task-v1',freezeId:id(5),planHash:sha,caseId:'live',evaluationId:id(6),arm:'candidate',
 originalRunId:id(2),skillId:id(4),version:1,contentHash:sha,snapshotHash:sha,inputHash:sha,sourceHash:sha,identityHash:sha,
 prospectiveJobId:id(7),prospectiveProjectionHash:sha,readExecution:'registered-live-read-v1'};
const task={id:id(3),execution_spec:spec,snapshot:{input:{content:'Synthetic question',requestKey:'synthetic-runtime',attachments:[],mode:'quick',knowledgeScope:['company']}}};
const read={run_id:task.id,tool_id:'customer_timeline',input:{offset:1},snapshot:{output:result([{id:id(9),name:'Synthetic customer'}],{cost:'known'})}};
const other={...read,run_id:id(99)};
const saved={sourceHash:sha,snapshot:{candidate:{listing:{id:spec.skillId}},receipts:[]}};
const run=()=>revalidateSkillRuntimeLiveSources(client,id(1),[task],[read,other]);
beforeEach(()=>{vi.resetAllMocks();m.sources.mockResolvedValue(undefined);m.bytes.mockResolvedValue({knowledgeReceiptBytesManifestHash:sha});m.original.mockResolvedValue(saved);m.disclosure.mockResolvedValue(undefined);});
it('rereads candidate-only sources in their own task and scope, without including another task',async()=>{
 const value=await run();expect(value).toMatchObject({runtimeLiveReadSourcesRevalidated:true,runtimeLiveReadTaskCount:1});
 expect(m.sources).toHaveBeenCalledWith({userId:id(1),runId:task.id,knowledgeScope:['company']},expect.any(Array),spec.skillId);
 const messages=m.sources.mock.calls[0][1];expect(messages).toHaveLength(2);expect(JSON.parse(messages[0].tool_calls[0].function.arguments)).toEqual({tool:read.tool_id,arguments:read.input});
 expect(JSON.parse(messages[1].content)).toEqual(read.snapshot.output);
 expect(m.original).toHaveBeenCalledWith({userId:id(1)},{runId:spec.originalRunId,skillId:spec.skillId,version:1});
 expect(m.disclosure).toHaveBeenCalledWith({userId:id(1)},messages,saved.snapshot);
 expect(m.bytes).toHaveBeenCalledWith(client,id(1),[{tool:read.tool_id,input:read.input,output:read.snapshot.output}]);
 expect(JSON.stringify(value)).not.toContain('Synthetic customer');
});
it.each(['sources','bytes','disclosure'] as const)('rejects a %s change although the task and tool journals stay unchanged',async(kind)=>{
 m[kind].mockRejectedValueOnce(new Error('Current source withdrawn'));
 await expect(run()).rejects.toThrow('Current source withdrawn');
});
it('rejects a changed original/candidate snapshot before accepting live source checks',async()=>{
 m.original.mockResolvedValueOnce({...saved,sourceHash:digest('changed source')});
 await expect(run()).rejects.toThrow('source snapshot changed');expect(m.sources).not.toHaveBeenCalled();expect(m.bytes).not.toHaveBeenCalled();
});
it('binds byte manifest changes into the opaque lifecycle fingerprint',async()=>{
 const before=await run();m.bytes.mockResolvedValueOnce({knowledgeReceiptBytesManifestHash:digest('changed bytes')});
 expect((await run()).runtimeLiveReadSourceManifestHash).not.toBe(before.runtimeLiveReadSourceManifestHash);
});
it('keeps legacy saved reads separate and does not reinterpret old tasks as live',async()=>{
 const {readExecution,...legacy}=spec;expect(readExecution).toBe('registered-live-read-v1');
 const value=await revalidateSkillRuntimeLiveSources(client,id(1),[{...task,execution_spec:legacy,snapshot:{}}],[read]);
 expect(value.runtimeLiveReadTaskCount).toBe(0);expect(m.sources).not.toHaveBeenCalled();expect(m.original).not.toHaveBeenCalled();
});
it('refuses a failed read in a completed live task before source reconstruction',async()=>{
 await expect(revalidateSkillRuntimeLiveSources(client,id(1),[task],[{...read,snapshot:{output:result(null,{status:'unavailable'})}}])).rejects.toThrow('source receipt unavailable');
 expect(m.original).not.toHaveBeenCalled();
});
function lockedFixture(){
 const identity={runtimeHash:sha,promptHash:sha,toolSchemaHash:sha,modelConfigHash:sha,scopeHash:sha};
 const plan={protocol:'skill-acceptance-plan-v1',pin:{ownerId:id(1),skillId:spec.skillId,version:1,contentHash:sha,sourceHash:sha},identity,
  frozenAt:'2026-10-21T00:00:00.000Z',expiresAt:'2026-10-22T00:00:00.000Z',
  cases:(['replay','negative','injection','permissions','shadow'] as const).map(category=>({id:category,category,inputHash:sha,sourceHash:sha,
   provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))};
 const lockedTask={...task,user_id:id(1),status:'completed',execution_kind:'main-agent-evaluation',
  execution_spec:{...spec,caseId:'shadow',planHash:digest(plan),identityHash:digest(identity)},snapshot:{...task.snapshot,result:{reply:'Synthetic answer'}}};
 const lockedRead={...read,user_id:id(1),effect:'read',status:'completed',input_hash:digest(read.input),approval_id:null};
 const query=vi.fn(async(sql:string)=>{
  if(sql.includes('from agent_run r'))return {rows:[lockedTask]};
  if(sql.includes('from agent_tool_call c'))return {rows:[lockedRead]};
  if(sql.includes('lock_skill_timeline_sources'))return {rows:[{n:1}]};
  throw new Error('Unexpected lifecycle query');
 });
 const artifact={plan,rawReceipts:{collector:{freezeId:spec.freezeId},prospectiveSources:{shadow:{caseId:'shadow',jobId:spec.prospectiveJobId,
  evaluationId:spec.evaluationId,taskId:task.id,runId:spec.originalRunId,sourceProjectionHash:sha,baselineProjectionHash:sha,candidateProjectionHash:sha}}}};
 return {client:{query} as unknown as PoolClient,query,artifact};
}
it('propagates source withdrawal through the retained runtime reader used by acceptance and later use',async()=>{
 const db=lockedFixture();m.sources.mockRejectedValueOnce(new Error('New source withdrawn'));
 await expect(lockSkillRuntimeMaterialSources(db.client,id(1),db.artifact)).rejects.toThrow('New source withdrawn');
 expect(db.query.mock.calls.some(([sql])=>sql.includes('lock_skill_timeline_sources'))).toBe(true);
});
it('changes the acceptance runtime ledger when live source bytes change without journal changes',async()=>{
 const db=lockedFixture(),before=await lockSkillRuntimeMaterialSources(db.client,id(1),db.artifact);
 m.bytes.mockResolvedValueOnce({knowledgeReceiptBytesManifestHash:digest('different original bytes')});
 const after=await lockSkillRuntimeMaterialSources(db.client,id(1),db.artifact);
 expect(after.runtimeTaskLedgerHash).not.toBe(before.runtimeTaskLedgerHash);
 expect(after).toMatchObject({runtimeLiveReadSourcesRevalidated:true,runtimeLiveReadTaskCount:1});
});
