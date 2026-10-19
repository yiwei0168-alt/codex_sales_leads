-- A recovered worker may retire only runs created under its own job's old lease.
alter table mailbox_sync_run add column if not exists work_job_id uuid references mailbox_work_job(id);
alter table mailbox_sync_run add column if not exists work_lease_token uuid;
do $$ begin
  alter table mailbox_sync_run add constraint mailbox_sync_run_worker_binding_check
    check ((work_job_id is null) = (work_lease_token is null));
exception when duplicate_object then null;
end $$;
create index if not exists mailbox_sync_run_work_job_idx on mailbox_sync_run(work_job_id)
  where work_job_id is not null;
