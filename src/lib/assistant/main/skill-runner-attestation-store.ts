import type {PoolClient} from 'pg';
import {z} from 'zod';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {tenantTransaction,withBoundTenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';
import {skillAcceptancePlanSchema} from './skill-acceptance-policy';
import {inspectSkillAcceptanceFreeze,lockSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {skillRunnerEnvelopeSchema,verifyConfiguredSkillRunnerAttestation,verifySkillRunnerAttestation,loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';
import {readLockedSkillAcceptanceEvidence} from './skill-acceptance-store';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {skillRunnerEvidenceWindow} from './skill-runner-evidence-window';

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
  ...skillRunnerEvidenceWindow(plan,row.observations),
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
  await lockSkillAcceptanceFreeze(client,context.userId,p.envelope.statement.freezeId);
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
/** Configured collector signing only. Bindings come from owned server records,
 * never a submitted statement. This signs a declaration, not production proof. */
export async function appendConfiguredSkillRunnerAttestation(context:Context,input:unknown,transaction:SkillCollectorTransaction){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);
 const p=z.object({bundleId:z.uuid()}).strict().parse(input);
 if(process.env.NODE_ENV!=='production'||process.execArgv.length||process.env.NODE_OPTIONS?.trim()||process.env.NODE_PATH?.trim())
  throw new Error('Controlled runner declaration process required');
 return transaction(context.userId,async client=>{
  await assertSkillCollector(client); // Reject an app role before reading a private key.
  const row=(await client.query<{raw_receipts:unknown}>(
   'select raw_receipts from agent_skill_acceptance_bundle where id=$1 and owner_id=$2',[p.bundleId,context.userId])).rows[0];
  if(!row)throw new Error('Runner declaration bundle unavailable');
  const freezeId=z.object({collector:z.object({freezeId:z.uuid()})}).parse(row.raw_receipts).collector.freezeId;
  await lockSkillAcceptanceFreeze(client,context.userId,freezeId);
  const expected=await loadBinding(client,context,p.bundleId,freezeId),registry=await loadConfiguredSkillRunnerTrustRegistry();
  const keyId=z.string().min(1).max(100).parse(process.env.SKILL_RUNNER_DECLARATION_KEY_ID),key=registry.keys.find(item=>item.keyId===keyId);
  if(!key?.enabled||!key.purposes.includes('runner-declaration')||key.collectorId!==expected.collectorId||key.deploymentHash!==expected.deploymentHash)
   throw new Error('Runner declaration signing enrollment unavailable');
  const path=process.env.SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE;if(!path)throw new Error('Runner declaration signing key not configured');
  const bytes=await readFile(/*turbopackIgnore: true*/ path);if(bytes.length>16384)throw new Error('Runner declaration signing key too large');
  const privateKey=createPrivateKey(bytes);
  if(privateKey.asymmetricKeyType!=='ed25519'||!createPublicKey(privateKey).export({type:'spki',format:'der'}).equals(createPublicKey(key.publicKeyPem).export({type:'spki',format:'der'})))
   throw new Error('Runner declaration signing key enrollment changed');
  const now=(await client.query<{checked_at:Date}>('select clock_timestamp() checked_at')).rows[0]?.checked_at;
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('Runner declaration signing clock unavailable');
  const previous=(await client.query<{envelope:unknown;artifact_hash:string;statement_hash:string}>(`select envelope,artifact_hash,statement_hash from agent_skill_runner_attestation
   where owner_id=$1 and bundle_id=$2 and freeze_id=$3 order by created_at desc,id desc limit 1`,[context.userId,p.bundleId,freezeId])).rows[0];
  const latest=previous?skillRunnerEnvelopeSchema.parse(previous.envelope):undefined;
  const reused=!!latest&&latest.statement.keyId===keyId&&Date.parse(latest.statement.expiresAt)>now.getTime();
  const statement={protocol:'skill-runner-attestation-v1' as const,keyId,collectorId:expected.collectorId,deploymentHash:expected.deploymentHash,
   ownerId:context.userId,freezeId,planHash:expected.planHash,artifactHash:expected.artifactHash,runtimeIdentityHash:expected.runtimeIdentityHash,
   capturedAt:expected.capturedAt,completedAt:expected.completedAt,issuedAt:now.toISOString(),
   expiresAt:new Date(Math.min(Date.parse(expected.expiresAt),Date.parse(key.expiresAt))).toISOString()};
  const envelope=reused?latest!:{statement,signature:sign(null,Buffer.from(digest(statement),'hex'),privateKey).toString('base64url')};
  const verified=verifySkillRunnerAttestation(envelope,registry,expected,now);
  if(reused&&(previous!.artifact_hash!==expected.artifactHash||previous!.statement_hash!==verified.statementHash))
   throw new Error('Runner declaration stored signing binding changed');
  // Reuse the same collector client and freeze lock; opening another transaction
  // here would wait on our own lock. Existing append rechecks records and trust.
  const result=await appendSkillRunnerAttestation(context,{bundleId:p.bundleId,envelope},async(owner,work)=>{
   if(owner!==context.userId)throw new Error('Runner declaration signing owner changed');return work(client);
  });
  return {...result,reused,productionQualified:false as const,automaticActivation:false as const};
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
/** Final-preparation component only. Source/bundle/freeze locks are acquired in
 * the standard order. The freeze lock also serializes declaration appends.
 * A signed declaration does not qualify a binary/provider or grant activation. */
export async function readLockedSkillRunnerAttestation(client:PoolClient,context:Context,bundleId:string){
 assertLocalAnalysisBoundary();
 return withBoundTenantTransaction(client,context.userId,async()=>{
  const evidence=await readLockedSkillAcceptanceEvidence(client,context,bundleId);
  if(evidence.artifact.sourceKind==='synthetic-fixture')return {
   runnerDeclarationRequired:false as const,runnerDeclarationRevalidated:false as const,
   collectorProvenanceVerified:false as const,automaticActivation:false as const};
  const freezeId=evidence.freezeStatus.freezeId;
  if(!freezeId)throw new Error('Locked runner declaration freeze unavailable');
  const row=(await client.query<{id:string;artifact_hash:string;statement_hash:string;envelope:unknown}>(`
   select id,artifact_hash,statement_hash,envelope from agent_skill_runner_attestation
   where owner_id=$1 and bundle_id=$2 and freeze_id=$3 order by created_at desc,id desc limit 1`,[context.userId,bundleId,freezeId])).rows[0];
  if(!row)throw new Error('Locked runner declaration unavailable');
  const expected=await loadBinding(client,context,bundleId,freezeId);
  const registry=await loadConfiguredSkillRunnerTrustRegistry();
  const now=(await client.query<{checked_at:Date}>('select clock_timestamp() checked_at')).rows[0]?.checked_at;
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('Locked runner declaration clock unavailable');
  const verified=verifySkillRunnerAttestation(row.envelope,registry,expected,now);
  if(row.artifact_hash!==evidence.artifactHash||row.artifact_hash!==expected.artifactHash||row.statement_hash!==verified.statementHash)
   throw new Error('Locked runner declaration stored binding changed');
  const envelope=skillRunnerEnvelopeSchema.parse(row.envelope);
  return {runnerDeclarationRequired:true as const,runnerDeclarationRevalidated:true as const,
   runnerDeclarationId:row.id,runnerStatementHash:verified.statementHash,runnerRegistryHash:verified.registryHash,
   runnerDeclarationCheckedAt:now.toISOString(),runnerDeclarationValidBefore:envelope.statement.expiresAt,
   collectorProvenanceVerified:false as const,automaticActivation:false as const};
 });
}
