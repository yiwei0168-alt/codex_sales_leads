import {z} from 'zod';
import {digest} from './contracts';
import {prepareRecordedSkillCandidateSnapshot} from './skill-candidate-source';
import {skillSafetySuite} from './skill-safety-suite';
import {initialTaskMessages} from './initial-task-messages';
import {decisionMemoryMessage} from './decision-memory-message';
import {availableTools} from './tools';
import {prepareSkillExecutionIdentity} from './skill-runtime-identity';
import {requireSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {createDurableSkillCandidateModel,type SkillCandidateCollector} from './skill-candidate-model';
import {runSkillCandidateArm} from './skill-candidate-runner';

const selection=z.object({runId:z.uuid(),skillId:z.uuid(),version:z.number().int().positive(),caseId:z.string().min(1).max(120)}).strict();
type Selection=z.infer<typeof selection>;
type Source=Awaited<ReturnType<typeof prepareRecordedSkillCandidateSnapshot>>;

/** Fixed development cases only. Oracles are never placed in the generated snapshot. */
export function buildSkillSafetyCandidate(source:Source,caseId:string){
 const item=skillSafetySuite().suite.cases.find(row=>row.id===caseId);
 if(!item||!['negative','injection','permissions'].includes(item.category)||item.provenance!=='synthetic')throw new Error('Registered safety case unavailable');
 const original=source.snapshot,profile=original.profile,context=original.context;
 const initial=initialTaskMessages(context,{content:item.question,attachments:[],knowledgeScope:context.knowledgeScope},
  {model:profile.routes[0].model,providers:[],version:profile.version,profile},[]);
 if(digest(initial[0])!==digest(original.initialMessages[0]))throw new Error('Safety production prompt changed');
 const tools=availableTools(context);
 const receipts=item.receipts.map(row=>{
  if(digest({tool:row.tool,arguments:row.arguments,result:row.result})!==row.sha256)throw new Error('Safety fixture changed');
  const tool=tools.find(tool=>tool.id===row.tool&&tool.effect==='read');if(!tool)throw new Error('Safety tool unavailable in mode');
  const receipt={tool:row.tool,arguments:tool.input.parse(row.arguments) as Record<string,unknown>,output:row.result};
  return {...receipt,hash:digest(receipt)};
 });
 // Original private history, decision memories and receipts do not enter synthetic tasks.
 const snapshot={...original,initialMessages:[initial[0],decisionMemoryMessage([]),...initial.slice(1)],receipts};
 const inputHash=digest({messages:snapshot.initialMessages,scope:context.knowledgeScope??null});
 const sourceHash=digest({protocol:'skill-production-protocol-safety-v1',originalSource:source.sourceHash,item,snapshot});
 return {snapshot,inputHash,sourceHash,caseId:item.id,category:item.category as 'negative'|'injection'|'permissions',provenance:'safety-fixture' as const,
  modelConfigHash:source.modelConfigHash,skillSourceHash:source.skillSourceHash};
}
export async function prepareSkillSafetyCandidate(context:{userId:string},input:Selection){
 const p=selection.parse(input);const source=await prepareRecordedSkillCandidateSnapshot(context,{runId:p.runId,skillId:p.skillId,version:p.version});
 return buildSkillSafetyCandidate(source,p.caseId);
}
/** Actual graph plus durable model adapter; callers still need separate paid-call authorization. */
export async function runDurableSkillSafetyArm(context:{userId:string},input:Selection,arm:'baseline'|'candidate',
 collector:SkillCandidateCollector,maximumModelCalls=8){
 const p=selection.parse(input);if(!collector.frozen)throw new Error('Safety execution requires a frozen plan');
 const saved=await prepareSkillSafetyCandidate(context,p),{freezeId,plan}=collector.frozen;
 const validate=async()=>{
  await requireSkillAcceptanceFreeze(context,freezeId,plan);
  const item=plan.cases.find(row=>row.id===p.caseId);
  if(!item||item.category!==saved.category||item.provenance!=='safety-fixture'||item.inputHash!==saved.inputHash||item.sourceHash!==saved.sourceHash
   ||plan.pin.ownerId!==context.userId||plan.pin.skillId!==p.skillId||plan.pin.version!==p.version||plan.pin.contentHash!==saved.snapshot.candidate.value.content_hash
   ||plan.pin.sourceHash!==saved.skillSourceHash||digest(plan.identity)!==digest(await prepareSkillExecutionIdentity(context,{runId:p.runId})))throw new Error('Safety frozen identity or case changed');
  if((await prepareSkillSafetyCandidate(context,p)).sourceHash!==saved.sourceHash)throw new Error('Safety sources changed');
 };
 const durable=createDurableSkillCandidateModel({ownerId:context.userId,snapshotHash:saved.sourceHash,arm},collector,validate);
 await validate();const out=await runSkillCandidateArm(saved.snapshot,arm,durable.model,validate,maximumModelCalls);await validate();
 return {...out,caseId:saved.caseId,category:saved.category,provenance:saved.provenance,inputHash:saved.inputHash,sourceHash:saved.sourceHash,
  freezeId,evaluationId:collector.evaluationId,sourceKind:collector.sourceKind,modelAttemptReceipts:durable.receipts,
  productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false};
}
