-- Remember exactly which qualification was used; no eligibility or initial grant.
alter table agent_skill add column if not exists activation_binding jsonb;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='agent_skill'::regclass and conname='skill_activation_binding_shape') then
  alter table agent_skill add constraint skill_activation_binding_shape check(activation_binding is null or
   (jsonb_typeof(activation_binding)='object' and activation_binding->>'protocol' is not distinct from 'skill-activation-binding-v1'));
 end if;
end $$;

create or replace function clear_skill_activation_binding() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.activation_binding is not distinct from old.activation_binding
  or not new.enabled or new.published or new.scope<>'account'
  or new.activation_binding->>'ownerId' is distinct from new.owner_id::text
  or new.activation_binding->>'skillId' is distinct from new.id::text
  or new.activation_binding->>'version' is distinct from new.current_version::text then
  new.activation_binding=null;
 end if;
 return new;
end $$;
drop trigger if exists skill_activation_binding_manual_change on agent_skill;
create trigger skill_activation_binding_manual_change before update of enabled,published,current_version,name,scope,owner_id
 on agent_skill for each row execute function clear_skill_activation_binding();

-- INVOKER preserves normal tenant RLS; only immutable snapshots and current
-- revocation state are inspected. This does not certify sources or human quality.
create or replace function skill_activation_is_current(actor uuid,target uuid,pinned_version integer) returns boolean
language plpgsql set search_path=pg_catalog,public as $$
declare s public.agent_skill%rowtype; b jsonb; current_reviews jsonb; revisions jsonb;
begin
 if actor is distinct from public.app_current_user_id()
  or not exists(select 1 from public.app_user where id=actor and status='active') then return false; end if;
 select * into s from public.agent_skill where id=target and (owner_id=actor or (scope='global' and published));
 if not found or not s.enabled then return false; end if;
 b=s.activation_binding;
 if b is null then return true; end if;
 if s.scope<>'account' or s.owner_id<>actor or s.current_version<>pinned_version
  or b->>'protocol' is distinct from 'skill-activation-binding-v1'
  or b->>'ownerId' is distinct from actor::text or b->>'skillId' is distinct from target::text
  or b->>'version' is distinct from pinned_version::text
  or not coalesce(clock_timestamp()<(b->>'validBefore')::timestamptz,false) then return false; end if;
 if not exists(select 1 from public.agent_skill_acceptance_bundle a join public.agent_skill_acceptance_freeze f
   on f.owner_id=a.owner_id and f.id=(b->>'freezeId')::uuid and f.skill_id=a.skill_id and f.version=a.version
  where a.id=(b->>'bundleId')::uuid and a.owner_id=actor and a.skill_id=target and a.version=pinned_version
   and a.artifact_hash=b->>'artifactHash' and a.source_kind='production-runner-pending-verification'
   and a.raw_receipts->'collector'->>'freezeId'=f.id::text
   and a.plan->>'frozenAt'=to_char(f.frozen_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
   and clock_timestamp()<(a.plan->>'expiresAt')::timestamptz
   and not exists(select 1 from public.agent_skill_acceptance_freeze_revocation r where r.freeze_id=f.id and r.owner_id=actor))
  then return false; end if;
 select coalesce(jsonb_agg(jsonb_build_object('caseId',case_id,'revision',revision) order by case_id),'[]'::jsonb) into current_reviews
  from (select distinct on(case_id) case_id,revision from public.agent_skill_acceptance_judgment
   where owner_id=actor and bundle_id=(b->>'bundleId')::uuid order by case_id,revision desc) latest;
 if current_reviews is distinct from b->'reviewVersions' then return false; end if;
 if not exists(select 1 from public.skill_runner_trust_registry_current c join public.skill_runner_trust_registry_version v on v.revision=c.revision
  where c.singleton and v.registry_hash=b->>'registryHash') then return false; end if;
 revisions=b->'runtimePackageRevisions';
 if jsonb_typeof(revisions) is distinct from 'array' or jsonb_array_length(revisions)=0 then return false; end if;
 if exists(select 1 from jsonb_array_elements_text(revisions) item(value) where not exists(
  select 1 from public.skill_runtime_package_registration p where p.revision=item.value::bigint
   and clock_timestamp()<(p.registration->>'validUntil')::timestamptz
   and not exists(select 1 from public.skill_runtime_package_withdrawal w where w.registration_revision=p.revision)
   and not exists(select 1 from public.skill_runtime_package_registration later where later.key_id=p.key_id and later.purpose=p.purpose and later.revision>p.revision)))
  then return false; end if;
 return true;
end $$;

create or replace function check_skill_activation_binding_commit() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.agent_skill s where s.id=(new.payload->>'skillId')::uuid and s.owner_id=new.user_id
  and s.activation_binding->>'bundleId'=new.payload->>'acceptanceBundleId'
  and s.activation_binding->>'artifactHash'=new.payload->>'acceptanceArtifactHash'
  and s.activation_binding->>'activationProofHash'=new.payload->>'activationProofHash'
  and s.activation_binding->>'callId'=new.payload->>'callId'
  and public.skill_activation_is_current(new.user_id,s.id,(new.payload->>'version')::integer)) then
  raise exception 'Skill activation qualification binding changed at commit';
 end if;
 return new;
end $$;
drop trigger if exists skill_activation_binding_commit_guard on agent_run_event;
create constraint trigger skill_activation_binding_commit_guard after insert on agent_run_event
 deferrable initially deferred for each row when(new.kind='skill_activated') execute function check_skill_activation_binding_commit();
revoke all on function clear_skill_activation_binding(),check_skill_activation_binding_commit(),skill_activation_is_current(uuid,uuid,integer)
 from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function skill_activation_is_current(uuid,uuid,integer) to network_copilot_app;
