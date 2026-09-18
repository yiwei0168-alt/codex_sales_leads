create table if not exists knowledge_release_v3 (
  id uuid primary key default gen_random_uuid(),
  release_key text not null unique,
  status text not null default 'building' check(status in('building','validated','active','superseded','failed')),
  scope_kind text not null check(scope_kind in('shared','owner')),
  owner_id uuid references app_user(id),
  extractor_profile text not null,
  chunk_profile text not null,
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  activated_at timestamptz,
  failure_reason text,
  check((scope_kind='shared' and owner_id is null) or (scope_kind='owner' and owner_id is not null))
);

create unique index if not exists knowledge_release_v3_active_shared_idx
  on knowledge_release_v3(scope_kind) where status='active' and scope_kind='shared';
create unique index if not exists knowledge_release_v3_active_owner_idx
  on knowledge_release_v3(owner_id) where status='active' and scope_kind='owner';

create table if not exists knowledge_release_asset_v3 (
  release_id uuid not null references knowledge_release_v3(id) on delete cascade,
  asset_id uuid not null references knowledge_asset(id) on delete cascade,
  processing_status text not null default 'pending'
    check(processing_status in('pending','success','blank','review-required','failed')),
  resolution_status text not null default 'pending'
    check(resolution_status in('pending','accepted','replace-source')),
  expected_units integer not null default 0 check(expected_units>=0),
  actual_units integer not null default 0 check(actual_units>=0),
  expected_chunks integer not null default 0 check(expected_chunks>=0),
  actual_chunks integer not null default 0 check(actual_chunks>=0),
  qwen_embeddings integer not null default 0 check(qwen_embeddings>=0),
  bge_embeddings integer not null default 0 check(bge_embeddings>=0),
  verified_facts integer not null default 0 check(verified_facts>=0),
  candidate_facts integer not null default 0 check(candidate_facts>=0),
  conflict_facts integer not null default 0 check(conflict_facts>=0),
  error_code text,
  human_decision_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(release_id,asset_id)
);

create table if not exists knowledge_source_revision_v3 (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references knowledge_release_v3(id) on delete cascade,
  asset_id uuid not null references knowledge_asset(id) on delete cascade,
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  extractor_profile text not null,
  parser_status text not null check(parser_status in('success','partial','failed')),
  quality_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(release_id,asset_id,source_sha256,extractor_profile)
);

