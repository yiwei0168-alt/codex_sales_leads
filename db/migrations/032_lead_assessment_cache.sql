create table if not exists lead_assessment_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  candidate_id text not null,
  canonical_domain text not null,
  dependency_fingerprint text not null check (dependency_fingerprint ~ '^[a-f0-9]{64}$'),
  scoring_policy_key text not null,
  scoring_policy_version text not null,
  prompt_version text not null,
  assessment jsonb not null,
  source_run_id uuid references lead_search_run(id) on delete set null,
  hit_count integer not null default 0 check (hit_count >= 0),
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, candidate_id, dependency_fingerprint)
);

create table if not exists lead_playbook_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  dependency_fingerprint text not null check (dependency_fingerprint ~ '^[a-f0-9]{64}$'),
  playbook jsonb not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, dependency_fingerprint)
);

create index if not exists lead_assessment_cache_lookup_idx
  on lead_assessment_cache(user_id, workspace_id, candidate_id, dependency_fingerprint, updated_at desc);
create index if not exists lead_playbook_cache_lookup_idx
  on lead_playbook_cache(user_id, workspace_id, dependency_fingerprint, updated_at desc);

alter table lead_assessment_cache enable row level security;
alter table lead_assessment_cache force row level security;
drop policy if exists lead_assessment_cache_tenant on lead_assessment_cache;
create policy lead_assessment_cache_tenant on lead_assessment_cache
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
alter table lead_playbook_cache enable row level security;
alter table lead_playbook_cache force row level security;
drop policy if exists lead_playbook_cache_tenant on lead_playbook_cache;
create policy lead_playbook_cache_tenant on lead_playbook_cache
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

grant select, insert, update, delete on lead_assessment_cache, lead_playbook_cache to network_copilot_app;

comment on table lead_assessment_cache is
  'Private tenant-scoped assessment cache. Reuse requires an exact dependency fingerprint over evidence, facts, scoring policy, prompt, objective and path memory.';
comment on table lead_playbook_cache is
  'Private tenant-scoped standard playbook cache keyed by the normalized plan and local RAG evidence.';
