import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
const mocks=vi.hoisted(()=>({query:vi.fn(),freeze:vi.fn(),shadow:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:mocks.query}));
vi.mock('./skill-acceptance-freeze',()=>({requireSkillAcceptanceFreeze:mocks.freeze}));
vi.mock('./skill-shadow',()=>({prepareSkillShadow:mocks.shadow}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
import {prepareSkillProspectiveSource} from './skill-prospective-source';

const owner='11111111-1111-4111-8111-111111111111',skill='22222222-2222-4222-8222-222222222222';
const job='33333333-3333-4333-8333-333333333333',freeze='44444444-4444-4444-8444-444444444444';
const hash=digest('synthetic');
const input={content:'Synthetic read-only task'},config={mode:'standard'},start={kind:'prospective-server-capture',
 skillId:skill,version:1,contentHash:hash,sourceHash:hash};
const plan=()=>({protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:skill,version:1,contentHash:hash,sourceHash:hash},
 identity:{runtimeHash:hash,promptHash:hash,toolSchemaHash:hash,modelConfigHash:digest(config),scopeHash:hash},
 frozenAt:'2026-10-16T01:00:00.000Z',expiresAt:'2026-10-16T03:00:00.000Z',
 cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:digest(input),sourceHash:digest(start),
  provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))});
const row=()=>({id:job,run_id:skill,campaign_id:freeze,start_context:start,
 registered_at:new Date('2026-10-16T00:00:00Z'),captured_at:new Date('2026-10-16T01:01:00Z'),
 task_started_at:new Date('2026-10-16T01:02:00Z'),ready_at:new Date('2026-10-16T02:00:00Z'),task_input:input,model_config:config});
const shadow=()=>({capture:{jobId:job,runId:skill,campaignId:freeze,start},config:{selection:{kind:'whole-read-only-task'}},snapshot:{bound:true}});
const args=()=>({jobId:job,freezeId:freeze,caseId:'shadow',plan:plan()});
beforeEach(()=>{vi.resetAllMocks();mocks.query.mockResolvedValue([row()]);mocks.freeze.mockResolvedValue({});mocks.shadow.mockResolvedValue(shadow());});
it('binds a frozen pre-task capture without using or promoting local model output',async()=>{
 const result=await prepareSkillProspectiveSource({userId:owner},args());
 expect(result).toMatchObject({prospectiveCaptureVerified:true,localComparisonPromoted:false,automaticActivation:false});
 expect(result.projection.taskStartedAt).toBe('2026-10-16T01:02:00.000Z');
 expect(mocks.freeze).toHaveBeenCalledTimes(2);expect(mocks.query).toHaveBeenCalledTimes(2);
});
it.each([
 {registered_at:new Date('2026-10-16T01:01:00Z')}, {captured_at:new Date('2026-10-16T00:59:00Z')},
 {task_started_at:new Date('2026-10-16T01:00:00Z')}, {task_started_at:null},
 {ready_at:null}, {ready_at:new Date('2026-10-16T01:01:00Z')},
 {ready_at:new Date('2026-10-16T03:00:00Z')}, {registered_at:new Date('invalid')},
])('rejects nonprospective or incomplete server time ordering %j',async change=>{
 mocks.query.mockResolvedValue([{...row(),...change}]);
 await expect(prepareSkillProspectiveSource({userId:owner},args())).rejects.toThrow('frozen before');
 expect(mocks.shadow).not.toHaveBeenCalled();
});
it.each([{task_input:{content:'changed'}},{model_config:{mode:'deep'}},{start_context:{...start,contentHash:digest('changed')}}])('rejects source binding drift %j',async change=>{
 mocks.query.mockResolvedValue([{...row(),...change}]);
 await expect(prepareSkillProspectiveSource({userId:owner},args())).rejects.toThrow('binding');
});
it('rejects another owner, a missing capture or a non-shadow plan case',async()=>{
 await expect(prepareSkillProspectiveSource({userId:skill},args())).rejects.toThrow('owner');
 await expect(prepareSkillProspectiveSource({userId:owner},{...args(),caseId:'replay'})).rejects.toThrow('case');
 mocks.query.mockResolvedValue([]);await expect(prepareSkillProspectiveSource({userId:owner},args())).rejects.toThrow('unavailable');
});
it('propagates source invalidation and rejects bounded subtask substitution',async()=>{
 mocks.shadow.mockRejectedValueOnce(new Error('source revoked'));
 await expect(prepareSkillProspectiveSource({userId:owner},args())).rejects.toThrow('revoked');
 mocks.shadow.mockResolvedValue({...shadow(),config:{selection:{kind:'read-only-subtask'}}});
 await expect(prepareSkillProspectiveSource({userId:owner},args())).rejects.toThrow('selection');
});
it('rejects changed capture during reading and freeze revocation at the final check',async()=>{
 mocks.query.mockResolvedValueOnce([row()]).mockResolvedValueOnce([{...row(),start_context:{changed:true}}]);
 await expect(prepareSkillProspectiveSource({userId:owner},args())).rejects.toThrow('during');
 mocks.query.mockResolvedValue([row()]);mocks.freeze.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('freeze revoked'));
 await expect(prepareSkillProspectiveSource({userId:owner},args())).rejects.toThrow('revoked');
});
it('rechecks source permissions and snapshot before returning the binding',async()=>{
 mocks.shadow.mockResolvedValueOnce(shadow()).mockRejectedValueOnce(new Error('source revoked during read'));
 await expect(prepareSkillProspectiveSource({userId:owner},args())).rejects.toThrow('revoked during');
 mocks.shadow.mockResolvedValueOnce(shadow()).mockResolvedValueOnce({...shadow(),snapshot:{bound:false}});
 await expect(prepareSkillProspectiveSource({userId:owner},args())).rejects.toThrow('source changed');
});
