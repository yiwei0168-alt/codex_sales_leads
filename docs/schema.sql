-- Reference Postgres schema for a production extension.
-- The credential-free Demo uses src/data/mexico-snapshot.ts at runtime.

create type channel_layer as enum ('Tier-1 Distributor', 'Downstream Channel');
create type account_tier as enum ('KA', 'Priority', 'Standard', 'Long-tail');
create type supply_model as enum ('Distributor Supply', 'Brand Direct', 'Co-sell/Co-supply', 'TBD');
create type evidence_status as enum ('Verified', 'Corroborated', 'Inferred', 'Unknown', 'Conflicting');

create table brand_profile (
  id uuid primary key,
  name text not null,
  products jsonb not null,
  positioning text,
  price_band text,
  competitors jsonb not null default '[]',
  proof_points jsonb not null default '[]'
);

create table market_workspace (
  id uuid primary key,
  brand_profile_id uuid not null references brand_profile(id),
  market text not null,
  mode text not null,
  objectives jsonb not null,
  language text not null,
  created_at timestamptz not null default now()
);

create table company (
  id uuid primary key,
  legal_name text not null,
  display_name text not null,
  aliases jsonb not null default '[]',
  domain text not null,
  country text not null,
  city text,
  unique (domain)
);

create table channel_node (
  id uuid primary key,
  workspace_id uuid not null references market_workspace(id),
  company_id uuid not null references company(id),
  layer channel_layer not null,
  roles jsonb not null,
  account_tier account_tier not null,
  supply_model supply_model not null,
  brand_involvement text not null,
  manual_overrides jsonb not null default '{}',
  unique (workspace_id, company_id)
);

create table evidence (
  id uuid primary key,
  company_id uuid not null references company(id),
  source_url text not null,
  title text not null,
  source_type text not null,
  captured_at timestamptz not null,
  claim text not null,
  summary text not null,
  status evidence_status not null,
  confidence numeric(5,2) not null check (confidence between 0 and 100)
);

create table node_assessment (
  id uuid primary key,
  node_id uuid not null references channel_node(id),
  role_model text not null,
  fit_score numeric(5,2) not null,
  account_value numeric(5,2) not null,
  reachability numeric(5,2) not null,
  evidence_confidence numeric(5,2) not null,
  reasons jsonb not null,
  risks jsonb not null,
  unknowns jsonb not null,
  rule_version text not null,
  model_version text,
  evidence_ids jsonb not null
);

create table channel_relationship (
  id uuid primary key,
  workspace_id uuid not null references market_workspace(id),
  from_node uuid not null references channel_node(id),
  to_node uuid not null references channel_node(id),
  relationship_type text not null,
  status text not null check (status in ('Verified', 'Hypothesis', 'Rejected')),
  evidence_ids jsonb not null default '[]'
);

create table opportunity (
  id uuid primary key,
  node_id uuid not null references channel_node(id),
  stage text not null,
  priority text not null,
  owner text,
  next_action text,
  manual_overrides jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table development_plan (
  id uuid primary key,
  node_id uuid not null references channel_node(id),
  angle text not null,
  products jsonb not null,
  supply_path supply_model not null,
  steps jsonb not null,
  draft text not null,
  evidence_ids jsonb not null,
  prompt_version text,
  model_version text,
  created_at timestamptz not null default now()
);
