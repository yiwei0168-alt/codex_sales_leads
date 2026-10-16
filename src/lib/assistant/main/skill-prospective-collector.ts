import {z} from 'zod';
import {digest} from './contracts';
import {skillAcceptancePlanSchema,skillAcceptanceObservationSchema} from './skill-acceptance-policy';
import {prepareSkillProspectiveSource} from './skill-prospective-source';
import {prepareSkillAcceptanceBaseline} from './skill-acceptance-baseline';
import {auditDurableSkillCandidate} from './skill-candidate-audit';
import {prepareSkillExecutionIdentity} from './skill-runtime-identity';
import {requireSkillAcceptanceFreeze,inspectLockedSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

export const skillProspectiveReferenceSchema=z.object({caseId:z.string().min(1).max(200),jobId:z.uuid(),evaluationId:z.uuid()}).strict();
const preparedInput=z.object({freezeId:z.uuid(),plan:skillAcceptancePlanSchema,reference:skillProspectiveReferenceSchema}).strict();
type Context={userId:string};
/** Rebuild both arms from current server journals. The local Qwen comparison is not
 * an arm, no submitted observation is accepted, and no model/tool request is made. */
export async function prepareSkillProspectiveObservation(context:Context,input:unknown){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);
 const p=preparedInput.parse(input),{plan,freezeId,reference}=p;
 const sourceInput={jobId:reference.jobId,caseId:reference.caseId,freezeId,plan};
 const source=await prepareSkillProspectiveSource(context,sourceInput),s=source.projection;
 const identity=()=>prepareSkillExecutionIdentity(context,{runId:s.runId});
 if(digest(await identity())!==digest(plan.identity))throw new Error('Prospective runtime identity changed');
 const base=await prepareSkillAcceptanceBaseline(context,{runId:s.runId}),b=base.projection;
 const candidateInput={runId:s.runId,skillId:plan.pin.skillId,version:plan.pin.version,evaluationId:reference.evaluationId,arm:'candidate' as const};
 const candidate=await auditDurableSkillCandidate(context,candidateInput),c=candidate.projection;
 if(c.freezeId!==freezeId||!c.candidateSkillUsed)throw new Error('Prospective candidate freeze or Skill binding changed');
 if(s.inputHash!==b.inputHash||c.taskInputHash!==b.inputHash
  ||b.modelConfigHash!==plan.identity.modelConfigHash||c.modelConfigHash!==plan.identity.modelConfigHash)
  throw new Error('Prospective arm input or model configuration changed');
 const captured=Date.parse(c.capturedAt),completed=Date.parse(c.completedAt);
 if(!Number.isFinite(captured)||!Number.isFinite(completed)||captured<Date.parse(s.taskCompletedAt)
  ||completed<captured||completed>=Date.parse(plan.expiresAt))throw new Error('Prospective candidate outside frozen execution interval');
 const baselineRoutes=b.requests.map((row,step)=>({step,requestedModel:row.requestedModel,
  actualModel:row.response.model,provider:row.response.provider,receiptHash:b.modelReceiptHashes[step],toolSchemaHash:row.toolSchemaHash}));
 const candidateRoutes=c.selectedModels.map(row=>({step:row.step,requestedModel:row.requestedModel,
  actualModel:row.model,provider:row.provider,receiptHash:row.receiptHash,toolSchemaHash:row.toolSchemaHash}));
 const common={state:'completed',stopReason:null,unexpectedEffects:0,identity:plan.identity};
 const observation=skillAcceptanceObservationSchema.parse({caseId:reference.caseId,planHash:digest(plan),pin:plan.pin,
  inputHash:s.inputHash,sourceHash:s.sourceHash,provenance:'prospective-task',capturedAt:s.capturedAt,
  taskStartedAt:s.taskStartedAt,completedAt:c.completedAt,sourceCurrent:true,
  baseline:{...common,requestedModel:baselineRoutes[0]?.requestedModel,actualModel:baselineRoutes[0]?.actualModel,
   provider:baselineRoutes[0]?.provider,answerHash:b.answerHash,evidenceHash:b.evidenceHash,modelReceiptHashes:b.modelReceiptHashes,
   routing:{protocol:'per-decision-v2',decisions:baselineRoutes}},
  candidate:{...common,requestedModel:candidateRoutes[0]?.requestedModel,actualModel:candidateRoutes[0]?.actualModel,
   provider:candidateRoutes[0]?.provider,answerHash:c.answerHash,evidenceHash:c.evidenceHash,
   modelReceiptHashes:c.modelAttemptReceipts.map(row=>row.hash),routing:{protocol:'per-decision-v2',decisions:candidateRoutes}},
 });
 if((await prepareSkillProspectiveSource(context,sourceInput)).projectionHash!==source.projectionHash
  ||(await prepareSkillAcceptanceBaseline(context,{runId:s.runId})).projectionHash!==base.projectionHash
  ||(await auditDurableSkillCandidate(context,candidateInput)).projectionHash!==candidate.projectionHash
  ||digest(await identity())!==digest(plan.identity))throw new Error('Prospective journals changed during collection');
 await requireSkillAcceptanceFreeze(context,freezeId,plan);
 return {observation,sourceKind:c.sourceKind,reference:{...reference,runId:s.runId,
  sourceProjectionHash:source.projectionHash,baselineProjectionHash:base.projectionHash,candidateProjectionHash:candidate.projectionHash},
  productionAgentEquivalent:false as const,automaticActivation:false as const};
}

