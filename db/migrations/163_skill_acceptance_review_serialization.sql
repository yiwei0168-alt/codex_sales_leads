-- All judgment appenders, including direct DML, share the final reader's gate.
create or replace function serialize_skill_acceptance_judgment() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('skill-acceptance:'||new.bundle_id::text,0));
 return new;
end $$;
revoke all on function serialize_skill_acceptance_judgment() from public,network_copilot_app,network_copilot_skill_collector;
drop trigger if exists skill_acceptance_judgment_admission on agent_skill_acceptance_judgment;
create trigger skill_acceptance_judgment_admission before insert on agent_skill_acceptance_judgment
 for each row execute function serialize_skill_acceptance_judgment();

-- Existing row guards already prohibit UPDATE/DELETE; include TRUNCATE too.
drop trigger if exists skill_acceptance_judgment_no_truncate on agent_skill_acceptance_judgment;
create trigger skill_acceptance_judgment_no_truncate before truncate on agent_skill_acceptance_judgment
 for each statement execute function reject_skill_acceptance_rewrite();
drop trigger if exists skill_acceptance_bundle_no_truncate on agent_skill_acceptance_bundle;
create trigger skill_acceptance_bundle_no_truncate before truncate on agent_skill_acceptance_bundle
 for each statement execute function reject_skill_acceptance_rewrite();

create or replace function skill_activation_review_guard_ready() returns boolean
language sql security definer set search_path=pg_catalog,public as $$
 select not exists(
  select 1 from (values
   ('agent_skill_acceptance_judgment','skill_acceptance_judgment_admission','serialize_skill_acceptance_judgment()',7),
   ('agent_skill_acceptance_judgment','skill_acceptance_judgment_immutable','reject_skill_acceptance_rewrite()',27),
   ('agent_skill_acceptance_bundle','skill_acceptance_bundle_immutable','reject_skill_acceptance_rewrite()',27),
   ('agent_skill_acceptance_judgment','skill_acceptance_judgment_no_truncate','reject_skill_acceptance_rewrite()',34),
   ('agent_skill_acceptance_bundle','skill_acceptance_bundle_no_truncate','reject_skill_acceptance_rewrite()',34),
   ('skill_activation_source_fence','skill_activation_review_guard','enforce_skill_activation_review_guard()',7)
  ) required(relation,trigger_name,function_name,trigger_type)
  where not exists(select 1 from pg_trigger t
   where t.tgrelid=to_regclass('public.'||required.relation) and t.tgname=required.trigger_name
    and t.tgfoid=to_regprocedure('public.'||required.function_name) and t.tgtype=required.trigger_type
    and t.tgenabled in('O','A') and not t.tgisinternal))
$$;
create or replace function enforce_skill_activation_review_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.skill_activation_review_guard_ready() then raise exception 'Skill activation review source guard unavailable'; end if;
 return new;
end $$;
drop trigger if exists skill_activation_review_guard on skill_activation_source_fence;
create trigger skill_activation_review_guard before insert on skill_activation_source_fence
 for each row execute function enforce_skill_activation_review_guard();
revoke all on function skill_activation_review_guard_ready(),enforce_skill_activation_review_guard()
 from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function skill_activation_review_guard_ready() to network_copilot_app;
