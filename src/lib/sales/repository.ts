import type { CompanyRecord } from "@/lib/domain";
import { query, transaction } from "@/lib/rag/db";
import type {
  CompanyContactDetailsDto,
  CompanyEditablePatch,
  ContactStatus,
  EmailCandidateStatus,
  MarketWorkspaceDto,
} from "./types";

const WORKSPACE_SLUG = "mexico-pilot";

export async function getCurrentWorkspace(userId: string): Promise<MarketWorkspaceDto | null> {
  const workspaces = await query<{
    id: string; slug: string; name: string; market: string; country_code: string; mode: "new-market" | "growth"; objective: string;
  }>(
    `select id, slug, name, market, country_code, mode, objective from market_workspace
     where owner_id = $1 and slug = $2 and status = 'active'`,
    [userId, WORKSPACE_SLUG],
  );
  const workspace = workspaces[0];
  if (!workspace) return null;
  const [rows, searches, contacts, emails, enrichmentSummaries] = await Promise.all([
    query<{
      record: CompanyRecord; account_tier: CompanyRecord["accountTier"]; supply_model: CompanyRecord["supplyModel"];
      brand_involvement: CompanyRecord["brandInvolvement"]; opportunity_stage: CompanyRecord["opportunityStage"];
      priority: CompanyRecord["priority"]; owner_name: string | null; next_action: string | null; manually_edited: boolean;
    }>(
      `select c.record, wc.account_tier, wc.supply_model, wc.brand_involvement, wc.opportunity_stage,
              wc.priority, wc.owner_name, wc.next_action, wc.manually_edited
       from workspace_company wc join sales_company c on c.id = wc.company_id
       where wc.workspace_id = $1 order by c.canonical_name`,
      [workspace.id],
    ),
    query<{ provider: string; accepted_count: number; credits_used: number; finished_at: string }>(
      `select provider, accepted_count, credits_used, finished_at::text from lead_search_run
       where workspace_id = $1 and status = 'completed' order by finished_at desc limit 1`,
      [workspace.id],
    ),
    query<{
      external_id: string; id: string; full_name: string; job_title: string | null; public_profile_url: string | null;
      source_url: string; source_provider: string; status: ContactStatus; confidence: number;
    }>(
      `select c.external_id, ct.id, ct.full_name, ct.job_title, ct.public_profile_url, ct.source_url,
              ct.source_provider, ct.status, ct.confidence
       from company_contact ct join sales_company c on c.id = ct.company_id
       join workspace_company wc on wc.company_id = c.id
       where wc.workspace_id = $1 order by c.external_id, ct.confidence desc, ct.full_name`,
      [workspace.id],
    ),
    query<{
      external_id: string; id: string; contact_id: string | null; email: string; status: EmailCandidateStatus;
      source_url: string | null; source_provider: string; derivation: string | null; confidence: number;
    }>(
      `select c.external_id, em.id, em.contact_id, em.email, em.status, em.source_url, em.source_provider,
              em.derivation, em.confidence
       from company_email_candidate em join sales_company c on c.id = em.company_id
       join workspace_company wc on wc.company_id = c.id
       where wc.workspace_id = $1 order by c.external_id,
         case em.status when 'Verified' then 1 when 'Public' then 2 when 'Pattern-guessed' then 3 when 'Unknown' then 4 else 5 end,
         em.confidence desc, em.email`,
      [workspace.id],
    ),
    query<{ external_id: string; evidence_count: number; provider_mix: string[]; enriched_at: string }>(
      `with latest as (
         select distinct on (e.company_id) e.company_id, e.run_id
         from company_web_evidence e join company_enrichment_run r on r.id = e.run_id
         where r.workspace_id = $1 and r.status = 'completed'
         order by e.company_id, r.finished_at desc nulls last, r.started_at desc
       )
       select c.external_id, count(e.id)::int as evidence_count, r.provider_mix,
              coalesce(r.finished_at, r.started_at)::text as enriched_at
       from latest l join company_web_evidence e on e.company_id = l.company_id and e.run_id = l.run_id
       join company_enrichment_run r on r.id = l.run_id
       join sales_company c on c.id = l.company_id
       group by c.external_id, r.provider_mix, r.finished_at, r.started_at`,
      [workspace.id],
    ),
  ]);

  const contactsByCompanyId: Record<string, CompanyContactDetailsDto> = {};
  for (const summary of enrichmentSummaries) {
    contactsByCompanyId[summary.external_id] = {
      contacts: [],
      emails: [],
      evidenceCount: summary.evidence_count,
      providerMix: summary.provider_mix,
      enrichedAt: summary.enriched_at,
    };
  }
  for (const contact of contacts) {
    const details = contactsByCompanyId[contact.external_id];
    if (!details) continue;
    details.contacts.push({
      id: contact.id,
      fullName: contact.full_name,
      jobTitle: contact.job_title ?? undefined,
      publicProfileUrl: contact.public_profile_url ?? undefined,
      sourceUrl: contact.source_url,
      sourceProvider: contact.source_provider,
      status: contact.status,
      confidence: contact.confidence,
    });
  }
  for (const email of emails) {
    const details = contactsByCompanyId[email.external_id];
    if (!details) continue;
    details.emails.push({
      id: email.id,
      contactId: email.contact_id ?? undefined,
      email: email.email,
      status: email.status,
      sourceUrl: email.source_url ?? undefined,
      sourceProvider: email.source_provider,
      derivation: email.derivation ?? undefined,
      confidence: email.confidence,
    });
  }
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    market: workspace.market,
    countryCode: workspace.country_code,
    mode: workspace.mode,
    objective: workspace.objective,
    companies: rows.map((row) => ({
      ...row.record,
      accountTier: row.account_tier,
      supplyModel: row.supply_model,
      brandInvolvement: row.brand_involvement,
      opportunityStage: row.opportunity_stage,
      priority: row.priority,
      owner: row.owner_name ?? row.record.owner,
      nextAction: row.next_action ?? row.record.nextAction,
      manuallyEdited: row.manually_edited,
    })),
    contactsByCompanyId,
    latestSearch: searches[0] ? {
      provider: searches[0].provider,
      acceptedCount: searches[0].accepted_count,
      creditsUsed: searches[0].credits_used,
      finishedAt: searches[0].finished_at,
    } : undefined,
  };
}

