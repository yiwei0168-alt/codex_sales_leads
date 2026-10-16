-- Serialize append-only model evidence with the final freeze transaction.
create or replace function check_skill_model_freeze() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare bound_freeze uuid;
begin
 if tg_table_name='agent_skill_model_attempt' then bound_freeze=new.freeze_id;
 else
  select freeze_id into bound_freeze from public.agent_skill_model_attempt where id=new.attempt_id and owner_id=new.owner_id;
  if not found then raise exception 'Skill model attempt unavailable'; end if;
 end if;
 if bound_freeze is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('skill-freeze:'||new.owner_id::text||':'||bound_freeze::text,0));
 if not exists(select 1 from public.agent_skill_acceptance_freeze f where f.id=bound_freeze and f.owner_id=new.owner_id
  and f.frozen_at<=clock_timestamp() and (f.plan_draft->>'expiresAt')::timestamptz>clock_timestamp()
  and not exists(select 1 from public.agent_skill_acceptance_freeze_revocation r where r.freeze_id=f.id))
 then raise exception 'Skill model freeze unavailable'; end if;
 return new;
end $$;
drop trigger if exists skill_model_outcome_freeze_admission on agent_skill_model_outcome;
create trigger skill_model_outcome_freeze_admission before insert on agent_skill_model_outcome
 for each row execute function check_skill_model_freeze();
revoke all on function check_skill_model_freeze() from public,network_copilot_app;

create or replace function lock_skill_freeze_revocation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('skill-freeze:'||new.owner_id::text||':'||new.freeze_id::text,0));
 return new;
end $$;
drop trigger if exists skill_freeze_revocation_serialization on agent_skill_acceptance_freeze_revocation;
create trigger skill_freeze_revocation_serialization before insert on agent_skill_acceptance_freeze_revocation
 for each row execute function lock_skill_freeze_revocation();
revoke all on function lock_skill_freeze_revocation() from public,network_copilot_app,network_copilot_skill_collector;
