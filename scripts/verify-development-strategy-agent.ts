import nextEnv from "@next/env";

import { runDevelopmentStrategyAgent } from "../src/lib/outreach/graph";
import { tenantQuery } from "../src/lib/rag/db";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

nextEnv.loadEnvConfig(process.cwd());

const workspace = await resolveTargetWorkspace();
const showDraft = process.argv.includes("--show-draft");
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
try {
  const result = await runDevelopmentStrategyAgent(workspace.ownerId, {
    companyExternalId: company.external_id,
    language: "en",
    tone: "consultative and concise",
    targetLength: 100,
    instructions: "Verification run: use a low-pressure, company-specific call to action.",
  });
  draftId = result.id;
  if (result.model === "deterministic-fallback") {
    throw new Error(`Kimi live verification degraded: ${result.warnings.join("; ")}`);
  }
  if (result.draft.subjectOptions.length === 0 || result.draft.body.length < 40) {
    throw new Error("Kimi live verification returned an incomplete draft");
  }
  const persisted = await tenantQuery<{ count: number }>(workspace.ownerId,
    `select count(*)::int as count from outreach_draft where id=$1 and user_id=$2`,
    [result.id, workspace.ownerId]);
  if (persisted[0]?.count !== 1) throw new Error("Generated development draft was not persisted");
  console.log(JSON.stringify({
    company: company.display_name,
    model: result.model,
    promptVersion: result.promptVersion,
    subjects: result.draft.subjectOptions.length,
    wordCount: result.draft.wordCount,
    evidenceReferences: result.evidenceIds.length,
    knowledgeReferences: result.knowledgeIds.length,
    templates: result.templateIds.length,
    persisted: true,
    ...(showDraft ? {
      personalizationAngle: result.strategy.personalizationAngle,
      subjectOptions: result.draft.subjectOptions,
      body: result.draft.body,
    } : {}),
  }, null, 2));
} finally {
  if (draftId) {
    await tenantQuery(workspace.ownerId,
      `delete from outreach_draft where id=$1 and user_id=$2`, [draftId, workspace.ownerId]);
  }
}
