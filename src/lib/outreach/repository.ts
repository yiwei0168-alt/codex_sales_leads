import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import { embedTexts } from "@/lib/rag/openai-provider";
import type { CompanyRecord } from "@/lib/domain";
import type { LeadDevelopmentHandoff } from "@/lib/leads/workflow/types";
import { insertFeedbackMemory, prepareFeedbackMemory, searchOutreachKnowledge } from "./knowledge-repository";
import type {
  DevelopmentContext, DevelopmentGenerationOptions, DevelopmentStrategyDto, OutreachFeedbackResult, OutreachTemplate,
} from "./types";

interface CompanyContextRow {
  workspace_id: string;
  company_id: string;
  external_id: string;
  country_code: string;
  record: CompanyRecord;
  search_run_id: string | null;
  dimensions: Record<string, number> | null;
  reasons: string[] | null;
  risks: string[] | null;
  unknowns: string[] | null;
  evidence_ids: string[] | null;
  handoff_report: LeadDevelopmentHandoff | null;
  playbook: Record<string, unknown> | null;
}

async function syncApprovedMailboxTemplates(userId: string): Promise<void> {
  await tenantQuery(userId,
    `insert into outreach_template (
       owner_id, visibility, source, source_ref, title, language, body, style_profile, approval_status
     ) select c.user_id, 'private', 'mailbox-approved', c.id::text, c.title, 'auto', c.content,
              jsonb_build_object('learnedBy', c.model, 'confidence', c.confidence, 'rationale', c.rationale), 'active'
       from mailbox_artifact_candidate c
      where c.user_id = $1 and c.kind = 'email-template' and c.review_status = 'approved'
     on conflict (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), source, source_ref)
       where source_ref is not null
     do update set title=excluded.title, body=excluded.body, style_profile=excluded.style_profile,
       approval_status='active', updated_at=now()`, [userId]);
}

async function loadTemplates(userId: string, roles: string[], language: string): Promise<OutreachTemplate[]> {
  await syncApprovedMailboxTemplates(userId);
  const rows = await tenantQuery<{
    id: string; visibility: OutreachTemplate["visibility"]; source: OutreachTemplate["source"];
    title: string; language: string; channel_roles: OutreachTemplate["channelRoles"];
    target_titles: string[]; subject_pattern: string; body: string; style_profile: Record<string, unknown>;
  }>(userId,
    `select id, visibility, source, title, language, channel_roles, target_titles,
            subject_pattern, body, style_profile
       from outreach_template
      where approval_status='active' and (visibility='shared' or owner_id=$1)
      order by case when visibility='private' then 0 else 1 end,
        case when channel_roles && $2::text[] then 0 else 1 end,
        case when language in ($3, 'auto') then 0 else 1 end,
        updated_at desc limit 6`, [userId, roles, language]);
  const mapped = rows.map((row) => ({
    id: row.id, visibility: row.visibility, source: row.source, title: row.title, language: row.language,
    channelRoles: row.channel_roles, targetTitles: row.target_titles, subjectPattern: row.subject_pattern,
    body: row.body, styleProfile: row.style_profile,
  }));
  const shared = mapped.find((item) => item.visibility === "shared");
  const privateStyle = mapped.find((item) => item.visibility === "private");
  return [shared, privateStyle].filter((item): item is OutreachTemplate => Boolean(item));
}

async function loadRecipient(userId: string, workspaceId: string, companyId: string, contactId?: string) {
  const rows = await tenantQuery<{
    id: string; full_name: string; job_title: string | null; email: string | null; email_status: string | null;
  }>(userId,
    `select ct.id, ct.full_name, ct.job_title, em.email, em.status as email_status
       from company_contact ct
       left join lateral (
         select e.email, e.status from company_email_candidate e
          where e.contact_id=ct.id and e.workspace_id=$2
            and e.status in ('Verified','Public')
          order by case e.status when 'Verified' then 0 else 1 end, e.confidence desc limit 1
       ) em on true
      where ct.workspace_id=$2 and ct.company_id=$3 and ($4::uuid is null or ct.id=$4)
        and exists (
          select 1 from market_workspace w
           where w.id=ct.workspace_id and w.owner_id=$1
        )
      order by case when $4::uuid is not null and ct.id=$4 then 0 else 1 end, ct.confidence desc limit 1`,
    [userId, workspaceId, companyId, contactId ?? null]);
  const row = rows[0];
  return row ? { contactId: row.id, name: row.full_name, title: row.job_title ?? undefined,
    email: row.email ?? undefined, emailStatus: row.email_status ?? undefined } : undefined;
}

