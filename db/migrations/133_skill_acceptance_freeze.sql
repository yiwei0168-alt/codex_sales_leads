create table if not exists agent_skill_acceptance_freeze (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references app_user(id),skill_id uuid not null,version integer not null,
 plan_draft jsonb not null check(jsonb_typeof(plan_draft)='object' and not(plan_draft ? 'frozenAt')),
 draft_hash text not null check(draft_hash ~ '^[a-f0-9]{64}$'),frozen_at timestamptz not null default clock_timestamp(),
 unique(owner_id,id),foreign key(owner_id,skill_id) references agent_skill(owner_id,id),foreign key(skill_id,version) references agent_skill_version(skill_id,version)
);
create or replace function stamp_skill_acceptance_freeze() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.frozen_at=clock_timestamp(); return new; end $$;
drop trigger if exists skill_freeze_stamp on agent_skill_acceptance_freeze;
create trigger skill_freeze_stamp before insert on agent_skill_acceptance_freeze for each row execute function stamp_skill_acceptance_freeze();
create table if not exists agent_skill_acceptance_freeze_revocation (
 freeze_id uuid primary key,owner_id uuid not null,reason text not null check(length(reason) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(),foreign key(owner_id,freeze_id) references agent_skill_acceptance_freeze(owner_id,id)
);
drop trigger if exists skill_freeze_immutable on agent_skill_acceptance_freeze;
create trigger skill_freeze_immutable before update or delete on agent_skill_acceptance_freeze for each row execute function reject_skill_acceptance_rewrite();
drop trigger if exists skill_freeze_revocation_immutable on agent_skill_acceptance_freeze_revocation;
create trigger skill_freeze_revocation_immutable before update or delete on agent_skill_acceptance_freeze_revocation for each row execute function reject_skill_acceptance_rewrite();
alter table agent_skill_acceptance_freeze enable row level security;
alter table agent_skill_acceptance_freeze force row level security;
alter table agent_skill_acceptance_freeze_revocation enable row level security;
alter table agent_skill_acceptance_freeze_revocation force row level security;
drop policy if exists owned_read on agent_skill_acceptance_freeze;
create policy owned_read on agent_skill_acceptance_freeze for select using(owner_id=app_current_user_id());
drop policy if exists collector_insert on agent_skill_acceptance_freeze;
create policy collector_insert on agent_skill_acceptance_freeze for insert to network_copilot_skill_collector with check(owner_id=app_current_user_id());
drop policy if exists owned_read on agent_skill_acceptance_freeze_revocation;
create policy owned_read on agent_skill_acceptance_freeze_revocation for select using(owner_id=app_current_user_id());
drop policy if exists owned_revoke on agent_skill_acceptance_freeze_revocation;
create policy owned_revoke on agent_skill_acceptance_freeze_revocation for insert with check(owner_id=app_current_user_id());
revoke all on agent_skill_acceptance_freeze,agent_skill_acceptance_freeze_revocation from public,network_copilot_app;
grant select on agent_skill_acceptance_freeze to network_copilot_app;
grant select,insert on agent_skill_acceptance_freeze to network_copilot_skill_collector;
grant select,insert on agent_skill_acceptance_freeze_revocation to network_copilot_app,network_copilot_skill_collector;
revoke all on function stamp_skill_acceptance_freeze() from public,network_copilot_app;
