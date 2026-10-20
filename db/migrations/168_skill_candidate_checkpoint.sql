-- Private mutable recovery state; model evidence remains separately append-only.
create table if not exists agent_skill_candidate_checkpoint (
 owner_id uuid not null references app_user(id) on delete cascade,evaluation_id uuid not null,
 arm text not null check(arm in('baseline','candidate')),
 snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),
 freeze_id uuid references agent_skill_acceptance_freeze(id),
 source_kind text not null check(source_kind in('synthetic-fixture','production-runner-pending-verification')),
 execution_token text not null check(execution_token ~ '^[1-9][0-9]*$'),
 revision bigint not null default 0 check(revision>=0),
 payload jsonb,payload_hash text,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,evaluation_id,arm),
 check((payload is null and payload_hash is null) or
  (payload is not null and payload_hash is not null and jsonb_typeof(payload)='object' and payload_hash ~ '^[a-f0-9]{64}$'))
);
alter table agent_skill_candidate_checkpoint enable row level security;
alter table agent_skill_candidate_checkpoint force row level security;
drop policy if exists collector_owned on agent_skill_candidate_checkpoint;
create policy collector_owned on agent_skill_candidate_checkpoint for all to network_copilot_skill_collector
 using(owner_id=app_current_user_id()) with check(owner_id=app_current_user_id());
revoke all on agent_skill_candidate_checkpoint from public,network_copilot_app,network_copilot_skill_collector;
grant select,insert on agent_skill_candidate_checkpoint to network_copilot_skill_collector;
grant update(execution_token,revision,payload,payload_hash,updated_at) on agent_skill_candidate_checkpoint to network_copilot_skill_collector;
