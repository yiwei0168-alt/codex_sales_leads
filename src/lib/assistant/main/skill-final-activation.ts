import type {PoolClient} from 'pg';
import {z} from 'zod';
import {tenantTransaction,withBoundTenantTransaction} from '@/lib/rag/db';
import {digest,result,toolResultSchema,type ExecutionContext} from './contracts';
import {instructionOnlySkill} from './skills';
import {admitSkillCatalogWrite} from './skill-catalog-admission';
import {configuredSkillRunnerTrustRegistryMode} from './skill-runner-attestation';
import {LeaseLostError,InstructionsChangedError} from './repository';
import {skillActivationBindingSchema} from './skill-activation-binding';

const unavailable='Skill replay and shadow acceptance required before Agent activation: trusted production evidence gate unavailable';
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema=z.object({id:z.uuid(),version:z.number().int().positive(),operation:z.literal('enable')}).strict();
const actorSchema=z.object({userId:z.uuid(),role:z.enum(['admin','member']),runId:z.uuid(),leaseToken:z.uuid(),callId:z.uuid(),instructionIds:z.array(z.uuid())}).passthrough();
const dataSchema=z.object({updated:z.literal(true),acceptanceBundleId:z.uuid(),acceptanceArtifactHash:sha,activationProofHash:sha}).strict();
const proofSchema=z.object({policyPassed:z.literal(true),blockers:z.array(z.string()).max(0),
 artifactHash:sha,latestReviewHash:sha,materialsHash:sha,currentRuntimeIdentityHash:sha,
 trustRegistryLocked:z.literal(true),trustRegistryHash:sha,sourceRevocationsLocked:z.literal(true),collectorProvenanceVerified:z.literal(true),productionAgentEquivalent:z.literal(true),
 canonicalOriginalCoverageRequired:z.literal(true),canonicalOriginalCoverageRevalidated:z.literal(true),
 runnerDeclarationRequired:z.literal(true),runnerDeclarationRevalidated:z.literal(true),
 transportReceiptsRequired:z.literal(true),transportReceiptsRevalidated:z.literal(true),
 signingEnrollmentCoverageRequired:z.literal(true),signingEnrollmentCoverageRevalidated:z.literal(true),
 runtimePackagesRequired:z.literal(true),runtimePackagesRegistered:z.literal(true),runtimePackageRegistrationHash:sha,
 runtimePackageRevisions:skillActivationBindingSchema.shape.runtimePackageRevisions,
 runtimePackageBytesPairRevalidated:z.literal(true),runtimeModuleFormatPairRevalidated:z.literal(true),
 methodExperienceTimesRevalidated:z.literal(true),decisionMemorySnapshotRevalidated:z.literal(true),
 lockedEvidencePolicyEvaluated:z.literal(true),sourcePayloadsRevalidated:z.literal(true),knowledgeSourcesLocked:z.literal(true),
 decisionMemorySourcesLocked:z.literal(true),skillCatalogSourcesLocked:z.literal(true),pinnedMethodSourcesLocked:z.literal(true),
 taskOriginsLocked:z.literal(true),taskJournalsLocked:z.literal(true),prospectiveCaptureSourcesLocked:z.literal(true),
 timelineSourcesLocked:z.literal(true),mailReadSourcesLocked:z.literal(true),attachmentMetadataLocked:z.literal(true),
 memoryReceiptSourcesRevalidated:z.literal(true),privateReceiptSourcesRevalidated:z.literal(true),
 acceptanceTimeCheckedAt:z.iso.datetime(),acceptanceValidBefore:z.iso.datetime(),
}).passthrough();
type Action=z.infer<typeof inputSchema>;
type Actor=z.infer<typeof actorSchema>;
type Call={status:string;input:unknown;input_hash:string;output:unknown;instructions:Array<{id:string}>;live:boolean};
async function readCall(client:PoolClient,actor:Actor,input:Action,lock=false){
 // Source/bundle locks are already retained at the final check. Do not wait on
 // a concurrent controller/heartbeat while holding that complete lock set.
 const run=await client.query<{instructions:Array<{id:string}>;live:boolean}>(`select r.instructions,
  r.status='running' and r.control is null and r.execution_kind='main-agent' and r.lease_token=$3
   and r.lease_until>clock_timestamp() live from agent_run r join app_user u on u.id=r.user_id
  where r.user_id=$1 and r.id=$2 and u.status='active' and u.role=$4 ${lock?'for update of r nowait':''}`,
 [actor.userId,actor.runId,actor.leaseToken,actor.role]);
 const row=(await client.query<Omit<Call,'instructions'|'live'>>(`select status,input,input_hash,output from agent_tool_call
  where user_id=$1 and run_id=$2 and id=$3 and tool_id='skill_manage' and effect='reversible' ${lock?'for update nowait':''}`,
 [actor.userId,actor.runId,actor.callId])).rows[0];
 if(!run.rows[0]||!row||row.input_hash!==digest(input)||digest(row.input)!==digest(input))throw new Error(unavailable);
 return {...row,...run.rows[0]};
}
function requireLive(call:Call,actor:Actor){
 if(!call.live||call.status!=='started')throw new LeaseLostError();
 if(!Array.isArray(call.instructions)||call.instructions.some(item=>!actor.instructionIds.includes(item.id)))throw new InstructionsChangedError();
}

