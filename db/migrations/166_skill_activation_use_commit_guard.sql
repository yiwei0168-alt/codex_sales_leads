-- A retained use is not a qualification grant. Recheck its exact binding and
-- wall-clock eligibility when the normal application transaction commits.
create table if not exists skill_activation_use_fence (
 transaction_id xid8 not null,owner_id uuid not null,skill_id uuid not null,version integer not null,
 actor_role text not null,binding_hash text not null check(binding_hash~'^[a-f0-9]{64}$'),
 valid_before timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 primary key(transaction_id,owner_id,skill_id,version)
);
create index if not exists skill_activation_use_fence_created on skill_activation_use_fence(created_at);
revoke all on skill_activation_use_fence from public,network_copilot_app,network_copilot_skill_collector;

create or replace function check_skill_activation_use_commit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.transaction_id<>pg_current_xact_id() or public.app_current_user_id() is distinct from new.owner_id
  or current_setting('role')<>'network_copilot_app' or clock_timestamp()>=new.valid_before
  or not exists(select 1 from public.app_user where id=new.owner_id and status='active' and role=new.actor_role)
  or not exists(select 1 from public.agent_skill where id=new.skill_id and owner_id=new.owner_id
   and current_version=new.version and activation_binding is not null
   and encode(sha256(convert_to(activation_binding::text,'UTF8')),'hex')=new.binding_hash)
  or not public.skill_activation_is_current(new.owner_id,new.skill_id,new.version) then
  raise exception 'Skill activation use expired or changed at commit';
 end if;
 return null;
end $$;
drop trigger if exists skill_activation_use_commit_guard on skill_activation_use_fence;
create constraint trigger skill_activation_use_commit_guard after insert on skill_activation_use_fence
 deferrable initially deferred for each row execute function check_skill_activation_use_commit();

create or replace function skill_activation_use_guard_ready() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from pg_trigger where tgrelid='public.skill_activation_use_fence'::regclass
  and tgname='skill_activation_use_commit_guard' and tgfoid='public.check_skill_activation_use_commit()'::regprocedure
  and tgtype=5 and tgdeferrable and tginitdeferred and tgenabled in('O','A') and not tgisinternal)
$$;

create or replace function retain_skill_activation_use(target uuid,pinned_version integer,expected_binding jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=public.app_current_user_id(); b jsonb; role_name text; fingerprint text; previous text;
begin
 if actor is null or current_setting('role')<>'network_copilot_app' or current_setting('transaction_isolation')<>'read committed'
  or not public.skill_activation_use_guard_ready() then return false; end if;
 select role into role_name from public.app_user where id=actor and status='active';
 if role_name is null or role_name is distinct from current_setting('app.current_user_role',true) then return false; end if;
 select activation_binding into b from public.agent_skill where id=target and owner_id=actor and scope='account' and enabled and current_version=pinned_version;
 if b is null or b is distinct from expected_binding or not public.skill_activation_is_current(actor,target,pinned_version) then return false; end if;
 fingerprint=encode(sha256(convert_to(b::text,'UTF8')),'hex');
 select binding_hash into previous from public.skill_activation_use_fence
  where transaction_id=pg_current_xact_id() and owner_id=actor and skill_id=target and version=pinned_version;
 if found then return previous=fingerprint; end if;
 -- Bounded cleanup of private transient guard rows only, never audit/provider receipts.
 delete from public.skill_activation_use_fence where (transaction_id,owner_id,skill_id,version) in(
  select transaction_id,owner_id,skill_id,version from public.skill_activation_use_fence
  where transaction_id<>pg_current_xact_id() and created_at<clock_timestamp()-interval '1 day' order by created_at limit 1000);
 insert into public.skill_activation_use_fence(transaction_id,owner_id,skill_id,version,actor_role,binding_hash,valid_before)
  values(pg_current_xact_id(),actor,target,pinned_version,role_name,fingerprint,(b->>'validBefore')::timestamptz);
 return true;
end $$;
revoke all on function check_skill_activation_use_commit(),skill_activation_use_guard_ready(),retain_skill_activation_use(uuid,integer,jsonb)
 from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function skill_activation_use_guard_ready(),retain_skill_activation_use(uuid,integer,jsonb) to network_copilot_app;
