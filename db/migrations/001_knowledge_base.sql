create extension if not exists vector;
create extension if not exists pgcrypto;

do $$ begin
  create type knowledge_base_type as enum ('industry', 'company', 'product');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type knowledge_document_status as enum ('draft', 'active', 'archived', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists knowledge_collection (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  base_type knowledge_base_type not null,
  embedding_model text not null default 'text-embedding-3-small',
  embedding_dimensions integer not null default 1536,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_document (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references knowledge_collection(id) on delete cascade,
  external_id text not null,
  title text not null,
  source_url text,
  source_type text not null,
  authority_level smallint not null default 2 check (authority_level between 1 and 5),
  language text not null default 'zh-CN',
  market text,
  company_id text,
  product_id text,
  content_sha256 text not null,
  metadata jsonb not null default '{}',
  status knowledge_document_status not null default 'active',
  captured_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, external_id)
);

create table if not exists knowledge_chunk (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_document(id) on delete cascade,
  chunk_index integer not null,
  heading_path text[] not null default '{}',
  content text not null,
  token_estimate integer not null,
  content_sha256 text not null,
  embedding vector(1536),
  search_vector tsvector generated always as (to_tsvector('simple', content)) stored,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists rag_query_log (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  collection_slugs text[] not null,
  filters jsonb not null default '{}',
  retrieved_chunk_ids uuid[] not null default '{}',
  answer text,
  embedding_model text,
  generation_model text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_document_collection_idx on knowledge_document(collection_id);
create index if not exists knowledge_document_company_idx on knowledge_document(company_id) where company_id is not null;
create index if not exists knowledge_document_product_idx on knowledge_document(product_id) where product_id is not null;
create index if not exists knowledge_document_market_idx on knowledge_document(market) where market is not null;
create index if not exists knowledge_chunk_search_idx on knowledge_chunk using gin(search_vector);
create index if not exists knowledge_chunk_embedding_idx on knowledge_chunk using hnsw (embedding vector_cosine_ops);

insert into knowledge_collection (slug, name, description, base_type)
values
  ('industry', '行业知识库', '用户上传的行业知识、渠道结构、主要品牌与市场研究', 'industry'),
  ('company', 'Cudy Technology 公司知识库', '用户上传的公司简介、产品线、当前业务、战略与经营资料', 'company'),
  ('product', 'Cudy Technology 产品知识库', '用户上传的产品资料、技术规格、兼容性、认证与使用限制', 'product')
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();
