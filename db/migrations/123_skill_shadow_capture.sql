-- Prospective server-owned capture. No campaign or outcome can be submitted by an Agent tool.
create table if not exists agent_skill_shadow_campaign (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_user(id),
  skill_id uuid not null, version integer not null,
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  config jsonb not null check(jsonb_typeof(config)='object'),
  enabled boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check(expires_at>created_at),
  unique(owner_id,id),
  foreign key(owner_id,skill_id) references agent_skill(owner_id,id),
  foreign key(skill_id,version) references agent_skill_version(skill_id,version)
);
create table if not exists agent_skill_shadow_job (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null, run_id uuid not null, campaign_id uuid not null,
  start_context jsonb not null, final_context jsonb,
  state text not null default 'observing' check(state in('observing','queued','running','completed','failed','skipped')),
  created_at timestamptz not null default clock_timestamp(), ready_at timestamptz,
  lease_token uuid, lease_until timestamptz, attempts integer not null default 0,
  reason text, result jsonb,
  unique(owner_id,id), unique(campaign_id,run_id),
  foreign key(owner_id,campaign_id) references agent_skill_shadow_campaign(owner_id,id),
  foreign key(owner_id,run_id) references agent_run(user_id,id)
);
create table if not exists agent_skill_shadow_event (
  id bigserial primary key, owner_id uuid not null, job_id uuid not null,
  kind text not null, payload jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  foreign key(owner_id,job_id) references agent_skill_shadow_job(owner_id,id)
);
create index if not exists agent_skill_shadow_ready on agent_skill_shadow_job(state,ready_at,id)
  where state in('queued','running');

-- Built-in SHA-256 over PostgreSQL's canonical jsonb text; kept separate from JS wire hashes.
create or replace function skill_shadow_json_hash(value jsonb) returns text
language sql immutable strict set search_path=public,pg_temp as $$
  select encode(sha256(convert_to(value::text,'UTF8')),'hex')
$$;

create or replace function skill_shadow_run_context(account_id uuid,task_id uuid) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('inputHash',skill_shadow_json_hash(r.input),
   'modelConfigHash',skill_shadow_json_hash(r.model_config),'resultHash',skill_shadow_json_hash(r.result),
   'instructionsHash',skill_shadow_json_hash(r.instructions),
   'pinnedSkills',coalesce((select jsonb_agg(jsonb_build_object('skillId',p.skill_id,'version',p.version) order by p.skill_id)
     from agent_run_skill p where p.user_id=account_id and p.run_id=task_id),'[]'::jsonb),
   'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'tool',t.tool_id,'version',t.tool_version,
     'effect',t.effect,'status',t.status,'inputHash',skill_shadow_json_hash(t.input),
     'outputHash',skill_shadow_json_hash(t.output)) order by t.created_at,t.id)
     from agent_tool_call t where t.user_id=account_id and t.run_id=task_id),'[]'::jsonb))
 from agent_run r where r.user_id=account_id and r.id=task_id and r.status='completed'
$$;

create or replace function capture_skill_shadow_lifecycle() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare j record; c record; final_payload jsonb;
begin
  if TG_OP='INSERT' then
    if new.execution_kind<>'main-agent' or new.status<>'queued' then return new; end if;
    -- A campaign registered after this INSERT cannot retrospectively claim live provenance.
    for c in select p.* from agent_skill_shadow_campaign p
      join agent_skill s on s.id=p.skill_id and s.owner_id=p.owner_id
      join agent_skill_version v on v.skill_id=s.id and v.version=p.version
      where p.owner_id=new.user_id and p.enabled and p.created_at<=clock_timestamp()
        and p.expires_at>clock_timestamp() and s.scope='account'
        and s.current_version=p.version and v.content_hash=p.content_hash
      order by p.created_at,p.id limit 8
    loop
      insert into agent_skill_shadow_job(owner_id,run_id,campaign_id,start_context)
        values(new.user_id,new.id,c.id,jsonb_build_object(
          'kind','prospective-server-capture','campaignId',c.id,'skillId',c.skill_id,'version',c.version,
          'contentHash',c.content_hash,'sourceHash',c.source_hash,'config',c.config,
          'inputHash',skill_shadow_json_hash(new.input),'modelConfigHash',skill_shadow_json_hash(new.model_config),
          'requestHash',new.request_hash,'createdRunStatus',new.status))
        on conflict(campaign_id,run_id) do nothing;
    end loop;
    return new;
  end if;
  if new.status not in('completed','cancelled') or old.status=new.status then return new; end if;
  for j in select * from agent_skill_shadow_job where owner_id=new.user_id and run_id=new.id and state='observing' for update
  loop
    if new.status='cancelled' then
      update agent_skill_shadow_job set state='skipped',reason='source-task-cancelled' where id=j.id;
      insert into agent_skill_shadow_event(owner_id,job_id,kind) values(new.user_id,j.id,'source-task-cancelled');
      continue;
    end if;
    if (select count(*) from agent_tool_call t where t.user_id=new.user_id and t.run_id=new.id)>240 then
      update agent_skill_shadow_job set state='skipped',reason='journal-limit' where id=j.id;
      insert into agent_skill_shadow_event(owner_id,job_id,kind) values(new.user_id,j.id,'journal-limit');
      continue;
    end if;
    final_payload=skill_shadow_run_context(new.user_id,new.id);
    update agent_skill_shadow_job set state='queued',ready_at=clock_timestamp(),final_context=final_payload where id=j.id;
    insert into agent_skill_shadow_event(owner_id,job_id,kind,payload)
      values(new.user_id,j.id,'source-task-completed',jsonb_build_object('finalContextHash',skill_shadow_json_hash(final_payload)));
  end loop;
  return new;
