alter table mailbox_message drop constraint if exists mailbox_message_learning_status_check;
alter table mailbox_message add constraint mailbox_message_learning_status_check
  check (learning_status in ('pending', 'analyzing', 'completed', 'failed', 'skipped', 'blocked'));

create table if not exists mailbox_outbound_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  message_id uuid not null,
  provider text not null check (provider in ('kimi')),
  model text not null,
  decision text not null check (decision in ('authorized', 'skipped', 'blocked')),
  status text not null check (status in ('started', 'completed', 'failed', 'not-sent')),
  input_sha256 text,
  original_char_count integer not null default 0 check (original_char_count >= 0),
  disclosed_char_count integer not null default 0 check (disclosed_char_count >= 0),
  redaction_counts jsonb not null default '{}',
  provider_request_id text,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (user_id, message_id) references mailbox_message(user_id, id) on delete cascade
);

create index if not exists mailbox_outbound_audit_user_time_idx
  on mailbox_outbound_audit(user_id, created_at desc);
create index if not exists mailbox_outbound_audit_message_idx
  on mailbox_outbound_audit(user_id, message_id, created_at desc);
