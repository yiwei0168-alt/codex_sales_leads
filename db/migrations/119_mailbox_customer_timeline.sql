create table if not exists mailbox_customer (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references app_user(id),
 identity_key text not null,name text not null,domain text,country text check(country ~ '^[A-Z]{2}$'),
 company_id uuid references sales_company(id),
 customer_type text check(customer_type in ('partner','inquiry','negotiating')),
 notes text not null default '',confirmed boolean not null default false,archived boolean not null default false,
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,identity_key),unique(user_id,id)
);
create table if not exists mailbox_customer_message (
 user_id uuid not null,customer_id uuid not null,message_id uuid not null,
 source text not null default 'suggested' check(source in ('suggested','confirmed','rejected')),
 primary key(user_id,customer_id,message_id),
 foreign key(user_id,customer_id) references mailbox_customer(user_id,id) on delete cascade,
 foreign key(user_id,message_id) references mailbox_message(user_id,id) on delete cascade
);
create table if not exists mailbox_timeline_note (
 user_id uuid not null,message_id uuid not null,content_hash text not null,
 ciphertext text not null,model text not null,updated_at timestamptz not null default now(),
 primary key(user_id,message_id),
 foreign key(user_id,message_id) references mailbox_message(user_id,id) on delete cascade
);
create table if not exists mailbox_customer_revision (
 user_id uuid not null,customer_id uuid not null,revision integer not null,
 snapshot jsonb not null,created_at timestamptz not null default now(),
 primary key(user_id,customer_id,revision),
 foreign key(user_id,customer_id) references mailbox_customer(user_id,id) on delete cascade
);
do $$ declare t text;begin
 foreach t in array array['mailbox_customer','mailbox_customer_message','mailbox_timeline_note','mailbox_customer_revision'] loop
 execute format('alter table %I enable row level security',t);
 execute format('alter table %I force row level security',t);
 execute format('drop policy if exists owner_only on %I',t);
 execute format('create policy owner_only on %I using(user_id=app_current_user_id()) with check(user_id=app_current_user_id())',t);
 execute format('grant select,insert,update,delete on %I to network_copilot_app',t);
 end loop;
end $$;
alter table mailbox_work_job drop constraint if exists mailbox_work_job_kind_check;
alter table mailbox_work_job add constraint mailbox_work_job_kind_check check(kind in ('learn','sync','timeline'));
