alter table knowledge_document add column if not exists visibility text;

update knowledge_document
set visibility = case
  when source_type = 'private-mailbox-approved' then 'private'
  else 'shared'
end
where visibility is null;

alter table knowledge_document alter column visibility set default 'private';
alter table knowledge_document alter column visibility set not null;

do $$ begin
  alter table knowledge_document add constraint knowledge_document_visibility_check
    check (visibility in ('shared', 'private'));
exception when duplicate_object then null;
end $$;

create index if not exists knowledge_document_visibility_owner_idx
  on knowledge_document(visibility, owner_id, collection_id)
  where status = 'active';
