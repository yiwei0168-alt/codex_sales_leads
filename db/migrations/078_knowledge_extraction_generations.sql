create table if not exists knowledge_index_generation(
  id uuid primary key default gen_random_uuid(), name text not null unique,
  status text not null check(status in('building','validated','active','failed')),
  extractor_version text not null, embedding_model text, embedding_dimensions integer,
  created_at timestamptz not null default now(), activated_at timestamptz, failure_reason text
);
create table if not exists knowledge_source_revision(
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references knowledge_asset(id) on delete cascade,
  generation_id uuid not null references knowledge_index_generation(id), source_sha256 text not null,
  extractor_version text not null, artifact_sha256 text not null, quality_summary jsonb not null,
  created_at timestamptz not null default now(), unique(asset_id,generation_id,source_sha256,extractor_version)
);
create table if not exists knowledge_chunk_v2(
  id uuid primary key default gen_random_uuid(), document_id uuid not null references knowledge_document(id) on delete cascade,
  source_revision_id uuid not null references knowledge_source_revision(id), generation_id uuid not null references knowledge_index_generation(id),
  chunk_index integer not null, parent_key text, block_type text not null, source_location jsonb not null,
  heading_path text[] not null default '{}', content text not null, normalized_text text,
  token_estimate integer not null, content_sha256 text not null, embedding vector(1536), metadata jsonb not null default '{}',
  unique(document_id,generation_id,chunk_index)
);
alter table knowledge_document add column if not exists active_generation_id uuid references knowledge_index_generation(id);
create index if not exists knowledge_chunk_v2_generation_idx on knowledge_chunk_v2(generation_id,document_id);
grant select,insert,update,delete on knowledge_index_generation,knowledge_source_revision,knowledge_chunk_v2 to network_copilot_app;
alter table knowledge_index_generation enable row level security;alter table knowledge_index_generation force row level security;
drop policy if exists knowledge_index_generation_read on knowledge_index_generation;drop policy if exists knowledge_index_generation_admin_write on knowledge_index_generation;
create policy knowledge_index_generation_read on knowledge_index_generation for select using(true);
create policy knowledge_index_generation_admin_write on knowledge_index_generation for all using(app_current_user_role()='admin') with check(app_current_user_role()='admin');
alter table knowledge_source_revision enable row level security;alter table knowledge_source_revision force row level security;
alter table knowledge_chunk_v2 enable row level security;alter table knowledge_chunk_v2 force row level security;
drop policy if exists knowledge_source_revision_acl on knowledge_source_revision;
create policy knowledge_source_revision_acl on knowledge_source_revision using(exists(select 1 from knowledge_asset a join knowledge_document d on d.id=a.document_id where a.id=asset_id and(d.visibility='shared' or d.owner_id=app_current_user_id()))) with check(app_current_user_role()='admin');
drop policy if exists knowledge_chunk_v2_acl on knowledge_chunk_v2;
create policy knowledge_chunk_v2_acl on knowledge_chunk_v2 using(exists(select 1 from knowledge_document d where d.id=document_id and(d.visibility='shared' or d.owner_id=app_current_user_id()))) with check(app_current_user_role()='admin');
