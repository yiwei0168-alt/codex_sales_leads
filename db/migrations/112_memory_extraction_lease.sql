alter table agent_memory_extraction_job add column if not exists lease_token uuid;
alter table agent_memory_extraction_job add column if not exists next_attempt_at timestamptz not null default now();
grant update(lease_token,next_attempt_at) on agent_memory_extraction_job to network_copilot_app;
create index if not exists agent_memory_extraction_job_due_idx
  on agent_memory_extraction_job(owner_id,next_attempt_at,created_at)
  where status='queued';

-- Server worker receives only account/run receipts; tenant RLS still protects source reads.
create or replace function next_local_memory_extraction_job()
returns table(owner_id uuid,run_id uuid)
language sql security definer set search_path=pg_catalog,public as $$
  select j.owner_id,j.run_id from public.agent_memory_extraction_job j
  join public.app_user u on u.id=j.owner_id and u.status='active'
  where (j.status='queued' and j.next_attempt_at<=now())
    or (j.status='processing' and j.updated_at<now()-interval '5 minutes')
  order by j.created_at limit 1;
$$;
revoke all on function next_local_memory_extraction_job() from public;
grant execute on function next_local_memory_extraction_job() to network_copilot_app;
