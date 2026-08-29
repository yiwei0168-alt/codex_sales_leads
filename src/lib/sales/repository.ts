import type { CompanyRecord } from "@/lib/domain";
import { query, tenantTransaction, transaction } from "@/lib/rag/db";
import type {
  CompanyContactDetailsDto,
  CompanyEditablePatch,
  ContactStatus,
  EmailCandidateStatus,
  MarketWorkspaceDto,
} from "./types";

const WORKSPACE_SLUG = "global-sales";

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
      selected_path_id: string | null; selected_path_type: CompanyRecord["selectedCooperationPath"] | null;
    }>(
      `select c.record, wc.account_tier, wc.supply_model, wc.brand_involvement, wc.opportunity_stage,
              wc.priority, wc.owner_name, wc.next_action, wc.manually_edited,
              wc.selected_path_id, wc.selected_path_type
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
       where wc.workspace_id = $1 and ct.workspace_id = $1 order by c.external_id, ct.confidence desc, ct.full_name`,
      [workspace.id],
    ),
    query<{
      external_id: string; id: string; contact_id: string | null; email: string; status: EmailCandidateStatus;
      source_url: string | null; source_provider: string; derivation: string | null; confidence: number;
      decision_id: string | null; verification_category: "Official" | "HighConfidence" | "NeedsReview" | null;
      verification_lifecycle: "Active" | "Invalid" | null; verification_confidence: number | null;
      role_relevance_score: number | null; verification_reachability: number | null; development_priority: number | null;
      verification_reasons: string[] | null; verification_review_flags: string[] | null; verification_decided_at: string | null;
    }>(
      `select c.external_id, em.id, em.contact_id, em.email, em.status, em.source_url, em.source_provider,
              em.derivation, em.confidence, vd.id as decision_id, vd.category as verification_category,
              vd.lifecycle_status as verification_lifecycle, vd.confidence_score as verification_confidence,
              vd.role_relevance_score, vd.reachability_score as verification_reachability,
              vd.development_priority, vd.reasons as verification_reasons,
              vd.review_flags as verification_review_flags, vd.decided_at::text as verification_decided_at
       from company_email_candidate em join sales_company c on c.id = em.company_id
       join workspace_company wc on wc.company_id = c.id
       left join contact_verification_decision vd on vd.id = em.verification_decision_id
         and vd.current and not vd.shadow
       where wc.workspace_id = $1 and em.workspace_id = $1 order by c.external_id,
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
      verification: email.decision_id && email.verification_category && email.verification_lifecycle
        && email.verification_confidence !== null && email.role_relevance_score !== null
        && email.verification_reachability !== null && email.development_priority !== null && email.verification_decided_at
        ? {
          decisionId: email.decision_id,
          category: email.verification_category,
          lifecycleStatus: email.verification_lifecycle,
          confidenceScore: email.verification_confidence,
          roleRelevanceScore: email.role_relevance_score,
          reachabilityScore: email.verification_reachability,
          developmentPriority: email.development_priority,
          reasons: email.verification_reasons ?? [],
          reviewFlags: email.verification_review_flags ?? [],
          decidedAt: email.verification_decided_at,
        } : undefined,
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
      selectedPathId: row.selected_path_id ?? row.record.selectedPathId,
      selectedCooperationPath: row.selected_path_type ?? row.record.selectedCooperationPath,
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
       values ($1, $2, 'workspace', $3, 'mode.updated', $4)`,
      [result.rows[0].id, userId, result.rows[0].id, JSON.stringify({ mode })],
    );
  });
}

