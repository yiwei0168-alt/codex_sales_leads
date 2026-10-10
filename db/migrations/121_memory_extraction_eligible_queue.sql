-- Ineligible historical jobs remain available for audit but cannot starve runnable jobs.
create or replace function next_local_memory_extraction_job()
returns table(owner_id uuid,run_id uuid)
language sql security definer set search_path=pg_catalog,public as $$
  select j.owner_id,j.run_id from public.agent_memory_extraction_job j
  join public.app_user u on u.id=j.owner_id and u.status='active'
  join public.agent_run r on r.id=j.run_id and r.user_id=j.owner_id
    and r.status='completed' and r.execution_kind='main-agent'
  where ((j.status='queued' and j.next_attempt_at<=now())
    or (j.status='processing' and j.updated_at<now()-interval '5 minutes'))
  order by j.next_attempt_at,j.created_at,j.run_id limit 1;
$$;
revoke all on function next_local_memory_extraction_job() from public;
grant execute on function next_local_memory_extraction_job() to network_copilot_app;
