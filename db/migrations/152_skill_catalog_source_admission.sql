-- G09: freeze the visible method catalog, including phantom inserts and old pins.
-- Reuse the memory/knowledge admission order before any bundle or Skill row lock.
create or replace function lock_skill_method_catalog_sources() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.lock_skill_decision_memory_sources();
end $$;
revoke all on function lock_skill_method_catalog_sources() from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_method_catalog_sources() to network_copilot_app;

create or replace function lock_skill_method_catalog_writes(method_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid;
begin
 actor=public.app_current_user_id();
 if actor is null or public.app_current_user_role()='admin' or exists(
  select 1 from public.agent_skill s where s.id=method_id and
   (s.scope='global' or s.owner_id<>actor or exists(select 1 from public.agent_run_skill p where p.skill_id=s.id and p.user_id<>s.owner_id))) then
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0));
 else
  perform pg_advisory_xact_lock_shared(hashtextextended('skill-memory-global',0));
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-owner:'||actor::text,0));
 end if;
end $$;
revoke all on function lock_skill_method_catalog_writes(uuid) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_method_catalog_writes(uuid) to network_copilot_app;

create or replace function serialize_skill_method_catalog_statement() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='TRUNCATE' then
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0));
 else
  perform public.lock_skill_method_catalog_writes(null);
 end if;
 return null;
end $$;
revoke all on function serialize_skill_method_catalog_statement() from public,network_copilot_app,network_copilot_skill_collector;

-- Session role alone cannot identify a shared source: owners may have changed
-- roles/scopes, and old pins keep a formerly shared method visible to peers.
create or replace function serialize_skill_method_catalog_row() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; shared_source boolean; method_ids uuid[];
begin
 actor=public.app_current_user_id();
 if tg_table_name='agent_skill' then
  shared_source=(tg_op<>'INSERT' and (old.scope='global' or old.owner_id is distinct from actor))
   or (tg_op<>'DELETE' and (new.scope='global' or new.owner_id is distinct from actor));
  method_ids=array[case when tg_op<>'INSERT' then old.id end,case when tg_op<>'DELETE' then new.id end];
  if not coalesce(shared_source,false) then
   select exists(select 1 from public.agent_run_skill p join public.agent_skill s on s.id=p.skill_id
    where s.id=any(method_ids) and p.user_id<>s.owner_id) into shared_source;
  end if;
 elsif tg_table_name='agent_skill_version' then
  method_ids=array[case when tg_op<>'INSERT' then old.skill_id end,case when tg_op<>'DELETE' then new.skill_id end];
  select exists(select 1 from public.agent_skill s where s.id=any(method_ids) and
   (s.scope='global' or s.owner_id is distinct from actor or exists(select 1 from public.agent_run_skill p where p.skill_id=s.id and p.user_id<>s.owner_id))) into shared_source;
 else
  shared_source=(tg_op<>'INSERT' and old.user_id is distinct from actor)
   or (tg_op<>'DELETE' and new.user_id is distinct from actor);
 end if;
 if shared_source then perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0)); end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function serialize_skill_method_catalog_row() from public,network_copilot_app,network_copilot_skill_collector;

do $$ declare table_name text; begin
 foreach table_name in array array['agent_skill','agent_skill_version','agent_run_skill'] loop
  execute format('drop trigger if exists skill_method_catalog_statement on public.%I',table_name);
  execute format('create trigger skill_method_catalog_statement before insert or update or delete or truncate on public.%I for each statement execute function serialize_skill_method_catalog_statement()',table_name);
  execute format('drop trigger if exists skill_method_catalog_row on public.%I',table_name);
  execute format('create trigger skill_method_catalog_row before insert or update or delete on public.%I for each row execute function serialize_skill_method_catalog_row()',table_name);
 end loop;
end $$;
