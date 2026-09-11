-- Amounts are integer micro-USD. Unknown bills retain the complete reservation.
create table if not exists user_spend_budget (
  user_id uuid primary key references app_user(id),
  limit_micros bigint not null check(limit_micros >= 0 and limit_micros <= 1000000000000),
  occupied_micros bigint not null default 0 check(occupied_micros >= 0),
  frozen boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists paid_call_reservation (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references app_user(id),
  operation_id text not null, stage text not null, tariff_key text not null, tariff_version text not null,
  reserved_micros bigint not null check(reserved_micros > 0),
  reported_micros bigint check(reported_micros >= 0),
  status text not null check(status in ('reserved','reported','unknown','bound-exceeded')),
  metrics jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists paid_call_reservation_owner_operation on paid_call_reservation(user_id,operation_id,created_at);
alter table user_spend_budget enable row level security;
alter table user_spend_budget force row level security;
alter table paid_call_reservation enable row level security;
alter table paid_call_reservation force row level security;
drop policy if exists spend_budget_owner on user_spend_budget;
create policy spend_budget_owner on user_spend_budget using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
drop policy if exists paid_reservation_owner on paid_call_reservation;
create policy paid_reservation_owner on paid_call_reservation using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update on user_spend_budget,paid_call_reservation to network_copilot_app;
