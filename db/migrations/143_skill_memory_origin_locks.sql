-- G09 only: extend 142 without changing application table-write privileges.
create or replace function lock_skill_memory_sources(source_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; locked_count integer; origin_count integer; run_ids uuid[]; message_ids uuid[]; conversation_ids uuid[];
begin
 actor=public.app_current_user_id();
 if actor is null or source_ids is null or cardinality(source_ids)>100 or array_position(source_ids,null) is not null
  or cardinality(source_ids)<>(select count(distinct value) from unnest(source_ids) as value) then
  raise exception 'Invalid Skill memory source lock request';
 end if;
 if cardinality(source_ids)=0 then return 0; end if;
 perform id from public.app_user where id=actor for share;
 if not found then raise exception 'Skill memory origin unavailable'; end if;
 select count(distinct m.id),array_agg(distinct r.id order by r.id),array_agg(distinct msg.id order by msg.id),array_agg(distinct c.id order by c.id)
 into origin_count,run_ids,message_ids,conversation_ids
 from public.agent_memory_observation m
 join public.agent_run r on r.id::text=m.source_receipt->>'runId' and r.user_id=actor
 join public.assistant_message msg on msg.id::text=m.source_receipt->>'messageId' and msg.user_id=actor and msg.conversation_id=r.conversation_id
 join public.assistant_conversation c on c.id=r.conversation_id and c.user_id=actor
 where m.owner_id=actor and m.id=any(source_ids);
 if origin_count<>cardinality(source_ids) then raise exception 'Skill memory origin unavailable'; end if;
 -- SHARE prevents content/status/ownership changes but permits ordinary FK inserts.
 perform id from public.assistant_conversation where user_id=actor and id=any(conversation_ids) order by id for share;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(conversation_ids) then raise exception 'Skill memory origin unavailable'; end if;
 perform id from public.agent_run where user_id=actor and id=any(run_ids) order by id for share;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(run_ids) then raise exception 'Skill memory origin unavailable'; end if;
 perform id from public.assistant_message where user_id=actor and id=any(message_ids) order by id for share;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(message_ids) then raise exception 'Skill memory origin unavailable'; end if;
 perform id from public.agent_memory_observation where owner_id=actor and id=any(source_ids) order by id for update;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(source_ids) then raise exception 'Skill memory source unavailable'; end if;
 perform id from public.agent_memory_conflict where owner_id=actor and (earlier_id=any(source_ids) or later_id=any(source_ids)) order by id for update;
 return locked_count;
end $$;
revoke all on function lock_skill_memory_sources(uuid[]) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_memory_sources(uuid[]) to network_copilot_app;
