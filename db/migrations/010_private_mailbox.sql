create table if not exists mailbox_connection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  provider text not null check (provider in ('alimail-imap')),
  email text not null,
  host text not null default 'imap.qiye.aliyun.com',
  port integer not null default 993 check (port between 1 and 65535),
  credential_ciphertext text not null,
  status text not null default 'active' check (status in ('active', 'error', 'disabled')),
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email),
  unique (user_id, id)
);

create table if not exists mailbox_sync_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  connection_id uuid not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  folder_count integer not null default 0,
  discovered_count integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (user_id, connection_id) references mailbox_connection(user_id, id) on delete cascade
);

create index if not exists mailbox_sync_run_user_time_idx
  on mailbox_sync_run(user_id, started_at desc);

create table if not exists mailbox_sync_cursor (
  user_id uuid not null references app_user(id) on delete cascade,
  connection_id uuid not null,
  folder_path text not null,
  uid_validity text not null,
  last_uid bigint not null default 0 check (last_uid >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, connection_id, folder_path),
  foreign key (user_id, connection_id) references mailbox_connection(user_id, id) on delete cascade
);

create table if not exists mailbox_message (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  connection_id uuid not null,
  folder_path text not null,
  uid_validity text not null,
  message_uid bigint not null check (message_uid > 0),
  internet_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender jsonb not null default '[]',
  recipients jsonb not null default '[]',
  subject text not null default '',
  sent_at timestamptz,
  body_text text not null default '',
  content_sha256 text not null,
  metadata jsonb not null default '{}',
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connection_id, folder_path, uid_validity, message_uid),
  unique (user_id, id),
  foreign key (user_id, connection_id) references mailbox_connection(user_id, id) on delete cascade
);

create index if not exists mailbox_message_user_sent_idx
  on mailbox_message(user_id, sent_at desc);
create index if not exists mailbox_message_user_direction_idx
  on mailbox_message(user_id, direction, sent_at desc);

create table if not exists mailbox_artifact_candidate (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  message_id uuid not null,
  kind text not null check (kind in ('company-policy', 'customer-signal', 'email-template')),
  title text not null,
  content text not null,
  structured_data jsonb not null default '{}',
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id, message_id, kind),
  foreign key (user_id, message_id) references mailbox_message(user_id, id) on delete cascade
);

create index if not exists mailbox_artifact_user_review_idx
  on mailbox_artifact_candidate(user_id, review_status, created_at desc);
