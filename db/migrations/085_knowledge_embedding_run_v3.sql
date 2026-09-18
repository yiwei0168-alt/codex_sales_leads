create table if not exists knowledge_embedding_run_v3 (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references knowledge_release_v3(id) on delete cascade,
  profile_id uuid not null references knowledge_embedding_profile_v3(id),
  status text not null check(status in('running','completed','failed')),
  resume_after uuid,
  input_items integer not null default 0 check(input_items>=0),
  valid_vectors integer not null default 0 check(valid_vectors>=0),
  input_tokens bigint not null default 0 check(input_tokens>=0),
  request_count integer not null default 0 check(request_count>=0),
  retry_count integer not null default 0 check(retry_count>=0),
  latency_ms bigint not null default 0 check(latency_ms>=0),
  cash_cost_status text not null default 'unknown' check(cash_cost_status in('zero','unknown','reported')),
  failure_code text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_embedding_run_v3_release_idx
  on knowledge_embedding_run_v3(release_id,profile_id,created_at desc);

grant select,insert,update on knowledge_embedding_run_v3 to network_copilot_app;
alter table knowledge_embedding_run_v3 enable row level security;
alter table knowledge_embedding_run_v3 force row level security;
drop policy if exists knowledge_embedding_run_v3_acl on knowledge_embedding_run_v3;
create policy knowledge_embedding_run_v3_acl on knowledge_embedding_run_v3 using(exists(
  select 1 from knowledge_release_v3 r where r.id=release_id
    and (r.scope_kind='shared' or r.owner_id=app_current_user_id())))
  with check(app_current_user_role()='admin');
