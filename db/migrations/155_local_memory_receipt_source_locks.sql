-- Keep learned receipt inputs stable until their observation transaction commits.
create or replace function lock_local_memory_receipt_source(target_run uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;
begin
 actor=public.app_current_user_id();
 if actor is null or target_run is null then raise exception 'source_changed'; end if;
 if public.app_current_user_role()='admin' then
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0));
 else
  perform pg_advisory_xact_lock_shared(hashtextextended('skill-memory-global',0));
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-owner:'||actor::text,0));
 end if;
 perform id from public.app_user where id=actor and status='active' for share;
 if not found then raise exception 'source_changed'; end if;
 -- UPDATE also fences new/moved tool receipts through the composite run FK.
 perform id from public.agent_run where id=target_run and user_id=actor
  and status='completed' and execution_kind='main-agent' for update;
 if not found then raise exception 'source_changed'; end if;
 perform id from public.agent_tool_call where user_id=actor and run_id=target_run order by id for share;
end $$;
revoke all on function lock_local_memory_receipt_source(uuid) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_local_memory_receipt_source(uuid) to network_copilot_app;
