create table if not exists task_spend_limit (
  user_id uuid not null references app_user(id),
  action_id uuid not null references assistant_action(id) on delete cascade,
  limit_micros bigint not null check(limit_micros between 0 and 1000000000000),
  updated_at timestamptz not null default now(),primary key(user_id,action_id)
);
create table if not exists spend_budget_change (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references app_user(id),
  operation_id text,previous_limit_micros bigint check(previous_limit_micros between 0 and 1000000000000),new_limit_micros bigint not null check(new_limit_micros between 0 and 1000000000000),
  metrics jsonb not null,created_at timestamptz not null default now()
);
alter table task_spend_limit enable row level security;
alter table task_spend_limit force row level security;
alter table spend_budget_change enable row level security;
alter table spend_budget_change force row level security;
drop policy if exists task_spend_owner on task_spend_limit;
create policy task_spend_owner on task_spend_limit using(user_id=app_current_user_id()) with check(user_id=app_current_user_id() and exists(select 1 from assistant_action a where a.id=action_id and a.user_id=app_current_user_id()));
drop policy if exists spend_change_owner on spend_budget_change;
create policy spend_change_owner on spend_budget_change using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update on task_spend_limit to network_copilot_app;
grant select,insert on spend_budget_change to network_copilot_app;
