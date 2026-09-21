-- Registration makes the extracted original available to shared-library users.
-- Activation in the immutable RAG v3 release is a separate review step.
alter table knowledge_upload_job drop constraint if exists knowledge_upload_job_status_check;
alter table knowledge_upload_job add constraint knowledge_upload_job_status_check
  check(status in('pending','running','extracted','failed','registered'));
alter table knowledge_upload_job add column if not exists published_document_id uuid references knowledge_document(id);
alter table knowledge_upload_job add column if not exists published_asset_id uuid references knowledge_asset(id);
