import {expect,it} from 'vitest';
import {digest} from './contracts';
import {skillRunnerEvidenceWindow} from './skill-runner-evidence-window';
import {skillAcceptancePlanSchema,skillAcceptanceObservationSchema} from './skill-acceptance-policy';

function fixture(){
 const hash=digest('synthetic'),pin={ownerId:'11111111-1111-4111-8111-111111111111',skillId:'22222222-2222-4222-8222-222222222222',version:1,contentHash:hash,sourceHash:hash};
 const identity={runtimeHash:hash,promptHash:hash,toolSchemaHash:hash,modelConfigHash:hash,scopeHash:hash};
 const plan=skillAcceptancePlanSchema.parse({protocol:'skill-acceptance-plan-v1',pin,identity,
  frozenAt:'2026-10-16T00:00:00Z',expiresAt:'2026-10-16T02:00:00Z',
  cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:hash,sourceHash:hash,
   provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))});
 const arm={state:'completed',stopReason:null,answerHash:hash,evidenceHash:hash,modelReceiptHashes:[hash],requestedModel:'synthetic',actualModel:'synthetic',provider:'synthetic',identity,unexpectedEffects:0};
 const observations=plan.cases.map(item=>skillAcceptanceObservationSchema.parse({caseId:item.id,planHash:digest(plan),pin,
  inputHash:item.inputHash,sourceHash:item.sourceHash,provenance:item.provenance,capturedAt:'2026-10-16T00:01:00Z',
  taskStartedAt:item.category==='shadow'?'2026-10-16T00:02:00Z':null,completedAt:'2026-10-16T00:03:00Z',sourceCurrent:true,baseline:arm,candidate:arm}));
 return {plan,observations};
}
it('derives the complete observed interval independent of order and permits partial groups',()=>{
 const f=fixture();f.observations[1].completedAt='2026-10-16T00:05:00Z';
 expect(skillRunnerEvidenceWindow(f.plan,f.observations.reverse())).toEqual({capturedAt:'2026-10-16T00:01:00.000Z',completedAt:'2026-10-16T00:05:00.000Z'});
 expect(skillRunnerEvidenceWindow(f.plan,[f.observations[0]])).toBeTruthy();
});
it('rejects empty, duplicated, unknown and malformed observations',()=>{
 const f=fixture();for(const rows of [[],[f.observations[0],f.observations[0]],[{...f.observations[0],caseId:'unknown'}],[{caseId:'replay'}]])
  expect(()=>skillRunnerEvidenceWindow(f.plan,rows)).toThrow();
});
it.each(['planHash','inputHash','sourceHash','pin','provenance'] as const)('rejects %s drift',field=>{
 const f=fixture(),row=f.observations[0];
 const change=field==='pin'?{...row.pin,version:2}:field==='provenance'?'safety-fixture':digest('changed');
 expect(()=>skillRunnerEvidenceWindow(f.plan,[{...row,[field]:change}])).toThrow('binding');
});
it.each([
 {capturedAt:'2026-10-15T23:59:00Z'},
 {completedAt:'2026-10-16T00:00:00Z'},
 {completedAt:'2026-10-16T02:00:00Z'},
])('rejects observation time drift %j',change=>{
 const f=fixture();expect(()=>skillRunnerEvidenceWindow(f.plan,[{...f.observations[0],...change}])).toThrow('time window');
});
it.each([null,'2026-10-16T00:00:30Z','2026-10-16T00:04:00Z'])('rejects shadow task start %s',taskStartedAt=>{
 const f=fixture();expect(()=>skillRunnerEvidenceWindow(f.plan,[{...f.observations[4],taskStartedAt}])).toThrow('prospective');
});
