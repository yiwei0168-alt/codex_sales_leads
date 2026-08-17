create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into app_user (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@network-copilot.local', 'Workspace Owner')
on conflict (id) do nothing;

create table if not exists app_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  token_sha256 text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists app_session_expiry_idx on app_session(expires_at);

create table if not exists auth_login_attempt (
  id bigserial primary key,
  ip_sha256 text not null,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_login_attempt_ip_time_idx on auth_login_attempt(ip_sha256, created_at desc);

create table if not exists market_workspace (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_user(id),
  slug text not null unique,
  name text not null,
  market text not null,
  country_code char(2) not null,
  mode text not null default 'new-market' check (mode in ('new-market', 'growth')),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  objective text not null default '',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into market_workspace (id, owner_id, slug, name, market, country_code, objective)
values (
  '00000000-0000-4000-8000-000000000100',
  '00000000-0000-4000-8000-000000000001',
  'mexico-pilot',
  'Mexico Market Pilot',
  'Mexico',
  'MX',
  'Discover and develop all qualified Cudy Technology sales leads in Mexico.'
)
on conflict (id) do update set objective = excluded.objective, updated_at = now();

create table if not exists sales_company (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  canonical_name text not null,
  domain text not null,
  country_code char(2) not null,
  city text,
  source_kind text not null default 'public-snapshot',
  record jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sales_company_domain_idx on sales_company(lower(domain));

create table if not exists workspace_company (
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  company_id uuid not null references sales_company(id) on delete cascade,
  account_tier text not null,
  supply_model text not null,
  brand_involvement text not null,
  opportunity_stage text not null,
  priority text not null,
  owner_name text,
  next_action text,
  manually_edited boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, company_id)
);

create index if not exists workspace_company_stage_idx on workspace_company(workspace_id, opportunity_stage);

create table if not exists lead_search_run (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  provider text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  target_count integer not null check (target_count between 1 and 500),
  query_count integer not null default 0,
  raw_result_count integer not null default 0,
  unique_candidate_count integer not null default 0,
  accepted_count integer not null default 0,
  credits_used integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists lead_search_run_workspace_time_idx on lead_search_run(workspace_id, started_at desc);

create table if not exists lead_search_query (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references lead_search_run(id) on delete cascade,
  query_text text not null,
  role_hint text not null,
  lead_type text not null check (lead_type in ('channel', 'strategic-customer')),
  language text not null,
  region text not null default 'Mexico',
  result_count integer not null default 0,
  credits_used integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists lead_search_result (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references lead_search_run(id) on delete cascade,
  query_id uuid not null references lead_search_query(id) on delete cascade,
  url text not null,
  domain text not null,
  title text not null,
  snippet text not null default '',
  provider_score real,
  accepted boolean not null default false,
  rejection_reason text,
  captured_at timestamptz not null default now(),
  unique (run_id, url)
);

create index if not exists lead_search_result_domain_idx on lead_search_result(run_id, domain);

create table if not exists workspace_audit_event (
  id bigserial primary key,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  actor_user_id uuid not null references app_user(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  changes jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists workspace_audit_event_workspace_time_idx on workspace_audit_event(workspace_id, created_at desc);
