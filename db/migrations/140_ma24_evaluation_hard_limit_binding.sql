-- Frozen evaluation ceilings and authorization identity cannot be edited after
-- admission. Counters only increase through the paid reservation trigger.
create or replace function protect_ma24_evaluation_hard_limit()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if row(new.manifest_sha256,new.maximum_provider_requests,new.maximum_request_bytes,
      new.maximum_output_tokens,new.hard_spend_cap_micros,new.authorized_at,
      new.authorization_reference) is distinct from
     row(old.manifest_sha256,old.maximum_provider_requests,old.maximum_request_bytes,
      old.maximum_output_tokens,old.hard_spend_cap_micros,old.authorized_at,
      old.authorization_reference) or
     new.used_provider_requests<old.used_provider_requests or
     new.used_request_bytes<old.used_request_bytes or
     new.used_output_tokens<old.used_output_tokens or
     new.used_reserved_micros<old.used_reserved_micros then
    raise exception 'MA24 evaluation frozen hard limit cannot change';
  end if;
  return new;
end;
$$;
revoke all on function protect_ma24_evaluation_hard_limit() from public;
drop trigger if exists ma24_evaluation_hard_limit_immutable on ma24_evaluation_hard_limit;
create trigger ma24_evaluation_hard_limit_immutable before update
  on ma24_evaluation_hard_limit for each row
  execute function protect_ma24_evaluation_hard_limit();

-- The restricted app role may read only the cap for its own queued or leased
-- evaluation task. It cannot select from the global cap table directly.
create or replace function read_ma24_evaluation_hard_limit(
  p_user_id uuid,p_run_id uuid,p_manifest_sha256 text)
returns table(maximum_provider_requests text,maximum_request_bytes text,
  maximum_output_tokens text,hard_spend_cap_micros text,
  authorized_at timestamptz,authorization_reference text)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_user_id is distinct from public.app_current_user_id() or
    p_manifest_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'MA24 evaluation hard limit reader identity denied';
  end if;
  return query select b.maximum_provider_requests::text,b.maximum_request_bytes::text,
    b.maximum_output_tokens::text,b.hard_spend_cap_micros::text,
    b.authorized_at,b.authorization_reference
  from public.agent_run r join public.ma24_evaluation_hard_limit b
    on b.manifest_sha256=p_manifest_sha256
  where r.user_id=p_user_id and r.id=p_run_id
    and r.execution_kind='main-agent-evaluation'
    and r.execution_spec->>'schema'='ma24-evaluation-run-v1'
    and r.execution_spec->>'manifestSha256'=p_manifest_sha256
    and (r.status='queued' or
      (r.status='running' and r.lease_until>now() and r.control is null));
end;
$$;
revoke all on function read_ma24_evaluation_hard_limit(uuid,uuid,text) from public;
grant execute on function read_ma24_evaluation_hard_limit(uuid,uuid,text)
  to network_copilot_app;
