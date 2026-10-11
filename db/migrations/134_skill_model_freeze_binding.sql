alter table agent_skill_model_attempt add column if not exists freeze_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='skill_model_attempt_owned_freeze') then
  alter table agent_skill_model_attempt add constraint skill_model_attempt_owned_freeze
   foreign key(owner_id,freeze_id) references agent_skill_acceptance_freeze(owner_id,id);
 end if;
end $$;
create or replace function check_skill_model_freeze() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.freeze_id is not null and not exists(
  select 1 from agent_skill_acceptance_freeze f where f.id=new.freeze_id and f.owner_id=new.owner_id
   and f.frozen_at<=clock_timestamp() and (f.plan_draft->>'expiresAt')::timestamptz>clock_timestamp()
   and not exists(select 1 from agent_skill_acceptance_freeze_revocation r where r.freeze_id=f.id)
 ) then raise exception 'Skill model freeze unavailable'; end if;
 return new;
end $$;
drop trigger if exists skill_model_freeze_admission on agent_skill_model_attempt;
create trigger skill_model_freeze_admission before insert on agent_skill_model_attempt for each row execute function check_skill_model_freeze();
revoke all on function check_skill_model_freeze() from public,network_copilot_app;