export async function loadDevelopmentContext(userId: string, options: DevelopmentGenerationOptions): Promise<DevelopmentContext> {
  const rows = await tenantQuery<CompanyContextRow>(userId,
    `select w.id as workspace_id, c.id as company_id, c.external_id, c.country_code, c.record, wc.search_run_id,
            a.dimensions, a.reasons, a.risks, a.unknowns, a.evidence_ids, a.handoff_report,
            r.metadata->'playbook' as playbook
       from market_workspace w
       join workspace_company wc on wc.workspace_id=w.id
       join sales_company c on c.id=wc.company_id
       left join lead_candidate_assessment a on a.run_id=wc.search_run_id and lower(a.domain)=lower(c.domain) and a.user_id=$1
       left join lead_search_run r on r.id=wc.search_run_id
      where w.owner_id=$1 and w.slug='global-sales' and c.external_id=$2 limit 1`,
    [userId, options.companyExternalId]);
  const row = rows[0];
  if (!row) throw new Error("候选公司不存在或不属于当前工作区");
  const language = options.language?.trim() || "en";
  const query = [`Cudy company strengths, distribution partnership policy and market proof`,
    `${row.record.roles.join(" ")} partner in ${row.record.country}`, row.record.summary].join(". ");
  const [embedding] = await embedTexts([query]);
  const countryCode = row.country_code.toUpperCase();
  const marketCodes = [countryCode, row.record.country.toUpperCase()];
  if (["NL", "BE", "LU"].includes(countryCode)) marketCodes.push("BENELUX");
  if (countryCode === "GB") marketCodes.push("UK");
  const knowledge = await searchOutreachKnowledge(userId, query, embedding, marketCodes, row.record.roles, 4);
  const [templates, recipient] = await Promise.all([
    loadTemplates(userId, row.record.roles, language),
    loadRecipient(userId, row.workspace_id, row.company_id, options.contactId),
  ]);
  return {
    userId, workspaceId: row.workspace_id, companyId: row.company_id,
    searchRunId: row.search_run_id ?? undefined, company: row.record,
    assessment: row.dimensions ? {
      dimensions: row.dimensions, reasons: row.reasons ?? [], risks: row.risks ?? [],
      unknowns: row.unknowns ?? [], evidenceIds: row.evidence_ids ?? [],
    } : undefined,
    playbook: row.playbook ?? undefined,
    handoff: row.handoff_report?.version === "lead-handoff-v2" ? row.handoff_report : undefined,
    recipient, knowledge, templates,
  };
}

export async function persistDevelopmentDraft(
  context: DevelopmentContext,
  result: Omit<DevelopmentStrategyDto, "id" | "createdAt" | "companyExternalId" | "status" | "revision">,
  inputSnapshot: Record<string, unknown>,
): Promise<DevelopmentStrategyDto> {
  const rows = await tenantQuery<{ id: string; created_at: string; revision: number }>(context.userId,
    `insert into outreach_draft (
       user_id, workspace_id, company_id, contact_id, search_run_id, language, strategy,
       subject_options, body, evidence_ids, knowledge_chunk_ids, template_ids,
       input_snapshot, handoff_report, model, prompt_version, warnings, generation_metrics
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid[],$12::uuid[],$13,$14,$15,$16,$17,$18)
     returning id, created_at::text, revision`,
    [context.userId, context.workspaceId, context.companyId, context.recipient?.contactId ?? null,
      context.searchRunId ?? null, result.draft.language, JSON.stringify(result.strategy), result.draft.subjectOptions,
      result.draft.body, result.evidenceIds, result.knowledgeIds, result.templateIds,
      JSON.stringify(inputSnapshot), JSON.stringify(context.handoff ?? {}), result.model, result.promptVersion, result.warnings,
      JSON.stringify(result.generationMetrics)]);
  return { ...result, id: rows[0].id, companyExternalId: context.company.id, status: "generated",
    revision: rows[0].revision, createdAt: rows[0].created_at };
}

