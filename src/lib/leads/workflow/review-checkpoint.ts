import { tenantQuery } from "@/lib/rag/db";
import type { LeadReviewCheckpoint } from "./assessment-review-agent";
import { researchQuestionHash, type LeadResearchAnswer } from "./research-answer";

export interface ReviewCheckpointScope { userId: string; workspaceId: string; countryCode: string;
  actionId?: string; graphThreadId?: string }

function validScope(scope: ReviewCheckpointScope, candidateId: string, contract: string) {
  if (!/^[A-Z]{2}$/.test(scope.countryCode) || !candidateId.trim()
    || !/^[a-f0-9]{64}$/.test(contract)) throw new Error("Invalid review checkpoint identity");
}

export function productReviewCheckpoint(scope: ReviewCheckpointScope): LeadReviewCheckpoint {
  return {
    async loadResearchAnswer(candidateId, question) {
      if (!scope.actionId || !scope.graphThreadId) return null;
      const rows = await tenantQuery<LeadResearchAnswer>(scope.userId,
        `select id,candidate_id as "candidateId",question_hash as "questionHash",
          relationship_status as "relationshipStatus",answer,received_at::text as "receivedAt"
         from lead_research_answer where user_id=$1 and action_id=$2 and graph_thread_id=$3
          and candidate_id=$4 and question_hash=$5 and question=$6`,
        [scope.userId,scope.actionId,scope.graphThreadId,candidateId,researchQuestionHash(question),question]);
      return rows[0] ?? null;
    },
    async load(phase, candidateId, contract) {
      validScope(scope, candidateId, contract);
      const rows = await tenantQuery<{ response: unknown }>(scope.userId,
        `select response from lead_review_checkpoint where user_id=$1 and workspace_id=$2
           and country_code=$3 and candidate_id=$4 and phase=$5 and execution_contract=$6`,
        [scope.userId, scope.workspaceId, scope.countryCode, candidateId, phase, contract]);
      return rows[0]?.response ?? null;
    },
    async save(phase, candidateId, contract, response) {
      validScope(scope, candidateId, contract);
      await tenantQuery(scope.userId,
        `insert into lead_review_checkpoint(user_id,workspace_id,country_code,candidate_id,phase,execution_contract,response)
         values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict do nothing`,
        [scope.userId, scope.workspaceId, scope.countryCode, candidateId, phase, contract,
          JSON.stringify(response)]);
    },
  };
}
