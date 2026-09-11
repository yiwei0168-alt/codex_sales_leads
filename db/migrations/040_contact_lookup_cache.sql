create table if not exists user_contact_lookup_cache (
  user_id uuid not null references app_user(id),
  company_id uuid not null references sales_company(id),
  provider text not null,
  status text not null check(status in ('running','completed','unknown')),
  result jsonb,
  run_id uuid not null references company_enrichment_run(id),
  updated_at timestamptz not null default now(),
  primary key(user_id,company_id,provider)
);
alter table user_contact_lookup_cache enable row level security;
alter table user_contact_lookup_cache force row level security;
drop policy if exists contact_lookup_owner on user_contact_lookup_cache;
create policy contact_lookup_owner on user_contact_lookup_cache
  using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update on user_contact_lookup_cache to network_copilot_app;