end $$;
drop trigger if exists skill_shadow_lifecycle on agent_run;
create trigger skill_shadow_lifecycle after insert or update of status on agent_run
  for each row execute function capture_skill_shadow_lifecycle();

alter table agent_skill_shadow_campaign enable row level security;
alter table agent_skill_shadow_campaign force row level security;
alter table agent_skill_shadow_job enable row level security;
alter table agent_skill_shadow_job force row level security;
alter table agent_skill_shadow_event enable row level security;
alter table agent_skill_shadow_event force row level security;
drop policy if exists owned_read on agent_skill_shadow_campaign;
create policy owned_read on agent_skill_shadow_campaign for select using(owner_id=app_current_user_id());
drop policy if exists owned_read on agent_skill_shadow_job;
create policy owned_read on agent_skill_shadow_job for select using(owner_id=app_current_user_id());
drop policy if exists owned_read on agent_skill_shadow_event;
create policy owned_read on agent_skill_shadow_event for select using(owner_id=app_current_user_id());
revoke all on agent_skill_shadow_campaign,agent_skill_shadow_job,agent_skill_shadow_event from public,network_copilot_app;
grant select on agent_skill_shadow_campaign,agent_skill_shadow_job,agent_skill_shadow_event to network_copilot_app;
revoke all on function capture_skill_shadow_lifecycle() from public,network_copilot_app;

create or replace function claim_skill_shadow_job() returns setof agent_skill_shadow_job
language plpgsql security definer set search_path=public,pg_temp as $$
declare chosen agent_skill_shadow_job;
begin
  if app_current_user_id() is null then return; end if;
  with exhausted as (update agent_skill_shadow_job set state='failed',reason='lease-retry-limit',lease_token=null,lease_until=null
    where owner_id=app_current_user_id() and state='running' and lease_until<=now() and attempts>=3 returning owner_id,id,attempts)
  insert into agent_skill_shadow_event(owner_id,job_id,kind,payload)
    select owner_id,id,'lease-retry-limit',jsonb_build_object('attempts',attempts) from exhausted;
  select j.* into chosen from agent_skill_shadow_job j join agent_skill_shadow_campaign c on c.id=j.campaign_id
    where j.owner_id=app_current_user_id() and c.enabled and c.expires_at>now() and j.attempts<3
      and (j.state='queued' or (j.state='running' and j.lease_until<=now()))
    order by j.ready_at,j.id for update of j skip locked limit 1;
  if chosen.id is null then return; end if;
  update agent_skill_shadow_job set state='running',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',
    attempts=attempts+1,reason=null where id=chosen.id returning * into chosen;
  insert into agent_skill_shadow_event(owner_id,job_id,kind,payload)
    values(chosen.owner_id,chosen.id,'claimed',jsonb_build_object('attempt',chosen.attempts,'leaseToken',chosen.lease_token));
  return next chosen;
end $$;
create or replace function heartbeat_skill_shadow_job(job uuid,token uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update agent_skill_shadow_job j set lease_until=now()+interval '90 seconds'
  where j.id=job and j.owner_id=app_current_user_id() and j.state='running' and j.lease_token=token and j.lease_until>now()
   and exists(select 1 from agent_skill_shadow_campaign c where c.id=j.campaign_id and c.enabled and c.expires_at>now());
 return found;
end $$;
create or replace function finish_skill_shadow_job(job uuid,token uuid,outcome text,artifact jsonb,detail text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare target agent_skill_shadow_job;
begin
 if outcome not in('completed','failed','skipped') or octet_length(artifact::text)>20000000 or length(detail)>500 then return false; end if;
 select j.* into target from agent_skill_shadow_job j where j.id=job and j.owner_id=app_current_user_id()
  and j.state='running' and j.lease_token=token and j.lease_until>now() for update;
 if target.id is null then return false; end if;
 if outcome='completed' and (artifact is null or target.final_context is distinct from skill_shadow_run_context(target.owner_id,target.run_id)
   or not exists(select 1 from agent_skill_shadow_campaign c join agent_skill s on s.id=c.skill_id and s.owner_id=c.owner_id
     where c.id=target.campaign_id and c.enabled and c.expires_at>now() and s.scope='account' and s.current_version=c.version
       and c.config=target.start_context->'config' and c.content_hash=target.start_context->>'contentHash'
       and c.source_hash=target.start_context->>'sourceHash')) then return false; end if;
 update agent_skill_shadow_job set state=outcome,result=artifact,reason=detail,lease_token=null,lease_until=null where id=job;
 insert into agent_skill_shadow_event(owner_id,job_id,kind,payload)
  values(target.owner_id,job,outcome,jsonb_build_object('attempt',target.attempts,'artifactHash',skill_shadow_json_hash(artifact),'reason',detail));
 return true;
end $$;
revoke all on function claim_skill_shadow_job(),heartbeat_skill_shadow_job(uuid,uuid),finish_skill_shadow_job(uuid,uuid,text,jsonb,text) from public;
grant execute on function claim_skill_shadow_job(),heartbeat_skill_shadow_job(uuid,uuid),finish_skill_shadow_job(uuid,uuid,text,jsonb,text) to network_copilot_app;
