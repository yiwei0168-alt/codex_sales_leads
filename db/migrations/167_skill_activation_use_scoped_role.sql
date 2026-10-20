-- Account role and effective tenant access role are distinct. An admin may
-- read with member privileges; a member may never claim admin privileges.
create or replace function retain_skill_activation_use(target uuid,pinned_version integer,expected_binding jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=public.app_current_user_id(); b jsonb; role_name text; fingerprint text; previous text;
begin
 if actor is null or current_setting('role')<>'network_copilot_app' or current_setting('transaction_isolation')<>'read committed'
  or not public.skill_activation_use_guard_ready() then return false; end if;
 select role into role_name from public.app_user where id=actor and status='active';
 if role_name is null or coalesce(current_setting('app.current_user_role',true),'') not in('member','admin')
  or (current_setting('app.current_user_role',true)='admin' and role_name<>'admin') then return false; end if;
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
revoke all on function retain_skill_activation_use(uuid,integer,jsonb) from public,network_copilot_skill_collector;
grant execute on function retain_skill_activation_use(uuid,integer,jsonb) to network_copilot_app;
