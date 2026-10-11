import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {digest} from './contracts';
import {readSkillAcceptanceEvidence} from './skill-acceptance-store';
import {validateStoredSkillAcceptanceCandidate} from './skill-acceptance-candidate';
import {loadRecordedTaskChain} from './recorded-task-source';
import {prepareSkillModelJournalAudit,readSkillCandidateJournal} from './skill-candidate-audit';
import type {RecordedEvidenceReceipt} from './recorded-evidence-receipts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

type Context={userId:string};
export async function listSkillAcceptanceReviews(context:Context,input:{skillId:string;offset:number}){
 const p=z.object({skillId:z.uuid(),offset:z.number().int().min(0).max(100000)}).strict().parse(input);
 const rows=await tenantQuery<{id:string;version:number;sourceKind:string;createdAt:string;caseCount:number}>(context.userId,
  `select id,version,source_kind as "sourceKind",created_at::text as "createdAt",jsonb_array_length(observations) as "caseCount"
   from agent_skill_acceptance_bundle where owner_id=$1 and skill_id=$2 order by created_at desc,id desc limit 13 offset $3`,[context.userId,p.skillId,p.offset]);
 return {items:rows.slice(0,12),hasMore:rows.length>12};
}
export async function readSkillAcceptanceReview(context:Context,bundleId:string){
 const saved=await readSkillAcceptanceEvidence(context,bundleId);
 return {id:bundleId,artifactHash:saved.artifactHash,version:saved.artifact.plan.pin.version,sourceKind:saved.artifact.sourceKind,
  sourcesCurrent:saved.sourcesCurrent,freezeStatus:saved.freezeStatus,automaticActivation:false,
  cases:saved.artifact.plan.cases.map(item=>{const observation=saved.artifact.observations.find(row=>row.caseId===item.id);
   return {id:item.id,category:item.category,hasObservation:Boolean(observation),materialAvailable:Boolean(observation&&item.category==='replay'&&item.provenance==='historical-task'),
    observationHash:observation?digest(observation):null,judgment:saved.judgments.find(row=>row.caseId===item.id)??null};}),
 };
}

/** Account-local review material only; no provider calls, tool dispatch or writes.
 * Fail closed when tracing is enabled. Only final answers and consumed evidence are returned,
 * never model system prompts, credentials, or unrelated journal rows. */
export async function readSkillAcceptanceReviewCase(context:Context,input:{bundleId:string;caseId:string}){
 assertLocalAnalysisBoundary();z.uuid().parse(input.bundleId);z.string().min(1).max(200).parse(input.caseId);
 const before=await readSkillAcceptanceEvidence(context,input.bundleId);
 const validated=await validateStoredSkillAcceptanceCandidate(context,input);
 const reference=z.object({runId:z.uuid(),evaluationId:z.uuid(),projectionHash:z.string()}).strict().parse(
  z.record(z.string(),z.unknown()).parse(before.artifact.rawReceipts.candidateSources)[input.caseId]);
 const chain=await loadRecordedTaskChain(context,{runId:reference.runId});
 if(digest({sourceHash:chain.sourceHash,chainHash:chain.chainHash,initialSourceHash:chain.initialSourceHash})!==digest(validated.original))throw new Error('Review original source changed');
 const readJournal=()=>readSkillCandidateJournal(context,{evaluationId:reference.evaluationId,arm:'candidate'});
 const rows=await readJournal(),audit=prepareSkillModelJournalAudit({...context,evaluationId:reference.evaluationId,arm:'candidate'},rows);
 const observation=before.artifact.observations.find(row=>row.caseId===input.caseId);
 const baseline=chain.turns.at(-1)?.reply.content,candidate=audit.selected.at(-1)?.message.content;
 if(!observation||typeof baseline!=='string'||typeof candidate!=='string'||digest(baseline)!==observation.baseline.answerHash
  ||digest(candidate)!==observation.candidate.answerHash||digest(audit.ordered.map(row=>digest(row)))!==digest(observation.candidate.modelReceiptHashes))
  throw new Error('Review answer journal changed');
 const references=new Map(chain.requests.flatMap(request=>request.receiptBinding.receipts.map(row=>[row.id,row.hash] as const)));
 const readReceipts=()=>references.size?tenantQuery<RecordedEvidenceReceipt>(context.userId,
  `select id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output,approval_id from agent_tool_call
   where user_id=$1 and run_id=$2 and id=any($3::uuid[]) order by id`,[context.userId,reference.runId,[...references.keys()]]):Promise.resolve([]);
 const receipts=await readReceipts();
 if(receipts.length!==references.size||receipts.some(row=>digest(row)!==references.get(row.id)))throw new Error('Review evidence changed');
 const question=chain.requests[0].body.messages.findLast(message=>message.role==='user')?.content;
 if(typeof question!=='string')throw new Error('Review task question unavailable');
 // Revalidate current source permissions and mutable history after assembling private material.
 if(digest(await loadRecordedTaskChain(context,{runId:reference.runId}))!==digest(chain)||digest(await readJournal())!==digest(rows)
  ||digest(await readReceipts())!==digest(receipts))throw new Error('Review material changed during reading');
 const after=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(digest(after)!==digest(before)||validated.artifactHash!==before.artifactHash)throw new Error('Review state changed during reading');
 return {bundleId:input.bundleId,caseId:input.caseId,artifactHash:before.artifactHash,observationHash:digest(observation),
  question,baseline,candidate,receipts:receipts.map(row=>({tool:row.tool_id,input:row.input,output:row.output})),
  sourceKind:before.artifact.sourceKind,freezeStatus:before.freezeStatus,judgment:before.judgments.find(row=>row.caseId===input.caseId)??null,
  automaticActivation:false,productionAgentEquivalent:false};
}
