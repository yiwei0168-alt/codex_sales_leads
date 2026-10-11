import {describe,it,expect} from 'vitest';
import {digest} from './contracts';
import {evaluateSkillAcceptancePolicy,skillAcceptancePlanSchema,skillAcceptanceObservationSchema,assertSkillAcceptanceRoutes} from './skill-acceptance-policy';

function fixture(){
 const pin={ownerId:'00000000-0000-4000-8000-000000000001',skillId:'00000000-0000-4000-8000-000000000002',version:1,contentHash:digest('package'),sourceHash:digest('sources')};
 const identity={runtimeHash:digest('runtime'),promptHash:digest('prompt'),toolSchemaHash:digest('tools'),modelConfigHash:digest('config'),scopeHash:digest('scope')};
 const plan=skillAcceptancePlanSchema.parse({protocol:'skill-acceptance-plan-v1',pin,identity,frozenAt:'2026-10-11T00:00:00Z',expiresAt:'2026-10-12T00:00:00Z',
  cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:digest(category),sourceHash:digest(`source:${category}`),provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))});
 const arm={state:'completed',stopReason:null,answerHash:digest('answer'),evidenceHash:digest('evidence'),modelReceiptHashes:[digest('receipt')],requestedModel:'z-ai/glm-5.3',actualModel:'z-ai/glm-5.3',provider:'registered-provider',identity,unexpectedEffects:0};
 const observations=plan.cases.map(item=>({caseId:item.id,planHash:digest(plan),pin,inputHash:item.inputHash,sourceHash:item.sourceHash,provenance:item.provenance,
  capturedAt:'2026-10-11T00:01:00Z',taskStartedAt:'2026-10-11T00:02:00Z',completedAt:'2026-10-11T00:03:00Z',sourceCurrent:true,baseline:structuredClone(arm),candidate:structuredClone(arm)}));
 const verdict={answer:true,citation:true,permission:true,injection:true};
 const judgments=observations.map(item=>({caseId:item.caseId,observationHash:digest(item),reviewerId:pin.ownerId,kind:'human',revision:1,revoked:false,baseline:{...verdict},candidate:{...verdict},rationale:'Synthetic policy fixture; not production or independent quality evidence.'}));
 return {plan,observations,judgments,currentPin:structuredClone(pin),currentIdentity:structuredClone(identity),now:'2026-10-11T01:00:00Z'};
}
function rebind(value:{plan:unknown;observations:Array<{caseId:string;planHash:string}>;judgments:Array<{caseId:string;observationHash:string}>}){
 for(const row of value.observations)row.planHash=digest(value.plan);
 for(const row of value.judgments){const observation=value.observations.find(item=>item.caseId===row.caseId);if(observation)row.observationHash=digest(observation);}
}

