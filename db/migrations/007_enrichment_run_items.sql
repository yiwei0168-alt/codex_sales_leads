create table if not exists company_enrichment_run_item (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references company_enrichment_run(id) on delete cascade,
  company_id uuid not null references sales_company(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  phase text not null default 'queued'
    check (phase in ('queued', 'official-search', 'contact-search', 'email-search', 'extract', 'persist', 'completed', 'failed')),
  worker_id text,
  attempts integer not null default 0 check (attempts between 0 and 10),
  named_contact_count integer not null default 0,
  email_count integer not null default 0,
  search_credits_used integer not null default 0,
  extract_credits_used integer not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (run_id, company_id)
);

create index if not exists company_enrichment_run_item_run_status_idx
  on company_enrichment_run_item(run_id, status, updated_at desc);

create index if not exists company_enrichment_run_item_company_idx
  on company_enrichment_run_item(company_id, updated_at desc);
