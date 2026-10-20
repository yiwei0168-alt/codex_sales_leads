-- Structural health plus actually retained transaction gates. No quality grant.
create or replace function skill_activation_source_guard_requirements()
returns table(relation_name text,trigger_name text,function_name text,trigger_type integer)
language sql stable set search_path=pg_catalog,public as $$
 select name,'skill_knowledge_source_statement','serialize_skill_knowledge_source_statement()',62
 from unnest(public.skill_activation_source_tables()) source(name)
 where name like 'knowledge_%' and name not in('knowledge_asset_immutable_snapshot','knowledge_asset_snapshot_prune_audit')
 union all select name,'skill_memory_source_statement','serialize_skill_memory_source_statement()',62
 from unnest(array['agent_memory','agent_memory_version','user_outreach_memory','outreach_knowledge_item','agent_memory_observation','agent_memory_conflict']) source(name)
 union all select name,'skill_global_memory_source_row','serialize_skill_global_memory_row()',31
 from unnest(array['agent_memory','agent_memory_version']) source(name)
 union all select name,'skill_method_catalog_statement','serialize_skill_method_catalog_statement()',62
 from unnest(array['agent_skill','agent_skill_version','agent_run_skill']) source(name)
 union all select name,'skill_method_catalog_row','serialize_skill_method_catalog_row()',31
 from unnest(array['agent_skill','agent_skill_version','agent_run_skill']) source(name)
 union all select * from (values
  ('agent_skill_model_attempt','skill_model_freeze_admission','check_skill_model_freeze()',7),
  ('agent_skill_model_outcome','skill_model_outcome_freeze_admission','check_skill_model_freeze()',7),
  ('agent_skill_acceptance_freeze_revocation','skill_freeze_revocation_serialization','lock_skill_freeze_revocation()',7),
  ('agent_skill_model_attempt','skill_model_attempt_immutable','reject_skill_acceptance_rewrite()',27),
  ('agent_skill_model_outcome','skill_model_outcome_immutable','reject_skill_acceptance_rewrite()',27),
  ('agent_skill_acceptance_freeze','skill_freeze_immutable','reject_skill_acceptance_rewrite()',27),
  ('agent_skill_acceptance_freeze_revocation','skill_freeze_revocation_immutable','reject_skill_acceptance_rewrite()',27),
  ('knowledge_asset_immutable_snapshot','immutable_snapshot_mutation','reject_immutable_asset_snapshot_mutation()',58),
  ('knowledge_asset_immutable_snapshot','immutable_snapshot_orphan_delete','authorize_orphan_snapshot_delete()',11),
  ('knowledge_asset_snapshot_prune_audit','snapshot_prune_audit_immutable','reject_snapshot_prune_audit_mutation()',58),
  ('skill_runner_trust_registry_current','skill_trust_registry_write','lock_skill_trust_registry_write()',62),
  ('skill_runner_trust_registry_version','skill_trust_registry_version_immutable','reject_skill_trust_registry_version_mutation()',58),
  ('skill_runtime_package_registration','runtime_package_registration_admission','lock_skill_runtime_package_write()',62),
  ('skill_runtime_package_withdrawal','runtime_package_withdrawal_admission','lock_skill_runtime_package_write()',62),
  ('skill_runtime_package_registration','runtime_package_registration_immutable','reject_skill_runtime_package_mutation()',58),
  ('skill_runtime_package_withdrawal','runtime_package_withdrawal_immutable','reject_skill_runtime_package_mutation()',58),
  ('skill_activation_source_fence','skill_activation_source_readiness_guard','enforce_skill_activation_source_readiness()',7)
 ) required(relation_name,trigger_name,function_name,trigger_type)
