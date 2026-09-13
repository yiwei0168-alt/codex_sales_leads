-- Company membership and account fields belong to the owning workspace.
alter table workspace_company enable row level security;
alter table workspace_company force row level security;
drop policy if exists workspace_company_owner on workspace_company;
create policy workspace_company_owner on workspace_company
  using (exists(select 1 from market_workspace w
    where w.id=workspace_id and w.owner_id=app_current_user_id()))
  with check (exists(select 1 from market_workspace w
    where w.id=workspace_id and w.owner_id=app_current_user_id()));
