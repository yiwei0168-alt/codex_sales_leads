-- One conservative ceiling for every paid request under a frozen MA24 manifest.
-- Only a later reviewed preflight may provision a row; the app role cannot.
create table if not exists ma24_evaluation_hard_limit (
  manifest_sha256 text primary key check(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  maximum_provider_requests bigint not null check(maximum_provider_requests > 0),
  maximum_request_bytes bigint not null check(maximum_request_bytes > 0),
  maximum_output_tokens bigint not null check(maximum_output_tokens > 0),
  hard_spend_cap_micros bigint not null check(hard_spend_cap_micros > 0),
  used_provider_requests bigint not null default 0 check(used_provider_requests >= 0),
  used_request_bytes bigint not null default 0 check(used_request_bytes >= 0),
  used_output_tokens bigint not null default 0 check(used_output_tokens >= 0),
  used_reserved_micros bigint not null default 0 check(used_reserved_micros >= 0),
  authorized_at timestamptz not null,
  authorization_reference text not null check(length(trim(authorization_reference)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on ma24_evaluation_hard_limit from public, network_copilot_app;

-- The row update serializes all runs sharing a manifest, even across accounts.
-- Failed inserts roll the counter update back; settled or unknown bills never
-- release the conservative capacity.
create or replace function reserve_ma24_evaluation_hard_limit()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  frozen_hash text;
  run_active boolean;
  request_bytes bigint;
  output_tokens bigint;
begin
  if new.operation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;
  select r.execution_spec->>'manifestSha256',
    r.status='running' and r.lease_until>now() and r.control is null
    into frozen_hash,run_active
    from public.agent_run r where r.id=new.operation_id::uuid and r.user_id=new.user_id
      and r.execution_kind='main-agent-evaluation';
  if not found then return new; end if;
  if run_active is distinct from true or
    coalesce(frozen_hash !~ '^[0-9a-f]{64}$', true) or
    new.cost_bound_known is distinct from true or new.reserved_micros <= 0 or
    coalesce(new.metrics->>'inputBytes' !~ '^[0-9]+$', true) or
    coalesce(new.metrics->>'maximumOutputTokens' !~ '^[0-9]+$', true) then
    raise exception 'MA24 evaluation reservation missing bounded identity';
  end if;
  request_bytes := (new.metrics->>'inputBytes')::bigint;
  output_tokens := (new.metrics->>'maximumOutputTokens')::bigint;
  update public.ma24_evaluation_hard_limit b set
    used_provider_requests=used_provider_requests+1,
    used_request_bytes=used_request_bytes+request_bytes,
    used_output_tokens=used_output_tokens+output_tokens,
    used_reserved_micros=used_reserved_micros+new.reserved_micros,
    updated_at=now()
    where b.manifest_sha256=frozen_hash
      and used_provider_requests < maximum_provider_requests
      and request_bytes <= maximum_request_bytes-used_request_bytes
      and output_tokens <= maximum_output_tokens-used_output_tokens
      and new.reserved_micros <= hard_spend_cap_micros-used_reserved_micros;
  if not found then
    raise exception 'MA24 evaluation hard limit absent or exhausted';
  end if;
  return new;
end;
$$;
revoke all on function reserve_ma24_evaluation_hard_limit() from public;
drop trigger if exists paid_call_ma24_hard_limit on paid_call_reservation;
create trigger paid_call_ma24_hard_limit before insert on paid_call_reservation
  for each row execute function reserve_ma24_evaluation_hard_limit();
