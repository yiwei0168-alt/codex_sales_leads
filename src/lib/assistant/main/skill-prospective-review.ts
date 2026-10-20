import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {digest} from './contracts';
import {readSkillAcceptanceEvidence} from './skill-acceptance-store';
import {prepareSkillProspectiveObservation} from './skill-prospective-collector';
import {loadRecordedTaskChain} from './recorded-task-source';
import {prepareSkillModelJournalAudit,readSkillCandidateJournal} from './skill-candidate-audit';
import type {RecordedEvidenceReceipt} from './recorded-evidence-receipts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

import {storedProspectiveReferenceSchema} from './skill-prospective-candidate-reference';
export {storedProspectiveReferenceSchema} from './skill-prospective-candidate-reference';
/** Private account-local review only. Rebuild claims from current server captures and
 * journals before returning answers; never expose system prompts or unused receipts. */
export async function readSkillProspectiveReviewCase(context:{userId:string},input:{bundleId:string;caseId:string}){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);z.uuid().parse(input.bundleId);z.string().min(1).max(200).parse(input.caseId);
 const before=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(!before.sourcesCurrent||before.freezeStatus.state!=='active'||!before.freezeStatus.freezeId)
  throw new Error('Prospective review source or freeze unavailable');
 const item=before.artifact.plan.cases.find(row=>row.id===input.caseId);
 if(!item||item.category!=='shadow'||item.provenance!=='prospective-task')throw new Error('Prospective review case unavailable');
 const reference=storedProspectiveReferenceSchema.parse(
  z.record(z.string(),z.unknown()).parse(before.artifact.rawReceipts.prospectiveSources)[item.id]);
 if(reference.caseId!==item.id)throw new Error('Prospective review case binding changed');
 const params={freezeId:before.freezeStatus.freezeId,plan:before.artifact.plan,
  reference:{caseId:reference.caseId,jobId:reference.jobId,evaluationId:reference.evaluationId,...(reference.taskId?{taskId:reference.taskId}:{})}};
 const rebuilt=await prepareSkillProspectiveObservation(context,params);
 const observation=before.artifact.observations.find(row=>row.caseId===item.id);
 if(!observation||digest(rebuilt.observation)!==digest(observation)||digest(rebuilt.reference)!==digest(reference)
  ||rebuilt.sourceKind!==before.artifact.sourceKind)throw new Error('Prospective review observation changed');
 const chain=await loadRecordedTaskChain(context,{runId:reference.runId});
 const rows=await readSkillCandidateJournal(context,{evaluationId:reference.evaluationId,arm:'candidate'});
 const audit=prepareSkillModelJournalAudit({...context,evaluationId:reference.evaluationId,arm:'candidate'},rows);
 const baseline=chain.turns.at(-1)?.reply.content,candidate=audit.selected.at(-1)?.message.content;
 const question=chain.requests[0]?.body.messages.findLast(message=>message.role==='user')?.content;
 if(typeof question!=='string'||typeof baseline!=='string'||typeof candidate!=='string'
  ||digest(baseline)!==observation.baseline.answerHash||digest(candidate)!==observation.candidate.answerHash
  ||digest(audit.ordered.map(row=>digest(row)))!==digest(observation.candidate.modelReceiptHashes))
  throw new Error('Prospective review answer journal changed');
 const references=new Map<string,string>();
 for(const request of chain.requests)for(const receipt of request.receiptBinding.receipts){
  if(references.has(receipt.id)&&references.get(receipt.id)!==receipt.hash)throw new Error('Prospective review receipt binding changed');
  references.set(receipt.id,receipt.hash);
 }
 const receipts=references.size?await tenantQuery<RecordedEvidenceReceipt>(context.userId,
  `select id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output,approval_id from agent_tool_call
   where user_id=$1 and run_id=$2 and id=any($3::uuid[]) order by id`,[context.userId,reference.runId,[...references.keys()]]):[];
 if(receipts.length!==references.size||receipts.some(row=>digest(row)!==references.get(row.id)||row.effect!=='read'||row.status!=='completed'))
  throw new Error('Prospective review consumed evidence changed');
 const readRuntime=()=>reference.taskId?tenantQuery<RecordedEvidenceReceipt>(context.userId,
  `select id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output,approval_id from agent_tool_call
   where user_id=$1 and run_id=$2 order by id`,[context.userId,reference.taskId]):Promise.resolve([]);
 const runtime=await readRuntime(),runtimeHashes=new Map(rebuilt.runtimeToolReceipts?.map(row=>[row.id,row.hash])??[]);
 if(runtime.length!==runtimeHashes.size||runtime.some(row=>digest(row)!==runtimeHashes.get(row.id)))throw new Error('Prospective review runtime evidence changed');
 if(digest(await readRuntime())!==digest(runtime))throw new Error('Prospective review runtime evidence changed while reading');
 if(digest(await prepareSkillProspectiveObservation(context,params))!==digest(rebuilt))
  throw new Error('Prospective review sources changed while reading');
 const after=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(digest(after)!==digest(before))throw new Error('Prospective review state changed while reading');
 return {bundleId:input.bundleId,caseId:item.id,artifactHash:before.artifactHash,observationHash:digest(observation),
  question,baseline,candidate,receipts:reference.taskId?[...receipts.map(row=>({tool:row.tool_id,input:row.input,output:row.output,arm:'baseline' as const})),
   ...runtime.map(row=>({tool:row.tool_id,input:row.input,output:row.output,arm:'candidate' as const}))]:receipts.map(row=>({tool:row.tool_id,input:row.input,output:row.output})),
  canPass:{baseline:true,candidate:true},sourceKind:before.artifact.sourceKind,freezeStatus:before.freezeStatus,
  judgment:before.judgments.find(row=>row.caseId===item.id)??null,
  automaticActivation:false,productionAgentEquivalent:false};
}
