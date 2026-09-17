alter table knowledge_reindex_job drop constraint if exists knowledge_reindex_job_mode_check;
alter table knowledge_reindex_job add constraint knowledge_reindex_job_mode_check
  check(mode in('dry-run','embed','activate','rollback'));
