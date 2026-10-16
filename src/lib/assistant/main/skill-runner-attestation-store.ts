import type {PoolClient} from 'pg';
import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';
import {skillAcceptancePlanSchema} from './skill-acceptance-policy';
import {inspectSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {skillRunnerEnvelopeSchema,verifyConfiguredSkillRunnerAttestation} from './skill-runner-attestation';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
type Context={userId:string};
async function loadBinding(client:PoolClient,context:Context,bundleId:string,freezeId:string){
 const row=(await client.query<{source_kind:string;plan:unknown;observations:unknown;raw_receipts:unknown;artifact_hash:string}>(
  'select source_kind,plan,observations,raw_receipts,artifact_hash from agent_skill_acceptance_bundle where id=$1 and owner_id=$2',
  [bundleId,context.userId])).rows[0];
 if(!row||row.source_kind!=='production-runner-pending-verification')throw new Error('Runner declaration requires pending production evidence');
 const artifact={sourceKind:row.source_kind,plan:row.plan,observations:row.observations,rawReceipts:row.raw_receipts};
 const plan=skillAcceptancePlanSchema.parse(row.plan);
 const collector=z.object({collector:z.object({freezeId:z.uuid()}).passthrough()}).passthrough().parse(row.raw_receipts).collector;
 if(plan.pin.ownerId!==context.userId||collector.freezeId!==freezeId||digest(artifact)!==row.artifact_hash)
  throw new Error('Runner declaration artifact binding changed');
 if(await inspectSkillAcceptanceFreeze(client,context.userId,freezeId,plan)!=='active')
  throw new Error('Runner declaration freeze inactive');
 return {ownerId:context.userId,freezeId,planHash:digest(plan),artifactHash:row.artifact_hash,
  runtimeIdentityHash:digest(plan.identity),frozenAt:plan.frozenAt,expiresAt:plan.expiresAt,
  deploymentHash:sha.parse(process.env.SKILL_RUNNER_DEPLOYMENT_SHA256),
  collectorId:z.string().min(1).max(200).parse(process.env.SKILL_RUNNER_COLLECTOR_ID)};
}
/** Dedicated collector only. This appends a signed claim; sources, provider equivalence,
 * complete quality evidence and final activation checks remain separate requirements. */
export async function appendSkillRunnerAttestation(context:Context,input:unknown,transaction:SkillCollectorTransaction){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);
 const p=z.object({bundleId:z.uuid(),envelope:skillRunnerEnvelopeSchema}).strict().parse(input);
 return transaction(context.userId,async client=>{
  await assertSkillCollector(client);
  const expected=await loadBinding(client,context,p.bundleId,p.envelope.statement.freezeId);
  const verified=await verifyConfiguredSkillRunnerAttestation(p.envelope,expected);
  await client.query(`insert into agent_skill_runner_attestation(owner_id,bundle_id,freeze_id,artifact_hash,statement_hash,envelope)
   values($1,$2,$3,$4,$5,$6) on conflict(owner_id,bundle_id,statement_hash) do nothing`,
  [context.userId,p.bundleId,expected.freezeId,expected.artifactHash,verified.statementHash,JSON.stringify(p.envelope)]);
  const saved=(await client.query<{id:string;envelope:unknown}>(`select id,envelope from agent_skill_runner_attestation
   where owner_id=$1 and bundle_id=$2 and statement_hash=$3`,[context.userId,p.bundleId,verified.statementHash])).rows[0];
  if(!saved||digest(saved.envelope)!==digest(p.envelope))throw new Error('Runner declaration stored statement changed');
  const after=await loadBinding(client,context,p.bundleId,expected.freezeId);
  const rechecked=await verifyConfiguredSkillRunnerAttestation(saved.envelope,after);
  if(digest(after)!==digest(expected)||rechecked.registryHash!==verified.registryHash)throw new Error('Runner declaration trust changed during append');
  return {id:saved.id,statementHash:verified.statementHash,signedDeclarationVerified:true,automaticActivation:false};
 });
}
/** Caller-owned statement, rebuilt against current server configuration. No HTTP caller can
 * supply an expected deployment or trust registry. A disabled key invalidates old rows too. */
export async function readSkillRunnerAttestation(context:Context,id:string){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);z.uuid().parse(id);
 return tenantTransaction(context.userId,async client=>{
  const row=(await client.query<{bundle_id:string;freeze_id:string;artifact_hash:string;statement_hash:string;envelope:unknown}>(
   'select bundle_id,freeze_id,artifact_hash,statement_hash,envelope from agent_skill_runner_attestation where id=$1 and owner_id=$2',
   [id,context.userId])).rows[0];
  if(!row)throw new Error('Runner declaration unavailable');
  const expected=await loadBinding(client,context,row.bundle_id,row.freeze_id);
  const verified=await verifyConfiguredSkillRunnerAttestation(row.envelope,expected);
  if(row.artifact_hash!==expected.artifactHash||row.statement_hash!==verified.statementHash)throw new Error('Runner declaration stored binding changed');
  return {id,bundleId:row.bundle_id,freezeId:row.freeze_id,signedDeclarationVerified:true,
   statementHash:verified.statementHash,registryHash:verified.registryHash,automaticActivation:false};
 });
}
