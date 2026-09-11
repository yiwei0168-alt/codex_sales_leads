alter table user_channel_relationship add column if not exists rejected_evidence_hash text;
create table if not exists user_relationship_analysis (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references app_user(id),workspace_id uuid not null references market_workspace(id),
  country_code text not null,from_company_id uuid not null references sales_company(id),to_company_id uuid not null references sales_company(id),
  fingerprint text not null,status text not null check(status in ('running','completed','failed')),result jsonb,metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,country_code,from_company_id,to_company_id,fingerprint)
);
alter table user_relationship_analysis enable row level security;
alter table user_relationship_analysis force row level security;
drop policy if exists relationship_analysis_owner on user_relationship_analysis;
create policy relationship_analysis_owner on user_relationship_analysis using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update on user_relationship_analysis to network_copilot_app;
