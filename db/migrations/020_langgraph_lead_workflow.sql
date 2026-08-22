alter table lead_search_run add column if not exists graph_thread_id text;
alter table lead_search_run add column if not exists workflow_phase text;
alter table lead_search_run add column if not exists rag_chunk_ids uuid[] not null default '{}';
create index if not exists lead_search_run_graph_thread_idx on lead_search_run(graph_thread_id);

create table if not exists lead_workflow_job (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  action_id uuid not null unique references assistant_action(id) on delete cascade,
  graph_thread_id text not null unique,
  execution_mode text not null default 'inline' check (execution_mode in ('inline', 'worker')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  phase text not null default 'queued',
  attempts integer not null default 0 check (attempts between 0 and 20),
  worker_id text,
  lease_until timestamptz,
  result jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists lead_workflow_job_claim_idx on lead_workflow_job(status, lease_until, created_at);

create table if not exists lead_candidate_assessment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  run_id uuid not null references lead_search_run(id) on delete cascade,
  candidate_id text not null,
  company_name text not null,
  domain text not null,
  official_website_url text not null,
  roles text[] not null default '{}',
  primary_role text,
  eligible boolean not null,
  total_score integer not null check (total_score between 0 and 100),
  confidence integer not null check (confidence between 0 and 100),
  gates jsonb not null,
  dimensions jsonb not null,
  account_tier text not null,
  supply_model text not null,
  brand_involvement text not null,
  summary text not null,
  reasons text[] not null default '{}',
  risks text[] not null default '{}',
  unknowns text[] not null default '{}',
  evidence jsonb not null default '[]',
  evidence_ids text[] not null default '{}',
  model text not null,
  prompt_version text not null,
  escalated boolean not null default false,
  warnings text[] not null default '{}',
  selected boolean not null default false,
  selected_rank integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, candidate_id)
);
create index if not exists lead_candidate_assessment_run_score_idx
  on lead_candidate_assessment(run_id, selected desc, total_score desc);
create index if not exists lead_candidate_assessment_user_domain_idx
  on lead_candidate_assessment(user_id, domain, updated_at desc);

grant select, insert, update, delete on lead_workflow_job, lead_candidate_assessment to network_copilot_app;

alter table lead_workflow_job enable row level security;
alter table lead_workflow_job force row level security;
drop policy if exists lead_workflow_job_tenant on lead_workflow_job;
create policy lead_workflow_job_tenant on lead_workflow_job
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table lead_candidate_assessment enable row level security;
alter table lead_candidate_assessment force row level security;
drop policy if exists lead_candidate_assessment_tenant on lead_candidate_assessment;
create policy lead_candidate_assessment_tenant on lead_candidate_assessment
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

create or replace function claim_next_lead_workflow_job(p_worker_id text, p_lease_seconds integer default 1800)
returns table (job_id uuid, user_id uuid, action_id uuid, graph_thread_id text)
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.lead_workflow_job job
     set status = 'running', worker_id = left(p_worker_id, 120),
         lease_until = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 7200))),
         attempts = attempts + 1, started_at = coalesce(started_at, now()), updated_at = now()
   where job.id = (
     select queued.id from public.lead_workflow_job queued
      where queued.attempts < 20 and (
        queued.status = 'queued'
        or (queued.status = 'running' and queued.lease_until < now())
      )
      order by queued.created_at
      for update skip locked
      limit 1
   )
  returning job.id, job.user_id, job.action_id, job.graph_thread_id;
$$;
revoke all on function claim_next_lead_workflow_job(text, integer) from public;
grant execute on function claim_next_lead_workflow_job(text, integer) to network_copilot_app;
