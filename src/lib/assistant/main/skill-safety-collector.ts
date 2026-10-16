import {z} from 'zod';
import {digest} from './contracts';
import {skillAcceptancePlanSchema,skillAcceptanceObservationSchema} from './skill-acceptance-policy';
import {auditSkillSafetyArm} from './skill-safety-audit';
import {requireSkillAcceptanceFreeze,inspectLockedSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

export const skillSafetyReferenceSchema=z.object({caseId:z.string().min(1).max(120),runId:z.uuid(),evaluationId:z.uuid()}).strict();
const selection=z.object({freezeId:z.uuid(),plan:skillAcceptancePlanSchema,cases:z.array(skillSafetyReferenceSchema).min(1).max(100)}).strict();
/** Both arms are reconstructed; callers cannot submit observations or verdicts. */
export async function collectSkillSafetyAcceptance(context:{userId:string},input:unknown,transaction:SkillCollectorTransaction){
 assertLocalAnalysisBoundary();const p=selection.parse(input),{plan,freezeId}=p;
 if(plan.pin.ownerId!==context.userId||new Set(p.cases.map(row=>row.caseId)).size!==p.cases.length||new Set(p.cases.map(row=>row.evaluationId)).size!==p.cases.length)throw new Error('Safety collector owner or cases invalid');
 await requireSkillAcceptanceFreeze(context,freezeId,plan);
 const observations:unknown[]=[],safetySources:Record<string,unknown>={};let sourceKind:string|undefined;
 for(const ref of p.cases){
  const item=plan.cases.find(row=>row.id===ref.caseId);if(!item||item.provenance!=='safety-fixture'||!['negative','injection','permissions'].includes(item.category))throw new Error('Unregistered safety case');
  const run={...ref,skillId:plan.pin.skillId,version:plan.pin.version};
  const baseline=await auditSkillSafetyArm(context,{...run,arm:'baseline'},{freezeId,plan}),candidate=await auditSkillSafetyArm(context,{...run,arm:'candidate'},{freezeId,plan});
  const b=baseline.projection,c=candidate.projection;
  if(b.sourceKind!==c.sourceKind||(sourceKind&&sourceKind!==b.sourceKind))throw new Error('Mixed safety source kinds');sourceKind=b.sourceKind;
  if([b,c].some(row=>row.inputHash!==item.inputHash||row.sourceHash!==item.sourceHash||Date.parse(row.capturedAt)<Date.parse(plan.frozenAt)||Date.parse(row.completedAt)>=Date.parse(plan.expiresAt)))throw new Error('Safety source or time mismatch');
  const arm=(row:typeof b)=>({state:row.state,stopReason:row.stopReason,unexpectedEffects:row.unexpectedEffects,identity:plan.identity,
   answerHash:row.answerHash,evidenceHash:row.evidenceHash,modelReceiptHashes:row.modelReceiptHashes,requestedModel:row.routes[0].requestedModel,actualModel:row.routes[0].actualModel,provider:row.routes[0].provider,routing:{protocol:'per-decision-v2',decisions:row.routes}});
  observations.push(skillAcceptanceObservationSchema.parse({caseId:item.id,planHash:digest(plan),pin:plan.pin,inputHash:item.inputHash,sourceHash:item.sourceHash,provenance:item.provenance,
   capturedAt:new Date(Math.min(Date.parse(b.capturedAt),Date.parse(c.capturedAt))).toISOString(),completedAt:new Date(Math.max(Date.parse(b.completedAt),Date.parse(c.completedAt))).toISOString(),taskStartedAt:null,sourceCurrent:true,baseline:arm(b),candidate:arm(c)}));
  safetySources[item.id]={...ref,baselineProjectionHash:baseline.projectionHash,candidateProjectionHash:candidate.projectionHash};
 }
 await requireSkillAcceptanceFreeze(context,freezeId,plan);
 const rawReceipts={safetySources,collector:{protocol:'safety-collector-v1',freezeId,freezeVerified:true,sourceIdentityChecked:true,runtimeIdentityVerified:false,automaticActivation:false}};
 const artifact={sourceKind,plan,observations,rawReceipts},artifactHash=digest(artifact);
 const bundleId=await transaction(context.userId,async client=>{
  await assertSkillCollector(client);
  if(await inspectLockedSkillAcceptanceFreeze(client,context.userId,freezeId,plan)!=='active')throw new Error('Safety freeze inactive before persistence');
  await client.query(`insert into agent_skill_acceptance_bundle(owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
   values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(owner_id,artifact_hash) do nothing`,[context.userId,plan.pin.skillId,plan.pin.version,sourceKind,JSON.stringify(plan),JSON.stringify(observations),JSON.stringify(rawReceipts),artifactHash]);
  const row=(await client.query<{id:string;source_kind:string;plan:unknown;observations:unknown;raw_receipts:unknown}>('select id,source_kind,plan,observations,raw_receipts from agent_skill_acceptance_bundle where owner_id=$1 and artifact_hash=$2',[context.userId,artifactHash])).rows[0];
  if(!row||digest({sourceKind:row.source_kind,plan:row.plan,observations:row.observations,rawReceipts:row.raw_receipts})!==artifactHash)throw new Error('Safety stored artifact mismatch');return row.id;
 });
 return {bundleId,artifactHash,collectedCases:observations.length,collectorProvenanceVerified:false,productionAgentEquivalent:false,automaticActivation:false};
}
