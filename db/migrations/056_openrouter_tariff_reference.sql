-- Public rate evidence only. A changed source holds the affected static tariff until separately reviewed.
create table if not exists billing_tariff_evidence_snapshot (
  source_key text not null check(source_key='openrouter-sol-standard-text-json-v1'),
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  tariff_key text not null check(tariff_key='openrouter-sol-credits-standard-text-json'),
  observed_at timestamptz not null,
  evidence jsonb not null,
  primary key(source_key,source_hash)
);
create index if not exists billing_tariff_evidence_latest_idx on billing_tariff_evidence_snapshot(source_key,observed_at desc);
create table if not exists billing_tariff_refresh_state (
  source_key text primary key check(source_key='openrouter-sol-standard-text-json-v1'),
  tariff_key text not null check(tariff_key='openrouter-sol-credits-standard-text-json'),
  checked_at timestamptz not null,
  next_attempt_at timestamptz not null,
  status text not null check(status in ('validated','review-required','unavailable')),
  hold boolean not null default false
);
create table if not exists billing_tariff_refresh_observation (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check(source_key='openrouter-sol-standard-text-json-v1'),
  checked_at timestamptz not null,
  status text not null check(status in ('validated','review-required','unavailable')),
  metrics jsonb not null
);
alter table billing_tariff_evidence_snapshot enable row level security;
alter table billing_tariff_evidence_snapshot force row level security;
alter table billing_tariff_refresh_state enable row level security;
alter table billing_tariff_refresh_state force row level security;
alter table billing_tariff_refresh_observation enable row level security;
alter table billing_tariff_refresh_observation force row level security;
drop policy if exists billing_tariff_public_snapshot on billing_tariff_evidence_snapshot;
create policy billing_tariff_public_snapshot on billing_tariff_evidence_snapshot using(true) with check(true);
drop policy if exists billing_tariff_public_state on billing_tariff_refresh_state;
create policy billing_tariff_public_state on billing_tariff_refresh_state using(true) with check(true);
drop policy if exists billing_tariff_public_observation on billing_tariff_refresh_observation;
create policy billing_tariff_public_observation on billing_tariff_refresh_observation using(true) with check(true);
grant select,insert on billing_tariff_evidence_snapshot,billing_tariff_refresh_observation to network_copilot_app;
grant select,insert,update on billing_tariff_refresh_state to network_copilot_app;
comment on table billing_tariff_evidence_snapshot is 'Append-only public OpenRouter pricing evidence, not an admitted tariff, invoice, or spending authorization. No user data.';
