-- G09: protect selected prospective capture/campaign metadata, no table-write grant.
create or replace function lock_skill_shadow_sources(job_ids uuid[], run_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; origin_count integer; locked_count integer; campaign_ids uuid[];
begin
 actor=public.app_current_user_id();
 if actor is null or job_ids is null or run_ids is null or cardinality(job_ids)>100
  or cardinality(job_ids)<>cardinality(run_ids) or array_position(job_ids,null) is not null or array_position(run_ids,null) is not null
  or cardinality(job_ids)<>(select count(distinct value) from unnest(job_ids) as value) then
  raise exception 'Invalid Skill shadow source lock request';
 end if;
 if cardinality(job_ids)=0 then return 0; end if;
 select count(*),array_agg(distinct j.campaign_id order by j.campaign_id) into origin_count,campaign_ids
 from public.agent_skill_shadow_job j join unnest(job_ids,run_ids) as wanted(job_id,run_id)
  on j.id=wanted.job_id and j.run_id=wanted.run_id
 join public.agent_skill_shadow_campaign c on c.id=j.campaign_id and c.owner_id=j.owner_id
 where j.owner_id=actor;
 if origin_count<>cardinality(job_ids) then raise exception 'Skill shadow source unavailable'; end if;
 -- Campaign before job matches campaign-control operations and avoids inversion.
 perform id from public.agent_skill_shadow_campaign where owner_id=actor and id=any(campaign_ids) order by id for share;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(campaign_ids) then raise exception 'Skill shadow source unavailable'; end if;
 perform id from public.agent_skill_shadow_job where owner_id=actor and id=any(job_ids) order by id for share;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(job_ids) then raise exception 'Skill shadow source unavailable'; end if;
 -- Recheck associations after locking: they may have changed while locks waited.
 select count(*) into locked_count from public.agent_skill_shadow_job j
 join unnest(job_ids,run_ids) as wanted(job_id,run_id) on j.id=wanted.job_id and j.run_id=wanted.run_id
 where j.owner_id=actor and j.campaign_id=any(campaign_ids);
 if locked_count<>cardinality(job_ids) then raise exception 'Skill shadow source binding changed'; end if;
 return locked_count;
end $$;
revoke all on function lock_skill_shadow_sources(uuid[],uuid[]) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_shadow_sources(uuid[],uuid[]) to network_copilot_app;
