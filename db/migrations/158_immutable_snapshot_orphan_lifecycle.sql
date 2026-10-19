-- Explicit operations-owner cleanup only. No retention duration or scheduled deletion.
create table if not exists knowledge_asset_snapshot_prune_audit (
 request_id uuid primary key,
 manifest jsonb not null check(jsonb_typeof(manifest)='object'),
 manifest_hash text not null check(manifest_hash ~ '^[0-9a-f]{64}$'),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 deleted_count integer not null check(deleted_count between 1 and 100),
 deleted_bytes bigint not null check(deleted_bytes>=0),
 completed_at timestamptz not null default clock_timestamp(),
 executed_by text not null default session_user
);
revoke all on knowledge_asset_snapshot_prune_audit from public,network_copilot_app,network_copilot_skill_collector;
create or replace function reject_snapshot_prune_audit_mutation() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Snapshot prune audit is immutable'; end $$;
revoke all on function reject_snapshot_prune_audit_mutation() from public,network_copilot_app,network_copilot_skill_collector;
drop trigger if exists snapshot_prune_audit_immutable on knowledge_asset_snapshot_prune_audit;
create trigger snapshot_prune_audit_immutable before update or delete or truncate on knowledge_asset_snapshot_prune_audit
 for each statement execute function reject_snapshot_prune_audit_mutation();

-- The runtime/collector have neither DELETE nor audit/cleanup EXECUTE privileges.
-- Even operations-owner deletion needs a same-transaction audit and exact rows.
create or replace function reject_immutable_asset_snapshot_mutation() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if tg_op='DELETE' and current_user=pg_get_userbyid((select relowner from pg_class where oid=tg_relid))
  and nullif(current_setting('app.snapshot_prune_request',true),'') is not null then
  perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0)); return null; end if;
 raise exception 'Immutable asset snapshot cannot be changed';
end $$;
create or replace function authorize_orphan_snapshot_delete() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare audit_row public.knowledge_asset_snapshot_prune_audit%rowtype;
begin
 if current_user<>pg_get_userbyid((select relowner from pg_class where oid=tg_relid)) then
  raise exception 'Snapshot cleanup requires the operations owner'; end if;
 select * into audit_row from public.knowledge_asset_snapshot_prune_audit
  where request_id=nullif(current_setting('app.snapshot_prune_request',true),'')::uuid;
 if not found or not (audit_row.manifest->'snapshots' @> jsonb_build_array(jsonb_build_object(
  'snapshotId',old.id,'assetId',old.asset_id,'sourceSha256',old.source_sha256,'byteSize',old.byte_size::text)))
  or exists(select 1 from public.knowledge_asset where id=old.asset_id)
  or old.created_at>=(audit_row.manifest->>'before')::timestamptz then
  raise exception 'Snapshot cleanup source or audit changed'; end if;
 return old;
end $$;
revoke all on function authorize_orphan_snapshot_delete() from public,network_copilot_app,network_copilot_skill_collector;
drop trigger if exists immutable_snapshot_orphan_delete on knowledge_asset_immutable_snapshot;
create trigger immutable_snapshot_orphan_delete before delete on knowledge_asset_immutable_snapshot
 for each row execute function authorize_orphan_snapshot_delete();

-- Invoker rights, deliberately not SECURITY DEFINER. Only the table owner can
-- execute successfully; no new role grants are introduced by this migration.
create or replace function prune_orphan_asset_snapshots(request uuid,plan jsonb,explanation text)
returns table(manifest_hash text,deleted_count integer,deleted_bytes bigint,completed_at timestamptz)
language plpgsql set search_path=pg_catalog,public as $$
declare saved public.knowledge_asset_snapshot_prune_audit%rowtype; expected_count integer;
 actual_count integer; total_bytes bigint; old_request text; cutoff timestamptz;
begin
 if current_user<>pg_get_userbyid((select relowner from pg_class where oid='public.knowledge_asset_immutable_snapshot'::regclass))
  or not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
  or current_setting('transaction_isolation')<>'read committed' then raise exception 'Snapshot cleanup requires operations owner, RLS bypass and read committed'; end if;
 if request is null or plan is null or jsonb_typeof(plan)<>'object'
  or plan->>'protocol' is distinct from 'orphan-asset-snapshot-prune-v1'
  or jsonb_typeof(plan->'snapshots') is distinct from 'array'
  or nullif(btrim(explanation),'') is null or length(explanation)>1000 then raise exception 'Invalid snapshot cleanup request'; end if;
 cutoff=(plan->>'before')::timestamptz;
 expected_count=jsonb_array_length(plan->'snapshots');
 if cutoff is null or cutoff>clock_timestamp() or expected_count not between 1 and 100
  or expected_count<>(select count(distinct value->>'snapshotId') from jsonb_array_elements(plan->'snapshots')) then
  raise exception 'Invalid snapshot cleanup scope'; end if;
 -- This is the same exclusive key as source insert/update/delete/TRUNCATE, and
 -- conflicts with current-source readers and capture's shared admission.
 perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0));
 select * into saved from public.knowledge_asset_snapshot_prune_audit where request_id=request;
 if found then
  if saved.manifest<>plan or saved.reason<>explanation then raise exception 'Snapshot cleanup request ID reused with different input'; end if;
  return query select saved.manifest_hash,saved.deleted_count,saved.deleted_bytes,saved.completed_at; return;
 end if;
 perform s.id from public.knowledge_asset_immutable_snapshot s
  join jsonb_array_elements(plan->'snapshots') p on s.id=(p->>'snapshotId')::uuid order by s.id for update of s;
 select count(*)::integer,coalesce(sum(s.byte_size),0)::bigint into actual_count,total_bytes
 from public.knowledge_asset_immutable_snapshot s join jsonb_array_elements(plan->'snapshots') p on s.id=(p->>'snapshotId')::uuid
 where s.asset_id=(p->>'assetId')::uuid and s.source_sha256=p->>'sourceSha256' and s.byte_size::text=p->>'byteSize'
  and s.created_at<cutoff and not exists(select 1 from public.knowledge_asset a where a.id=s.asset_id);
 if actual_count<>expected_count then raise exception 'Snapshot cleanup preview is stale or source still exists'; end if;
 insert into public.knowledge_asset_snapshot_prune_audit(request_id,manifest,manifest_hash,reason,deleted_count,deleted_bytes)
 values(request,plan,encode(public.digest(convert_to(plan::text,'UTF8'),'sha256'),'hex'),explanation,actual_count,total_bytes)
 returning * into saved;
 old_request=current_setting('app.snapshot_prune_request',true);
 perform set_config('app.snapshot_prune_request',request::text,true);
 delete from public.knowledge_asset_immutable_snapshot where id in(select (p->>'snapshotId')::uuid from jsonb_array_elements(plan->'snapshots') p);
 get diagnostics actual_count=row_count;
 perform set_config('app.snapshot_prune_request',coalesce(old_request,''),true);
 if actual_count<>expected_count then raise exception 'Snapshot cleanup changed during deletion'; end if;
 return query select saved.manifest_hash,saved.deleted_count,saved.deleted_bytes,saved.completed_at;
end $$;
revoke all on function prune_orphan_asset_snapshots(uuid,jsonb,text) from public,network_copilot_app,network_copilot_skill_collector;
