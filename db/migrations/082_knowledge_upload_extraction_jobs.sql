create table if not exists knowledge_upload_job (
  id uuid primary key,
  user_id uuid not null references app_user(id),
  collection_slug text not null check(collection_slug in('industry','company','product')),
  status text not null default 'pending' check(status in('pending','running','extracted','failed')),
  title text not null,
  original_filename text not null,
  storage_key text not null check(storage_key <> '' and storage_key !~ '(^[\\/]|(^|[\\/])\.\.([\\/]|$)|^[A-Za-z]:|^\\\\)'),
  extraction_artifact_key text,
  mime_type text not null,
  byte_size bigint not null check(byte_size > 0),
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  source_url text,
  visibility text not null default 'private' check(visibility in('private','shared')),
  entity_key text,
  extractor_version text,
  error_code text,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_upload_job_user_created_idx on knowledge_upload_job(user_id,created_at desc);
create index if not exists knowledge_upload_job_pending_idx on knowledge_upload_job(status,created_at) where status='pending';
grant select,insert,update on knowledge_upload_job to network_copilot_app;
alter table knowledge_upload_job enable row level security;
alter table knowledge_upload_job force row level security;
drop policy if exists knowledge_upload_job_acl on knowledge_upload_job;
create policy knowledge_upload_job_acl on knowledge_upload_job
  using(user_id=app_current_user_id())
  with check(user_id=app_current_user_id());
