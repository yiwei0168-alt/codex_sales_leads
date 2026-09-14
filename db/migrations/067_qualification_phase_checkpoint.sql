-- Completed fact-screening responses are append-only and tenant/task scoped.
-- In-flight or unknown paid requests stay governed by paid_call_reservation;
-- absence of a completed row is never permission to replay one.
create table if not exists lead_qualification_phase_checkpoint (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  action_id uuid not null references assistant_action(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  candidate_id text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  phase_index integer not null check (phase_index >= 0),
  execution_contract text not null check (execution_contract ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id, action_id, country_code, candidate_id,
    source_fingerprint, phase_index, execution_contract)
);
alter table lead_qualification_phase_checkpoint enable row level security;
alter table lead_qualification_phase_checkpoint force row level security;
drop policy if exists lead_qualification_phase_checkpoint_tenant on lead_qualification_phase_checkpoint;
create policy lead_qualification_phase_checkpoint_tenant on lead_qualification_phase_checkpoint
  using (user_id=app_current_user_id() and exists (
    select 1 from market_workspace w where w.id=workspace_id and w.owner_id=user_id)
    and exists (select 1 from assistant_action a where a.id=action_id and a.user_id=user_id))
  with check (user_id=app_current_user_id() and exists (
    select 1 from market_workspace w where w.id=workspace_id and w.owner_id=user_id)
    and exists (select 1 from assistant_action a where a.id=action_id and a.user_id=user_id));
grant select,insert on lead_qualification_phase_checkpoint to network_copilot_app;
-- Migration 014 broadly re-grants table privileges on replay; revoke here last.
revoke update,delete on lead_qualification_phase_checkpoint from network_copilot_app;
comment on table lead_qualification_phase_checkpoint is
  'Append-only validated completed lead fact-phase response, keyed to owner, task and exact request. No raw HTTP response or credentials.';
