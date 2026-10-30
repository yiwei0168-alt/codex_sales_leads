import { createHash } from "node:crypto";
import { z } from "zod";

export const researchAnswerInput = z.object({
  candidateId: z.string().min(8).max(80),
  questionHash: z.string().regex(/^[a-f0-9]{64}$/),
  relationshipStatus: z.enum(["none", "exists", "unknown"]),
  answer: z.string().trim().min(1).max(1000),
}).strict();

export interface LeadResearchAnswer extends z.infer<typeof researchAnswerInput> {
  id: string;
  receivedAt: string;
}

export function researchQuestionHash(question: string): string {
  return createHash("sha256").update(question).digest("hex");
}

/** Fail closed. A relationship declaration cannot resolve other research questions.
 * This exact legacy question has a fully specified scope; arbitrary free text is
 * deliberately not classified with keyword matching or a new model call.
 */
export function isCudyRelationshipQuestion(question: string, companyName: string): boolean {
  return question === `Is ${companyName} independent of Cudy, and does it currently have any supplier, reseller, distribution, ownership, or contractual relationship with Cudy?`;
}

export function relationshipAnswerMatches(answer: LeadResearchAnswer, candidateId: string, question: string): boolean {
  return answer.candidateId === candidateId && answer.questionHash === researchQuestionHash(question)
    && /^[0-9a-f-]{36}$/i.test(answer.id) && Number.isFinite(Date.parse(answer.receivedAt));
}
