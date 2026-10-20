-- Transaction-local source sealing. No quality or production activation grant.
create table if not exists skill_activation_source_fence (
 transaction_id xid8 primary key,
 fence_id uuid not null default gen_random_uuid() unique,
 owner_id uuid not null,actor_role text not null,run_id uuid not null,call_id uuid not null,
 skill_id uuid not null,version integer not null,bundle_id uuid not null,proof_hash text not null,
 valid_before timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 skill_written boolean not null default false,receipt_written boolean not null default false,audit_written boolean not null default false
);
revoke all on skill_activation_source_fence from public,network_copilot_app,network_copilot_skill_collector;

create or replace function skill_activation_source_tables() returns text[]
language sql immutable set search_path=pg_catalog,public as $$ select array[
 'app_user','assistant_conversation','assistant_message','agent_run','agent_tool_call','agent_run_event',
 'agent_run_skill','agent_skill','agent_skill_version',
 'agent_skill_acceptance_bundle','agent_skill_acceptance_judgment','agent_skill_acceptance_freeze','agent_skill_acceptance_freeze_revocation',
 'agent_skill_model_attempt','agent_skill_model_outcome','agent_skill_runner_attestation',
 'agent_skill_shadow_campaign','agent_skill_shadow_job','agent_skill_shadow_event',
 'agent_memory','agent_memory_version','user_outreach_memory','outreach_knowledge_item','agent_memory_observation','agent_memory_conflict',
 'knowledge_collection','knowledge_document','knowledge_chunk','knowledge_document_revision',
 'knowledge_asset','knowledge_entity','knowledge_document_entity','knowledge_index_generation',
 'knowledge_source_revision','knowledge_chunk_v2','knowledge_fact',
 'knowledge_release_v3','knowledge_release_asset_v3','knowledge_source_revision_v3','knowledge_source_unit_v3',
 'knowledge_chunk_v3','knowledge_chunk_entity_v3','knowledge_embedding_profile_v3','knowledge_chunk_embedding_v3',
 'knowledge_fact_v3','knowledge_review_queue_v3','knowledge_release_pointer_v3','knowledge_tree_version','knowledge_tree_node',
 'knowledge_upload_extraction_review','knowledge_upload_review_completion',
 'knowledge_asset_immutable_snapshot','knowledge_asset_snapshot_prune_audit',
 'mailbox_connection','mailbox_message','mailbox_customer','mailbox_customer_message','mailbox_timeline_note',
 'skill_runner_trust_registry_version','skill_runner_trust_registry_current','skill_runtime_package_registration','skill_runtime_package_withdrawal'
 ]::text[] $$;

