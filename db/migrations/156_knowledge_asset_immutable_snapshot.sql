-- Explicit G09 source snapshots. No automatic backfill or original-file migration.
create table if not exists knowledge_asset_immutable_snapshot (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 byte_size bigint not null check(byte_size between 0 and 52428800),
 body bytea not null,
 captured_by uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(asset_id,source_sha256),
 check(octet_length(body)=byte_size),
 check(encode(public.digest(body,'sha256'),'hex')=source_sha256)
);
-- Deliberately no asset/user FK: withdrawing/deleting source metadata must remain
-- possible. An orphaned snapshot is inaccessible; privileged retention is separate.
alter table knowledge_asset_immutable_snapshot enable row level security;
alter table knowledge_asset_immutable_snapshot force row level security;
revoke all on knowledge_asset_immutable_snapshot from public,network_copilot_app,network_copilot_skill_collector;
grant select on knowledge_asset_immutable_snapshot to network_copilot_app;
drop policy if exists immutable_snapshot_current_access on knowledge_asset_immutable_snapshot;
create policy immutable_snapshot_current_access on knowledge_asset_immutable_snapshot using(exists(
 select 1 from knowledge_asset a join knowledge_document d on d.id=a.document_id
 where a.id=asset_id and a.source_sha256=knowledge_asset_immutable_snapshot.source_sha256
 and a.byte_size=knowledge_asset_immutable_snapshot.byte_size and a.registration_status='registered'
 and d.status='active' and (d.owner_id=app_current_user_id() or d.visibility='shared')
));
create or replace function reject_immutable_asset_snapshot_mutation() returns trigger
language plpgsql set search_path=pg_catalog,public as $$ begin raise exception 'Immutable asset snapshot cannot be changed'; end $$;
revoke all on function reject_immutable_asset_snapshot_mutation() from public,network_copilot_app,network_copilot_skill_collector;
drop trigger if exists immutable_snapshot_mutation on knowledge_asset_immutable_snapshot;
create trigger immutable_snapshot_mutation before update or delete or truncate on knowledge_asset_immutable_snapshot
 for each statement execute function reject_immutable_asset_snapshot_mutation();

create or replace function capture_immutable_asset_snapshot(target_asset uuid,expected_sha256 text,original_bytes bytea) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; approved_size bigint; result uuid;
begin
 actor=public.app_current_user_id();
 if actor is null or target_asset is null or expected_sha256 is null or original_bytes is null
  or expected_sha256 !~ '^[0-9a-f]{64}$' or octet_length(original_bytes)>52428800 then raise exception 'Invalid immutable snapshot'; end if;
 perform public.lock_skill_knowledge_sources();
 select a.byte_size into approved_size from public.knowledge_asset a join public.knowledge_document d on d.id=a.document_id
 where a.id=target_asset and a.source_sha256=expected_sha256 and a.registration_status='registered'
 and d.status='active' and (d.owner_id=actor or d.visibility='shared');
 if not found or approved_size<>octet_length(original_bytes)
  or encode(public.digest(original_bytes,'sha256'),'hex')<>expected_sha256 then raise exception 'Immutable snapshot source unavailable or changed'; end if;
 insert into public.knowledge_asset_immutable_snapshot(asset_id,source_sha256,byte_size,body,captured_by)
 values(target_asset,expected_sha256,approved_size,original_bytes,actor) on conflict(asset_id,source_sha256) do nothing;
 select id into result from public.knowledge_asset_immutable_snapshot where asset_id=target_asset and source_sha256=expected_sha256;
 return result;
end $$;
revoke all on function capture_immutable_asset_snapshot(uuid,text,bytea) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function capture_immutable_asset_snapshot(uuid,text,bytea) to network_copilot_app;