$$;
create or replace function skill_activation_source_guard_health() returns boolean
language sql security definer set search_path=pg_catalog,public as $$
 select public.skill_activation_source_fence_ready() and public.skill_activation_review_guard_ready()
 and public.skill_activation_declaration_guard_ready() and not exists(
  select 1 from public.skill_activation_source_guard_requirements() required
  where not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass('public.'||required.relation_name)
   and t.tgname=required.trigger_name and t.tgfoid=to_regprocedure('public.'||required.function_name)
   and t.tgtype=required.trigger_type and t.tgenabled in('O','A') and not t.tgisinternal))
 and not exists(select 1 from (values
  ('skill_activation_commit_guard','check_skill_activation_commit()'),
  ('skill_activation_binding_commit_guard','check_skill_activation_binding_commit()')
 ) required(trigger_name,function_name) where not exists(select 1 from pg_trigger t
  where t.tgrelid='public.agent_run_event'::regclass and t.tgname=required.trigger_name
   and t.tgfoid=to_regprocedure('public.'||required.function_name) and t.tgtype=5
   and t.tgdeferrable and t.tginitdeferred and t.tgenabled in('O','A') and not t.tgisinternal))
$$;
create or replace function skill_activation_sources_ready(target_bundle uuid,target_freeze uuid,expected_artifact text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; gate record; gate_key bigint;
begin
 actor=public.app_current_user_id();
 if actor is null or current_setting('role',true) is distinct from 'network_copilot_app'
  or not public.skill_activation_source_guard_health()
  or not exists(select 1 from public.agent_skill_acceptance_bundle b join public.agent_skill_acceptance_freeze f
   on f.owner_id=b.owner_id and f.id=target_freeze and f.skill_id=b.skill_id and f.version=b.version
   join public.app_user u on u.id=b.owner_id
   where b.id=target_bundle and b.owner_id=actor and b.artifact_hash=expected_artifact
    and b.source_kind='production-runner-pending-verification' and b.raw_receipts->'collector'->>'freezeId'=f.id::text
    and b.plan-'frozenAt'=f.plan_draft
    and b.plan->>'frozenAt'=to_char(f.frozen_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    and u.status='active' and u.role=public.app_current_user_role()
    and f.frozen_at<=clock_timestamp() and clock_timestamp()<(b.plan->>'expiresAt')::timestamptz
    and not exists(select 1 from public.agent_skill_acceptance_freeze_revocation r where r.owner_id=actor and r.freeze_id=f.id)) then return false; end if;
 for gate in select * from (values
  ('skill-memory-global',false),('skill-memory-owner:'||actor::text,true),
  ('skill-acceptance:'||target_bundle::text,true),('skill-freeze:'||actor::text||':'||target_freeze::text,true),
  ('skill-runner-trust-registry-v1',false),('skill-runtime-packages-v1',false)
 ) required(name,exclusive) loop
  gate_key=hashtextextended(gate.name,0);
  if not exists(select 1 from pg_locks l where l.pid=pg_backend_pid() and l.locktype='advisory' and l.granted
   and l.database=(select oid from pg_database where datname=current_database()) and l.objsubid=1
   and l.classid=((gate_key>>32)&4294967295)::oid and l.objid=(gate_key&4294967295)::oid
   and (l.mode='ExclusiveLock' or not gate.exclusive and l.mode='ShareLock')) then return false; end if;
 end loop;
 return true;
end $$;
create or replace function enforce_skill_activation_source_readiness() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare bundle public.agent_skill_acceptance_bundle%rowtype;
begin
 select * into bundle from public.agent_skill_acceptance_bundle where id=new.bundle_id and owner_id=new.owner_id;
 if not found or not public.skill_activation_sources_ready(bundle.id,(bundle.raw_receipts->'collector'->>'freezeId')::uuid,bundle.artifact_hash)
 then raise exception 'Skill activation source protection not ready'; end if;
 return new;
end $$;
drop trigger if exists skill_activation_source_readiness_guard on skill_activation_source_fence;
create trigger skill_activation_source_readiness_guard before insert on skill_activation_source_fence
 for each row execute function enforce_skill_activation_source_readiness();
revoke all on function skill_activation_source_guard_requirements(),skill_activation_source_guard_health(),
 skill_activation_sources_ready(uuid,uuid,text),enforce_skill_activation_source_readiness()
 from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function skill_activation_source_guard_health(),skill_activation_sources_ready(uuid,uuid,text) to network_copilot_app;
