import {z} from 'zod';
import {digest} from './contracts';
import {readSkillAcceptanceEvidence} from './skill-acceptance-store';
import {readSkillAcceptanceReviewCase} from './skill-acceptance-review';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';
import {inspectSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {skillRunnerEvidenceWindow} from './skill-runner-evidence-window';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

const inputSchema=z.object({bundleIds:z.array(z.uuid()).min(1).max(1000).refine(ids=>new Set(ids).size===ids.length)}).strict();
const sourceNames=['baselineSources','candidateSources','safetySources','prospectiveSources'] as const;
/** Compose server-owned collected groups before reviewing the new artifact. No judgments,
 * signatures or production-authenticity flags are inherited from the component bundles. */
export async function composeSkillAcceptanceEvidence(context:{userId:string},input:unknown,transaction:SkillCollectorTransaction){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);const p=inputSchema.parse(input);
 const bundles:Array<Awaited<ReturnType<typeof readSkillAcceptanceEvidence>>>=[];
 for(const id of [...p.bundleIds].sort())bundles.push(await readSkillAcceptanceEvidence(context,id));
 const first=bundles[0],plan=first.artifact.plan,planHash=digest(plan),freezeId=first.freezeStatus.freezeId;
 if(!freezeId||plan.pin.ownerId!==context.userId||new Set(plan.cases.map(row=>row.id)).size!==plan.cases.length
  ||new Set(plan.cases.map(row=>row.category)).size!==5)throw new Error('Composition requires a complete registered plan');
 const observations=new Map<string,typeof first.artifact.observations[number]>();
 const sources=Object.fromEntries(sourceNames.map(name=>[name,new Map<string,unknown>()])) as Record<typeof sourceNames[number],Map<string,unknown>>;
 for(const bundle of bundles){
  if(bundle.artifact.sourceKind!==first.artifact.sourceKind||digest(bundle.artifact.plan)!==planHash
   ||!bundle.sourcesCurrent||bundle.freezeStatus.state!=='active'||bundle.freezeStatus.freezeId!==freezeId)
   throw new Error('Composition source, plan or freeze changed');
  skillRunnerEvidenceWindow(plan,bundle.artifact.observations);
  for(const observation of bundle.artifact.observations){
   if(observations.has(observation.caseId))throw new Error('Composition has duplicate case observations');
   const item=plan.cases.find(row=>row.id===observation.caseId)!;
   const names:ReadonlyArray<typeof sourceNames[number]>=item.provenance==='historical-task'?['baselineSources','candidateSources']:
    item.provenance==='prospective-task'?['prospectiveSources']:['safetySources'];
   for(const name of names){
    const refs=z.record(z.string(),z.unknown()).parse(bundle.artifact.rawReceipts[name]);
    if(!Object.hasOwn(refs,item.id))throw new Error('Composition source reference missing');
    sources[name].set(item.id,refs[item.id]);
   }
   observations.set(item.id,observation);
  }
 }
 if(observations.size!==plan.cases.length||plan.cases.some(row=>!observations.has(row.id)))throw new Error('Composition is missing planned cases');
 for(const bundle of bundles)for(const observation of bundle.artifact.observations){
  const material=await readSkillAcceptanceReviewCase(context,{bundleId:bundle.id,caseId:observation.caseId});
  if(material.artifactHash!==bundle.artifactHash||material.observationHash!==digest(observation)||material.sourceKind!==bundle.artifact.sourceKind)
   throw new Error('Composition material binding changed');
 }
 // Re-read account/source/freeze state after every material has been rebuilt.
 for(const before of bundles){
  const after=await readSkillAcceptanceEvidence(context,before.id);
  if(digest(after)!==digest(before))throw new Error('Composition sources changed during preparation');
 }
 const rawReceipts={...Object.fromEntries(sourceNames.map(name=>[name,Object.fromEntries(sources[name])])),
  sourceBundles:bundles.map(bundle=>({id:bundle.id,artifactHash:bundle.artifactHash})),
  collector:{protocol:'composed-collector-v1',freezeId,freezeVerified:true,sourceIdentityChecked:true,
   runtimeIdentityVerified:false,automaticActivation:false}};
 const artifact={sourceKind:first.artifact.sourceKind,plan,observations:plan.cases.map(row=>observations.get(row.id)!),rawReceipts};
 const artifactHash=digest(artifact);
 const bundleId=await transaction(context.userId,async client=>{
  await assertSkillCollector(client);
  if(await inspectSkillAcceptanceFreeze(client,context.userId,freezeId,plan)!=='active')throw new Error('Composition freeze inactive');
  for(const bundle of bundles){
   const saved=(await client.query<{source_kind:string;plan:unknown;observations:unknown;raw_receipts:unknown;artifact_hash:string}>(
    'select source_kind,plan,observations,raw_receipts,artifact_hash from agent_skill_acceptance_bundle where id=$1 and owner_id=$2',[bundle.id,context.userId])).rows[0];
   if(!saved||saved.artifact_hash!==bundle.artifactHash||digest({sourceKind:saved.source_kind,plan:saved.plan,observations:saved.observations,rawReceipts:saved.raw_receipts})!==bundle.artifactHash)
    throw new Error('Composition stored source changed');
  }
  await client.query(`insert into agent_skill_acceptance_bundle(owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
   values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(owner_id,artifact_hash) do nothing`,
   [context.userId,plan.pin.skillId,plan.pin.version,artifact.sourceKind,JSON.stringify(plan),JSON.stringify(artifact.observations),JSON.stringify(rawReceipts),artifactHash]);
  const saved=(await client.query<{id:string;source_kind:string;plan:unknown;observations:unknown;raw_receipts:unknown}>(
   'select id,source_kind,plan,observations,raw_receipts from agent_skill_acceptance_bundle where owner_id=$1 and artifact_hash=$2',[context.userId,artifactHash])).rows[0];
  if(!saved||digest({sourceKind:saved.source_kind,plan:saved.plan,observations:saved.observations,rawReceipts:saved.raw_receipts})!==artifactHash)
   throw new Error('Composition stored artifact changed');
  return saved.id;
 });
 return {bundleId,artifactHash,collectedCases:observations.size,requiresNewHumanReview:true,
  collectorProvenanceVerified:false,productionAgentEquivalent:false,automaticActivation:false};
}
