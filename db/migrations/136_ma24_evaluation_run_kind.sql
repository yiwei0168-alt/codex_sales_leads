-- Independent MA24 runs use the same scoped Agent graph without entering
-- ordinary conversation memory extraction or Skill shadow capture.
alter table agent_run drop constraint if exists agent_run_execution_kind_check;
alter table agent_run add constraint agent_run_execution_kind_check
  check(execution_kind in ('main-agent','mail','main-agent-evaluation'));

-- The ordinary worker must never pick up an evaluation row before the
-- independent corpus, build and paid-call admission are bound by a dedicated
-- evaluation runner. Its claim path is intentionally absent for now.
create or replace function claim_next_agent_run(p_worker text)
returns table(id uuid,user_id uuid,lease_token uuid)
language sql security definer set search_path=pg_catalog,public as $$
  update public.agent_run r set status='running',worker_id=left(p_worker,120),
    lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
  where r.id=(select q.id from public.agent_run q join public.app_user u on u.id=q.user_id
    where u.status='active' and q.execution_version='main-agent-v1'
      and q.execution_kind in ('main-agent','mail')
      and ((q.status='queued' and q.next_attempt_at<=now()) or (q.status='running' and q.lease_until<now()))
    order by q.created_at for update of q skip locked limit 1)
  returning r.id,r.user_id,r.lease_token;
$$;
revoke all on function claim_next_agent_run(text) from public;
grant execute on function claim_next_agent_run(text) to network_copilot_app;
