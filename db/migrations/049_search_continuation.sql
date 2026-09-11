create table if not exists lead_search_continuation (
  user_id uuid not null references app_user(id),
  parent_action_id uuid primary key references assistant_action(id) on delete cascade,
  child_action_id uuid not null unique references assistant_action(id) on delete cascade,
  root_action_id uuid not null references assistant_action(id) on delete cascade,
  depth smallint not null check(depth between 1 and 3),
  excluded_domains text[] not null check(cardinality(excluded_domains)<=5000),
  created_at timestamptz not null default now(),
  check(parent_action_id<>child_action_id)
);
alter table lead_search_continuation enable row level security;
alter table lead_search_continuation force row level security;
drop policy if exists search_continuation_owner on lead_search_continuation;
create policy search_continuation_owner on lead_search_continuation
  using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert on lead_search_continuation to network_copilot_app;
