create table if not exists knowledge_reindex_job(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  generation_id uuid references knowledge_index_generation(id),
  mode text not null check(mode in('dry-run','activate','rollback')),
  status text not null check(status in('planned','running','completed','failed')),
  batch_size integer not null check(batch_size between 1 and 1000),
  resume_after text,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_reindex_job_user_created_idx on knowledge_reindex_job(user_id,created_at desc);
grant select,insert,update on knowledge_reindex_job to network_copilot_app;
alter table knowledge_reindex_job enable row level security;
alter table knowledge_reindex_job force row level security;
drop policy if exists knowledge_reindex_job_acl on knowledge_reindex_job;
create policy knowledge_reindex_job_acl on knowledge_reindex_job
  using(user_id=app_current_user_id())
  with check(user_id=app_current_user_id() and app_current_user_role()='admin');
