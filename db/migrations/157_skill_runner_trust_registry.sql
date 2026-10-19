-- Public-key enrollment only. No initial registry and no private keys.
create table if not exists skill_runner_trust_registry_version (
 revision bigint generated always as identity primary key,
 registry jsonb not null check(jsonb_typeof(registry)='object'),
 registry_hash text not null check(registry_hash ~ '^[a-f0-9]{64}$'),
 published_at timestamptz not null default clock_timestamp(),
 published_by text not null default session_user
);
create table if not exists skill_runner_trust_registry_current (
 singleton boolean primary key default true check(singleton),
 revision bigint not null references skill_runner_trust_registry_version(revision)
);
revoke all on skill_runner_trust_registry_version,skill_runner_trust_registry_current from public,network_copilot_app,network_copilot_skill_collector;
revoke all on sequence skill_runner_trust_registry_version_revision_seq from public,network_copilot_app,network_copilot_skill_collector;
grant select on skill_runner_trust_registry_version,skill_runner_trust_registry_current to network_copilot_app,network_copilot_skill_collector;

create or replace function reject_skill_trust_registry_version_mutation() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Trust registry versions are immutable'; end $$;
drop trigger if exists skill_trust_registry_version_immutable on skill_runner_trust_registry_version;
create trigger skill_trust_registry_version_immutable before update or delete or truncate on skill_runner_trust_registry_version
 for each statement execute function reject_skill_trust_registry_version_mutation();

-- A statement trigger acquires admission before row locks, including privileged
-- direct DML. Administrative trigger disabling remains outside this guarantee.
create or replace function lock_skill_trust_registry_write() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('skill-runner-trust-registry-v1',0));
 return null;
end $$;
drop trigger if exists skill_trust_registry_write on skill_runner_trust_registry_current;
create trigger skill_trust_registry_write before insert or update or delete or truncate on skill_runner_trust_registry_current
 for each statement execute function lock_skill_trust_registry_write();

-- Only the migration/operations principal may publish. An empty keys array is
-- a valid revocation version. Consumers validate the strict schema and digest.
create or replace function publish_skill_runner_trust_registry(document jsonb,expected_hash text) returns bigint
language plpgsql set search_path=pg_catalog,public as $$
declare next_revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('skill-runner-trust-registry-v1',0));
 insert into public.skill_runner_trust_registry_version(registry,registry_hash) values(document,expected_hash) returning revision into next_revision;
 insert into public.skill_runner_trust_registry_current(singleton,revision) values(true,next_revision)
 on conflict(singleton) do update set revision=excluded.revision;
 return next_revision;
end $$;
revoke all on function reject_skill_trust_registry_version_mutation(),lock_skill_trust_registry_write(),publish_skill_runner_trust_registry(jsonb,text)
 from public,network_copilot_app,network_copilot_skill_collector;
