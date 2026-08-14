import type { CompanyRecord } from "@/lib/domain";
import { query, transaction } from "@/lib/rag/db";
import type { CompanyEditablePatch, MarketWorkspaceDto } from "./types";

const WORKSPACE_SLUG = "mexico-pilot";

export async function getCurrentWorkspace(): Promise<MarketWorkspaceDto | null> {
  const workspaces = await query<{
    id: string; slug: string; name: string; market: string; country_code: string; mode: "new-market" | "growth"; objective: string;
  }>(
    `select id, slug, name, market, country_code, mode, objective from market_workspace where slug = $1 and status = 'active'`,
    [WORKSPACE_SLUG],
  );
  const workspace = workspaces[0];
  if (!workspace) return null;
  const rows = await query<{
    record: CompanyRecord; account_tier: CompanyRecord["accountTier"]; supply_model: CompanyRecord["supplyModel"];
    brand_involvement: CompanyRecord["brandInvolvement"]; opportunity_stage: CompanyRecord["opportunityStage"];
    priority: CompanyRecord["priority"]; owner_name: string | null; next_action: string | null; manually_edited: boolean;
  }>(
    `select c.record, wc.account_tier, wc.supply_model, wc.brand_involvement, wc.opportunity_stage,
            wc.priority, wc.owner_name, wc.next_action, wc.manually_edited
     from workspace_company wc join sales_company c on c.id = wc.company_id
     where wc.workspace_id = $1 order by c.canonical_name`,
    [workspace.id],
  );
  const searches = await query<{ provider: string; accepted_count: number; credits_used: number; finished_at: string }>(
    `select provider, accepted_count, credits_used, finished_at::text from lead_search_run
     where workspace_id = $1 and status = 'completed' order by finished_at desc limit 1`,
    [workspace.id],
  );
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
      `update market_workspace set mode = $1, updated_at = now() where slug = $2 returning id`,
      [mode, WORKSPACE_SLUG],
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
       join sales_company c on c.id = wc.company_id where w.slug = $1 and c.external_id = $2`,
      [WORKSPACE_SLUG, externalId],
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
