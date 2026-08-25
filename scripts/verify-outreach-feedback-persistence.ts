import nextEnv from "@next/env";

import { loadDevelopmentContext, applyFeedbackRevision, createFeedbackRecord, persistDevelopmentDraft } from "../src/lib/outreach/repository";
import { reviseDevelopmentDraftWithFeedback } from "../src/lib/outreach/kimi-agent";
import { tenantQuery } from "../src/lib/rag/db";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

nextEnv.loadEnvConfig(process.cwd());

const workspace = await resolveTargetWorkspace();
const liveKimi = process.argv.includes("--live-kimi");
const companies = await tenantQuery<{ external_id: string }>(workspace.ownerId,
  `select c.external_id from workspace_company wc
    join sales_company c on c.id=wc.company_id
   where wc.workspace_id=$1 order by wc.updated_at desc limit 1`, [workspace.id]);
const company = companies[0];
if (!company) throw new Error("Feedback persistence verification requires a saved company");

let draftId: string | undefined;
let feedbackId: string | undefined;
try {
  const context = await loadDevelopmentContext(workspace.ownerId, { companyExternalId: company.external_id, language: "en" });
  const evidenceIds = context.company.evidence.slice(0, 1).map((item) => item.id);
  const knowledgeIds = context.knowledge.slice(0, 2).map((item) => item.id);
  const originalBody = "Dear {{first_name}},\n\nThis is a verified local persistence test for a grounded Cudy channel development email.\n\nBest regards,\n{{sender_name}}";
  const draft = await persistDevelopmentDraft(context, {
    strategy: { objective: "Verify the feedback persistence workflow", personalizationAngle: "Grounded channel fit",
      valuePropositions: ["Relevant channel support"], recommendedProducts: [], targetTitles: ["Commercial Director"],
      likelyObjections: [], callToAction: "A low-pressure introductory call", followUpPlan: ["Follow up once"],
      evidenceIds, knowledgeIds },
    draft: { language: "en", subjectOptions: ["Local feedback verification"], body: originalBody,
      wordCount: originalBody.split(/\s+/).filter(Boolean).length, placeholders: ["first_name", "sender_name"] },
    evidenceIds, knowledgeIds, templateIds: context.templates.map((item) => item.id), warnings: [],
    model: "verification-fixture", promptVersion: "feedback-persistence-v1",
    generationMetrics: { modelCalls: 0, latencyMs: 0 }, recipient: context.recipient,
  }, { verification: true });
  draftId = draft.id;
  const reviewedBody = `${draft.draft.body}\n\nHuman-reviewed wording retained.`;
  feedbackId = await createFeedbackRecord(workspace.ownerId, {
    draftId: draft.id, feedback: "Use approved Dutch retail proof when relevant and keep the CTA low-pressure.",
    previousBody: reviewedBody, sourceRevision: draft.revision, allowMemory: true,
  });
  const feedback = "For future Netherlands distributor outreach, use the approved MediaMarkt Netherlands proof when relevant and keep the call to action low-pressure. This is a reusable market and style preference.";
  const evaluated = liveKimi
    ? await reviseDevelopmentDraftWithFeedback(context, { ...draft, draft: { ...draft.draft, body: reviewedBody } }, feedback)
    : { revisedBody: `${reviewedBody}\n\nThe revised version keeps a low-pressure next step.`,
        subjectOptions: ["A practical channel discussion"], model: "verification-fixture",
        generationMetrics: { modelCalls: 0, latencyMs: 0 }, evidenceIds, knowledgeIds,
        memory: { valuable: true, summary: "For relevant Dutch channel outreach, use approved local retail proof and a low-pressure call to action.",
          reason: "Reusable market and style preference confirmed by the user", marketCodes: ["NL", "BENELUX"],
          channelRoles: ["Distributor"] } };
  if (liveKimi && !evaluated.memory.valuable) {
    throw new Error(`Kimi did not classify the explicit reusable preference as valuable: ${evaluated.memory.reason}`);
  }
  const result = await applyFeedbackRevision(workspace.ownerId, {
    feedbackId, draft: { ...draft, draft: { ...draft.draft, body: reviewedBody } },
    revisedBody: evaluated.revisedBody, subjectOptions: evaluated.subjectOptions, model: evaluated.model,
    generationMetrics: evaluated.generationMetrics, evidenceIds: evaluated.evidenceIds,
    knowledgeIds: evaluated.knowledgeIds, allowMemory: true, memory: evaluated.memory,
  });
  const rows = await tenantQuery<{
    status: string; source_revision: number; memory_allowed: boolean; previous_body: string;
    revised_body: string | null; memory_id: string | null; draft_revision: number;
  }>(workspace.ownerId,
    `select f.status, f.source_revision, f.memory_allowed, f.previous_body, f.revised_body,
            f.memory_id, d.revision as draft_revision
       from outreach_feedback f join outreach_draft d on d.id=f.draft_id
      where f.id=$1 and f.user_id=$2`, [feedbackId, workspace.ownerId]);
  const audit = rows[0];
  if (!audit || audit.status !== "applied" || !audit.memory_allowed || audit.source_revision !== draft.revision
    || audit.previous_body !== reviewedBody || audit.revised_body !== evaluated.revisedBody || !audit.memory_id
    || audit.draft_revision !== draft.revision + 1 || !result.memoryStored) {
    throw new Error("Local feedback persistence audit failed");
  }
  console.log(JSON.stringify({ persisted: true, liveKimi, revision: audit.draft_revision, status: audit.status,
    memoryAllowed: audit.memory_allowed, memoryStored: result.memoryStored, previousHumanEditPreserved: true }, null, 2));
} finally {
  if (feedbackId) {
    await tenantQuery(workspace.ownerId,
      `delete from outreach_knowledge_item
        where owner_id=$1 and kind='feedback-memory' and source_refs->>'feedbackId'=$2`,
      [workspace.ownerId, feedbackId]);
  }
  if (draftId) {
    await tenantQuery(workspace.ownerId, `delete from outreach_draft where id=$1 and user_id=$2`,
      [draftId, workspace.ownerId]);
  }
}
