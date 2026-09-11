create table if not exists knowledge_document_revision (
  id uuid primary key default gen_random_uuid(),document_id uuid not null references knowledge_document(id) on delete cascade,
  user_id uuid not null references app_user(id),content_sha256 text not null,title text not null,content text not null,
  created_at timestamptz not null default now(),unique(document_id,content_sha256)
);
alter table knowledge_document_revision enable row level security;
alter table knowledge_document_revision force row level security;
drop policy if exists knowledge_revision_owner on knowledge_document_revision;
create policy knowledge_revision_owner on knowledge_document_revision using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,delete on knowledge_document_revision to network_copilot_app;
alter table knowledge_document_revision add column if not exists reconstructed boolean not null default false;
