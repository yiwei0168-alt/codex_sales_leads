-- Operational lease state, not model/quality evidence or activation authority.
create table if not exists agent_skill_candidate_execution_lease (
 owner_id uuid not null references app_user(id),evaluation_id uuid not null,
 arm text not null check(arm in('baseline','candidate')),
 source_kind text not null check(source_kind in('synthetic-fixture','production-runner-pending-verification')),
 freeze_id uuid references agent_skill_acceptance_freeze(id),valid_until timestamptz,
 execution_token text not null check(execution_token ~ '^[1-9][0-9]*$'),
 status text not null check(status in('running','released')),
 control text check(control in('pause','cancel')),lease_until timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,evaluation_id,arm),check(status='released' or lease_until is not null)
);
alter table agent_skill_candidate_execution_lease enable row level security;
alter table agent_skill_candidate_execution_lease force row level security;
drop policy if exists collector_owned on agent_skill_candidate_execution_lease;
create policy collector_owned on agent_skill_candidate_execution_lease for all to network_copilot_skill_collector
 using(owner_id=app_current_user_id()) with check(owner_id=app_current_user_id());
revoke all on agent_skill_candidate_execution_lease from public,network_copilot_app,network_copilot_skill_collector;
grant select,insert on agent_skill_candidate_execution_lease to network_copilot_skill_collector;
grant update(execution_token,status,control,lease_until,valid_until,updated_at) on agent_skill_candidate_execution_lease to network_copilot_skill_collector;
