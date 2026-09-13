-- A workspace's objective, metadata and mode are private to its owner.
alter table market_workspace enable row level security;
alter table market_workspace force row level security;
drop policy if exists market_workspace_owner on market_workspace;
create policy market_workspace_owner on market_workspace
  using (owner_id=app_current_user_id())
  with check (owner_id=app_current_user_id());