create or replace function guard_skill_activation_source_write() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare f public.skill_activation_source_fence%rowtype;
begin
 select * into f from public.skill_activation_source_fence where transaction_id=pg_current_xact_id_if_assigned() for update;
 if not found then
  if tg_level='STATEMENT' then return null; elsif tg_op='DELETE' then return old; else return new; end if;
 end if;
 if public.app_current_user_id() is distinct from f.owner_id
  or public.app_current_user_role() is distinct from f.actor_role
  or current_setting('role',true) is distinct from 'network_copilot_app' then
  raise exception 'Skill activation source transaction context changed';
 end if;
 -- Reject forbidden statements before legacy source-admission triggers can
 -- acquire or upgrade their locks. The three permitted effects still require
 -- exact row-level validation below, including single-write flags.
 if tg_level='STATEMENT' then
  if (tg_table_name='agent_skill' and tg_op='UPDATE')
   or (tg_table_name='agent_tool_call' and tg_op='UPDATE')
   or (tg_table_name='agent_run_event' and tg_op='INSERT') then return null; end if;
  raise exception 'Skill activation source transaction sealed';
 end if;
 if tg_table_name='agent_skill' and tg_op='UPDATE' then
  if not f.skill_written and new.id=f.skill_id and new.owner_id=f.owner_id and new.scope='account'
   and new.current_version=f.version and new.enabled and not new.published
   and new.activation_binding->>'sourceFenceId'=f.fence_id::text
   and new.activation_binding->>'activationProofHash'=f.proof_hash
   and new.activation_binding->>'bundleId'=f.bundle_id::text
   and new.activation_binding->>'callId'=f.call_id::text
   and (to_jsonb(new)-array['enabled','published','activation_binding','updated_at'])=(to_jsonb(old)-array['enabled','published','activation_binding','updated_at']) then
   update public.skill_activation_source_fence set skill_written=true where transaction_id=f.transaction_id;
   return new;
  end if;
 elsif tg_table_name='agent_tool_call' and tg_op='UPDATE' then
  if f.skill_written and not f.receipt_written and old.status='started' and new.status='completed'
   and new.user_id=f.owner_id and new.run_id=f.run_id and new.id=f.call_id
   and new.output->>'status'='success' and new.output->>'callId'=f.call_id::text
   and new.output->'data'->>'activationProofHash'=f.proof_hash
   and new.output->'data'->>'acceptanceBundleId'=f.bundle_id::text
   and (to_jsonb(new)-array['status','output','metrics','updated_at'])=(to_jsonb(old)-array['status','output','metrics','updated_at']) then
   update public.skill_activation_source_fence set receipt_written=true where transaction_id=f.transaction_id;
   return new;
  end if;
 elsif tg_table_name='agent_run_event' and tg_op='INSERT' then
  if f.skill_written and f.receipt_written and not f.audit_written and new.user_id=f.owner_id and new.run_id=f.run_id
   and new.kind='skill_activated' and new.payload->>'sourceFenceId'=f.fence_id::text
   and new.payload->>'activationProofHash'=f.proof_hash and new.payload->>'callId'=f.call_id::text
   and new.payload->>'acceptanceBundleId'=f.bundle_id::text and new.payload->>'skillId'=f.skill_id::text
   and new.payload->>'version'=f.version::text and (new.payload->>'validBefore')::timestamptz=f.valid_before then
   update public.skill_activation_source_fence set audit_written=true where transaction_id=f.transaction_id;
   return new;
  end if;
 end if;
 raise exception 'Skill activation source transaction sealed';
end $$;

create or replace function skill_activation_source_fence_ready() returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare name text; relation regclass;
begin
 foreach name in array public.skill_activation_source_tables() loop
  relation=to_regclass('public.'||quote_ident(name));
  if relation is null or not exists(select 1 from pg_trigger where tgrelid=relation and tgname='skill_activation_source_statement'
   and tgfoid=to_regprocedure('public.guard_skill_activation_source_write()') and tgtype=30 and tgenabled in('O','A') and not tgisinternal)
   or not exists(select 1 from pg_trigger where tgrelid=relation and tgname='skill_activation_source_write'
   and tgfoid=to_regprocedure('public.guard_skill_activation_source_write()') and tgtype=31 and tgenabled in('O','A') and not tgisinternal)
   or not exists(select 1 from pg_trigger where tgrelid=relation and tgname='skill_activation_source_truncate'
   and tgfoid=to_regprocedure('public.guard_skill_activation_source_write()') and tgtype=34 and tgenabled in('O','A') and not tgisinternal) then return false; end if;
 end loop;
 return exists(select 1 from pg_trigger where tgrelid='public.skill_activation_source_fence'::regclass
  and tgname='skill_activation_source_commit_guard' and tgfoid=to_regprocedure('public.check_skill_activation_source_commit()')
  and tgdeferrable and tginitdeferred and tgenabled in('O','A') and not tgisinternal);
end $$;

