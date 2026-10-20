-- Direct collector appends retain the same freeze gate as configured issuance.
create or replace function serialize_skill_runner_attestation() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('skill-freeze:'||new.owner_id::text||':'||new.freeze_id::text,0));
 return new;
end $$;
revoke all on function serialize_skill_runner_attestation() from public,network_copilot_app,network_copilot_skill_collector;
drop trigger if exists skill_runner_attestation_admission on agent_skill_runner_attestation;
create trigger skill_runner_attestation_admission before insert on agent_skill_runner_attestation
 for each row execute function serialize_skill_runner_attestation();
drop trigger if exists skill_runner_attestation_no_truncate on agent_skill_runner_attestation;
create trigger skill_runner_attestation_no_truncate before truncate on agent_skill_runner_attestation
 for each statement execute function reject_skill_acceptance_rewrite();

create or replace function skill_activation_declaration_guard_ready() returns boolean
language sql security definer set search_path=pg_catalog,public as $$
 select not exists(select 1 from (values
  ('agent_skill_runner_attestation','skill_runner_attestation_admission','serialize_skill_runner_attestation()',7),
  ('agent_skill_runner_attestation','skill_runner_attestation_immutable','reject_skill_acceptance_rewrite()',27),
  ('agent_skill_runner_attestation','skill_runner_attestation_no_truncate','reject_skill_acceptance_rewrite()',34),
  ('skill_activation_source_fence','skill_activation_declaration_guard','enforce_skill_activation_declaration_guard()',7)
 ) required(relation,trigger_name,function_name,trigger_type)
 where not exists(select 1 from pg_trigger t
  where t.tgrelid=to_regclass('public.'||required.relation) and t.tgname=required.trigger_name
   and t.tgfoid=to_regprocedure('public.'||required.function_name) and t.tgtype=required.trigger_type
   and t.tgenabled in('O','A') and not t.tgisinternal))
$$;
create or replace function enforce_skill_activation_declaration_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.skill_activation_declaration_guard_ready() then raise exception 'Skill activation declaration source guard unavailable'; end if;
 return new;
end $$;
drop trigger if exists skill_activation_declaration_guard on skill_activation_source_fence;
create trigger skill_activation_declaration_guard before insert on skill_activation_source_fence
 for each row execute function enforce_skill_activation_declaration_guard();
revoke all on function skill_activation_declaration_guard_ready(),enforce_skill_activation_declaration_guard()
 from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function skill_activation_declaration_guard_ready() to network_copilot_app;