export async function updateDevelopmentDraft(userId: string, draftId: string, input: { body?: string; approve?: boolean }): Promise<boolean> {
  return tenantTransaction(userId, async (client) => {
    const current = await client.query<{ workspace_id: string; revision: number; effective_body: string }>(
      `select workspace_id, revision, coalesce(manual_body, body) as effective_body
         from outreach_draft where id=$1 and user_id=$2 and status in ('generated','approved') for update`,
      [draftId, userId]);
    if (!current.rows[0]) return false;
    const revisedBody = input.body?.slice(0, 30_000);
    const rows = await client.query<{ id: string }>(
      `update outreach_draft set manual_body=coalesce($3, manual_body),
         status=case when $4 then 'approved' else status end,
         approved_at=case when $4 then now() else approved_at end,
         revision=case when $3::text is null then revision else revision+1 end, updated_at=now()
       where id=$1 and user_id=$2 and status in ('generated','approved') returning id`,
      [draftId, userId, revisedBody ?? null, input.approve ?? false]);
    if (rows.rows[0] && revisedBody !== undefined && revisedBody !== current.rows[0].effective_body) {
      await client.query(
        `insert into user_outreach_edit_event (
           user_id, workspace_id, draft_id, source_revision, edit_source, previous_body, revised_body
         ) values ($1,$2,$3,$4,'manual-body-edit',$5,$6)`,
        [userId, current.rows[0].workspace_id, draftId, current.rows[0].revision,
          current.rows[0].effective_body, revisedBody],
      );
    }
    return Boolean(rows.rows[0]);
  });
}

export async function loadDraftForFeedback(userId: string, draftId: string): Promise<{
  context: DevelopmentContext;
  draft: DevelopmentStrategyDto;
}> {
  const rows = await tenantQuery<{
    company_external_id: string; strategy: DevelopmentStrategyDto["strategy"]; subject_options: string[];
    contact_id: string | null; language: string; body: string; manual_body: string | null;
    evidence_ids: string[]; knowledge_chunk_ids: string[];
    template_ids: string[]; warnings: string[]; model: string; prompt_version: string; status: DevelopmentStrategyDto["status"];
    revision: number; generation_metrics: DevelopmentStrategyDto["generationMetrics"]; created_at: string;
  }>(userId,
    `select c.external_id as company_external_id, d.contact_id, d.language, d.strategy,
            d.subject_options, d.body, d.manual_body,
            d.evidence_ids, d.knowledge_chunk_ids, d.template_ids, d.warnings, d.model,
            d.prompt_version, d.status, d.revision, d.generation_metrics, d.created_at::text
       from outreach_draft d join sales_company c on c.id=d.company_id
      where d.id=$1 and d.user_id=$2`, [draftId, userId]);
  const row = rows[0];
  if (!row) throw new Error("开发草稿不存在");
  const context = await loadDevelopmentContext(userId, {
    companyExternalId: row.company_external_id, contactId: row.contact_id ?? undefined, language: row.language,
  });
  const body = row.manual_body ?? row.body;
  return { context, draft: {
    id: draftId, companyExternalId: row.company_external_id, strategy: row.strategy,
    draft: { language: row.language, subjectOptions: row.subject_options, body,
      wordCount: body.split(/\s+/).filter(Boolean).length,
      placeholders: [...body.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]) },
    evidenceIds: row.evidence_ids, knowledgeIds: row.knowledge_chunk_ids,
    templateIds: row.template_ids, warnings: row.warnings, model: row.model,
    promptVersion: row.prompt_version, generationMetrics: row.generation_metrics,
    status: row.status, revision: row.revision, createdAt: row.created_at,
  } };
}

export async function createFeedbackRecord(userId: string, input: {
  draftId: string; feedback: string; previousBody: string; sourceRevision: number; allowMemory: boolean;
}): Promise<string> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `insert into outreach_feedback (
       user_id, draft_id, feedback, previous_body, source_revision, memory_allowed
     ) values ($1,$2,$3,$4,$5,$6) returning id`,
    [userId, input.draftId, input.feedback.slice(0, 4_000), input.previousBody,
      input.sourceRevision, input.allowMemory]);
  return rows[0].id;
}

export async function markFeedbackFailed(userId: string, feedbackId: string, reason: string): Promise<void> {
  await tenantQuery(userId,
    `update outreach_feedback set status='failed', memory_reason=$3 where id=$1 and user_id=$2`,
    [feedbackId, userId, reason.slice(0, 500)]);
}