function routedFixture(){
 const old=fixture(),value={...old,observations:old.observations.map(row=>skillAcceptanceObservationSchema.parse(row))};
 for(const row of value.observations)for(const side of ['baseline','candidate'] as const){
  const arm=row[side];arm.modelReceiptHashes=[digest('first'),digest('second')];
  arm.routing={protocol:'per-decision-v2',decisions:[
   {step:0,requestedModel:arm.requestedModel,actualModel:arm.actualModel,provider:arm.provider,receiptHash:digest('first'),toolSchemaHash:arm.identity.toolSchemaHash},
   {step:1,requestedModel:'synthetic/backup',actualModel:'synthetic/backup',provider:'backup-provider',receiptHash:digest('second'),toolSchemaHash:arm.identity.toolSchemaHash},
  ]};
 }
 rebind(value);return value;
}
it('records mixed selected models without losing the original single-model format',()=>{
 expect(evaluateSkillAcceptancePolicy(routedFixture())).toMatchObject({policyPassed:true,automaticActivation:false});
 expect(evaluateSkillAcceptancePolicy(fixture()).policyPassed).toBe(true);
});
it.each(['gap','receipt','duplicate','tools','summary'])('rejects invalid per-decision %s binding',kind=>{
 const value=routedFixture(),arm=value.observations[0].candidate,routes=arm.routing!.decisions;
 if(kind==='gap')routes[1].step=3;if(kind==='receipt')routes[1].receiptHash=digest('missing');if(kind==='duplicate')routes[1].receiptHash=routes[0].receiptHash;
 if(kind==='tools')routes[1].toolSchemaHash=digest('changed');if(kind==='summary')arm.actualModel='wrong';
 expect(()=>evaluateSkillAcceptancePolicy(value)).toThrow();
});
it('does not hide a later model identity mismatch or route transition difference',()=>{
 const value=routedFixture();value.observations[0].candidate.routing!.decisions[1].actualModel='different/model';rebind(value);
 expect(evaluateSkillAcceptancePolicy(value).blockers).toEqual(expect.arrayContaining(['model-mismatch:replay:candidate','model-route-difference:replay']));
});
it('allows repeated decisions on the same route while checking all their receipt bindings',()=>{
 const value=routedFixture(),arm=value.observations[0].candidate;
 arm.modelReceiptHashes.push(digest('third'));arm.routing!.decisions.push({...arm.routing!.decisions[1],step:2,receiptHash:digest('third')});rebind(value);
 expect(evaluateSkillAcceptancePolicy(value).policyPassed).toBe(true);
});
it('compares every saved route and receipt against server-derived decisions',()=>{
 const arm=routedFixture().observations[0].candidate,expected=structuredClone(arm.routing!.decisions);
 expect(()=>assertSkillAcceptanceRoutes(arm,expected)).not.toThrow();expected[1].receiptHash=digest('other');
 expect(()=>assertSkillAcceptanceRoutes(arm,expected)).toThrow('server receipts');
 const legacy=skillAcceptanceObservationSchema.parse(fixture().observations[0]).candidate;
 expect(()=>assertSkillAcceptanceRoutes(legacy,arm.routing!.decisions)).toThrow('legacy');
});
describe('strict Skill acceptance calculation (not activation authority)',()=>{
 it('accepts complete policy evidence without issuing activation authorization',()=>{
  expect(evaluateSkillAcceptancePolicy(fixture())).toMatchObject({policyPassed:true,automaticActivation:false,blockers:[]});
 });
 it.each(['replay','negative','injection','permissions','shadow'])('requires frozen %s coverage, even when other rows pass',name=>{
  const value=fixture();value.plan.cases=value.plan.cases.filter(row=>row.id!==name);
  // Keep five rows so the schema minimum cannot mask the coverage condition.
  value.plan.cases.push({...value.plan.cases[0],id:'extra'});rebind(value);
  expect(evaluateSkillAcceptancePolicy(value).blockers).toContain(`missing-category:${name}`);
 });
 it.each(['observation','judgment'])('rejects missing %s rather than treating unreviewed as zero',kind=>{
  const value=fixture();if(kind==='observation')value.observations.pop();else value.judgments.pop();
  expect(evaluateSkillAcceptancePolicy(value).blockers).toContain(`missing-${kind}:shadow`);
 });
 it.each(['plan','observation','judgment'])('rejects duplicate %s rows',kind=>{
  const value=fixture();if(kind==='plan')value.plan.cases.push(value.plan.cases[0]);else if(kind==='observation')value.observations.push(value.observations[0]);else value.judgments.push(value.judgments[0]);rebind(value);
  expect(evaluateSkillAcceptancePolicy(value).blockers).toContain(`duplicate-${kind==='plan'?'plan-case':kind}`);
 });
 it.each(['ownerId','skillId','version','contentHash','sourceHash'] as const)('binds current Skill %s',key=>{
  const value=fixture();if(key==='version')value.currentPin.version++;else if(key.endsWith('Id'))value.currentPin[key]='00000000-0000-4000-8000-000000000099';else value.currentPin[key]=digest('changed');
  expect(evaluateSkillAcceptancePolicy(value).blockers).toContain('skill-or-source-changed');
 });
 it.each(['runtimeHash','promptHash','toolSchemaHash','modelConfigHash','scopeHash'] as const)('binds current %s and both observed arms',key=>{
  const value=fixture();value.currentIdentity[key]=digest('changed');value.observations[0].candidate.identity[key]=digest('other');rebind(value);
  expect(evaluateSkillAcceptancePolicy(value).blockers).toEqual(expect.arrayContaining(['runtime-or-configuration-changed','non-equivalent-arm:replay:candidate']));
 });
 it.each(['2026-10-10T23:59:59Z','2026-10-12T00:00:00Z'])('rejects evaluation outside validity: %s',now=>{
  const value=fixture();value.now=now;expect(evaluateSkillAcceptancePolicy(value).blockers).toContain('plan-outside-validity');
 });
 it('cannot relabel a historical result as prospective shadow after the task began',()=>{
  const value=fixture();value.observations[4].capturedAt='2026-10-11T00:02:01Z';rebind(value);
  expect(evaluateSkillAcceptancePolicy(value).blockers).toContain('not-prospective:shadow');
 });
 it('rejects changed source and post-review answer bytes even with passing verdicts',()=>{
  const value=fixture();value.observations[0].sourceCurrent=false;value.observations[0].candidate.answerHash=digest('altered');
  expect(evaluateSkillAcceptancePolicy(value).blockers).toEqual(expect.arrayContaining(['source-not-current:replay','judgment-binding:replay']));
 });
 it.each(['baseline','candidate'] as const)('does not count an incomplete %s arm as a comparable outcome',side=>{
  const value=fixture();value.observations[0][side].state='failed';rebind(value);
  expect(evaluateSkillAcceptancePolicy(value).blockers).toContain(`incomplete-arm:replay:${side}`);
 });
 it('rejects model/provider mismatches and unexpected effects regardless of the review',()=>{
  const value=fixture();value.observations[0].candidate.actualModel='different/model';value.observations[0].candidate.provider='other';value.observations[0].candidate.unexpectedEffects=1;rebind(value);
  expect(evaluateSkillAcceptancePolicy(value).blockers).toEqual(expect.arrayContaining(['model-mismatch:replay:candidate','model-route-difference:replay','unexpected-effect:replay:candidate']));
 });
 it.each(['revoked','assistant-development'])('rejects %s judgments',kind=>{
  const value=fixture();if(kind==='revoked')value.judgments[0].revoked=true;else value.judgments[0].kind=kind;
  expect(evaluateSkillAcceptancePolicy(value).blockers).toContain('unaccepted-judgment:replay');
 });
 it('any candidate permission or injection failure blocks the whole bundle',()=>{
  const value=fixture();value.judgments[2].candidate.injection=false;value.judgments[3].candidate.permission=false;
  expect(evaluateSkillAcceptancePolicy(value).blockers).toEqual(expect.arrayContaining(['candidate-safety-failure:injection','candidate-safety-failure:permissions']));
 });
 it('does not offset a replay citation regression with another category',()=>{
  const value=fixture();value.judgments[0].candidate.citation=false;value.judgments[1].baseline.citation=false;
  expect(evaluateSkillAcceptancePolicy(value).blockers).toContain('quality-regression:replay:citation');
 });
 it('does not call equal zero-success runs proof that a method worked',()=>{
  const value=fixture();for(const row of value.judgments){row.baseline.answer=false;row.candidate.answer=false;}
  expect(evaluateSkillAcceptancePolicy(value).blockers).toEqual(expect.arrayContaining(['no-demonstrated-success:replay','no-demonstrated-success:shadow']));
 });
 it('refuses an injected automaticActivation/status field instead of trusting it',()=>{
  const value=fixture();expect(()=>evaluateSkillAcceptancePolicy({...value,plan:{...value.plan,status:'passed',automaticActivation:true}})).toThrow();
 });
});
