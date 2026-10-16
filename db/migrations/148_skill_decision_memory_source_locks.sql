-- Protect current and historical memory domains, including phantom inserts.
create or replace function lock_skill_decision_memory_sources() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid;
begin
 actor=public.app_current_user_id();
 if actor is null or not exists(select 1 from public.app_user where id=actor) then raise exception 'Skill memory owner unavailable'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('skill-memory-global',0));
 perform pg_advisory_xact_lock(hashtextextended('skill-memory-owner:'||actor::text,0));
end $$;
revoke all on function lock_skill_decision_memory_sources() from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_decision_memory_sources() to network_copilot_app;

-- Statement admission runs before row locks. Administrative/unscoped writes and
-- legacy shared-policy writes take the global exclusive gate.
create or replace function serialize_skill_memory_source_statement() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare actor uuid;
begin
 actor=public.app_current_user_id();
 if actor is null or public.app_current_user_role()='admin' or tg_table_name='outreach_knowledge_item' or tg_op='TRUNCATE' then
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0));
 else
  perform pg_advisory_xact_lock_shared(hashtextextended('skill-memory-global',0));
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-owner:'||actor::text,0));
 end if;
 return null;
end $$;
revoke all on function serialize_skill_memory_source_statement() from public,network_copilot_app,network_copilot_skill_collector;

-- A global memory version can belong to an account whose current role changed.
-- Inspect the actual parent scope rather than trusting only the session role.
create or replace function serialize_skill_global_memory_row() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare shared_source boolean;
begin
 if tg_table_name='agent_memory' then
  shared_source=(tg_op<>'INSERT' and old.scope='global') or (tg_op<>'DELETE' and new.scope='global');
 else
  select exists(select 1 from public.agent_memory m where m.scope='global'
   and ((tg_op<>'INSERT' and m.id=old.memory_id) or (tg_op<>'DELETE' and m.id=new.memory_id))) into shared_source;
 end if;
 if shared_source then perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0)); end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function serialize_skill_global_memory_row() from public,network_copilot_app,network_copilot_skill_collector;

do $$ declare table_name text; begin
 foreach table_name in array array['agent_memory','agent_memory_version','user_outreach_memory','outreach_knowledge_item','agent_memory_observation','agent_memory_conflict'] loop
  execute format('drop trigger if exists skill_memory_source_statement on public.%I',table_name);
  execute format('create trigger skill_memory_source_statement before insert or update or delete or truncate on public.%I for each statement execute function serialize_skill_memory_source_statement()',table_name);
 end loop;
 foreach table_name in array array['agent_memory','agent_memory_version'] loop
  execute format('drop trigger if exists skill_global_memory_source_row on public.%I',table_name);
  execute format('create trigger skill_global_memory_source_row before insert or update or delete on public.%I for each row execute function serialize_skill_global_memory_row()',table_name);
 end loop;
end $$;
