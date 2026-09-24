alter table agent_memory_observation add column if not exists memory_key text;
alter table agent_memory_observation add column if not exists idempotency_key text;
create unique index if not exists agent_memory_observation_idempotency_idx
  on agent_memory_observation(owner_id,idempotency_key) where idempotency_key is not null;
create index if not exists agent_memory_observation_key_idx
  on agent_memory_observation(owner_id,kind,memory_key,recorded_at desc) where memory_key is not null;
create table if not exists agent_memory_conflict (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_user(id),
  earlier_id uuid not null references agent_memory_observation(id),
  later_id uuid not null references agent_memory_observation(id),
  status text not null default 'open' check(status in('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(earlier_id,later_id),
  check(earlier_id<>later_id)
);
create table if not exists agent_memory_notice (
  observation_id uuid primary key references agent_memory_observation(id),
  owner_id uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create or replace function enforce_memory_review_owner() returns trigger language plpgsql as $$
begin
  if tg_table_name='agent_memory_conflict' then
    if not exists(select 1 from agent_memory_observation m where m.id=new.earlier_id and m.owner_id=new.owner_id)
       or not exists(select 1 from agent_memory_observation m where m.id=new.later_id and m.owner_id=new.owner_id) then
      raise exception 'memory conflict owner mismatch';
    end if;
  elsif not exists(select 1 from agent_memory_observation m where m.id=new.observation_id and m.owner_id=new.owner_id) then
    raise exception 'memory notice owner mismatch';
  end if;
  return new;
end $$;
drop trigger if exists agent_memory_conflict_owner_check on agent_memory_conflict;
create trigger agent_memory_conflict_owner_check before insert or update on agent_memory_conflict
  for each row execute function enforce_memory_review_owner();
drop trigger if exists agent_memory_notice_owner_check on agent_memory_notice;
create trigger agent_memory_notice_owner_check before insert or update on agent_memory_notice
  for each row execute function enforce_memory_review_owner();
grant select,insert on agent_memory_conflict,agent_memory_notice to network_copilot_app;
grant update(status,resolved_at) on agent_memory_conflict to network_copilot_app;
grant update(read_at) on agent_memory_notice to network_copilot_app;
alter table agent_memory_conflict enable row level security;
alter table agent_memory_conflict force row level security;
drop policy if exists agent_memory_conflict_owner on agent_memory_conflict;
create policy agent_memory_conflict_owner on agent_memory_conflict for all
  using(owner_id=app_current_user_id()) with check(owner_id=app_current_user_id());
alter table agent_memory_notice enable row level security;
alter table agent_memory_notice force row level security;
drop policy if exists agent_memory_notice_owner on agent_memory_notice;
create policy agent_memory_notice_owner on agent_memory_notice for all
  using(owner_id=app_current_user_id()) with check(owner_id=app_current_user_id());
