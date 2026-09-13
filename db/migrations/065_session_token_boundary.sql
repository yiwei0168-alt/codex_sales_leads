-- Authentication starts with a secret token before an owner is known. The
-- application may insert an owned session; only narrow token functions can
-- update/resolve or revoke an existing one.
do $$ begin
  if not exists(select 1 from pg_roles r where r.rolname=current_user and (r.rolsuper or r.rolbypassrls)) then
    raise exception 'Session token functions require a migration role that bypasses forced RLS';
  end if;
end $$;
alter table app_session enable row level security;
alter table app_session force row level security;
drop policy if exists app_session_insert_owner on app_session;
create policy app_session_insert_owner on app_session for insert
  with check (user_id=app_current_user_id());

create or replace function public.app_session_resolve(p_token_sha256 text)
returns table(user_id uuid,display_name text,role text)
language sql security definer set search_path=pg_catalog as $$
  update public.app_session s set last_seen_at=now()
  from public.app_user u
  where s.user_id=u.id and u.status='active'
    and s.token_sha256=p_token_sha256 and s.expires_at>now()
  returning s.user_id,u.display_name,u.role;
$$;
revoke all on function public.app_session_resolve(text) from public;
grant execute on function public.app_session_resolve(text) to network_copilot_app;

create or replace function public.app_session_revoke(p_token_sha256 text)
returns void language sql security definer set search_path=pg_catalog as $$
  delete from public.app_session where token_sha256=p_token_sha256;
$$;
revoke all on function public.app_session_revoke(text) from public;
grant execute on function public.app_session_revoke(text) to network_copilot_app;

revoke select,update,delete on app_session from network_copilot_app;
