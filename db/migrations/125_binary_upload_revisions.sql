-- Explicit compare-and-swap target; never infer replacement from a filename.
alter table knowledge_upload_job
  add column if not exists revision_target_document_id uuid references knowledge_document(id),
  add column if not exists revision_base_version_id uuid references knowledge_tree_version(id);
alter table knowledge_upload_job drop constraint if exists knowledge_upload_revision_pair;
alter table knowledge_upload_job add constraint knowledge_upload_revision_pair check(
  (revision_target_document_id is null)=(revision_base_version_id is null));
create index if not exists knowledge_upload_revision_target_idx
  on knowledge_upload_job(user_id,revision_target_document_id,created_at desc)
  where revision_target_document_id is not null;
