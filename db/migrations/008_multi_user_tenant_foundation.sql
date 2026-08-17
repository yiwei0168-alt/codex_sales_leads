alter table app_user add column if not exists password_hash text;
alter table app_user add column if not exists role text not null default 'member';
alter table app_user add column if not exists status text not null default 'active';

do $$ begin
  alter table app_user add constraint app_user_role_check check (role in ('admin', 'member'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table app_user add constraint app_user_status_check check (status in ('active', 'disabled'));
exception when duplicate_object then null;
end $$;

update app_user set role = 'admin'
where id = '00000000-0000-4000-8000-000000000001';

alter table market_workspace drop constraint if exists market_workspace_slug_key;
create unique index if not exists market_workspace_owner_slug_idx
  on market_workspace(owner_id, slug);

alter table knowledge_document add column if not exists owner_id uuid references app_user(id) on delete cascade;
update knowledge_document
set owner_id = '00000000-0000-4000-8000-000000000001'
where owner_id is null;
alter table knowledge_document alter column owner_id set not null;
alter table knowledge_document drop constraint if exists knowledge_document_collection_id_external_id_key;
create unique index if not exists knowledge_document_owner_collection_external_idx
  on knowledge_document(owner_id, collection_id, external_id);
create index if not exists knowledge_document_owner_collection_idx
  on knowledge_document(owner_id, collection_id);

alter table rag_query_log add column if not exists user_id uuid references app_user(id) on delete cascade;
update rag_query_log
set user_id = '00000000-0000-4000-8000-000000000001'
where user_id is null;
alter table rag_query_log alter column user_id set not null;
create index if not exists rag_query_log_user_time_idx
  on rag_query_log(user_id, created_at desc);
