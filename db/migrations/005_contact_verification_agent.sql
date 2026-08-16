create table if not exists contact_verification_run (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  mode text not null default 'shadow' check (mode in ('shadow', 'assisted', 'automatic')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  routine_model text not null,
  escalation_model text not null,
  prompt_version text not null,
  target_count integer not null check (target_count between 1 and 50),
  processed_count integer not null default 0,
  escalated_count integer not null default 0,
  model_call_count integer not null default 0,
  total_tokens integer not null default 0,
  timeout_ms integer not null check (timeout_ms between 1000 and 120000),
  max_calls_per_contact integer not null default 2 check (max_calls_per_contact between 1 and 2),
  error_message text,
  metadata jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists contact_verification_run_workspace_time_idx
  on contact_verification_run(workspace_id, started_at desc);

create table if not exists contact_model_assessment (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references contact_verification_run(id) on delete cascade,
  company_id uuid not null references sales_company(id) on delete cascade,
  email_candidate_id uuid not null references company_email_candidate(id) on delete cascade,
  sequence_number integer not null check (sequence_number between 1 and 2),
  provider text not null,
  model_version text not null,
  prompt_version text not null,
  provider_request_id text,
  latency_ms integer not null check (latency_ms >= 0),
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  total_tokens integer not null default 0,
  output jsonb not null,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (run_id, email_candidate_id, sequence_number)
);

create table if not exists contact_verification_decision (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references contact_verification_run(id) on delete cascade,
  company_id uuid not null references sales_company(id) on delete cascade,
  contact_id uuid references company_contact(id) on delete set null,
  email_candidate_id uuid not null references company_email_candidate(id) on delete cascade,
  shadow boolean not null default true,
  category text not null check (category in ('Official', 'HighConfidence', 'NeedsReview')),
  lifecycle_status text not null check (lifecycle_status in ('Active', 'Invalid')),
  contact_type text not null check (contact_type in ('GeneralMailbox', 'NamedPerson', 'Unknown')),
  confidence_score integer not null check (confidence_score between 0 and 100),
  role_relevance_score integer not null check (role_relevance_score between 0 and 100),
  reachability_score integer not null check (reachability_score between 0 and 100),
  development_priority integer not null check (development_priority between 0 and 100),
  employment_status text not null,
  email_evidence_status text not null,
  delivery_status text not null,
  matched_rule_ids text[] not null default '{}',
  evidence_ids uuid[] not null default '{}',
  reasons text[] not null default '{}',
  review_flags text[] not null default '{}',
  decided_at timestamptz not null,
  unique (run_id, email_candidate_id)
);

create index if not exists contact_verification_decision_company_idx
  on contact_verification_decision(company_id, decided_at desc);

create table if not exists contact_review_queue (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references contact_verification_decision(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'deferred')),
  priority integer not null check (priority between 0 and 100),
  review_flags text[] not null default '{}',
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
