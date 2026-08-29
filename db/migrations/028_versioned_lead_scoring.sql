create table if not exists lead_scoring_policy (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version text not null,
  schema_version text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  policy jsonb not null,
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  change_summary text not null default '',
  source_knowledge_ids uuid[] not null default '{}',
  created_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (policy_key, version),
  unique (policy_key, checksum)
);

create unique index if not exists lead_scoring_policy_one_active_idx
  on lead_scoring_policy(policy_key) where status='active';

alter table lead_search_run add column if not exists scoring_policy_id uuid references lead_scoring_policy(id);
alter table lead_search_run add column if not exists scoring_policy_version text;
alter table lead_search_run add column if not exists scoring_policy_checksum text;
alter table lead_search_run add column if not exists scoring_policy_snapshot jsonb not null default '{}';

alter table lead_candidate_assessment
  add column if not exists eligibility_status text not null default 'eligible'
    check (eligibility_status in ('eligible', 'research-required', 'ineligible-for-current-task',
      'insufficient-evidence-for-recommendation'));
alter table lead_candidate_assessment add column if not exists score_lower integer check (score_lower between 0 and 100);
alter table lead_candidate_assessment add column if not exists score_upper integer check (score_upper between 0 and 100);
alter table lead_candidate_assessment add column if not exists research_depth text
  check (research_depth in ('deep', 'standard', 'limited'));
alter table lead_candidate_assessment add column if not exists primary_business_role text;
alter table lead_candidate_assessment add column if not exists company_scale_class text
  check (company_scale_class in ('Global/Enterprise', 'National', 'Regional', 'Local/Small', 'Unknown'));
alter table lead_candidate_assessment add column if not exists recommendation_priority text
  check (recommendation_priority in ('High', 'Medium', 'Low', 'Hold/Research Required'));

create table if not exists lead_evidence_snapshot (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  run_id uuid not null references lead_search_run(id) on delete cascade,
  candidate_id text not null,
  source_url text not null,
  canonical_url text not null,
  source_type text not null check (source_type in ('official-website', 'independent-public', 'user-confirmed')),
  evidence_kinds text[] not null default '{}',
  acquisition_status text not null check (acquisition_status in ('fresh', 'revalidated', 'failed')),
  retrieved_at timestamptz not null,
  freshness_days integer not null check (freshness_days > 0),
  expires_at timestamptz not null,
  content_hash text check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$'),
  content text,
  prior_run_id uuid references lead_search_run(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (run_id, candidate_id, canonical_url)
);
create index if not exists lead_evidence_snapshot_candidate_idx
  on lead_evidence_snapshot(run_id, candidate_id, acquisition_status, expires_at);

alter table lead_scoring_policy enable row level security;
drop policy if exists lead_scoring_policy_read on lead_scoring_policy;
create policy lead_scoring_policy_read on lead_scoring_policy for select using (true);
drop policy if exists lead_scoring_policy_admin_write on lead_scoring_policy;
create policy lead_scoring_policy_admin_write on lead_scoring_policy for all
  using (app_current_user_role()='admin') with check (app_current_user_role()='admin');

alter table lead_evidence_snapshot enable row level security;
alter table lead_evidence_snapshot force row level security;
drop policy if exists lead_evidence_snapshot_tenant on lead_evidence_snapshot;
create policy lead_evidence_snapshot_tenant on lead_evidence_snapshot
  using (user_id=app_current_user_id()) with check (user_id=app_current_user_id());

grant select, insert, update, delete on lead_scoring_policy, lead_evidence_snapshot to network_copilot_app;