create table if not exists knowledge_source_unit_v3 (
  id uuid primary key default gen_random_uuid(),
  source_revision_id uuid not null references knowledge_source_revision_v3(id) on delete cascade,
  unit_type text not null check(unit_type in('page','slide','sheet','document')),
  unit_index integer not null check(unit_index>=1),
  status text not null check(status in('success','blank','review-required','failed')),
  content_sha256 text check(content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  error_code text,
  review_note text,
  reviewed_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  unique(source_revision_id,unit_type,unit_index),
  check(status not in('review-required','failed') or reviewed_at is not null or review_note is null)
);

create table if not exists knowledge_chunk_v3 (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references knowledge_release_v3(id) on delete cascade,
  document_id uuid not null references knowledge_document(id) on delete cascade,
  source_revision_id uuid not null references knowledge_source_revision_v3(id) on delete cascade,
  source_unit_id uuid references knowledge_source_unit_v3(id) on delete restrict,
  parent_chunk_id uuid references knowledge_chunk_v3(id) on delete set null,
  chunk_index integer not null check(chunk_index>=0),
  block_type text not null,
  heading_path text[] not null default '{}',
  source_location jsonb not null,
  content text not null,
  canonical_embedding_text text not null,
  token_estimate integer not null check(token_estimate>=0),
  content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
  search_vector tsvector generated always as
    (to_tsvector('simple',coalesce(canonical_embedding_text,''))) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(release_id,document_id,chunk_index)
);
create index if not exists knowledge_chunk_v3_release_document_idx on knowledge_chunk_v3(release_id,document_id);
create index if not exists knowledge_chunk_v3_parent_idx on knowledge_chunk_v3(parent_chunk_id);
create index if not exists knowledge_chunk_v3_search_idx on knowledge_chunk_v3 using gin(search_vector);

create table if not exists knowledge_chunk_entity_v3 (
  chunk_id uuid not null references knowledge_chunk_v3(id) on delete cascade,
  entity_id uuid not null references knowledge_entity(id) on delete cascade,
  relation_type text not null check(relation_type in('about','applies-to','mentions')),
  row_start integer,
  row_end integer,
  binding_method text not null,
  binding_confidence numeric(5,4) not null check(binding_confidence between 0 and 1),
  primary key(chunk_id,entity_id,relation_type),
  check(row_start is null or row_start>=1),
  check(row_end is null or (row_start is not null and row_end>=row_start))
);
create index if not exists knowledge_chunk_entity_v3_entity_idx on knowledge_chunk_entity_v3(entity_id,chunk_id);

create table if not exists knowledge_embedding_profile_v3 (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique,
  provider text not null check(provider in('aliyun-bailian','local')),
  model text not null,
  model_revision text not null,
  dimensions integer not null check(dimensions in(1024,1536)),
  distance_metric text not null default 'cosine' check(distance_metric='cosine'),
  tokenizer_revision text,
  artifact_sha256 text check(artifact_sha256 is null or artifact_sha256 ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check((provider='aliyun-bailian' and dimensions=1536 and model='text-embedding-v4')
     or (provider='local' and dimensions=1024 and model='BAAI/bge-m3'))
);

insert into knowledge_embedding_profile_v3(profile_key,provider,model,model_revision,dimensions)
values
  ('qwen-v4-1536','aliyun-bailian','text-embedding-v4','provider-current-pinned-at-build',1536),
  ('bge-m3-1024','local','BAAI/bge-m3','pending-exact-revision-before-build',1024)
on conflict(profile_key) do nothing;

create table if not exists knowledge_chunk_embedding_v3 (
  chunk_id uuid not null references knowledge_chunk_v3(id) on delete cascade,
  profile_id uuid not null references knowledge_embedding_profile_v3(id),
  content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
  qwen_embedding vector(1536),
  bge_embedding vector(1024),
  input_tokens integer check(input_tokens is null or input_tokens>=0),
  latency_ms integer check(latency_ms is null or latency_ms>=0),
  retry_count integer not null default 0 check(retry_count>=0),
  created_at timestamptz not null default now(),
  primary key(chunk_id,profile_id),
  check((qwen_embedding is not null)::integer+(bge_embedding is not null)::integer=1)
);
create index if not exists knowledge_chunk_embedding_v3_qwen_hnsw
  on knowledge_chunk_embedding_v3 using hnsw(qwen_embedding vector_cosine_ops)
  where qwen_embedding is not null;
create index if not exists knowledge_chunk_embedding_v3_bge_hnsw
  on knowledge_chunk_embedding_v3 using hnsw(bge_embedding vector_cosine_ops)
  where bge_embedding is not null;

create table if not exists knowledge_fact_v3 (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references knowledge_release_v3(id) on delete cascade,
  source_revision_id uuid not null references knowledge_source_revision_v3(id) on delete cascade,
  chunk_id uuid not null references knowledge_chunk_v3(id) on delete cascade,
  entity_id uuid not null references knowledge_entity(id),
  entity_version text,
  market text,
  attribute_key text not null,
  raw_field_name text not null,
  typed_value jsonb not null,
  raw_value text not null,
  unit text,
  qualifiers jsonb not null default '{}'::jsonb,
  polarity text not null check(polarity in('positive','negative','unknown')),
  table_coordinate jsonb,
  evidence_location jsonb not null,
  evidence_hash text not null,
  validation_rule text not null,
  validation_rule_version text not null,
  verification_status text not null check(verification_status in('candidate','verified','conflicting','rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(release_id,entity_id,attribute_key,evidence_hash),
  check(verification_status<>'verified' or verified_at is not null)
);
create index if not exists knowledge_fact_v3_lookup_idx
  on knowledge_fact_v3(release_id,entity_id,attribute_key,verification_status);

create table if not exists knowledge_review_queue_v3 (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references knowledge_release_v3(id) on delete cascade,
  asset_id uuid not null references knowledge_asset(id) on delete cascade,
  source_unit_id uuid references knowledge_source_unit_v3(id) on delete cascade,
  fact_id uuid references knowledge_fact_v3(id) on delete cascade,
  reason text not null check(reason in('ocr','layout','low-confidence','conflict','source-damaged','source-missing')),
  status text not null default 'open' check(status in('open','accepted','corrected','rejected','replace-source')),
  resolution_note text,
  reviewed_by uuid references app_user(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check(status='open' or (reviewed_at is not null and reviewed_by is not null))
);
create index if not exists knowledge_review_queue_v3_release_status_idx
  on knowledge_review_queue_v3(release_id,status,reason);

create table if not exists knowledge_release_pointer_v3 (
  id uuid primary key default gen_random_uuid(),
  scope_kind text not null check(scope_kind in('shared','owner')),
  owner_id uuid references app_user(id),
  release_id uuid not null references knowledge_release_v3(id),
  activated_at timestamptz not null default now(),
  check((scope_kind='shared' and owner_id is null) or (scope_kind='owner' and owner_id is not null))
);
create unique index if not exists knowledge_release_pointer_v3_shared_idx
  on knowledge_release_pointer_v3(scope_kind) where scope_kind='shared';
create unique index if not exists knowledge_release_pointer_v3_owner_idx
  on knowledge_release_pointer_v3(owner_id) where scope_kind='owner';

alter table knowledge_document add column if not exists active_release_v3_id uuid references knowledge_release_v3(id);

create or replace function activate_knowledge_release_v3(target_release uuid) returns void
language plpgsql security invoker as $$
declare target knowledge_release_v3%rowtype;
begin
  select * into target from knowledge_release_v3 where id=target_release for update;
  if target.id is null or target.status<>'validated' then
    raise exception 'v3 release must exist and be validated';
  end if;
  if exists(
    select 1 from knowledge_asset a join knowledge_document d on d.id=a.document_id
    where a.registration_status='registered'
      and ((target.scope_kind='shared' and d.visibility='shared')
        or (target.scope_kind='owner' and d.visibility='private' and d.owner_id=target.owner_id))
      and not exists(select 1 from knowledge_release_asset_v3 m where m.release_id=target.id and m.asset_id=a.id)
  ) then raise exception 'v3 release manifest does not cover every registered asset'; end if;
  if exists(
    select 1 from knowledge_release_asset_v3 m join knowledge_asset a on a.id=m.asset_id
    where m.release_id=target.id and (
      m.processing_status='pending'
      or m.expected_units<>m.actual_units
      or m.expected_chunks<>m.actual_chunks
      or m.qwen_embeddings<>m.actual_chunks
      or m.bge_embeddings<>m.actual_chunks
      or (m.processing_status='success' and lower(a.source_nature) like '%datasheet%' and m.actual_chunks=0)
      or (m.processing_status in('blank','review-required','failed') and (m.resolution_status='pending' or m.human_decision_at is null))
    )
  ) then raise exception 'v3 release asset completeness gate failed'; end if;
  if exists(select 1 from knowledge_review_queue_v3 where release_id=target.id and status='open') then
    raise exception 'v3 release has unresolved review items';
  end if;

  update knowledge_release_v3 set status='superseded'
   where status='active' and id<>target.id and scope_kind=target.scope_kind
     and owner_id is not distinct from target.owner_id;
  update knowledge_release_v3 set status='active',activated_at=now() where id=target.id;
  if target.scope_kind='shared' then
    insert into knowledge_release_pointer_v3(scope_kind,owner_id,release_id)
    values('shared',null,target.id)
    on conflict(scope_kind) where scope_kind='shared'
    do update set release_id=excluded.release_id,activated_at=now();
  else
    insert into knowledge_release_pointer_v3(scope_kind,owner_id,release_id)
    values('owner',target.owner_id,target.id)
    on conflict(owner_id) where scope_kind='owner'
    do update set release_id=excluded.release_id,activated_at=now();
  end if;
  update knowledge_document d set active_release_v3_id=target.id
   where (target.scope_kind='shared' and d.visibility='shared')
      or (target.scope_kind='owner' and d.visibility='private' and d.owner_id=target.owner_id);
end $$;

grant select,insert,update on knowledge_release_v3,knowledge_release_asset_v3,knowledge_source_revision_v3,
  knowledge_source_unit_v3,knowledge_chunk_v3,knowledge_chunk_entity_v3,knowledge_embedding_profile_v3,
  knowledge_chunk_embedding_v3,knowledge_fact_v3,knowledge_review_queue_v3,knowledge_release_pointer_v3
  to network_copilot_app;
grant execute on function activate_knowledge_release_v3(uuid) to network_copilot_app;

alter table knowledge_release_v3 enable row level security;
alter table knowledge_release_v3 force row level security;
drop policy if exists knowledge_release_v3_acl on knowledge_release_v3;
create policy knowledge_release_v3_acl on knowledge_release_v3 using(
  scope_kind='shared' or owner_id=app_current_user_id())
  with check(app_current_user_role()='admin' and (scope_kind='shared' or owner_id=app_current_user_id()));

alter table knowledge_release_asset_v3 enable row level security;
alter table knowledge_release_asset_v3 force row level security;
drop policy if exists knowledge_release_asset_v3_acl on knowledge_release_asset_v3;
create policy knowledge_release_asset_v3_acl on knowledge_release_asset_v3 using(exists(
  select 1 from knowledge_release_v3 r where r.id=release_id and (r.scope_kind='shared' or r.owner_id=app_current_user_id())))
  with check(app_current_user_role()='admin');

alter table knowledge_source_revision_v3 enable row level security;
alter table knowledge_source_revision_v3 force row level security;
drop policy if exists knowledge_source_revision_v3_acl on knowledge_source_revision_v3;
create policy knowledge_source_revision_v3_acl on knowledge_source_revision_v3 using(exists(
  select 1 from knowledge_asset a join knowledge_document d on d.id=a.document_id
  where a.id=asset_id and (d.visibility='shared' or d.owner_id=app_current_user_id())))
  with check(app_current_user_role()='admin');

alter table knowledge_source_unit_v3 enable row level security;
alter table knowledge_source_unit_v3 force row level security;
drop policy if exists knowledge_source_unit_v3_acl on knowledge_source_unit_v3;
create policy knowledge_source_unit_v3_acl on knowledge_source_unit_v3 using(exists(
  select 1 from knowledge_source_revision_v3 r where r.id=source_revision_id))
  with check(app_current_user_role()='admin');

alter table knowledge_chunk_v3 enable row level security;
alter table knowledge_chunk_v3 force row level security;
drop policy if exists knowledge_chunk_v3_acl on knowledge_chunk_v3;
create policy knowledge_chunk_v3_acl on knowledge_chunk_v3 using(exists(
  select 1 from knowledge_document d where d.id=document_id and (d.visibility='shared' or d.owner_id=app_current_user_id())))
  with check(app_current_user_role()='admin');

alter table knowledge_chunk_entity_v3 enable row level security;
alter table knowledge_chunk_entity_v3 force row level security;
drop policy if exists knowledge_chunk_entity_v3_acl on knowledge_chunk_entity_v3;
create policy knowledge_chunk_entity_v3_acl on knowledge_chunk_entity_v3 using(exists(
  select 1 from knowledge_chunk_v3 c where c.id=chunk_id)) with check(app_current_user_role()='admin');

alter table knowledge_embedding_profile_v3 enable row level security;
alter table knowledge_embedding_profile_v3 force row level security;
drop policy if exists knowledge_embedding_profile_v3_read on knowledge_embedding_profile_v3;
create policy knowledge_embedding_profile_v3_read on knowledge_embedding_profile_v3 for select using(true);
drop policy if exists knowledge_embedding_profile_v3_write on knowledge_embedding_profile_v3;
create policy knowledge_embedding_profile_v3_write on knowledge_embedding_profile_v3 for all
  using(app_current_user_role()='admin') with check(app_current_user_role()='admin');

alter table knowledge_chunk_embedding_v3 enable row level security;
alter table knowledge_chunk_embedding_v3 force row level security;
drop policy if exists knowledge_chunk_embedding_v3_acl on knowledge_chunk_embedding_v3;
create policy knowledge_chunk_embedding_v3_acl on knowledge_chunk_embedding_v3 using(exists(
  select 1 from knowledge_chunk_v3 c where c.id=chunk_id)) with check(app_current_user_role()='admin');

alter table knowledge_fact_v3 enable row level security;
alter table knowledge_fact_v3 force row level security;
drop policy if exists knowledge_fact_v3_acl on knowledge_fact_v3;
create policy knowledge_fact_v3_acl on knowledge_fact_v3 using(exists(
  select 1 from knowledge_chunk_v3 c where c.id=chunk_id)) with check(app_current_user_role()='admin');

alter table knowledge_review_queue_v3 enable row level security;
alter table knowledge_review_queue_v3 force row level security;
drop policy if exists knowledge_review_queue_v3_acl on knowledge_review_queue_v3;
create policy knowledge_review_queue_v3_acl on knowledge_review_queue_v3 using(exists(
  select 1 from knowledge_asset a join knowledge_document d on d.id=a.document_id
  where a.id=asset_id and (d.visibility='shared' or d.owner_id=app_current_user_id())))
  with check(app_current_user_role()='admin');

alter table knowledge_release_pointer_v3 enable row level security;
alter table knowledge_release_pointer_v3 force row level security;
drop policy if exists knowledge_release_pointer_v3_acl on knowledge_release_pointer_v3;
create policy knowledge_release_pointer_v3_acl on knowledge_release_pointer_v3 using(
  scope_kind='shared' or owner_id=app_current_user_id()) with check(app_current_user_role()='admin');
