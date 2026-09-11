-- Additive foundation: legacy membership and every existing foreign key remain intact.
-- Do not switch readers until all company actions resolve candidate_id within a workspace.
create table if not exists workspace_company_market (
  workspace_id uuid not null,
  company_id uuid not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  candidate_id text not null,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  user_overrides jsonb not null default '{}' check (jsonb_typeof(user_overrides) = 'object'),
  search_run_id uuid references lead_search_run(id) on delete set null,
  provenance text not null check (provenance in ('legacy-snapshot','legacy-country-conflict','assessment','user-added')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,company_id,country_code),
  unique (workspace_id,candidate_id),
  foreign key (workspace_id,company_id) references workspace_company(workspace_id,company_id) on delete cascade
);

-- Snapshot only the one known membership. Never invent other historical markets.
-- A conflict is retained for audit, explicitly stale, not treated as a current assessment.
insert into workspace_company_market(workspace_id,company_id,country_code,candidate_id,record,user_overrides,search_run_id,provenance,created_at,updated_at)
select wc.workspace_id,wc.company_id,trim(coalesce(wc.market_country_code,c.country_code)),c.external_id,
  c.record || jsonb_build_object(
    'id',c.external_id,'country',trim(coalesce(wc.market_country_code,c.country_code)),
    'accountTier',wc.account_tier,'supplyModel',wc.supply_model,'brandInvolvement',wc.brand_involvement,
    'opportunityStage',wc.opportunity_stage,'priority',wc.priority,'owner',wc.owner_name,
    'nextAction',wc.next_action,'selectedPathId',wc.selected_path_id,
    'selectedCooperationPath',wc.selected_path_type,'manuallyEdited',wc.manually_edited,
    'assessmentNeedsRefresh',coalesce((c.record->>'assessmentNeedsRefresh')='true',false)
       or coalesce(wc.market_country_code,c.country_code)<>c.country_code
       or c.record->>'searchRunId' is distinct from wc.search_run_id::text),
  case when wc.user_overrides->>'userAdded'='true' then wc.user_overrides
    - array['fitScore','accountValue','evidenceConfidence','summary','risks','unknowns','evidence','searchRunId','assessmentNeedsRefresh']
    else wc.user_overrides end,wc.search_run_id,
  case when coalesce(wc.market_country_code,c.country_code)<>c.country_code
       or c.record->>'searchRunId' is distinct from wc.search_run_id::text
    then 'legacy-country-conflict' else 'legacy-snapshot' end,c.created_at,wc.updated_at
from workspace_company wc join sales_company c on c.id=wc.company_id
where trim(coalesce(wc.market_country_code,c.country_code)) ~ '^[A-Z]{2}$'
on conflict (workspace_id,company_id,country_code) do nothing;

create index if not exists company_market_country on workspace_company_market(workspace_id,country_code);
alter table workspace_company_market enable row level security;
alter table workspace_company_market force row level security;
drop policy if exists company_market_owner on workspace_company_market;
create policy company_market_owner on workspace_company_market
  using (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id()))
  with check (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id()));
grant select,insert,update on workspace_company_market to network_copilot_app;
