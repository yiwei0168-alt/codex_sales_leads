create table if not exists product_catalog (
  model text primary key,
  product_name text not null,
  category text not null,
  description text not null default '',
  brand text not null default 'Cudy Technology',
  lifecycle_status text not null default 'unknown',
  datasheet_version text,
  source_file text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_catalog_category_idx on product_catalog(category);
create index if not exists product_catalog_name_idx on product_catalog using gin(to_tsvector('simple', product_name || ' ' || description));

update knowledge_collection
set embedding_model = 'text-embedding-v4', embedding_dimensions = 1536, updated_at = now()
where slug in ('industry', 'company', 'product');
