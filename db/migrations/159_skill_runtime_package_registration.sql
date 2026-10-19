-- Operations records only. No initial package registration or production grant.
create table if not exists skill_runtime_package_registration (
 revision bigint generated always as identity primary key,
 request_id uuid not null unique,
 key_id text not null check(key_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$'),
 purpose text not null check(purpose in ('runner-declaration','model-transport','task-model-transport')),
 registration jsonb not null check(jsonb_typeof(registration)='object'),
 registration_hash text not null check(registration_hash ~ '^[a-f0-9]{64}$'),
 registered_at timestamptz not null default clock_timestamp(),
 registered_by text not null default session_user
);
create index if not exists skill_runtime_package_latest on skill_runtime_package_registration(key_id,purpose,revision desc);
create table if not exists skill_runtime_package_withdrawal (
 request_id uuid primary key,
 registration_revision bigint not null unique references skill_runtime_package_registration(revision),
 reason text not null check(length(trim(reason)) between 1 and 1000),
 withdrawn_at timestamptz not null default clock_timestamp(),
 withdrawn_by text not null default session_user
);
revoke all on skill_runtime_package_registration,skill_runtime_package_withdrawal from public,network_copilot_app,network_copilot_skill_collector;
revoke all on sequence skill_runtime_package_registration_revision_seq from public,network_copilot_app,network_copilot_skill_collector;
grant select on skill_runtime_package_registration,skill_runtime_package_withdrawal to network_copilot_app,network_copilot_skill_collector;

create or replace function lock_skill_runtime_package_write() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin perform pg_advisory_xact_lock(hashtextextended('skill-runtime-packages-v1',0)); return null; end $$;
create or replace function reject_skill_runtime_package_mutation() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Runtime package history is immutable'; end $$;
drop trigger if exists runtime_package_registration_admission on skill_runtime_package_registration;
create trigger runtime_package_registration_admission before insert or update or delete or truncate on skill_runtime_package_registration
 for each statement execute function lock_skill_runtime_package_write();
drop trigger if exists runtime_package_withdrawal_admission on skill_runtime_package_withdrawal;
create trigger runtime_package_withdrawal_admission before insert or update or delete or truncate on skill_runtime_package_withdrawal
 for each statement execute function lock_skill_runtime_package_write();
drop trigger if exists runtime_package_registration_immutable on skill_runtime_package_registration;
create trigger runtime_package_registration_immutable before update or delete or truncate on skill_runtime_package_registration
 for each statement execute function reject_skill_runtime_package_mutation();
drop trigger if exists runtime_package_withdrawal_immutable on skill_runtime_package_withdrawal;
create trigger runtime_package_withdrawal_immutable before update or delete or truncate on skill_runtime_package_withdrawal
 for each statement execute function reject_skill_runtime_package_mutation();

create or replace function register_skill_runtime_package(document jsonb,expected_hash text,request uuid,expected_revision bigint) returns bigint
language plpgsql set search_path=pg_catalog,public as $$
declare previous public.skill_runtime_package_registration%rowtype; current_revision bigint; published bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('skill-runtime-packages-v1',0));
 select * into previous from public.skill_runtime_package_registration where request_id=request;
 if found then
  if previous.registration_hash<>expected_hash or previous.registration<>document then raise exception 'Runtime package request changed'; end if;
  return previous.revision;
 end if;
 if document->>'protocol' is distinct from 'skill-runtime-package-registration-v1'
  or jsonb_typeof(document->'binding') is distinct from 'object' or jsonb_typeof(document->'inspection') is distinct from 'object'
  or jsonb_typeof(document->'validUntil') is distinct from 'string'
  or (document->>'validUntil')::timestamptz<=clock_timestamp() then raise exception 'Runtime package registration invalid'; end if;
 select max(revision) into current_revision from public.skill_runtime_package_registration
  where key_id=document->'binding'->>'keyId' and purpose=document->'binding'->>'purpose';
 if current_revision is distinct from expected_revision then raise exception 'Runtime package revision changed'; end if;
 insert into public.skill_runtime_package_registration(request_id,key_id,purpose,registration,registration_hash)
  values(request,document->'binding'->>'keyId',document->'binding'->>'purpose',document,expected_hash) returning revision into published;
 return published;
end $$;
create or replace function withdraw_skill_runtime_package(request uuid,target bigint,explanation text) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare previous public.skill_runtime_package_withdrawal%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('skill-runtime-packages-v1',0));
 select * into previous from public.skill_runtime_package_withdrawal where request_id=request;
 if found then
  if previous.registration_revision<>target or previous.reason<>explanation then raise exception 'Runtime package withdrawal request changed'; end if;
  return previous.request_id;
 end if;
 if exists(select 1 from public.skill_runtime_package_withdrawal where registration_revision=target) then raise exception 'Runtime package already withdrawn'; end if;
 insert into public.skill_runtime_package_withdrawal(request_id,registration_revision,reason) values(request,target,explanation);
 return request;
end $$;
revoke all on function lock_skill_runtime_package_write(),reject_skill_runtime_package_mutation(),register_skill_runtime_package(jsonb,text,uuid,bigint),withdraw_skill_runtime_package(uuid,bigint,text)
 from public,network_copilot_app,network_copilot_skill_collector;
