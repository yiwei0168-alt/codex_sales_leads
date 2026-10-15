-- MA24 evaluation runs are claimed only by an explicitly admitted, dedicated
-- runner. Never scan the evaluation queue or reclaim a lost lease implicitly.
create or replace function claim_ma24_evaluation_run(p_run_id uuid, p_worker text)
returns table(id uuid,user_id uuid,lease_token uuid)
language sql security definer set search_path=pg_catalog,public as $$
  update public.agent_run r set status='running',worker_id=left(p_worker,120),
    lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
  where p_worker is not null and length(trim(p_worker))>0 and r.id=p_run_id
    and r.status='queued' and r.next_attempt_at<=now()
    and r.execution_kind='main-agent-evaluation'
    and r.execution_version='main-agent-v1'
    and r.execution_spec->>'schema'='ma24-evaluation-run-v1'
    and exists (select 1 from public.app_user u where u.id=r.user_id and u.status='active')
  returning r.id,r.user_id,r.lease_token;
$$;
revoke all on function claim_ma24_evaluation_run(uuid,text) from public;
grant execute on function claim_ma24_evaluation_run(uuid,text) to network_copilot_app;