create or replace function begin_skill_activation_source_fence(target_run uuid,target_call uuid,target_skill uuid,target_version integer,
 target_bundle uuid,proof text,deadline timestamptz,lease uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; role_name text; fence uuid;
begin
 actor=public.app_current_user_id();role_name=public.app_current_user_role();
 if actor is null or current_setting('role',true) is distinct from 'network_copilot_app'
  or role_name not in('admin','member') or not coalesce(proof ~ '^[a-f0-9]{64}$',false)
  or deadline is null or deadline<=clock_timestamp() or not public.skill_activation_source_fence_ready() then
  raise exception 'Skill activation source fence unavailable';
 end if;
 if exists(select 1 from public.skill_activation_source_fence where transaction_id=pg_current_xact_id()) then
  raise exception 'Skill activation source fence already armed'; end if;
 if not exists(select 1 from public.agent_run r join public.app_user u on u.id=r.user_id
  join public.agent_tool_call c on c.user_id=r.user_id and c.run_id=r.id and c.id=target_call
  join public.agent_skill s on s.owner_id=r.user_id and s.id=target_skill
  join public.agent_skill_acceptance_bundle b on b.owner_id=r.user_id and b.id=target_bundle
  where r.user_id=actor and r.id=target_run and r.status='running' and r.control is null and r.execution_kind='main-agent'
   and r.lease_token=lease and r.lease_until>clock_timestamp() and u.status='active' and u.role=role_name
   and c.status='started' and c.tool_id='skill_manage' and c.effect='reversible'
   and c.input->>'operation'='enable' and c.input->>'id'=s.id::text and c.input->>'version'=target_version::text
   and s.scope='account' and s.current_version=target_version and b.skill_id=s.id and b.version=target_version
   and b.source_kind='production-runner-pending-verification' and deadline<=(b.plan->>'expiresAt')::timestamptz) then
  raise exception 'Skill activation source fence actor binding invalid'; end if;
 -- Only committed rows from other transactions are visible. Keep the current
 -- fence even if deferred checks are explicitly flushed before COMMIT.
 with obsolete as(select transaction_id from public.skill_activation_source_fence
  where transaction_id<>pg_current_xact_id() and created_at<clock_timestamp()-interval '1 day'
  order by created_at limit 1000 for update skip locked)
 delete from public.skill_activation_source_fence f using obsolete o where f.transaction_id=o.transaction_id;
 insert into public.skill_activation_source_fence(transaction_id,owner_id,actor_role,run_id,call_id,skill_id,version,bundle_id,proof_hash,valid_before)
  values(pg_current_xact_id(),actor,role_name,target_run,target_call,target_skill,target_version,target_bundle,proof,deadline) returning fence_id into fence;
 return fence;
end $$;

create or replace function check_skill_activation_source_commit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare f public.skill_activation_source_fence%rowtype;
begin
 select * into f from public.skill_activation_source_fence where transaction_id=new.transaction_id and fence_id=new.fence_id;
 if not found or public.app_current_user_id() is distinct from f.owner_id
  or public.app_current_user_role() is distinct from f.actor_role
  or current_setting('role',true) is distinct from 'network_copilot_app'
  or not(f.skill_written and f.receipt_written and f.audit_written) or clock_timestamp()>=f.valid_before
  or not exists(select 1 from public.agent_run_event e where e.user_id=f.owner_id and e.run_id=f.run_id and e.kind='skill_activated'
   and e.payload->>'sourceFenceId'=f.fence_id::text and e.payload->>'activationProofHash'=f.proof_hash) then
  raise exception 'Skill activation source fence incomplete or expired at commit';
 end if;
 return new;
end $$;
drop trigger if exists skill_activation_source_commit_guard on skill_activation_source_fence;
create constraint trigger skill_activation_source_commit_guard after insert on skill_activation_source_fence
 deferrable initially deferred for each row execute function check_skill_activation_source_commit();

do $$ declare name text; begin
 foreach name in array public.skill_activation_source_tables() loop
  if to_regclass('public.'||quote_ident(name)) is null then raise exception 'Missing Skill source table: %',name; end if;
  execute format('drop trigger if exists skill_activation_source_statement on public.%I',name);
  execute format('create trigger skill_activation_source_statement before insert or update or delete on public.%I for each statement execute function guard_skill_activation_source_write()',name);
  execute format('drop trigger if exists skill_activation_source_write on public.%I',name);
  execute format('create trigger skill_activation_source_write before insert or update or delete on public.%I for each row execute function guard_skill_activation_source_write()',name);
  execute format('drop trigger if exists skill_activation_source_truncate on public.%I',name);
  execute format('create trigger skill_activation_source_truncate before truncate on public.%I for each statement execute function guard_skill_activation_source_write()',name);
 end loop;
end $$;
revoke all on function skill_activation_source_tables(),guard_skill_activation_source_write(),skill_activation_source_fence_ready(),
 begin_skill_activation_source_fence(uuid,uuid,uuid,integer,uuid,text,timestamptz,uuid),check_skill_activation_source_commit()
 from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function skill_activation_source_fence_ready(),begin_skill_activation_source_fence(uuid,uuid,uuid,integer,uuid,text,timestamptz,uuid) to network_copilot_app;
