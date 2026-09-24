alter table knowledge_upload_job
  add column if not exists lease_token uuid,
  add column if not exists lease_until timestamptz;

update knowledge_upload_job set lease_until=now()-interval '1 second'
  where status='running' and lease_until is null;

create index if not exists knowledge_upload_job_recovery_idx
  on knowledge_upload_job(status,lease_until,created_at)
  where status in ('pending','running');