const selection=z.object({freezeId:z.uuid(),plan:skillAcceptancePlanSchema,
 cases:z.array(skillProspectiveReferenceSchema).min(1).max(100)}).strict();
/** Collector-only immutable snapshot; reviews, provenance attestation and activation
 * remain separate. Rebuilding on later reads detects changed private sources. */
export async function collectSkillProspectiveAcceptance(context:Context,input:unknown,transaction:SkillCollectorTransaction){
 assertLocalAnalysisBoundary();const p=selection.parse(input),{plan,freezeId}=p;
 if(plan.pin.ownerId!==context.userId||['caseId','jobId','evaluationId'].some(key=>
  new Set(p.cases.map(row=>row[key as keyof typeof row])).size!==p.cases.length))
  throw new Error('Prospective collector owner or case binding invalid');
 const prepared=[];
 for(const reference of p.cases)prepared.push(await prepareSkillProspectiveObservation(context,{plan,freezeId,reference}));
 const sourceKind=prepared[0].sourceKind;
 if(prepared.some(row=>row.sourceKind!==sourceKind))throw new Error('Prospective collector cannot mix source categories');
 const observations=prepared.map(row=>row.observation),prospectiveSources=Object.fromEntries(prepared.map(row=>[row.observation.caseId,row.reference]));
 const rawReceipts={prospectiveSources,collector:{protocol:'prospective-collector-v1',freezeId,freezeVerified:true,
  sourceIdentityChecked:true,runtimeIdentityVerified:false,automaticActivation:false}};
 const artifact={sourceKind,plan,observations,rawReceipts},artifactHash=digest(artifact);
 const bundleId=await transaction(context.userId,async client=>{
  await assertSkillCollector(client);
  if(await inspectLockedSkillAcceptanceFreeze(client,context.userId,freezeId,plan)!=='active')throw new Error('Prospective freeze changed before persistence');
  await client.query(`insert into agent_skill_acceptance_bundle(owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
   values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(owner_id,artifact_hash) do nothing`,
  [context.userId,plan.pin.skillId,plan.pin.version,sourceKind,JSON.stringify(plan),JSON.stringify(observations),JSON.stringify(rawReceipts),artifactHash]);
  const saved=(await client.query<{id:string;source_kind:string;plan:unknown;observations:unknown;raw_receipts:unknown}>(
   'select id,source_kind,plan,observations,raw_receipts from agent_skill_acceptance_bundle where owner_id=$1 and artifact_hash=$2',[context.userId,artifactHash])).rows[0];
  if(!saved||digest({sourceKind:saved.source_kind,plan:saved.plan,observations:saved.observations,rawReceipts:saved.raw_receipts})!==artifactHash)
   throw new Error('Prospective stored artifact mismatch');
  return saved.id;
 });
 return {bundleId,artifactHash,collectedCases:observations.length,collectorProvenanceVerified:false,
  productionAgentEquivalent:false,automaticActivation:false};
}
