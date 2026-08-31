create table if not exists workflow_stage_metric (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  lead_run_id uuid references lead_search_run(id) on delete cascade,
  action_id uuid references assistant_action(id) on delete set null,
  graph_thread_id text not null,
  workflow_key text not null,
  workflow_version text not null,
  stage text not null,
  status text not null check (status in ('completed', 'failed', 'cache-hit')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  input_items integer not null default 0 check (input_items >= 0),
  input_bytes integer not null default 0 check (input_bytes >= 0),
  output_items integer not null default 0 check (output_items >= 0),
  output_bytes integer not null default 0 check (output_bytes >= 0),
  paid_search_credits numeric(12,4) not null default 0 check (paid_search_credits >= 0),
  generated_artifacts integer not null default 0 check (generated_artifacts >= 0),
  valid_artifacts integer not null default 0 check (valid_artifacts >= 0),
  downstream_used_artifacts integer not null default 0 check (downstream_used_artifacts >= 0),
  dependency_fingerprint text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists workflow_model_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  lead_run_id uuid references lead_search_run(id) on delete cascade,
  action_id uuid references assistant_action(id) on delete set null,
  graph_thread_id text not null,
  stage text not null,
  requested_model text not null,
  actual_model text not null,
  provider_id text,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  fallback_used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists workflow_artifact_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  lead_run_id uuid references lead_search_run(id) on delete cascade,
  action_id uuid references assistant_action(id) on delete set null,
  graph_thread_id text not null,
  stage text not null,
  artifact_type text not null,
  event_type text not null check (event_type in (
    'generated', 'valid', 'retrieved', 'cited', 'decision-used', 'displayed', 'selected', 'edited', 'executed'
  )),
  artifact_count integer not null check (artifact_count >= 0),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists workflow_optimization_opportunity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  lead_run_id uuid references lead_search_run(id) on delete cascade,
  workflow_key text not null,
  stage text not null,
  opportunity_key text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  observation text not null,
  recommended_action text not null,
  evidence jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'accepted', 'testing', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_run_id, stage, opportunity_key)
);

create index if not exists workflow_stage_metric_run_idx on workflow_stage_metric(lead_run_id, stage, created_at);
create index if not exists workflow_model_usage_run_idx on workflow_model_usage(lead_run_id, stage, created_at);
create index if not exists workflow_artifact_event_run_idx on workflow_artifact_event(lead_run_id, event_type, stage);
create index if not exists workflow_optimization_open_idx on workflow_optimization_opportunity(workspace_id, status, severity, created_at desc);

alter table workflow_stage_metric enable row level security;
alter table workflow_stage_metric force row level security;
drop policy if exists workflow_stage_metric_tenant on workflow_stage_metric;
create policy workflow_stage_metric_tenant on workflow_stage_metric
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
alter table workflow_model_usage enable row level security;
alter table workflow_model_usage force row level security;
drop policy if exists workflow_model_usage_tenant on workflow_model_usage;
create policy workflow_model_usage_tenant on workflow_model_usage
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
alter table workflow_artifact_event enable row level security;
alter table workflow_artifact_event force row level security;
drop policy if exists workflow_artifact_event_tenant on workflow_artifact_event;
create policy workflow_artifact_event_tenant on workflow_artifact_event
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
alter table workflow_optimization_opportunity enable row level security;
alter table workflow_optimization_opportunity force row level security;
drop policy if exists workflow_optimization_opportunity_tenant on workflow_optimization_opportunity;
create policy workflow_optimization_opportunity_tenant on workflow_optimization_opportunity
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

grant select, insert, update, delete on workflow_stage_metric, workflow_model_usage,
  workflow_artifact_event, workflow_optimization_opportunity to network_copilot_app;

comment on table workflow_stage_metric is
  'Private per-tenant stage efficiency telemetry. Stores counts, byte sizes, fingerprints and costs, never prompt or artifact bodies.';
comment on table workflow_optimization_opportunity is
  'Automatically detected cost/usage optimization candidates for later human review; no optimization is applied automatically.';
