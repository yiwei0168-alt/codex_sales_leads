alter table knowledge_upload_job add column if not exists visual_lease_token uuid;
alter table knowledge_upload_job add column if not exists visual_lease_until timestamptz;
alter table knowledge_upload_job add column if not exists visual_attempts integer not null default 0;
alter table knowledge_upload_job add column if not exists visual_retry_at timestamptz;
alter table knowledge_upload_job add column if not exists visual_error_code text;
create index if not exists knowledge_upload_visual_pending_idx on knowledge_upload_job(updated_at)
 where status='extracted' and error_code='extraction-review-required';