export async function updateWorkspaceMode(mode: "new-market" | "growth", userId: string): Promise<void> {
  await transaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `update market_workspace set mode = $1, updated_at = now()
       where owner_id = $2 and slug = $3 returning id`,
      [mode, userId, WORKSPACE_SLUG],
    );
    if (!result.rows[0]) throw new Error("Workspace not found");
    await client.query(
      `insert into workspace_audit_event (workspace_id, actor_user_id, entity_type, entity_id, action, changes)
       values ($1, $2, 'workspace', $1::text, 'mode.updated', $3)`,
      [result.rows[0].id, userId, JSON.stringify({ mode })],
    );
  });
}

export async function updateCompanyState(externalId: string, patch: CompanyEditablePatch, userId: string): Promise<void> {
  await transaction(async (client) => {
    const current = await client.query<{
      workspace_id: string; company_id: string; account_tier: string; supply_model: string; brand_involvement: string;
      opportunity_stage: string; priority: string; owner_name: string | null; next_action: string | null;
    }>(
      `select wc.workspace_id, wc.company_id, wc.account_tier, wc.supply_model, wc.brand_involvement,
              wc.opportunity_stage, wc.priority, wc.owner_name, wc.next_action
       from workspace_company wc join market_workspace w on w.id = wc.workspace_id
       join sales_company c on c.id = wc.company_id
       where w.owner_id = $1 and w.slug = $2 and c.external_id = $3`,
      [userId, WORKSPACE_SLUG, externalId],
    );
    const row = current.rows[0];
    if (!row) throw new Error("Company not found in current workspace");
    const next = {
      accountTier: patch.accountTier ?? row.account_tier,
      supplyModel: patch.supplyModel ?? row.supply_model,
      brandInvolvement: patch.brandInvolvement ?? row.brand_involvement,
      opportunityStage: patch.opportunityStage ?? row.opportunity_stage,
      priority: patch.priority ?? row.priority,
      owner: patch.owner === undefined ? row.owner_name : patch.owner,
      nextAction: patch.nextAction === undefined ? row.next_action : patch.nextAction,
    };
    await client.query(
      `update workspace_company set account_tier = $1, supply_model = $2, brand_involvement = $3,
              opportunity_stage = $4, priority = $5, owner_name = $6, next_action = $7,
              manually_edited = true, updated_at = now()
       where workspace_id = $8 and company_id = $9`,
      [next.accountTier, next.supplyModel, next.brandInvolvement, next.opportunityStage, next.priority,
        next.owner || null, next.nextAction || null, row.workspace_id, row.company_id],
    );
    await client.query(
      `insert into workspace_audit_event (workspace_id, actor_user_id, entity_type, entity_id, action, changes)
       values ($1, $2, 'company', $3, 'company.updated', $4)`,
      [row.workspace_id, userId, externalId, JSON.stringify(patch)],
    );
  });
}
