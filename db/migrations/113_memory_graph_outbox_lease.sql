alter table agent_memory_graph_outbox add column if not exists lease_token uuid;
alter table agent_memory_graph_outbox add column if not exists leased_at timestamptz;
alter table agent_memory_graph_outbox add column if not exists next_attempt_at timestamptz not null default now();
grant update(lease_token,leased_at,next_attempt_at) on agent_memory_graph_outbox to network_copilot_app;
create index if not exists agent_memory_graph_outbox_due_idx
  on agent_memory_graph_outbox(next_attempt_at,created_at) where delivered_at is null;

-- Only account and observation receipts leave this function. The worker must
-- claim and read the observation through its account RLS transaction.
create or replace function next_memory_graph_outbox()
returns table(owner_id uuid,observation_id uuid)
language sql security definer set search_path=pg_catalog,public as $$
  select m.owner_id,o.observation_id
  from public.agent_memory_graph_outbox o
  join public.agent_memory_observation m on m.id=o.observation_id
  join public.app_user u on u.id=m.owner_id and u.status='active'
  where o.delivered_at is null and o.next_attempt_at<=now()
    and (o.lease_token is null or o.leased_at<now()-interval '5 minutes')
  order by o.created_at limit 1;
$$;
revoke all on function next_memory_graph_outbox() from public;
grant execute on function next_memory_graph_outbox() to network_copilot_app;
