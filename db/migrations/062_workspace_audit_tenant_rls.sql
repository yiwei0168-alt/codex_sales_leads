-- Workspace audit changes may contain private strategy, contact and mail metadata.
-- Application readers see only the owning workspace; writers must be the actor.
alter table workspace_audit_event enable row level security;
alter table workspace_audit_event force row level security;
drop policy if exists workspace_audit_event_owner on workspace_audit_event;
create policy workspace_audit_event_owner on workspace_audit_event
  using (exists(select 1 from market_workspace w
    where w.id=workspace_id and w.owner_id=app_current_user_id()))
  with check (actor_user_id=app_current_user_id() and exists(select 1 from market_workspace w
    where w.id=workspace_id and w.owner_id=app_current_user_id()));
