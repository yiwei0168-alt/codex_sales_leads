import { tenantTransaction } from "@/lib/rag/db";
import { getProductionLeadWorkflowGraph } from "./graph";
import { checkpointInvocation } from "./pause";
import { isCudyRelationshipQuestion, researchAnswerInput, researchQuestionHash } from "./research-answer";
import type { LeadWorkflowState } from "./types";

export class ResearchAnswerConflict extends Error {}

export function targetedResearchRequests(state: LeadWorkflowState) {
  return state.assessmentReviews.filter(review => review.status === "targeted-research-required"
    && review.researchQuestion).flatMap(review => {
    const candidate = state.correctedCandidates.find(item => item.candidateId === review.candidateId);
    if (!candidate) return [];
    const question = review.researchQuestion!;
    return [{ candidateId: candidate.candidateId, companyName: candidate.companyName,
      question, questionHash: researchQuestionHash(question),
      supportsRelationshipAnswer: isCudyRelationshipQuestion(question, candidate.companyName) }];
  });
}

/** Action row lock serializes normal confirmation and answer+queue. The immutable
 * answer is committed in the same transaction as queueing, before workers can see it.
 */
export async function researchAnswerService(userId: string, actionId: string, input?: unknown) {
  const answer = input === undefined ? undefined : researchAnswerInput.parse(input);
  return tenantTransaction(userId, async client => {
    const action = (await client.query(`select status,payload from assistant_action
      where user_id=$1 and id=$2 and action_type='lead-search' for update`, [userId,actionId])).rows[0];
    if (!action) throw new ResearchAnswerConflict("任务不存在或无权访问");
    const job = (await client.query(`select status,graph_thread_id,attempts from lead_workflow_job
      where user_id=$1 and action_id=$2 for update`, [userId,actionId])).rows[0];
    if (!job) throw new ResearchAnswerConflict("任务尚未建立审核记录");
    const records = (await client.query(`select id,candidate_id as "candidateId",question_hash as "questionHash",
      relationship_status as "relationshipStatus",answer,received_at::text as "receivedAt"
      from lead_research_answer where user_id=$1 and action_id=$2 and graph_thread_id=$3`,
    [userId,actionId,job.graph_thread_id])).rows;
    const prior = answer && records.find(row => row.candidateId === answer.candidateId && row.questionHash === answer.questionHash);
    if (prior && (prior.relationshipStatus !== answer!.relationshipStatus || prior.answer !== answer!.answer))
      throw new ResearchAnswerConflict("该问题已有回答，不能覆盖原始记录；请先复核");
    // Retrying an accepted HTTP submission must never enqueue a second execution.
    if (prior) return { answers: records, requests: [], status: job.status,
      queued: job.status === "queued" || job.status === "running", duplicate: true };
    const snapshot = await getProductionLeadWorkflowGraph().getState({
      configurable: { thread_id: job.graph_thread_id, checkpoint_ns: "" } });
    checkpointInvocation(snapshot,userId,actionId,action.payload);
    const state = snapshot.values as LeadWorkflowState;
    const requests = targetedResearchRequests(state);
    if (!answer) return { requests, answers: records, status: job.status, queued: false, duplicate: false };
    const request = requests.find(item => item.candidateId === answer.candidateId && item.questionHash === answer.questionHash);
    if (action.status !== "failed" || job.status !== "failed" || !snapshot.next.includes("recover_incomplete_processing")
      || !request || !request.supportsRelationshipAnswer)
      throw new ResearchAnswerConflict("任务状态或补证问题已变化；请刷新后复核");
    const shouldQueue = answer.relationshipStatus === "none";
    if (shouldQueue && job.attempts >= 20) throw new ResearchAnswerConflict("任务已达到最大恢复次数");
    const saved = (await client.query(`insert into lead_research_answer
      (user_id,action_id,graph_thread_id,candidate_id,question_hash,question,relationship_status,answer)
      values($1,$2,$3,$4,$5,$6,$7,$8) returning id,received_at::text as "receivedAt"`,
    [userId,actionId,job.graph_thread_id,answer.candidateId,answer.questionHash,request.question,answer.relationshipStatus,answer.answer])).rows[0];
    if (shouldQueue) {
      await client.query(`update assistant_action set status='confirmed',confirmed_at=coalesce(confirmed_at,now()),
        started_at=null,finished_at=null,error_message=null,updated_at=now() where id=$1 and user_id=$2`,[actionId,userId]);
      await client.query(`update lead_workflow_job set status='queued',phase='queued',execution_mode='worker',
        worker_id=null,lease_until=null,error_message=null,finished_at=null,stop_requested=false,paused_at=null,updated_at=now()
        where action_id=$1 and user_id=$2`,[actionId,userId]);
    }
    return { requests, answers: [...records,{...answer,...saved}], status: shouldQueue ? "queued" : job.status,
      queued: shouldQueue, duplicate: false };
  });
}
