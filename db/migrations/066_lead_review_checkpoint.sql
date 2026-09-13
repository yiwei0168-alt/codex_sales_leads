-- A completed model response is durable before the next review subcall or peer.
-- This table is additive; older graph checkpoints remain readable and cache misses
-- cannot erase prior paid reservations.
create table if not exists lead_review_checkpoint (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  candidate_id text not null,
  phase text not null check (phase in ('secondary','judge')),
  execution_contract text not null check (execution_contract ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id, country_code, candidate_id, phase, execution_contract)
);
-- The unique constraint already provides the exact lookup index.
drop index if exists lead_review_checkpoint_lookup_idx;
alter table lead_review_checkpoint enable row level security;
alter table lead_review_checkpoint force row level security;
drop policy if exists lead_review_checkpoint_tenant on lead_review_checkpoint;
create policy lead_review_checkpoint_tenant on lead_review_checkpoint
  using (user_id=app_current_user_id() and exists(
    select 1 from market_workspace w where w.id=workspace_id and w.owner_id=user_id))
  with check (user_id=app_current_user_id() and exists(
    select 1 from market_workspace w where w.id=workspace_id and w.owner_id=user_id));
grant select,insert on lead_review_checkpoint to network_copilot_app;
-- Migration 014 re-grants broad public-table privileges on every replay.
-- Revoke at the end of this migration so completed responses remain append-only.
revoke update,delete on lead_review_checkpoint from network_copilot_app;
comment on table lead_review_checkpoint is
  'Tenant- and country-scoped completed secondary/judge model responses keyed by their exact wire dependency. No credentials or raw HTTP response are stored.';
