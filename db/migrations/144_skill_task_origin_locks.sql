-- G09: keep initial conversation provenance stable without granting table writes.
create or replace function lock_skill_task_origins(run_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; origin_count integer; locked_count integer; conversation_ids uuid[];
begin
 actor=public.app_current_user_id();
 if actor is null or run_ids is null or cardinality(run_ids)>100 or array_position(run_ids,null) is not null
  or cardinality(run_ids)<>(select count(distinct value) from unnest(run_ids) as value) then
  raise exception 'Invalid Skill task origin lock request';
 end if;
 if cardinality(run_ids)=0 then return 0; end if;
 perform id from public.app_user where id=actor for share;
 if not found then raise exception 'Skill task origin unavailable'; end if;
 select count(distinct r.id),array_agg(distinct c.id order by c.id) into origin_count,conversation_ids
 from public.agent_run r join public.assistant_conversation c on c.id=r.conversation_id and c.user_id=actor
 where r.user_id=actor and r.id=any(run_ids);
 if origin_count<>cardinality(run_ids) then raise exception 'Skill task origin unavailable'; end if;
 -- UPDATE also fences new messages through their conversation FK.
 perform id from public.assistant_conversation where user_id=actor and id=any(conversation_ids) order by id for update;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(conversation_ids) then raise exception 'Skill task origin unavailable'; end if;
 perform id from public.assistant_message where user_id=actor and conversation_id=any(conversation_ids) order by id for share;
 return origin_count;
end $$;
revoke all on function lock_skill_task_origins(uuid[]) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_task_origins(uuid[]) to network_copilot_app;
