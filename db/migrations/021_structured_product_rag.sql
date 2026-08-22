create table if not exists product_fact (
  id uuid primary key default gen_random_uuid(),
  model text not null references product_catalog(model) on delete cascade,
  fact_group text not null check (fact_group in (
    'identity', 'wireless', 'network', 'interface', 'protocol', 'management', 'feature'
  )),
  fact_key text not null,
  fact_value text not null,
  normalized_value text not null,
  numeric_value numeric,
  unit text,
  source_file text not null,
  source_authority smallint not null default 5 check (source_authority between 1 and 5),
  evidence_excerpt text not null,
  extraction_method text not null default 'deterministic-catalog-v1',
  verification_status text not null default 'verified'
    check (verification_status in ('verified', 'provisional', 'conflicting')),
  fact_hash text not null,
  search_vector tsvector generated always as (
    to_tsvector('simple', model || ' ' || fact_key || ' ' || fact_value || ' ' || normalized_value)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model, fact_key, normalized_value, source_file)
);

create index if not exists product_fact_model_idx on product_fact(model);
create index if not exists product_fact_key_value_idx on product_fact(fact_key, normalized_value);
create index if not exists product_fact_search_idx on product_fact using gin(search_vector);
create index if not exists product_fact_verified_idx on product_fact(model, source_authority desc)
  where verification_status = 'verified';

alter table product_catalog add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('simple', model || ' ' || product_name || ' ' || category || ' ' || description)
  ) stored;
create index if not exists product_catalog_structured_search_idx
  on product_catalog using gin(search_vector);

-- Product facts are shared. Every tenant may read them, while mutations require
-- an explicitly admin-scoped transaction used by the ingestion pipeline.
grant select, insert, update, delete on product_fact to network_copilot_app;
alter table product_fact enable row level security;
alter table product_fact force row level security;
drop policy if exists product_fact_read on product_fact;
drop policy if exists product_fact_admin_write on product_fact;
create policy product_fact_read on product_fact for select using (true);
create policy product_fact_admin_write on product_fact for all
  using (app_current_user_role() = 'admin')
  with check (app_current_user_role() = 'admin');
