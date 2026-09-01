create table if not exists lead_search_provider_call (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references lead_search_run(id) on delete cascade,
  query_id uuid references lead_search_query(id) on delete set null,
  provider text not null,
  engine text not null,
  mechanism text not null,
  search_category text not null,
  search_track text not null,
  trigger_kind text not null,
  invocation_reason text not null,
  status text not null check (status in ('running', 'completed', 'failed', 'skipped')),
  input_query_count integer not null default 1 check (input_query_count >= 0),
  input_characters integer not null default 0 check (input_characters >= 0),
  raw_result_count integer not null default 0 check (raw_result_count >= 0),
  normalized_company_count integer not null default 0 check (normalized_company_count >= 0),
  new_unique_company_count integer not null default 0 check (new_unique_company_count >= 0),
  existing_company_hit_count integer not null default 0 check (existing_company_hit_count >= 0),
  rejected_result_count integer not null default 0 check (rejected_result_count >= 0),
  paid_search_credits numeric(12,4) not null default 0 check (paid_search_credits >= 0),
  model_input_tokens integer not null default 0 check (model_input_tokens >= 0),
  model_output_tokens integer not null default 0 check (model_output_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  fallback_used boolean not null default false,
  discarded_reason_counts jsonb not null default '{}',
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists lead_search_provider_call_run_idx
  on lead_search_provider_call(run_id, search_category, search_track, started_at);

create table if not exists lead_search_provider_occurrence (
  id uuid primary key default gen_random_uuid(),
  occurrence_key text not null unique,
  run_id uuid not null references lead_search_run(id) on delete cascade,
  provider_call_id uuid not null references lead_search_provider_call(id) on delete cascade,
  candidate_key text,
  url text,
  domain text,
  external_id text,
  rank integer not null check (rank >= 1),
  source_kind text not null,
  normalized boolean not null default false,
  first_discovery boolean not null default false,
  rejection_reason text,
  gate_status text check (gate_status is null or gate_status in ('pass', 'hold', 'reject')),
  final_primary_role text,
  final_eligibility text,
  final_score numeric(5,2),
  displayed boolean,
  selected boolean,
  downstream_used boolean,
  discovery_credit numeric(8,6),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists lead_search_provider_occurrence_run_candidate_idx
  on lead_search_provider_occurrence(run_id, candidate_key);
create index if not exists lead_search_provider_occurrence_call_idx
  on lead_search_provider_occurrence(provider_call_id);

grant select, insert, update, delete on lead_search_provider_call, lead_search_provider_occurrence
  to network_copilot_app;

comment on table lead_search_provider_call is
  'Aggregate per-call hybrid-search inputs, yield, cost, latency, retries and discard reasons; contains no credentials or raw provider response.';
comment on table lead_search_provider_occurrence is
  'Per-provider candidate occurrence used for first, unique, assisted and fractional discovery contribution plus downstream quality writeback.';
