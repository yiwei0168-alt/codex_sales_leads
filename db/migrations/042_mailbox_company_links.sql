create table if not exists mailbox_message_company (
  user_id uuid not null references app_user(id),message_id uuid not null,
  company_id uuid references sales_company(id),source text not null check(source in ('domain-match','user-confirmed','user-rejected','ambiguous')),
  updated_at timestamptz not null default now(),primary key(user_id,message_id),
  foreign key(user_id,message_id) references mailbox_message(user_id,id) on delete cascade
);
alter table mailbox_message_company enable row level security;
alter table mailbox_message_company force row level security;
drop policy if exists mailbox_company_owner on mailbox_message_company;
create policy mailbox_company_owner on mailbox_message_company using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update,delete on mailbox_message_company to network_copilot_app;
