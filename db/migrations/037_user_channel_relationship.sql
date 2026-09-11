create table if not exists user_channel_relationship (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  country_code text not null,
  from_company_id uuid not null references sales_company(id) on delete cascade,
  to_company_id uuid not null references sales_company(id) on delete cascade,
  relationship_type text not null,
  status text not null check (status in ('pending','user-confirmed','user-rejected','evidence-supported')),
  basis text not null default '',
  source_url text not null default '',
  updated_at timestamptz not null default now(),
  check (from_company_id <> to_company_id),
  unique(workspace_id, country_code, from_company_id, to_company_id, relationship_type)
);
alter table user_channel_relationship enable row level security;
alter table user_channel_relationship force row level security;
drop policy if exists user_channel_relationship_owner on user_channel_relationship;
create policy user_channel_relationship_owner on user_channel_relationship
 using (user_id=app_current_user_id()) with check (user_id=app_current_user_id());
grant select,insert,update,delete on user_channel_relationship to network_copilot_app;
