alter table mailbox_message add column if not exists thread_key text;
alter table mailbox_message add column if not exists screening_score integer not null default 0;
alter table mailbox_message add column if not exists screening_bucket text not null default 'review';
alter table mailbox_message add column if not exists screening_reasons jsonb not null default '[]';
alter table mailbox_message add column if not exists screened_at timestamptz;

do $$ begin
  alter table mailbox_message add constraint mailbox_message_screening_score_check
    check (screening_score between -200 and 200);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table mailbox_message add constraint mailbox_message_screening_bucket_check
    check (screening_bucket in ('recommended', 'review', 'ignored'));
exception when duplicate_object then null;
end $$;

create index if not exists mailbox_message_screening_idx
  on mailbox_message(user_id, screening_bucket, screening_score desc, sent_at desc);
create index if not exists mailbox_message_thread_idx
  on mailbox_message(user_id, thread_key, sent_at);
