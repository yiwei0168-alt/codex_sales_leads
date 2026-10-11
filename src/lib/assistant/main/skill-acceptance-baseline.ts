import {z} from 'zod';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {loadRecordedTaskChain} from './recorded-task-source';
import {replayRecordedGraphTrace} from './recorded-graph-audit';
import {readSkillAcceptanceEvidence} from './skill-acceptance-store';
import {assertSkillAcceptanceRoutes} from './skill-acceptance-policy';

const sourceReference=z.object({runId:z.uuid(),projectionHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
type Context={userId:string};
/** Dedicated local process only. Re-reads database provenance; returns hashes, never private message text. */
export async function prepareSkillAcceptanceBaseline(context:Context,input:{runId:string}){
 assertLocalAnalysisBoundary();
 const before=await loadRecordedTaskChain(context,input);
 const graph=await replayRecordedGraphTrace(before);
 const after=await loadRecordedTaskChain(context,input);
 if(digest(before)!==digest(after))throw new Error('Acceptance baseline changed during validation');
 const reads=new Map<string,string>();
 for(const request of before.requests)for(const receipt of request.receiptBinding.receipts){
  const previous=reads.get(receipt.id);if(previous&&previous!==receipt.hash)throw new Error('Acceptance baseline read changed');
  reads.set(receipt.id,receipt.hash);
 }
 const evidence=[...reads].sort(([a],[b])=>a.localeCompare(b)).map(([id,hash])=>({id,hash}));
 const projection={protocol:'skill-acceptance-baseline-v1' as const,ownerId:context.userId,runId:input.runId,
  inputHash:before.taskInputHash,sourceHash:before.sourceHash,chainHash:before.chainHash,
  initialSourceHash:before.initialSourceHash,journalHash:before.journalClosure.journalHash,
  modelConfigHash:before.modelConfigHash,answerHash:graph.finalReplyHash,evidenceHash:digest(evidence),
  modelReceiptHashes:before.requests.map(request=>request.sourceHash),
  requests:before.requests.map(request=>({callId:request.binding.callId,requestHash:request.requestHash,
   requestedModel:request.selectedRoute.model,
   settingsHash:digest(Object.fromEntries(Object.entries(request.body).filter(([key])=>key!=='messages'&&key!=='tools'))),
   toolSchemaHash:digest(request.body.tools),response:request.originalResponse})),
 };
 return {projection,projectionHash:digest(projection),baselineJournalVerified:true as const,
  productionAgentEquivalent:false as const,automaticActivation:false as const};
}

/** Connects stored baseline claims to current server journals. Candidate/live collector proofs are separate. */
export async function validateStoredSkillAcceptanceBaseline(context:Context,input:{bundleId:string;caseId:string}){
 assertLocalAnalysisBoundary();z.uuid().parse(input.bundleId);z.string().min(1).parse(input.caseId);
 const before=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(!before.sourcesCurrent)throw new Error('Acceptance Skill sources changed');
 const item=before.artifact.plan.cases.find(row=>row.id===input.caseId);
 if(!item||item.category!=='replay'||item.provenance!=='historical-task')throw new Error('Acceptance case is not historical replay');
 const references=z.record(z.string(),sourceReference).parse(before.artifact.rawReceipts.baselineSources);
 const reference=references[input.caseId];if(!reference)throw new Error('Acceptance baseline source missing');
 const current=await prepareSkillAcceptanceBaseline(context,{runId:reference.runId}),projection=current.projection;
 if(current.projectionHash!==reference.projectionHash)throw new Error('Acceptance baseline source changed');
 const observation=before.artifact.observations.find(row=>row.caseId===input.caseId);
 if(!observation||observation.baseline.state!=='completed'||observation.baseline.stopReason!==null||observation.baseline.unexpectedEffects!==0
  ||item.inputHash!==projection.inputHash||item.sourceHash!==current.projectionHash
  ||observation.baseline.answerHash!==projection.answerHash||observation.baseline.evidenceHash!==projection.evidenceHash
  ||digest(observation.baseline.modelReceiptHashes)!==digest(projection.modelReceiptHashes)
  ||observation.baseline.identity.modelConfigHash!==projection.modelConfigHash)
  throw new Error('Acceptance baseline observation does not match server journal');
 assertSkillAcceptanceRoutes(observation.baseline,projection.requests.map((request,step)=>({step,requestedModel:request.requestedModel,actualModel:request.response.model!,provider:request.response.provider!,receiptHash:projection.modelReceiptHashes[step],toolSchemaHash:request.toolSchemaHash})));
 const after=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(!after.sourcesCurrent||digest(before)!==digest(after))throw new Error('Acceptance evidence or review changed during baseline validation');
 return {bundleId:input.bundleId,caseId:input.caseId,artifactHash:before.artifactHash,projectionHash:current.projectionHash,
  original:{sourceHash:projection.sourceHash,chainHash:projection.chainHash,initialSourceHash:projection.initialSourceHash},
  baselineJournalVerified:true as const,productionAgentEquivalent:false as const,collectorProvenanceVerified:false as const,
  candidateVerified:false as const,automaticActivation:false as const};
}
