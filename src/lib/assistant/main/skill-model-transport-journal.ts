import {z} from 'zod';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {readSkillCandidateJournal,prepareSkillModelJournalAudit} from './skill-candidate-audit';
import {requireSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';
import {skillTransportEnvelopeSchema,verifyConfiguredSkillTransportReceipt} from './skill-model-transport-receipt';
import {skillTransportFailureEnvelopeSchema,verifyConfiguredSkillTransportFailure} from './skill-model-transport-failure-receipt';
import type {SkillCandidateCollector} from './skill-candidate-model';

/** Verify all persisted attempts, including each signed predecessor in a fallback
 * chain. No caller-supplied rows. Deployed binary verification remains separate. */
export async function verifySkillCandidateJournalTransports(context:{userId:string},input:{evaluationId:string;arm:'baseline'|'candidate'},frozen:NonNullable<SkillCandidateCollector['frozen']>){
 assertLocalAnalysisBoundary();z.uuid().parse(input.evaluationId);z.enum(['baseline','candidate']).parse(input.arm);
 await requireSkillAcceptanceFreeze(context,frozen.freezeId,frozen.plan);
 const rows=await readSkillCandidateJournal(context,input),audit=prepareSkillModelJournalAudit({...context,...input},rows);
 if(audit.sourceKind!=='production-runner-pending-verification'||audit.freezeId!==frozen.freezeId)throw new Error('Pending-production transports required');
 const receiptHashes:string[]=[],generations=new Set<string>();let registryHash:string|undefined;
 for(const row of audit.ordered){
  const outcome=z.object({status:z.string()}).passthrough().parse(row.output);if(outcome.status==='success')continue;
  const data=z.object({data:z.object({retryable:z.literal(true),reason:z.string(),transportFailureReceipt:skillTransportFailureEnvelopeSchema})}).parse(row.output).data;
  const s=data.transportFailureReceipt.statement;
  if(!(Date.parse(row.started_at??'')<=Date.parse(s.capturedAt)&&Date.parse(s.completedAt)<=Date.parse(row.completed_at??'')))throw new Error('Transport failure outside journal attempt');
  const checked=await verifyConfiguredSkillTransportFailure(data.transportFailureReceipt,{binding:{ownerId:context.userId,freezeId:frozen.freezeId,
   evaluationId:input.evaluationId,arm:input.arm,planHash:digest(frozen.plan),snapshotHash:audit.snapshotHash,step:row.step,routeIndex:row.route_index,
   collectorId:z.string().min(1).parse(process.env.SKILL_RUNNER_COLLECTOR_ID),deploymentHash:z.string().regex(/^[a-f0-9]{64}$/).parse(process.env.SKILL_RUNNER_DEPLOYMENT_SHA256)},
   request:row.input,reason:data.reason,frozenAt:frozen.plan.frozenAt,expiresAt:frozen.plan.expiresAt,toolSchemaHash:frozen.plan.identity.toolSchemaHash});
  if(registryHash&&checked.registryHash!==registryHash)throw new Error('Transport trust changed during audit');registryHash=checked.registryHash;
  receiptHashes.push(checked.statementHash);
 }
 for(const selected of audit.selected){
  const row=selected.row,value=z.object({data:z.object({value:z.object({message:z.unknown(),requestManifest:z.unknown(),transportReceipt:z.unknown()}).passthrough()})}).parse(row.output).data.value;
  const generation=selected.request.originalResponse.generationId;
  const receipt=skillTransportEnvelopeSchema.parse(value.transportReceipt);
  if(!(Date.parse(row.started_at??'')<=Date.parse(receipt.statement.capturedAt)
   &&Date.parse(receipt.statement.completedAt)<=Date.parse(row.completed_at??'')))throw new Error('Transport receipt outside journal attempt');
  if(!generation||generations.has(generation))throw new Error('Transport generation missing or reused');generations.add(generation);
  const checked=await verifyConfiguredSkillTransportReceipt(value.transportReceipt,{binding:{ownerId:context.userId,freezeId:frozen.freezeId,
   evaluationId:input.evaluationId,arm:input.arm,planHash:digest(frozen.plan),snapshotHash:audit.snapshotHash,step:row.step,routeIndex:row.route_index,
   collectorId:z.string().min(1).parse(process.env.SKILL_RUNNER_COLLECTOR_ID),deploymentHash:z.string().regex(/^[a-f0-9]{64}$/).parse(process.env.SKILL_RUNNER_DEPLOYMENT_SHA256)},
   manifest:value.requestManifest,message:value.message,frozenAt:frozen.plan.frozenAt,expiresAt:frozen.plan.expiresAt});
  if(registryHash&&checked.registryHash!==registryHash)throw new Error('Transport trust changed during audit');registryHash=checked.registryHash;
  receiptHashes.push(checked.statementHash);
 }
 await requireSkillAcceptanceFreeze(context,frozen.freezeId,frozen.plan);
 if(digest(await readSkillCandidateJournal(context,input))!==digest(rows)||digest(await loadConfiguredSkillRunnerTrustRegistry())!==registryHash)
  throw new Error('Transport journal or trust changed during audit');
 return {journalHash:audit.journalHash,transportReceiptHashes:receiptHashes,registryHash,
  signedSuccessfulTransportsVerified:true as const,signedFallbackAttemptsVerified:true as const,binaryVerified:false as const,automaticActivation:false as const};
}
