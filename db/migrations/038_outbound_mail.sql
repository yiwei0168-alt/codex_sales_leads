alter table mailbox_connection add column if not exists smtp_verified_at timestamptz;
create table if not exists outbound_mail (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references app_user(id),
 workspace_id uuid not null references market_workspace(id), company_id uuid not null references sales_company(id),
 connection_id uuid not null references mailbox_connection(id), idempotency_key uuid not null,
 request_hash text not null, message_id text not null, parent_id uuid references outbound_mail(id),
 content_ciphertext text not null, status text not null check(status in ('sending','sent','failed','unknown')),
 error_code text, created_at timestamptz not null default now(), sent_at timestamptz,
 unique(user_id,idempotency_key)
);
create unique index if not exists outbound_mail_content_dedupe on outbound_mail(user_id,request_hash);
alter table outbound_mail enable row level security;
alter table outbound_mail force row level security;
drop policy if exists outbound_mail_owner on outbound_mail;
create policy outbound_mail_owner on outbound_mail using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update on outbound_mail to network_copilot_app;
