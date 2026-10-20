-- This is a deadline/receipt integrity backstop, never an activation grant.
-- The server must still authenticate all sources, production provenance and
-- latest human judgments before writing a skill_activated event.
create or replace function check_skill_activation_commit() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare deadline timestamptz; lease_deadline timestamptz;
begin
 if new.kind<>'skill_activated' then return new; end if;
 if public.app_current_user_id() is distinct from new.user_id
  or new.payload->>'protocol' is distinct from 'skill-final-activation-v1'
  or new.payload->>'validBefore' is null
  or not coalesce(new.payload->>'activationProofHash' ~ '^[a-f0-9]{64}$',false) then
  raise exception 'Skill activation commit receipt invalid';
 end if;
 deadline=(new.payload->>'validBefore')::timestamptz;
 select r.lease_until into lease_deadline from agent_run r join app_user u on u.id=r.user_id
 join agent_tool_call c on c.user_id=r.user_id and c.run_id=r.id and c.id=(new.payload->>'callId')::uuid
 join agent_skill s on s.owner_id=r.user_id and s.id=(new.payload->>'skillId')::uuid
 join agent_skill_acceptance_bundle b on b.owner_id=r.user_id and b.id=(new.payload->>'acceptanceBundleId')::uuid
 where r.user_id=new.user_id and r.id=new.run_id and r.status='running' and r.control is null and r.execution_kind='main-agent'
  and u.status='active' and u.role=new.payload->>'actorRole'
  and c.status='completed' and c.tool_id='skill_manage' and c.effect='reversible'
  and c.input->>'operation'='enable' and c.input->>'id'=s.id::text and (c.input->>'version')::integer=s.current_version
  and c.output->>'status'='success' and c.output->>'callId'=c.id::text
  and c.output->'data'->>'activationProofHash'=new.payload->>'activationProofHash'
  and c.output->'data'->>'acceptanceBundleId'=b.id::text
  and c.output->'data'->>'acceptanceArtifactHash'=b.artifact_hash
  and b.skill_id=s.id and b.version=s.current_version and b.source_kind='production-runner-pending-verification'
  and s.enabled and not s.published and s.scope='account' and s.current_version=(new.payload->>'version')::integer;
 if not found or clock_timestamp()>=least(deadline,lease_deadline) then
  raise exception 'Skill activation expired or changed at commit';
 end if;
 return new;
end $$;
revoke all on function check_skill_activation_commit() from public,network_copilot_app,network_copilot_skill_collector;
drop trigger if exists skill_activation_commit_guard on agent_run_event;
create constraint trigger skill_activation_commit_guard after insert on agent_run_event
 deferrable initially deferred for each row when(new.kind='skill_activated') execute function check_skill_activation_commit();
