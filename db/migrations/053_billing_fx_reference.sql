-- Public official reference data only. Never store user billing statements or bank rates here.
create table if not exists billing_fx_reference_snapshot (
  source_key text not null check(source_key='ecb-cny-usd-reference-v1'),
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  native_currency text not null check(native_currency='CNY'),
  reference_date date not null,
  retrieved_at timestamptz not null,
  fx jsonb not null,
  primary key(source_key,source_hash,native_currency)
);
create index if not exists billing_fx_reference_latest_idx on billing_fx_reference_snapshot(source_key,reference_date desc,retrieved_at desc);
create table if not exists billing_reference_refresh_state (
  source_key text primary key check(source_key='ecb-cny-usd-reference-v1'),
  checked_at timestamptz not null,next_attempt_at timestamptz not null,
  status text not null check(status in ('validated','unavailable'))
);
create table if not exists billing_reference_refresh_observation (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check(source_key='ecb-cny-usd-reference-v1'),
  checked_at timestamptz not null,status text not null check(status in ('validated','unavailable')),
  metrics jsonb not null
);
alter table billing_fx_reference_snapshot enable row level security;
alter table billing_fx_reference_snapshot force row level security;
alter table billing_reference_refresh_state enable row level security;
alter table billing_reference_refresh_state force row level security;
alter table billing_reference_refresh_observation enable row level security;
alter table billing_reference_refresh_observation force row level security;
drop policy if exists billing_fx_public_reference on billing_fx_reference_snapshot;
create policy billing_fx_public_reference on billing_fx_reference_snapshot using(true) with check(true);
drop policy if exists billing_fx_refresh_state on billing_reference_refresh_state;
create policy billing_fx_refresh_state on billing_reference_refresh_state using(true) with check(true);
drop policy if exists billing_fx_refresh_observation on billing_reference_refresh_observation;
create policy billing_fx_refresh_observation on billing_reference_refresh_observation using(true) with check(true);
grant select,insert on billing_fx_reference_snapshot,billing_reference_refresh_observation to network_copilot_app;
grant select,insert,update on billing_reference_refresh_state to network_copilot_app;
comment on table billing_fx_reference_snapshot is 'Append-only public official FX reference snapshots; not an invoice, bank conversion or authorization to spend. No user data. Only the fixed credential-free ECB refresh adapter writes these rows.';
