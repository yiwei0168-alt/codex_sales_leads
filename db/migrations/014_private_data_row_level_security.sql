create or replace function app_current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

create or replace function app_current_user_role() returns text
language sql stable as $$
  select nullif(current_setting('app.current_user_role', true), '')
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'network_copilot_app') then
    create role network_copilot_app nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

grant usage on schema public to network_copilot_app;
grant select, insert, update, delete on all tables in schema public to network_copilot_app;
grant usage, select on all sequences in schema public to network_copilot_app;
grant execute on function app_current_user_id() to network_copilot_app;
grant execute on function app_current_user_role() to network_copilot_app;
do $$ begin
  execute format('grant network_copilot_app to %I', current_user);
end $$;

alter table mailbox_connection enable row level security;
alter table mailbox_connection force row level security;
drop policy if exists mailbox_connection_tenant on mailbox_connection;
create policy mailbox_connection_tenant on mailbox_connection
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table mailbox_sync_run enable row level security;
alter table mailbox_sync_run force row level security;
drop policy if exists mailbox_sync_run_tenant on mailbox_sync_run;
create policy mailbox_sync_run_tenant on mailbox_sync_run
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table mailbox_sync_cursor enable row level security;
alter table mailbox_sync_cursor force row level security;
drop policy if exists mailbox_sync_cursor_tenant on mailbox_sync_cursor;
create policy mailbox_sync_cursor_tenant on mailbox_sync_cursor
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table mailbox_message enable row level security;
alter table mailbox_message force row level security;
drop policy if exists mailbox_message_tenant on mailbox_message;
create policy mailbox_message_tenant on mailbox_message
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table mailbox_artifact_candidate enable row level security;
alter table mailbox_artifact_candidate force row level security;
drop policy if exists mailbox_artifact_candidate_tenant on mailbox_artifact_candidate;
create policy mailbox_artifact_candidate_tenant on mailbox_artifact_candidate
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table mailbox_outbound_audit enable row level security;
alter table mailbox_outbound_audit force row level security;
drop policy if exists mailbox_outbound_audit_tenant on mailbox_outbound_audit;
create policy mailbox_outbound_audit_tenant on mailbox_outbound_audit
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table knowledge_document enable row level security;
alter table knowledge_document force row level security;
drop policy if exists knowledge_document_read on knowledge_document;
drop policy if exists knowledge_document_insert on knowledge_document;
drop policy if exists knowledge_document_update on knowledge_document;
drop policy if exists knowledge_document_delete on knowledge_document;
create policy knowledge_document_read on knowledge_document for select
  using (visibility = 'shared' or owner_id = app_current_user_id());
create policy knowledge_document_insert on knowledge_document for insert
  with check (owner_id = app_current_user_id() and (visibility = 'private' or app_current_user_role() = 'admin'));
create policy knowledge_document_update on knowledge_document for update
  using (owner_id = app_current_user_id())
  with check (owner_id = app_current_user_id() and (visibility = 'private' or app_current_user_role() = 'admin'));
create policy knowledge_document_delete on knowledge_document for delete
  using (owner_id = app_current_user_id());

alter table knowledge_chunk enable row level security;
alter table knowledge_chunk force row level security;
drop policy if exists knowledge_chunk_read on knowledge_chunk;
drop policy if exists knowledge_chunk_write on knowledge_chunk;
create policy knowledge_chunk_read on knowledge_chunk for select using (
  exists (select 1 from knowledge_document d where d.id = document_id)
);
create policy knowledge_chunk_write on knowledge_chunk for all using (
  exists (select 1 from knowledge_document d where d.id = document_id and d.owner_id = app_current_user_id())
) with check (
  exists (select 1 from knowledge_document d where d.id = document_id and d.owner_id = app_current_user_id())
);

alter table rag_query_log enable row level security;
alter table rag_query_log force row level security;
drop policy if exists rag_query_log_tenant on rag_query_log;
create policy rag_query_log_tenant on rag_query_log
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
