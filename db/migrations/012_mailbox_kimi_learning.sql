alter table mailbox_sync_run add column if not exists phase text not null default 'queued';
alter table mailbox_sync_run add column if not exists processed_count integer not null default 0;
alter table mailbox_sync_run add column if not exists learning_total integer not null default 0;
alter table mailbox_sync_run add column if not exists learning_processed integer not null default 0;
alter table mailbox_sync_run add column if not exists learning_failed integer not null default 0;
alter table mailbox_sync_run add column if not exists candidate_count integer not null default 0;
alter table mailbox_sync_run add column if not exists current_subject text;
alter table mailbox_sync_run add column if not exists model text;
alter table mailbox_sync_run add column if not exists updated_at timestamptz not null default now();

create unique index if not exists mailbox_sync_run_user_id_idx on mailbox_sync_run(user_id, id);
create unique index if not exists mailbox_sync_run_one_active_idx
  on mailbox_sync_run(user_id, connection_id) where status = 'running';

alter table mailbox_message add column if not exists sync_run_id uuid;
alter table mailbox_message add column if not exists learning_status text not null default 'pending';
alter table mailbox_message add column if not exists learning_error text;
alter table mailbox_message add column if not exists learned_at timestamptz;

do $$ begin
  alter table mailbox_message add constraint mailbox_message_learning_status_check
    check (learning_status in ('pending', 'analyzing', 'completed', 'failed'));
exception when duplicate_object then null;
end $$;

alter table mailbox_message drop constraint if exists mailbox_message_sync_run_owner_fk;
alter table mailbox_message add constraint mailbox_message_sync_run_owner_fk
  foreign key (user_id, sync_run_id) references mailbox_sync_run(user_id, id)
  on delete set null (sync_run_id);

create index if not exists mailbox_message_run_learning_idx
  on mailbox_message(user_id, sync_run_id, learning_status, updated_at desc);

alter table mailbox_artifact_candidate add column if not exists model text;
alter table mailbox_artifact_candidate add column if not exists prompt_version text;
alter table mailbox_artifact_candidate add column if not exists confidence real;
alter table mailbox_artifact_candidate add column if not exists rationale text;

do $$ begin
  alter table mailbox_artifact_candidate add constraint mailbox_artifact_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1));
exception when duplicate_object then null;
end $$;
