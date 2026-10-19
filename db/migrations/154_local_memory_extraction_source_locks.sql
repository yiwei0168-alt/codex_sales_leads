-- G03 ordinary extraction: hold source identity/content until the storage commit.
-- Follow memory/knowledge admission -> account -> conversation -> run -> message.
create or replace function lock_local_memory_extraction_source(target_run uuid, expected_message uuid, expected_content text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; conversation uuid; current_conversation uuid; source_message uuid; source_content text;
begin
 actor=public.app_current_user_id();
 if actor is null or target_run is null or expected_message is null or expected_content is null or length(expected_content)>12000 then
  raise exception 'source_changed';
 end if;
 -- Match statement admission even on databases predating the G09 gate functions.
 if public.app_current_user_role()='admin' then
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0));
 else
  perform pg_advisory_xact_lock_shared(hashtextextended('skill-memory-global',0));
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-owner:'||actor::text,0));
 end if;
 perform id from public.app_user where id=actor and status='active' for share;
 if not found then raise exception 'source_changed'; end if;
 select conversation_id into conversation from public.agent_run where id=target_run and user_id=actor;
 if conversation is null then raise exception 'source_changed'; end if;
 -- UPDATE fences new or moved messages through their conversation foreign key.
 perform id from public.assistant_conversation where id=conversation and user_id=actor for update;
 if not found then raise exception 'source_changed'; end if;
 select conversation_id into current_conversation from public.agent_run where id=target_run and user_id=actor
  and status='completed' and execution_kind='main-agent' for share;
 if not found or current_conversation is distinct from conversation then raise exception 'source_changed'; end if;
 -- Also fence edits to non-first messages that could change first-message ordering.
 perform id from public.assistant_message where user_id=actor and conversation_id=conversation order by id for share;
 select id,content into source_message,source_content from public.assistant_message where user_id=actor
  and conversation_id=conversation and metadata->>'runId'=target_run::text and role='user' order by created_at,id limit 1;
 if source_message is distinct from expected_message or source_content is distinct from expected_content then
  raise exception 'source_changed';
 end if;
end $$;
revoke all on function lock_local_memory_extraction_source(uuid,uuid,text) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_local_memory_extraction_source(uuid,uuid,text) to network_copilot_app;
