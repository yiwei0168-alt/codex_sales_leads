import type {PoolClient} from 'pg';
import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {inspectSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {digest} from './contracts';
import {skillSourcesCurrent,type SourcedSkillVersion} from './skill-source-guard';
import {skillAcceptancePlanSchema,skillAcceptanceObservationSchema,skillAcceptanceJudgmentSchema} from './skill-acceptance-policy';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
const bundleSchema=z.object({sourceKind:z.enum(['synthetic-fixture','production-runner-pending-verification']),
 plan:skillAcceptancePlanSchema,observations:z.array(skillAcceptanceObservationSchema).max(1000),rawReceipts:z.record(z.string(),z.unknown())}).strict();
export const appendSkillAcceptanceJudgmentSchema=z.object({bundleId:z.uuid(),artifactHash:sha,expectedRevision:z.number().int().min(0),
 judgment:skillAcceptanceJudgmentSchema.omit({reviewerId:true,kind:true,revision:true})}).strict();
type Context={userId:string};

/** Internal-only projection. Hash validation detects corruption; it does not authenticate a collector. */
async function loadBundle(client:PoolClient,userId:string,id:string){
 const row=(await client.query<{owner_id:string;skill_id:string;version:number;source_kind:string;plan:unknown;observations:unknown;raw_receipts:unknown;artifact_hash:string}>(
  'select owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash from agent_skill_acceptance_bundle where id=$1 and owner_id=$2',[id,userId])).rows[0];
 if(!row)throw new Error('Acceptance evidence unavailable');
 const artifact=bundleSchema.parse({sourceKind:row.source_kind,plan:row.plan,observations:row.observations,rawReceipts:row.raw_receipts});
 if(digest(artifact)!==row.artifact_hash||artifact.plan.pin.ownerId!==userId||artifact.plan.pin.skillId!==row.skill_id||artifact.plan.pin.version!==row.version)
  throw new Error('Acceptance artifact changed');
 const planned=new Map(artifact.plan.cases.map(item=>[item.id,item]));
 const seen=new Set<string>();
 for(const observation of artifact.observations){
  const item=planned.get(observation.caseId);
  if(!item||seen.has(observation.caseId)||observation.planHash!==digest(artifact.plan)||digest(observation.pin)!==digest(artifact.plan.pin)
   ||observation.inputHash!==item.inputHash||observation.sourceHash!==item.sourceHash||observation.provenance!==item.provenance)
   throw new Error('Acceptance observation binding changed');
  seen.add(observation.caseId);
 }
 return {id,artifactHash:row.artifact_hash,artifact};
}

async function assertCurrentSkill(client:PoolClient,userId:string,plan:z.infer<typeof skillAcceptancePlanSchema>){
 const skill=(await client.query<SourcedSkillVersion&{current_version:number;dependencies:unknown}>(
  `select s.current_version,s.scope,s.owner_id,v.source,v.validation,v.files,v.content_hash,v.dependencies
   from agent_skill s join agent_skill_version v on v.skill_id=s.id and v.version=$3
   join app_user u on u.id=s.owner_id and u.status='active'
   where s.id=$1 and s.owner_id=$2 for share of s`,[plan.pin.skillId,userId,plan.pin.version])).rows[0];
 if(!skill||skill.scope!=='account'||skill.current_version!==plan.pin.version||skill.content_hash!==plan.pin.contentHash
  ||digest(skill.files)!==plan.pin.contentHash||digest({source:skill.source,validation:skill.validation,dependencies:skill.dependencies})!==plan.pin.sourceHash
  ||!await skillSourcesCurrent(client,userId,skill))throw new Error('Acceptance Skill sources changed');
}
async function latestJudgments(client:PoolClient,userId:string,id:string){
 const rows=await client.query<{judgment:unknown}>(`select distinct on(case_id) judgment from agent_skill_acceptance_judgment
  where bundle_id=$1 and owner_id=$2 order by case_id,revision desc`,[id,userId]);
 return rows.rows.map(row=>skillAcceptanceJudgmentSchema.parse(row.judgment));
}
async function bundleFreezeStatus(client:PoolClient,userId:string,bundle:Awaited<ReturnType<typeof loadBundle>>){
 const collector=bundle.artifact.rawReceipts.collector;
 if(collector===undefined)return {state:'not-recorded' as const,freezeId:null};
 const metadata=z.object({freezeId:z.uuid().optional(),freezeVerified:z.boolean().optional()}).passthrough().parse(collector);
 if(!metadata.freezeId){
  if(metadata.freezeVerified)throw new Error('Acceptance freeze reference missing');
  return {state:'not-recorded' as const,freezeId:null};
 }
 return {state:await inspectSkillAcceptanceFreeze(client,userId,metadata.freezeId,bundle.artifact.plan),freezeId:metadata.freezeId};
}
export async function readSkillAcceptanceEvidence(context:Context,id:string){
 z.uuid().parse(id);z.uuid().parse(context.userId);
 return tenantTransaction(context.userId,async client=>{
  const bundle=await loadBundle(client,context.userId,id);
  const judgments=await latestJudgments(client,context.userId,id);
  for(const judgment of judgments){
   const observation=bundle.artifact.observations.find(row=>row.caseId===judgment.caseId);
   if(!observation||judgment.observationHash!==digest(observation))throw new Error('Acceptance judgment binding changed');
  }
  // Historical evidence remains reviewable after version/source expiry, with an explicit warning.
  let sourcesCurrent=true;try{await assertCurrentSkill(client,context.userId,bundle.artifact.plan);}catch{sourcesCurrent=false;}
  const freezeStatus=await bundleFreezeStatus(client,context.userId,bundle);
  return {...bundle,judgments,sourcesCurrent,freezeStatus,automaticActivation:false,collectorProvenanceVerified:false};
 });
}

/**
 * Called only from an authenticated human review boundary or an explicitly tagged
 * development reviewer. Neither actor kind nor reviewer ID is accepted in input.
 * This internal function is not yet exposed as an HTTP route or Agent tool.
 */
export async function appendSkillAcceptanceJudgment(context:Context&{reviewerKind:'human'|'assistant-development'},input:unknown){
 const p=appendSkillAcceptanceJudgmentSchema.parse(input);z.uuid().parse(context.userId);
 const kind=z.enum(['human','assistant-development']).parse(context.reviewerKind);
 return tenantTransaction(context.userId,async client=>{
  // Future activation must take this same lock before reading latest judgments.
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`skill-acceptance:${p.bundleId}`]);
  const bundle=await loadBundle(client,context.userId,p.bundleId);
  if(bundle.artifactHash!==p.artifactHash)throw new Error('Stale acceptance artifact');
  const observation=bundle.artifact.observations.find(row=>row.caseId===p.judgment.caseId);
  if(!observation||digest(observation)!==p.judgment.observationHash)throw new Error('Stale acceptance observation');
  const latest=(await latestJudgments(client,context.userId,p.bundleId)).find(row=>row.caseId===p.judgment.caseId);
  if((latest?.revision??0)!==p.expectedRevision)throw new Error('Acceptance review revision changed');
  // Revocation remains available when a source/Skill has since changed.
  if(!p.judgment.revoked){
   await assertCurrentSkill(client,context.userId,bundle.artifact.plan);
   const freeze=await bundleFreezeStatus(client,context.userId,bundle);
   if(freeze.state!=='active'&&freeze.state!=='not-recorded')throw new Error('Acceptance freeze no longer active');
  }
  const judgment=skillAcceptanceJudgmentSchema.parse({...p.judgment,reviewerId:context.userId,kind,revision:p.expectedRevision+1});
  await client.query(`insert into agent_skill_acceptance_judgment(bundle_id,owner_id,case_id,revision,reviewer_id,reviewer_kind,observation_hash,judgment)
   values($1,$2,$3,$4,$2,$5,$6,$7)`,[p.bundleId,context.userId,judgment.caseId,judgment.revision,kind,judgment.observationHash,JSON.stringify(judgment)]);
  return {revision:judgment.revision,automaticActivation:false};
 });
}