export async function updateCompanyState(externalId: string, patch: CompanyEditablePatch, userId: string): Promise<void> {
  await tenantTransaction(userId, async (client) => {
    const current = await client.query<{
      workspace_id: string; company_id: string; account_tier: string; supply_model: string; brand_involvement: string;
      opportunity_stage: string; priority: string; owner_name: string | null; next_action: string | null;
      selected_path_id: string | null; selected_path_type: string | null; record: CompanyRecord;
      country_code: string; mode: string; objective: string;
    }>(
      `select wc.workspace_id, wc.company_id, wc.account_tier, wc.supply_model, wc.brand_involvement,
              wc.opportunity_stage, wc.priority, wc.owner_name, wc.next_action,
              wc.selected_path_id, wc.selected_path_type, c.record, w.country_code, w.mode, w.objective
       from workspace_company wc join market_workspace w on w.id = wc.workspace_id
       join sales_company c on c.id = wc.company_id
       where w.owner_id = $1 and w.slug = $2 and c.external_id = $3`,
      [userId, WORKSPACE_SLUG, externalId],
    );
    const row = current.rows[0];
    if (!row) throw new Error("Company not found in current workspace");
    if (patch.accountTier !== undefined) {
      const distributorTier = patch.accountTier.endsWith("Distributor");
      if (row.record.layer === "Tier-1 Distributor" ? !distributorTier : distributorTier) {
        throw new Error("Account tier is incompatible with the candidate's cooperation-path layer");
      }
    }
    const selectedPath = patch.selectedPathId === undefined ? undefined
      : row.record.cooperationPaths?.find((path) => path.pathId === patch.selectedPathId);
    if (patch.selectedPathId !== undefined && !selectedPath) {
      throw new Error("Selected cooperation path is not available for this company");
    }
    const next = {
      accountTier: patch.accountTier ?? row.account_tier,
      supplyModel: patch.supplyModel ?? row.supply_model,
      brandInvolvement: patch.brandInvolvement ?? row.brand_involvement,
      opportunityStage: patch.opportunityStage ?? row.opportunity_stage,
      priority: patch.priority ?? row.priority,
      owner: patch.owner === undefined ? row.owner_name : patch.owner,
      nextAction: patch.nextAction === undefined ? row.next_action : patch.nextAction,
      selectedPathId: patch.selectedPathId ?? row.selected_path_id,
      selectedPathType: selectedPath?.pathType ?? row.selected_path_type,
    };
    await client.query(
      `update workspace_company set account_tier = $1, supply_model = $2, brand_involvement = $3,
              opportunity_stage = $4, priority = $5, owner_name = $6, next_action = $7,
              selected_path_id = $8, selected_path_type = $9,
              manually_edited = true, updated_at = now()
       where workspace_id = $10 and company_id = $11`,
      [next.accountTier, next.supplyModel, next.brandInvolvement, next.opportunityStage, next.priority,
        next.owner || null, next.nextAction || null, next.selectedPathId, next.selectedPathType,
        row.workspace_id, row.company_id],
    );
    if (selectedPath && selectedPath.pathId !== row.selected_path_id) {
      const edit = await client.query<{ id: string }>(
        `insert into user_cooperation_path_edit (
           user_id, workspace_id, company_id, previous_path_id, previous_path_type,
           selected_path_id, selected_path_type, primary_business_role, company_scale_class,
           market_code, development_stage, available_paths, source
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'user-ui') returning id`,
        [userId, row.workspace_id, row.company_id, row.selected_path_id, row.selected_path_type,
          selectedPath.pathId, selectedPath.pathType, row.record.primaryBusinessRole ?? null,
          (row.record as CompanyRecord & { companyScaleClass?: string }).companyScaleClass ?? null,
          row.country_code, `${row.mode}:${row.objective}`, JSON.stringify(row.record.cooperationPaths ?? [])],
      );
      await client.query(
        `insert into user_outreach_memory (
           user_id, workspace_id, kind, external_id, title, content, market_codes, channel_roles,
           context, usage_scope, affects_objective_scoring
         ) values ($1,$2,'cooperation-path-preference',$3,'User-confirmed cooperation path',$4,$5,$6,$7,
           'internal-learning',false)`,
        [userId, row.workspace_id, `path-edit:${edit.rows[0].id}`,
          `For ${row.record.displayName}, the user selected ${selectedPath.pathType} instead of ${row.selected_path_type ?? "the agent default"}.`,
          [row.country_code], [selectedPath.candidateRole], JSON.stringify({ companyExternalId: externalId,
            primaryBusinessRole: row.record.primaryBusinessRole, selectedPathId: selectedPath.pathId,
            selectedPathType: selectedPath.pathType, previousPathId: row.selected_path_id,
            previousPathType: row.selected_path_type, developmentStage: `${row.mode}:${row.objective}` })],
      );
    }
    await client.query(
      `insert into workspace_audit_event (workspace_id, actor_user_id, entity_type, entity_id, action, changes)
       values ($1, $2, 'company', $3, 'company.updated', $4)`,
      [row.workspace_id, userId, externalId, JSON.stringify(patch)],
    );
  });
}
