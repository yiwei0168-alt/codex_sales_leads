import nextEnv from "@next/env";

import { runDevelopmentFeedbackAgent, runDevelopmentStrategyAgent } from "../src/lib/outreach/graph";
import { tenantQuery } from "../src/lib/rag/db";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

nextEnv.loadEnvConfig(process.cwd());

const workspace = await resolveTargetWorkspace();
const showDraft = process.argv.includes("--show-draft");
const verifyFeedback = process.argv.includes("--verify-feedback");
const companies = await tenantQuery<{ external_id: string; display_name: string }>(workspace.ownerId,
  `select c.external_id, c.canonical_name as display_name
     from workspace_company wc
     join sales_company c on c.id=wc.company_id
    where wc.workspace_id=$1
    order by wc.updated_at desc
    limit 1`, [workspace.id]);
const company = companies[0];
if (!company) throw new Error("Development strategy verification requires at least one saved company");

let draftId: string | undefined;
let feedbackId: string | undefined;
try {
  const startedAt = Date.now();
  const result = await runDevelopmentStrategyAgent(workspace.ownerId, {
    companyExternalId: company.external_id,
    language: "en",
    tone: "consultative and concise",
    instructions: "Verification run: use a low-pressure, company-specific call to action.",
  });
  draftId = result.id;
  if (result.model.endsWith("fallback")) {
    throw new Error(`Kimi live verification degraded: ${result.warnings.join("; ")}`);
  }
  if (result.draft.subjectOptions.length === 0 || result.draft.body.length < 40) {
    throw new Error("Kimi live verification returned an incomplete draft");
  }
  const persisted = await tenantQuery<{ count: number }>(workspace.ownerId,
    `select count(*)::int as count from outreach_draft where id=$1 and user_id=$2`,
    [result.id, workspace.ownerId]);
  if (persisted[0]?.count !== 1) throw new Error("Generated development draft was not persisted");
  let feedbackVerification: Record<string, unknown> | undefined;
  if (verifyFeedback) {
    const reviewedBody = `${result.draft.body}\n\n{{review_note}}`;
    const feedbackResult = await runDevelopmentFeedbackAgent(workspace.ownerId, {
      draftId: result.id,
      currentBody: reviewedBody,
      sourceRevision: result.revision,
      allowMemory: true,
      feedback: "For future Netherlands distributor outreach, use the approved MediaMarkt Netherlands proof when relevant and keep the call to action low-pressure. This is a reusable market and style preference.",
    });
    feedbackId = feedbackResult.feedbackId;
    if (feedbackResult.draft.revision !== result.revision + 1) {
      throw new Error("Feedback revision did not increment the draft revision");
    }
    if (!feedbackResult.memoryStored) throw new Error(`Reusable feedback was not stored: ${feedbackResult.memoryReason}`);
    const audit = await tenantQuery<{
      status: string; memory_allowed: boolean; source_revision: number; previous_body: string;
      memory_id: string | null; memory_count: number;
    }>(workspace.ownerId,
      `select f.status, f.memory_allowed, f.source_revision, f.previous_body, f.memory_id,
              (select count(*)::int from outreach_knowledge_item k
                where k.id=f.memory_id and k.owner_id=f.user_id and k.kind='feedback-memory') as memory_count
         from outreach_feedback f where f.id=$1 and f.user_id=$2`,
      [feedbackResult.feedbackId, workspace.ownerId]);
    const row = audit[0];
    if (!row || row.status !== "applied" || !row.memory_allowed || row.source_revision !== result.revision
      || row.previous_body !== reviewedBody || row.memory_count !== 1) {
      throw new Error("Feedback audit or private memory persistence verification failed");
    }
    feedbackVerification = { revision: feedbackResult.draft.revision, feedbackStatus: row.status,
      memoryAllowed: row.memory_allowed, memoryStored: feedbackResult.memoryStored,
      memorySummary: feedbackResult.memorySummary };
  }
  console.log(JSON.stringify({
    company: company.display_name,
    model: result.model,
    promptVersion: result.promptVersion,
    elapsedMs: Date.now() - startedAt,
    generationMetrics: result.generationMetrics,
    subjects: result.draft.subjectOptions.length,
    wordCount: result.draft.wordCount,
    evidenceReferences: result.evidenceIds.length,
    knowledgeReferences: result.knowledgeIds.length,
    templates: result.templateIds.length,
    persisted: true,
    ...(feedbackVerification ? { feedback: feedbackVerification } : {}),
    ...(showDraft ? {
      personalizationAngle: result.strategy.personalizationAngle,
      subjectOptions: result.draft.subjectOptions,
      body: result.draft.body,
    } : {}),
  }, null, 2));
} finally {
  if (feedbackId) {
    await tenantQuery(workspace.ownerId,
      `delete from outreach_knowledge_item
        where owner_id=$1 and kind='feedback-memory' and source_refs->>'feedbackId'=$2`,
      [workspace.ownerId, feedbackId]);
  }
  if (draftId) {
    await tenantQuery(workspace.ownerId,
      `delete from outreach_draft where id=$1 and user_id=$2`, [draftId, workspace.ownerId]);
  }
}
