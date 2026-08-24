import { getRagConfig } from "@/lib/rag/config";
import { tenantQuery } from "@/lib/rag/db";
import { embedTexts } from "@/lib/rag/openai-provider";
import { hybridSearch } from "@/lib/rag/repository";
import type { CompanyRecord } from "@/lib/domain";
import type {
  DevelopmentContext, DevelopmentGenerationOptions, DevelopmentStrategyDto, OutreachTemplate,
} from "./types";

interface CompanyContextRow {
  workspace_id: string;
  company_id: string;
  external_id: string;
  record: CompanyRecord;
  search_run_id: string | null;
  dimensions: Record<string, number> | null;
  reasons: string[] | null;
  risks: string[] | null;
  unknowns: string[] | null;
  evidence_ids: string[] | null;
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
        updated_at desc limit 5`, [userId, roles, language]);
  return rows.map((row) => ({
    id: row.id, visibility: row.visibility, source: row.source, title: row.title, language: row.language,
    channelRoles: row.channel_roles, targetTitles: row.target_titles, subjectPattern: row.subject_pattern,
    body: row.body, styleProfile: row.style_profile,
  }));
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
    `select w.id as workspace_id, c.id as company_id, c.external_id, c.record, wc.search_run_id,
            a.dimensions, a.reasons, a.risks, a.unknowns, a.evidence_ids,
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
  const query = [
    `Cudy products, company strengths and approved policies relevant to ${row.record.displayName}`,
    `${row.record.roles.join(" ")} in ${row.record.country}`,
    row.record.summary,
  ].join(". ");
  const [embedding] = await embedTexts([query]);
  const config = getRagConfig();
  const retrieved = await hybridSearch(userId, query, embedding, { collections: ["product", "company"] }, 10);
  const knowledge = retrieved.filter((chunk) => chunk.score >= config.minScore)
    .filter((chunk) => chunk.metadata.mailboxArtifactKind !== "email-template"
      && chunk.metadata.mailboxArtifactKind !== "customer-signal")
    .map((chunk) => ({
      id: chunk.id, collection: chunk.collection as "product" | "company", title: chunk.title,
      content: chunk.content.slice(0, 4_000), score: chunk.score, corroborated: chunk.corroborated,
      structuredFacts: Array.isArray(chunk.metadata.structuredFacts)
        ? chunk.metadata.structuredFacts as DevelopmentContext["knowledge"][number]["structuredFacts"] : [],
    }));
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
    playbook: row.playbook ?? undefined, recipient, knowledge, templates,
  };
}

export async function persistDevelopmentDraft(
  context: DevelopmentContext,
  result: Omit<DevelopmentStrategyDto, "id" | "createdAt" | "companyExternalId" | "status">,
  inputSnapshot: Record<string, unknown>,
): Promise<DevelopmentStrategyDto> {
  const rows = await tenantQuery<{ id: string; created_at: string }>(context.userId,
    `insert into outreach_draft (
       user_id, workspace_id, company_id, contact_id, search_run_id, language, strategy,
       subject_options, body, evidence_ids, knowledge_chunk_ids, template_ids,
       input_snapshot, model, prompt_version, warnings
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid[],$12::uuid[],$13,$14,$15,$16)
     returning id, created_at::text`,
    [context.userId, context.workspaceId, context.companyId, context.recipient?.contactId ?? null,
      context.searchRunId ?? null, result.draft.language, JSON.stringify(result.strategy), result.draft.subjectOptions,
      result.draft.body, result.evidenceIds, result.knowledgeIds, result.templateIds,
      JSON.stringify(inputSnapshot), result.model, result.promptVersion, result.warnings]);
  return { ...result, id: rows[0].id, companyExternalId: context.company.id, status: "generated", createdAt: rows[0].created_at };
}

export async function updateDevelopmentDraft(userId: string, draftId: string, input: { body?: string; approve?: boolean }): Promise<boolean> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `update outreach_draft set manual_body=coalesce($3, manual_body),
       status=case when $4 then 'approved' else status end,
       approved_at=case when $4 then now() else approved_at end, updated_at=now()
     where id=$1 and user_id=$2 and status in ('generated','approved') returning id`,
    [draftId, userId, input.body?.slice(0, 20_000) ?? null, input.approve ?? false]);
  return Boolean(rows[0]);
}
