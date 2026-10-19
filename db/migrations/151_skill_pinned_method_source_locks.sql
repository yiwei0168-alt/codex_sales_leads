-- G09: retain every method used by recorded tasks, not only the candidate Skill.
-- The caller retains the transaction through material reconstruction/final update.
create or replace function lock_skill_pinned_method_sources(run_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; locked_count integer; pin_count integer;
begin
 actor=public.app_current_user_id();
 if actor is null or run_ids is null or cardinality(run_ids)>100 or array_position(run_ids,null) is not null
  or cardinality(run_ids)<>(select count(distinct value) from unnest(run_ids) as value) then
  raise exception 'Invalid Skill pinned method lock request';
 end if;
 -- Parent UPDATE fences new pins through agent_run_skill's account/run FK.
 perform id from public.agent_run where user_id=actor and id=any(run_ids) order by id for update;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(run_ids) then raise exception 'Skill pinned method task unavailable'; end if;
 -- Existing pins cannot be replaced or deleted while their method rows are locked.
 perform skill_id from public.agent_run_skill where user_id=actor and run_id=any(run_ids)
  order by run_id,skill_id for share;
 get diagnostics pin_count=row_count;
 perform s.id from public.agent_skill s where exists(select 1 from public.agent_run_skill p
  where p.user_id=actor and p.run_id=any(run_ids) and p.skill_id=s.id) order by s.id for share;
 perform v.skill_id from public.agent_skill_version v where exists(select 1 from public.agent_run_skill p
  where p.user_id=actor and p.run_id=any(run_ids) and p.skill_id=v.skill_id and p.version=v.version)
  order by v.skill_id,v.version for share;
 return pin_count;
end $$;
revoke all on function lock_skill_pinned_method_sources(uuid[]) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_pinned_method_sources(uuid[]) to network_copilot_app;
