create table if not exists company_enrichment_run (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  provider_mix text[] not null default '{}',
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  target_count integer not null check (target_count between 1 and 100),
  processed_count integer not null default 0,
  search_credits_used integer not null default 0,
  extract_credits_used integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists company_enrichment_run_workspace_time_idx
  on company_enrichment_run(workspace_id, started_at desc);

create table if not exists company_web_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references company_enrichment_run(id) on delete cascade,
  company_id uuid not null references sales_company(id) on delete cascade,
  provider text not null,
  source_kind text not null check (source_kind in ('official-website', 'web-search', 'contact-platform')),
  url text not null,
  title text not null,
  excerpt text not null default '',
  provider_score real,
  captured_at timestamptz not null default now(),
  unique (run_id, company_id, url)
);

create index if not exists company_web_evidence_company_idx
  on company_web_evidence(company_id, captured_at desc);

create table if not exists company_contact (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references sales_company(id) on delete cascade,
  full_name text not null,
  job_title text,
  public_profile_url text,
  source_url text not null,
  source_provider text not null,
  status text not null check (status in ('Public', 'Verified', 'Inferred')),
  confidence integer not null check (confidence between 0 and 100),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (company_id, full_name, source_url)
);

create table if not exists company_email_candidate (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references sales_company(id) on delete cascade,
  contact_id uuid references company_contact(id) on delete set null,
  email text not null,
  status text not null check (status in ('Public', 'Verified', 'Pattern-guessed', 'Unknown', 'Invalid')),
  source_url text,
  source_provider text not null,
  derivation text,
  confidence integer not null check (confidence between 0 and 100),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (company_id, email)
);

create index if not exists company_email_candidate_company_status_idx
  on company_email_candidate(company_id, status);
