-- A completed task queues local learning by receipt ID. No message body is copied here.
create table if not exists agent_memory_extraction_job (
  owner_id uuid not null,
  run_id uuid not null,
  status text not null default 'queued' check(status in('queued','processing','ready','failed')),
  attempt_count integer not null default 0 check(attempt_count>=0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(owner_id,run_id),
  foreign key(owner_id,run_id) references agent_run(user_id,id)
);
create index if not exists agent_memory_extraction_job_queue_idx
  on agent_memory_extraction_job(status,created_at) where status in('queued','processing');
grant select,insert on agent_memory_extraction_job to network_copilot_app;
grant update(status,attempt_count,error_code,updated_at) on agent_memory_extraction_job to network_copilot_app;
alter table agent_memory_extraction_job enable row level security;
alter table agent_memory_extraction_job force row level security;
drop policy if exists agent_memory_extraction_job_owner on agent_memory_extraction_job;
create policy agent_memory_extraction_job_owner on agent_memory_extraction_job for all
  using(owner_id=app_current_user_id()) with check(owner_id=app_current_user_id());
