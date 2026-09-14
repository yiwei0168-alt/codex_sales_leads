-- The raw structured final score response is durable before normalization or cache publication.
-- A missing row never authorizes replay of an unknown paid request.
create table if not exists lead_qualification_final_checkpoint (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  action_id uuid not null references assistant_action(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  candidate_id text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  execution_contract text not null check (execution_contract ~ '^[a-f0-9]{64}$'),
  paid_request_fingerprint text not null check (paid_request_fingerprint ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id, action_id, country_code, candidate_id,
    source_fingerprint, execution_contract)
);
create index if not exists qualification_final_paid_replay_lookup
  on lead_qualification_final_checkpoint(user_id,action_id,paid_request_fingerprint);
alter table lead_qualification_final_checkpoint enable row level security;
alter table lead_qualification_final_checkpoint force row level security;
drop policy if exists lead_qualification_final_checkpoint_tenant on lead_qualification_final_checkpoint;
create policy lead_qualification_final_checkpoint_tenant on lead_qualification_final_checkpoint
  using (user_id=app_current_user_id() and exists (
    select 1 from market_workspace w where w.id=workspace_id and w.owner_id=user_id)
    and exists (select 1 from assistant_action a where a.id=action_id and a.user_id=user_id))
  with check (user_id=app_current_user_id() and exists (
    select 1 from market_workspace w where w.id=workspace_id and w.owner_id=user_id)
    and exists (select 1 from assistant_action a where a.id=action_id and a.user_id=user_id));
grant select,insert on lead_qualification_final_checkpoint to network_copilot_app;
revoke update,delete on lead_qualification_final_checkpoint from network_copilot_app;
comment on table lead_qualification_final_checkpoint is
  'Append-only structured final score response, keyed to owner, task, market and exact paid request; no raw HTTP or credentials.';
