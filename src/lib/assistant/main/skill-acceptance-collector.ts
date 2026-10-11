import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {skillAcceptancePlanSchema,skillAcceptanceObservationSchema} from './skill-acceptance-policy';
import {prepareSkillAcceptanceBaseline} from './skill-acceptance-baseline';
import {auditDurableSkillCandidate} from './skill-candidate-audit';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';
import {skillSourcesCurrent,type SourcedSkillVersion} from './skill-source-guard';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {requireSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {prepareSkillExecutionIdentity} from './skill-runtime-identity';

const selection=z.object({plan:skillAcceptancePlanSchema,freezeId:z.uuid().optional(),replays:z.array(z.object({caseId:z.string().min(1),runId:z.uuid(),evaluationId:z.uuid()}).strict()).min(1).max(100)}).strict();
/** Append historical collection snapshots, not reviewer judgments or activation grants.
 * Runtime identities remain unverified; optional freeze references are checked against server records. */
export async function collectHistoricalSkillAcceptance(context:{userId:string},input:unknown,transaction:SkillCollectorTransaction){
 assertLocalAnalysisBoundary();const {plan,replays,freezeId}=selection.parse(input);
 if(freezeId)await requireSkillAcceptanceFreeze(context,freezeId,plan);
 if(plan.pin.ownerId!==context.userId||new Set(replays.map(row=>row.caseId)).size!==replays.length||new Set(replays.map(row=>row.evaluationId)).size!==replays.length)throw new Error('Collector owner or case binding invalid');
 const checkSkill=()=>tenantTransaction(context.userId,async client=>{
  const row=(await client.query<SourcedSkillVersion&{current_version:number;dependencies:unknown}>(`select s.current_version,s.scope,s.owner_id,v.source,v.validation,v.files,v.content_hash,v.dependencies
   from agent_skill s join agent_skill_version v on v.skill_id=s.id and v.version=$3 join app_user u on u.id=s.owner_id and u.status='active'
   where s.id=$1 and s.owner_id=$2`,[plan.pin.skillId,context.userId,plan.pin.version])).rows[0];
  if(!row||row.current_version!==plan.pin.version||row.scope!=='account'||row.content_hash!==plan.pin.contentHash||digest(row.files)!==plan.pin.contentHash
   ||digest({source:row.source,validation:row.validation,dependencies:row.dependencies})!==plan.pin.sourceHash||!await skillSourcesCurrent(client,context.userId,row))throw new Error('Collector Skill source changed');
 });
 await checkSkill();
 const observations:unknown[]=[],baselineSources:Record<string,unknown>={},candidateSources:Record<string,unknown>={};
 let sourceKind:string|undefined;
 for(const ref of replays){
  const item=plan.cases.find(row=>row.id===ref.caseId);
  if(!item||item.category!=='replay'||item.provenance!=='historical-task')throw new Error('Collector case is not historical replay');
  if(freezeId&&digest(plan.identity)!==digest(await prepareSkillExecutionIdentity(context,{runId:ref.runId})))throw new Error('Frozen collector identity changed');
  const base=await prepareSkillAcceptanceBaseline(context,{runId:ref.runId}),candidate=await auditDurableSkillCandidate(context,{runId:ref.runId,skillId:plan.pin.skillId,version:plan.pin.version,evaluationId:ref.evaluationId,arm:'candidate'});
  const b=base.projection,c=candidate.projection;
  if(freezeId&&c.freezeId!==freezeId)throw new Error('Candidate journal freeze binding mismatch');
  if(freezeId&&(Date.parse(c.capturedAt)<Date.parse(plan.frozenAt)||Date.parse(c.completedAt)>=Date.parse(plan.expiresAt)))throw new Error('Candidate outside frozen plan interval');
  if(item.inputHash!==b.inputHash||item.sourceHash!==base.projectionHash||c.taskInputHash!==b.inputHash||b.modelConfigHash!==plan.identity.modelConfigHash||c.modelConfigHash!==plan.identity.modelConfigHash)
   throw new Error('Collector task or model configuration changed');
  if(sourceKind&&sourceKind!==c.sourceKind)throw new Error('Collector cannot mix source categories');sourceKind=c.sourceKind;
  const baselineRoutes=b.requests.map((row,step)=>({step,requestedModel:row.requestedModel,actualModel:row.response.model,provider:row.response.provider,receiptHash:b.modelReceiptHashes[step],toolSchemaHash:row.toolSchemaHash}));
  const candidateRoutes=c.selectedModels.map(row=>({step:row.step,requestedModel:row.requestedModel,actualModel:row.model,provider:row.provider,receiptHash:row.receiptHash,toolSchemaHash:row.toolSchemaHash}));
  const common={state:'completed',stopReason:null,unexpectedEffects:0,identity:plan.identity};
  observations.push(skillAcceptanceObservationSchema.parse({caseId:item.id,planHash:digest(plan),pin:plan.pin,inputHash:item.inputHash,sourceHash:item.sourceHash,provenance:item.provenance,
   capturedAt:c.capturedAt,completedAt:c.completedAt,taskStartedAt:null,sourceCurrent:true,
   baseline:{...common,requestedModel:baselineRoutes[0].requestedModel,actualModel:baselineRoutes[0].actualModel,provider:baselineRoutes[0].provider,answerHash:b.answerHash,evidenceHash:b.evidenceHash,modelReceiptHashes:b.modelReceiptHashes,routing:{protocol:'per-decision-v2',decisions:baselineRoutes}},
   candidate:{...common,requestedModel:candidateRoutes[0].requestedModel,actualModel:candidateRoutes[0].actualModel,provider:candidateRoutes[0].provider,answerHash:c.answerHash,evidenceHash:c.evidenceHash,modelReceiptHashes:c.modelAttemptReceipts.map(row=>row.hash),routing:{protocol:'per-decision-v2',decisions:candidateRoutes}},
  }));
  baselineSources[item.id]={runId:ref.runId,projectionHash:base.projectionHash};candidateSources[item.id]={runId:ref.runId,evaluationId:ref.evaluationId,projectionHash:candidate.projectionHash};
 }
 await checkSkill();
 if(freezeId)await requireSkillAcceptanceFreeze(context,freezeId,plan);
 const artifact={sourceKind,plan,observations,rawReceipts:{baselineSources,candidateSources,collector:{protocol:'historical-collector-v1',...(freezeId?{freezeId}:{}),freezeVerified:Boolean(freezeId),sourceIdentityChecked:Boolean(freezeId),runtimeIdentityVerified:false,automaticActivation:false}}},artifactHash=digest(artifact);
 const id=await transaction(context.userId,async client=>{
  await assertSkillCollector(client);
  await client.query(`insert into agent_skill_acceptance_bundle(owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
   values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(owner_id,artifact_hash) do nothing`,[context.userId,plan.pin.skillId,plan.pin.version,sourceKind,JSON.stringify(plan),JSON.stringify(observations),JSON.stringify(artifact.rawReceipts),artifactHash]);
  const row=(await client.query<{id:string;plan:unknown;observations:unknown;raw_receipts:unknown;source_kind:string}>('select id,plan,observations,raw_receipts,source_kind from agent_skill_acceptance_bundle where owner_id=$1 and artifact_hash=$2',[context.userId,artifactHash])).rows[0];
  if(!row||digest({sourceKind:row.source_kind,plan:row.plan,observations:row.observations,rawReceipts:row.raw_receipts})!==artifactHash)throw new Error('Collector stored artifact mismatch');return row.id;
 });
 return {bundleId:id,artifactHash,collectedCases:observations.length,collectorProvenanceVerified:false,productionAgentEquivalent:false,automaticActivation:false};
}
