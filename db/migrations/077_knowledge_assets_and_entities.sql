create table if not exists knowledge_asset (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_document(id) on delete cascade,
  storage_key text not null check (storage_key <> '' and storage_key !~ '(^[\\/]|(^|[\\/])\.\.([\\/]|$)|^[A-Za-z]:|^\\\\)'),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  document_type text not null,
  document_version text,
  market text,
  language text,
  source_nature text not null,
  externally_disclosable boolean not null default false,
  registration_status text not null default 'registered' check (registration_status in ('registered','missing','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id,storage_key,source_sha256)
);

create table if not exists knowledge_entity (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product','company','industry-topic')),
  canonical_key text not null,
  display_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(entity_type,canonical_key)
);

create table if not exists knowledge_document_entity (
  document_id uuid not null references knowledge_document(id) on delete cascade,
  entity_id uuid not null references knowledge_entity(id) on delete cascade,
  relation_type text not null default 'about' check (relation_type in ('about','applies-to','mentions')),
  primary key(document_id,entity_id,relation_type)
);

create index if not exists knowledge_asset_document_idx on knowledge_asset(document_id);
create index if not exists knowledge_document_entity_entity_idx on knowledge_document_entity(entity_id,document_id);

grant select,insert,update,delete on knowledge_asset,knowledge_entity,knowledge_document_entity to network_copilot_app;
alter table knowledge_asset enable row level security;
alter table knowledge_asset force row level security;
alter table knowledge_document_entity enable row level security;
alter table knowledge_document_entity force row level security;
drop policy if exists knowledge_asset_acl on knowledge_asset;
create policy knowledge_asset_acl on knowledge_asset using (exists (
  select 1 from knowledge_document d where d.id=document_id and (d.visibility='shared' or d.owner_id=app_current_user_id())
)) with check (exists (
  select 1 from knowledge_document d where d.id=document_id and d.owner_id=app_current_user_id()
));
drop policy if exists knowledge_document_entity_acl on knowledge_document_entity;
create policy knowledge_document_entity_acl on knowledge_document_entity using (exists (
  select 1 from knowledge_document d where d.id=document_id and (d.visibility='shared' or d.owner_id=app_current_user_id())
)) with check (exists (
  select 1 from knowledge_document d where d.id=document_id and d.owner_id=app_current_user_id()
));
alter table knowledge_entity enable row level security;
alter table knowledge_entity force row level security;
drop policy if exists knowledge_entity_read on knowledge_entity;
drop policy if exists knowledge_entity_admin_write on knowledge_entity;
create policy knowledge_entity_read on knowledge_entity for select using (true);
create policy knowledge_entity_admin_write on knowledge_entity for all using (app_current_user_role()='admin') with check (app_current_user_role()='admin');
