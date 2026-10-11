-- A separate collector credential is required. Normal application sessions cannot
-- manufacture model evidence. These records alone are never activation grants.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='network_copilot_skill_collector') then
  create role network_copilot_skill_collector nologin nosuperuser nobypassrls;
 end if;
end $$;
create table if not exists agent_skill_model_attempt (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references app_user(id),
 evaluation_id uuid not null, arm text not null check(arm in('baseline','candidate')),
 step integer not null check(step>=0), route_index integer not null check(route_index between 0 and 2),
 source_kind text not null check(source_kind in('synthetic-fixture','production-runner-pending-verification')),
 snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),
 input jsonb not null check(jsonb_typeof(input)='object'), input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 unique(owner_id,id), unique(owner_id,evaluation_id,arm,step,route_index)
);
create table if not exists agent_skill_model_outcome (
 attempt_id uuid primary key, owner_id uuid not null,
 output jsonb not null check(jsonb_typeof(output)='object'), output_hash text not null check(output_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(owner_id,attempt_id) references agent_skill_model_attempt(owner_id,id)
);
drop trigger if exists skill_model_attempt_immutable on agent_skill_model_attempt;
create trigger skill_model_attempt_immutable before update or delete on agent_skill_model_attempt
 for each row execute function reject_skill_acceptance_rewrite();
drop trigger if exists skill_model_outcome_immutable on agent_skill_model_outcome;
create trigger skill_model_outcome_immutable before update or delete on agent_skill_model_outcome
 for each row execute function reject_skill_acceptance_rewrite();
alter table agent_skill_model_attempt enable row level security;
alter table agent_skill_model_attempt force row level security;
alter table agent_skill_model_outcome enable row level security;
alter table agent_skill_model_outcome force row level security;
drop policy if exists owned_read on agent_skill_model_attempt;
create policy owned_read on agent_skill_model_attempt for select using(owner_id=app_current_user_id());
drop policy if exists collector_insert on agent_skill_model_attempt;
create policy collector_insert on agent_skill_model_attempt for insert to network_copilot_skill_collector with check(owner_id=app_current_user_id());
drop policy if exists owned_read on agent_skill_model_outcome;
create policy owned_read on agent_skill_model_outcome for select using(owner_id=app_current_user_id());
drop policy if exists collector_insert on agent_skill_model_outcome;
create policy collector_insert on agent_skill_model_outcome for insert to network_copilot_skill_collector with check(owner_id=app_current_user_id());
revoke all on agent_skill_model_attempt,agent_skill_model_outcome from public,network_copilot_app;
grant usage on schema public to network_copilot_skill_collector;
grant execute on function app_current_user_id() to network_copilot_skill_collector;
grant select on agent_skill_model_attempt,agent_skill_model_outcome to network_copilot_app;
grant select,insert on agent_skill_model_attempt,agent_skill_model_outcome to network_copilot_skill_collector;