/** Only the Agent enable path. No caller can submit a bundle, verdict or proof.
 * The current readiness producer intentionally leaves production/source gates
 * false, so real activation remains unavailable until those gates are complete.
 * Positive transaction tests use mocked proof producers, never human approvals. */
export async function activateAgentSkill(context:Pick<ExecutionContext,'userId'|'role'>,input:Action){
 const action=inputSchema.parse(input);
 return tenantTransaction(context.userId,async client=>{
  // Reject script/global/dependency changes without taking Skill row locks ahead
  // of the bundle/review lock. Re-read eligibility under the final lock below.
  const select=()=>client.query<{scope:string;files:unknown;validation:{scripts?:string;dependencies?:string};dependencies:unknown}>(
   'select v.validation,s.scope,v.files,v.dependencies,v.source,v.content_hash,s.owner_id from agent_skill s join agent_skill_version v on v.skill_id=s.id where s.id=$1 and s.owner_id=$2 and v.version=$3',
   [action.id,context.userId,action.version]);
  const eligible=(row:Awaited<ReturnType<typeof select>>['rows'][number]|undefined)=>row?.scope==='account'&&row.validation?.scripts==='none'
   &&row.validation.dependencies==='none'&&instructionOnlySkill(row.files)&&Array.isArray(row.dependencies)&&row.dependencies.length===0;
  if(!eligible((await select()).rows[0]))throw new Error('Script, dependency or global Skill requires human approval');
  const parsed=actorSchema.safeParse(context);if(!parsed.success)throw new Error(unavailable);
  const actor=parsed.data;
  return withBoundTenantTransaction(client,context.userId,async()=>{
   const existing=await readCall(client,actor,action);
   if(existing.status==='completed'){
    const saved=toolResultSchema.parse(existing.output),data=dataSchema.parse(saved.data);
    if(saved.status!=='success'||saved.callId!==actor.callId)throw new Error(unavailable);
    return data; // Historical committed effect only; never enable again.
   }
   requireLive(existing,actor);
   if(configuredSkillRunnerTrustRegistryMode()!=='database')throw new Error(unavailable);
   const [{readLockedSkillRunnerTrustRegistry},{readLockedSkillAcceptanceEvidence},{evaluateLockedSkillAcceptanceReadiness},{withCurrentDecisionMemory}]=await Promise.all([
    import('./skill-runner-trust-registry-store'),import('./skill-acceptance-store'),import('./skill-locked-materials'),import('./memory-message-guard')]);
   const registry=await readLockedSkillRunnerTrustRegistry(client,context.userId);
   await admitSkillCatalogWrite(client,action.id);
   await client.query('select lock_skill_knowledge_sources()');
   const latest=async()=>(await client.query<{id:string;artifact_hash:string;source_kind:string}>(`select id,artifact_hash,source_kind from agent_skill_acceptance_bundle
    where owner_id=$1 and skill_id=$2 and version=$3 order by created_at desc,id desc limit 1`,[context.userId,action.id,action.version])).rows[0];
   const bundle=await latest();
   if(!bundle||bundle.source_kind!=='production-runner-pending-verification')throw new Error(unavailable);
   // Bundle/freeze -> Skill is the same order as authenticated review writes.
   const evidence=await readLockedSkillAcceptanceEvidence(client,context,bundle.id);
   const finalBundle=await latest();
   if(evidence.artifactHash!==bundle.artifact_hash||evidence.currentPin.skillId!==action.id||evidence.currentPin.version!==action.version
    ||evidence.currentPin.ownerId!==context.userId||finalBundle?.id!==bundle.id||finalBundle.artifact_hash!==bundle.artifact_hash
    ||!eligible((await select()).rows[0]))throw new Error(unavailable);
   return withCurrentDecisionMemory(context.userId,async()=>{
    const checked=proofSchema.safeParse(await evaluateLockedSkillAcceptanceReadiness(client,context,bundle.id));
    if(!checked.success)throw new Error(unavailable);
    const proof=checked.data;
    if(proof.artifactHash!==evidence.artifactHash||proof.latestReviewHash!==evidence.latestReviewHash
     ||proof.trustRegistryHash!==registry.registryHash||Date.parse(proof.acceptanceTimeCheckedAt)>=Date.parse(proof.acceptanceValidBefore))throw new Error(unavailable);
    const guard=(await client.query<{ready:boolean}>(`select exists(select 1 from pg_trigger where tgname='skill_activation_commit_guard'
     and tgrelid='public.agent_run_event'::regclass and tgfoid=to_regprocedure('public.check_skill_activation_commit()')
     and tgdeferrable and tginitdeferred and tgenabled in('O','A') and not tgisinternal) ready`)).rows[0]?.ready;
    if(guard!==true)throw new Error('Skill activation commit guard unavailable');
    const bindingGuard=(await client.query<{ready:boolean}>(`select exists(select 1 from pg_trigger where tgname='skill_activation_binding_commit_guard'
     and tgrelid='public.agent_run_event'::regclass and tgfoid=to_regprocedure('public.check_skill_activation_binding_commit()')
     and tgdeferrable and tginitdeferred and tgenabled in('O','A') and not tgisinternal) ready`)).rows[0]?.ready;
    if(bindingGuard!==true)throw new Error('Skill activation binding guard unavailable');
    await client.query('set constraints skill_activation_commit_guard,skill_activation_binding_commit_guard deferred');
    requireLive(await readCall(client,actor,action,true),actor);
    const activationProofHash=digest({protocol:'skill-final-activation-v1',bundleId:bundle.id,ownerId:context.userId,
     skillId:action.id,version:action.version,proof});
    const data=dataSchema.parse({updated:true,acceptanceBundleId:bundle.id,acceptanceArtifactHash:proof.artifactHash,activationProofHash});
    const binding=skillActivationBindingSchema.parse({protocol:'skill-activation-binding-v1',ownerId:context.userId,skillId:action.id,version:action.version,
     bundleId:bundle.id,artifactHash:proof.artifactHash,freezeId:evidence.freezeStatus.freezeId,reviewHash:proof.latestReviewHash,
     reviewVersions:evidence.judgments.map(judgment=>({caseId:judgment.caseId,revision:judgment.revision})),
     registryHash:registry.registryHash,runtimePackageRevisions:proof.runtimePackageRevisions,validBefore:proof.acceptanceValidBefore,
     activationProofHash,callId:actor.callId});
    const output=result(data,{cost:'known',callId:actor.callId});
    const saved=(await client.query<{n:number}>(`with changed as (
     update agent_skill set enabled=true,published=false,activation_binding=$10::jsonb,updated_at=clock_timestamp()
      where owner_id=$1 and id=$2 and current_version=$3 and scope='account' and clock_timestamp()<$4::timestamptz
       and exists(select 1 from agent_run r where r.user_id=$1 and r.id=$5 and r.lease_token=$9
        and r.status='running' and r.control is null and r.lease_until>clock_timestamp()) returning id
     ), completed as (
      update agent_tool_call set status='completed',output=$8,updated_at=clock_timestamp(),
       metrics=metrics||jsonb_build_object('inputItems',1,'validOutputItems',1,'apiCredits',0,'costUsd',0,'costState','known','usageBoundary','atomic-skill-activation')
      where user_id=$1 and run_id=$5 and id=$6 and status='started' and input_hash=$7 and exists(select 1 from changed) returning id
     ) select count(*)::integer n from completed`,
    [context.userId,action.id,action.version,proof.acceptanceValidBefore,actor.runId,actor.callId,digest(action),JSON.stringify(output),actor.leaseToken,JSON.stringify(binding)])).rows[0]?.n;
    if(saved!==1)throw new Error('Skill activation changed or expired before commit');
    await client.query("insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,'skill_activated',$3)",
     [context.userId,actor.runId,JSON.stringify({protocol:'skill-final-activation-v1',validBefore:proof.acceptanceValidBefore,actorRole:actor.role,
      callId:actor.callId,skillId:action.id,version:action.version,...data,latestReviewHash:proof.latestReviewHash})]);
    const time=(await client.query<{valid:boolean}>(`select clock_timestamp()<$1::timestamptz and exists(select 1 from agent_run
     where user_id=$2 and id=$3 and lease_token=$4 and status='running' and control is null and lease_until>clock_timestamp()) valid`,
    [proof.acceptanceValidBefore,context.userId,actor.runId,actor.leaseToken])).rows[0]?.valid;
    if(time!==true)throw new Error('Skill activation evidence expired before commit');
    return data;
   });
  });
 },context.role);
}
