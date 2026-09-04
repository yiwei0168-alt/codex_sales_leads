alter table lead_search_provider_call
  add column if not exists call_fingerprint text,
  add column if not exists query_cluster_key text,
  add column if not exists cache_status text not null default 'miss',
  add column if not exists failure_class text,
  add column if not exists circuit_scope text;

alter table lead_search_provider_call
  drop constraint if exists lead_search_provider_call_cache_status_check;
alter table lead_search_provider_call
  add constraint lead_search_provider_call_cache_status_check
  check (cache_status in ('miss', 'hit', 'failed-hit', 'skipped'));

create index if not exists lead_search_provider_call_fingerprint_idx
  on lead_search_provider_call(run_id, call_fingerprint, started_at desc);
create index if not exists lead_search_provider_call_cluster_idx
  on lead_search_provider_call(run_id, query_cluster_key, started_at desc);

create table if not exists public_evidence.role_correction_snapshot (
  id uuid primary key default gen_random_uuid(),
  company_entity_id uuid not null references public_evidence.company_entity(id) on delete cascade,
  market_country_code char(2) not null,
  dependency_fingerprint text not null check (dependency_fingerprint ~ '^[a-f0-9]{64}$'),
  evidence_snapshot_hash text not null check (evidence_snapshot_hash ~ '^[a-f0-9]{64}$'),
  correction_model text not null,
  prompt_version text not null,
  role_taxonomy_version text not null,
  correction jsonb not null,
  evidence_bindings jsonb not null default '{}',
  missing_evidence text[] not null default '{}',
  source_run_id uuid references lead_search_run(id) on delete set null,
  hit_count integer not null default 0 check (hit_count >= 0),
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_entity_id, market_country_code, dependency_fingerprint)
);

alter table public_evidence.role_correction_snapshot
  add column if not exists evidence_bindings jsonb not null default '{}';

create index if not exists public_evidence_role_correction_lookup_idx
  on public_evidence.role_correction_snapshot(company_entity_id, market_country_code,
    dependency_fingerprint, updated_at desc);

grant select, insert, update, delete on public_evidence.role_correction_snapshot to network_copilot_app;

comment on table public_evidence.role_correction_snapshot is
  'Versioned public-evidence role decisions. Reuse requires an exact evidence, prompt and taxonomy fingerprint; private user memory is never stored here.';
comment on column public_evidence.role_correction_snapshot.missing_evidence is
  'Explicit unresolved evidence gaps passed downstream so later agents supplement only material missing facts.';
comment on column public_evidence.role_correction_snapshot.evidence_bindings is
  'Maps cached evidence IDs to stable public URL/content hashes so exact evidence can be rebound to current-run IDs.';