export async function applyFeedbackRevision(userId: string, input: {
  feedbackId: string;
  draft: DevelopmentStrategyDto;
  revisedBody: string;
  subjectOptions: string[];
  model: string;
  generationMetrics: DevelopmentStrategyDto["generationMetrics"];
  evidenceIds: string[];
  knowledgeIds: string[];
  allowMemory: boolean;
  memory: { valuable: boolean; summary?: string; reason: string; marketCodes: string[]; channelRoles: string[] };
}): Promise<OutreachFeedbackResult> {
  const shouldStoreMemory = input.allowMemory && input.memory.valuable && Boolean(input.memory.summary);
  const memoryEmbedding = shouldStoreMemory ? await prepareFeedbackMemory(input.memory.summary!) : undefined;
  const memoryReason = input.allowMemory ? input.memory.reason : "用户未授权将本次反馈写入长期记忆";
  const applied = await tenantTransaction(userId, async (client) => {
    let memoryId: string | undefined;
    if (shouldStoreMemory && memoryEmbedding) {
      memoryId = await insertFeedbackMemory(client, userId, {
        feedbackId: input.feedbackId, summary: input.memory.summary!, marketCodes: input.memory.marketCodes,
        channelRoles: input.memory.channelRoles, reason: input.memory.reason,
      }, memoryEmbedding);
    }
    const draftResult = await client.query<{ revision: number; updated_at: string }>(
      `update outreach_draft set body=$3, manual_body=null, subject_options=$4, status='generated',
         approved_at=null, revision=revision+1, model=$5, generation_metrics=$6,
         evidence_ids=$7, knowledge_chunk_ids=$8::uuid[], updated_at=now()
       where id=$1 and user_id=$2 and revision=$9 and status in ('generated','approved')
       returning revision, updated_at::text`,
      [input.draft.id, userId, input.revisedBody, input.subjectOptions, input.model,
        JSON.stringify(input.generationMetrics), input.evidenceIds, input.knowledgeIds, input.draft.revision]);
    if (!draftResult.rows[0]) throw new Error("草稿已被其他操作更新，请刷新后重新提交反馈");
    const feedbackResult = await client.query<{ id: string }>(
      `update outreach_feedback set status='applied', revised_body=$3, memory_valuable=$4,
         memory_summary=$5, memory_reason=$6, private_memory_id=$7, model=$8,
         generation_metrics=$9, applied_at=now()
       where id=$1 and user_id=$2 and status='submitted' returning id`,
      [input.feedbackId, userId, input.revisedBody, shouldStoreMemory,
        shouldStoreMemory ? input.memory.summary : null, memoryReason, memoryId ?? null,
        input.model, JSON.stringify(input.generationMetrics)]);
    if (!feedbackResult.rows[0]) throw new Error("反馈记录状态已变化，无法重复应用");
    await client.query(
      `insert into user_outreach_edit_event (
         user_id, workspace_id, draft_id, feedback_id, source_revision, edit_source,
         user_instruction, previous_body, revised_body, distilled_memory_id, distillation_status
       ) select $1,d.workspace_id,d.id,$2,$3,'feedback-revision',f.feedback,f.previous_body,$4,$5,
                case when $5::uuid is null then 'not-reusable' else 'applied' end
           from outreach_draft d join outreach_feedback f on f.draft_id=d.id
          where d.id=$6 and f.id=$2`,
      [userId, input.feedbackId, input.draft.revision, input.revisedBody,
        memoryId ?? null, input.draft.id],
    );
    return { revision: draftResult.rows[0].revision, memoryId };
  });
  const revised = { ...input.draft, status: "generated" as const, revision: applied.revision,
    model: input.model, generationMetrics: input.generationMetrics,
    evidenceIds: input.evidenceIds, knowledgeIds: input.knowledgeIds,
    draft: { ...input.draft.draft, subjectOptions: input.subjectOptions,
      body: input.revisedBody, wordCount: input.revisedBody.split(/\s+/).filter(Boolean).length } };
  return { feedbackId: input.feedbackId, draft: revised, memoryStored: Boolean(applied.memoryId),
    memorySummary: applied.memoryId ? input.memory.summary : undefined, memoryReason };
}
