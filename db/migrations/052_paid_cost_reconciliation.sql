alter table paid_call_reservation add column if not exists estimated_micros bigint check(estimated_micros>=0);
alter table paid_call_reservation add column if not exists invoice_micros bigint check(invoice_micros>=0);
alter table paid_call_reservation add column if not exists settled_micros bigint check(settled_micros>=0);
alter table paid_call_reservation add column if not exists occupied_micros bigint check(occupied_micros>=0);
alter table paid_call_reservation add column if not exists settled_source text;
alter table paid_call_reservation add column if not exists provider_request_hash text;
create unique index if not exists paid_reservation_owner_id_unique on paid_call_reservation(user_id,id);

create table if not exists paid_cost_observation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  reservation_id uuid not null,
  kind text not null check(kind in ('usage-estimate','provider-report','invoice','verified-unbilled')),
  amount_micros bigint check(amount_micros>=0),
  source_reference_hash text not null check(source_reference_hash ~ '^[a-f0-9]{64}$'),
  source_version text not null,
  complete boolean not null,uniquely_matched boolean not null,
  provider_request_hash text,
  occupied_before bigint not null check(occupied_before>=0),
  occupied_after bigint not null check(occupied_after>=0),
  metrics jsonb not null default '{}',created_at timestamptz not null default now(),
  foreign key(user_id,reservation_id) references paid_call_reservation(user_id,id),
  unique(user_id,reservation_id,kind,source_reference_hash)
);
create table if not exists paid_rule_hold (
  user_id uuid not null references app_user(id),tariff_key text not null,tariff_version text not null,
  reason text not null,created_at timestamptz not null default now(),
  primary key(user_id,tariff_key,tariff_version)
);
alter table paid_cost_observation enable row level security;
alter table paid_cost_observation force row level security;
alter table paid_rule_hold enable row level security;
alter table paid_rule_hold force row level security;
drop policy if exists paid_cost_observation_owner on paid_cost_observation;
create policy paid_cost_observation_owner on paid_cost_observation using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
drop policy if exists paid_rule_hold_owner on paid_rule_hold;
create policy paid_rule_hold_owner on paid_rule_hold using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert on paid_cost_observation,paid_rule_hold to network_copilot_app;
comment on table paid_cost_observation is 'Append-only micro-USD observations; estimates, reports and invoice verification are distinct, never additive. Trusted source matching required before occupancy release.';
