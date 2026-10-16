-- G09 source-lock primitive only; no dependency on deferred evaluation migrations.
-- Locks do not certify source eligibility, method quality or activation permission.
create or replace function lock_skill_memory_sources(source_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; locked_count integer;
begin
 actor=public.app_current_user_id();
 if actor is null or source_ids is null or cardinality(source_ids)>100
   or array_position(source_ids,null) is not null
   or cardinality(source_ids)<>(select count(distinct value) from unnest(source_ids) as value) then
  raise exception 'Invalid Skill memory source lock request';
 end if;
 -- FOR UPDATE also conflicts with FK KEY SHARE taken by newly inserted
 -- corrections/invalidations/conflicts. Existing conflict state changes need
 -- their own row locks, because unchanged FK columns need not be rechecked.
 perform id from public.agent_memory_observation
  where owner_id=actor and id=any(source_ids) order by id for update;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(source_ids) then raise exception 'Skill memory source unavailable'; end if;
 perform id from public.agent_memory_conflict
  where owner_id=actor and (earlier_id=any(source_ids) or later_id=any(source_ids)) order by id for update;
 return locked_count;
end $$;
revoke all on function lock_skill_memory_sources(uuid[]) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_memory_sources(uuid[]) to network_copilot_app;
