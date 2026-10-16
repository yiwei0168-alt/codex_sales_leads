import type {PoolClient} from 'pg';
import {z} from 'zod';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {readLockedSkillAcceptanceEvidence} from './skill-acceptance-store';
import {prepareSkillExecutionIdentity} from './skill-runtime-identity';
import {evaluateSkillAcceptancePolicy} from './skill-acceptance-policy';

/** Internal policy projection while retaining the caller's evidence locks. Source
 * identity preparation reuses the caller transaction; full source locking and
 * production provenance remain separate. Never use policyPassed as authorization. */
export async function evaluateLockedSkillAcceptancePolicy(client:PoolClient,context:{userId:string},bundleId:string){
 assertLocalAnalysisBoundary();
 return withBoundTenantTransaction(client,context.userId,async()=>{
 const before=await readLockedSkillAcceptanceEvidence(client,context,bundleId),{plan,rawReceipts}=before.artifact;
 const runs=new Set<string>();
 const reference=(name:string,caseId:string)=>{
  const refs=z.record(z.string(),z.unknown()).parse(rawReceipts[name]);
  return z.object({runId:z.uuid()}).passthrough().parse(refs[caseId]).runId;
 };
 for(const item of plan.cases){
  if(item.provenance==='historical-task'){
   const runId=reference('baselineSources',item.id);
   if(reference('candidateSources',item.id)!==runId)throw new Error('Locked historical arm sources differ');runs.add(runId);
  }else runs.add(reference(item.provenance==='prospective-task'?'prospectiveSources':'safetySources',item.id));
 }
 let identity:Awaited<ReturnType<typeof prepareSkillExecutionIdentity>>|undefined;
 for(const runId of [...runs].sort()){
  const current=await prepareSkillExecutionIdentity(context,{runId});
  if(identity&&digest(identity)!==digest(current))throw new Error('Current acceptance source identities differ');identity=current;
 }
 if(!identity)throw new Error('Current acceptance identity unavailable');
 const after=await readLockedSkillAcceptanceEvidence(client,context,bundleId);
 if(before.artifactHash!==after.artifactHash||before.latestReviewHash!==after.latestReviewHash||digest(before.currentPin)!==digest(after.currentPin))
  throw new Error('Locked acceptance evidence changed during policy preparation');
 const time=(await client.query<{checked_at:Date}>('select clock_timestamp() as checked_at')).rows[0]?.checked_at;
 if(!(time instanceof Date)||!Number.isFinite(time.getTime()))throw new Error('Acceptance database clock unavailable');
 const policy=evaluateSkillAcceptancePolicy({plan,observations:before.artifact.observations,judgments:after.judgments,
  currentPin:after.currentPin,currentIdentity:identity,now:time.toISOString()});
 return {...policy,artifactHash:after.artifactHash,latestReviewHash:after.latestReviewHash,currentRuntimeIdentityHash:digest(identity),
  lockedEvidencePolicyEvaluated:true as const,sourcePayloadsRevalidated:false as const,collectorProvenanceVerified:false as const,automaticActivation:false as const};
 });
}
