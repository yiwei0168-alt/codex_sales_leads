import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {loadRecordedTaskChain} from './recorded-task-source';
import {skillSourcesCurrent,type SourcedSkillVersion} from './skill-source-guard';
import {instructionOnlySkill} from './skills';
import {runSkillCandidateArm} from './skill-candidate-runner';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import type {RecordedEvidenceReceipt} from './recorded-evidence-receipts';
import {createDurableSkillCandidateModel,type SkillCandidateCollector} from './skill-candidate-model';
import {requireSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {prepareSkillExecutionIdentity} from './skill-runtime-identity';

type Snapshot=Parameters<typeof runSkillCandidateArm>[0];
const selection=z.object({runId:z.uuid(),skillId:z.uuid(),version:z.number().int().positive()}).strict();
type Selection=z.infer<typeof selection>;

/** Internal local collector only. No supplied messages, packages or receipt bodies are trusted. */
async function load(context:{userId:string},input:Selection){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);const p=selection.parse(input);
 const chain=await loadRecordedTaskChain(context,{runId:p.runId});
 const references=new Map<string,string>();
 for(const request of chain.requests)for(const row of request.receiptBinding.receipts){
  if(references.has(row.id)&&references.get(row.id)!==row.hash)throw new Error('Candidate receipt binding changed');
  references.set(row.id,row.hash);
 }
 const saved=await tenantTransaction(context.userId,async client=>{
  const skills=(await client.query<Snapshot['skills'][number]>(
   'select id,name,scope,current_version,enabled,published,owner_id=$1 as owned from agent_skill order by name,id',[context.userId])).rows;
  const listing=skills.find(row=>row.id===p.skillId);
  const value=(await client.query<Snapshot['candidate']['value']&SourcedSkillVersion>(
   `select v.*,s.owner_id,s.scope from agent_skill s join agent_skill_version v on v.skill_id=s.id
    join app_user u on u.id=s.owner_id and u.status='active'
    where s.id=$1 and s.owner_id=$2 and v.version=$3 for share of s`,[p.skillId,context.userId,p.version])).rows[0];
  if(!listing||!value||!listing.owned||listing.enabled||listing.scope!=='account'||listing.current_version!==p.version
   ||value.content_hash!==digest(value.files)||!instructionOnlySkill(value.files)||!Array.isArray(value.dependencies)||value.dependencies.length
   ||!await skillSourcesCurrent(client,context.userId,value))throw new Error('Candidate Skill source unavailable');
  const rows=references.size?(await client.query<RecordedEvidenceReceipt>(
   `select id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output,approval_id
    from agent_tool_call where user_id=$1 and run_id=$2 and id=any($3::uuid[]) order by id`,[context.userId,p.runId,[...references.keys()]])).rows:[];
  if(rows.length!==references.size||rows.some(row=>digest(row)!==references.get(row.id)))throw new Error('Candidate receipt source changed');
  const receipts=rows.map(row=>{
   const receipt={tool:row.tool_id,arguments:z.record(z.string(),z.unknown()).parse(row.input),output:row.output};
   return {...receipt,hash:digest(receipt)};
  });
  return {skills,candidate:{listing,value},receipts};
 });
 const first=chain.requests[0];if(!first)throw new Error('Candidate original request unavailable');
 const snapshot:Snapshot={...saved,context:{userId:context.userId,role:first.accountRole,mode:first.profile.mode,knowledgeScope:first.knowledgeScope},
  initialMessages:first.body.messages,profile:first.profile};
 return {snapshot,skillSourceHash:digest({source:saved.candidate.value.source,validation:saved.candidate.value.validation,dependencies:saved.candidate.value.dependencies}),sourceHash:digest({chain,saved}),taskInputHash:chain.taskInputHash,modelConfigHash:chain.modelConfigHash};
}

/** Snapshot remains private to this invocation. Every graph boundary reloads authoritative sources. */
export async function runRecordedSkillCandidateArm(context:{userId:string},input:Selection,
 arm:'baseline'|'candidate',model:Parameters<typeof runSkillCandidateArm>[2],maximumModelCalls=8){
 const saved=await load(context,input);
 const validate=async()=>{if((await load(context,input)).sourceHash!==saved.sourceHash)throw new Error('Candidate sources changed during execution');};
 await validate();
 const output=await runSkillCandidateArm(saved.snapshot,arm,model,validate,maximumModelCalls);
 return {...output,serverSnapshotHash:saved.sourceHash,taskInputHash:saved.taskInputHash,modelConfigHash:saved.modelConfigHash,serverSnapshotRevalidated:true,
  productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false};
}

/** No network/model implementation is selected implicitly; caller supplies an authorized collector. */
export async function runDurableRecordedSkillCandidateArm(context:{userId:string},input:Selection,
 arm:'baseline'|'candidate',collector:SkillCandidateCollector,maximumModelCalls=8){
 const saved=await load(context,input);
 const validate=async()=>{
  if((await load(context,input)).sourceHash!==saved.sourceHash)throw new Error('Candidate sources changed during execution');
  if(collector.frozen){
   const {freezeId,plan}=collector.frozen;
   await requireSkillAcceptanceFreeze(context,freezeId,plan);
   if(plan.pin.sourceHash!==saved.skillSourceHash||plan.pin.ownerId!==context.userId||plan.pin.skillId!==input.skillId||plan.pin.version!==input.version||plan.pin.contentHash!==saved.snapshot.candidate.value.content_hash
    ||digest(plan.identity)!==digest(await prepareSkillExecutionIdentity(context,{runId:input.runId})))throw new Error('Frozen execution identity changed');
  }
 };
 const durable=createDurableSkillCandidateModel({ownerId:context.userId,snapshotHash:saved.sourceHash,arm},collector,validate);
 await validate();
 const output=await runSkillCandidateArm(saved.snapshot,arm,durable.model,validate,maximumModelCalls);
 return {...output,evaluationId:collector.evaluationId,sourceKind:collector.sourceKind,serverSnapshotHash:saved.sourceHash,taskInputHash:saved.taskInputHash,modelConfigHash:saved.modelConfigHash,
  modelAttemptReceipts:durable.receipts,serverSnapshotRevalidated:true,
  productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false};
}
