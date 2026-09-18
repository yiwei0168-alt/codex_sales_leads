-- KQ04 confirmed 2026-09-19: a complete release may activate while unresolved
-- fact rows remain quarantined. Document/OCR review, manifest, chunk and dual-vector
-- completeness remain hard activation gates.
drop trigger if exists knowledge_release_v3_gold_activation_guard on knowledge_release_v3;
drop function if exists guard_knowledge_release_v3_gold_activation();

create or replace function activate_knowledge_release_v3(target_release uuid) returns void
language plpgsql security invoker as $$
declare target knowledge_release_v3%rowtype;
begin
  select * into target from knowledge_release_v3 where id=target_release for update;
  if target.id is null or target.status<>'validated' then
    raise exception 'v3 release must exist and be validated';
  end if;
  if exists(
    select 1 from knowledge_asset a join knowledge_document d on d.id=a.document_id
    where a.registration_status='registered'
      and ((target.scope_kind='shared' and d.visibility='shared')
        or (target.scope_kind='owner' and d.visibility='private' and d.owner_id=target.owner_id))
      and not exists(select 1 from knowledge_release_asset_v3 m where m.release_id=target.id and m.asset_id=a.id)
  ) then raise exception 'v3 release manifest does not cover every registered asset'; end if;
  if exists(
    select 1 from knowledge_release_asset_v3 m join knowledge_asset a on a.id=m.asset_id
    where m.release_id=target.id and (
      m.processing_status='pending'
      or m.expected_units<>m.actual_units
      or m.expected_chunks<>m.actual_chunks
      or m.qwen_embeddings<>m.actual_chunks
      or m.bge_embeddings<>m.actual_chunks
      or (m.processing_status='success' and lower(a.source_nature) like '%datasheet%' and m.actual_chunks=0)
      or (m.processing_status in('blank','review-required','failed') and (m.resolution_status='pending' or m.human_decision_at is null))
    )
  ) then raise exception 'v3 release asset completeness gate failed'; end if;
  if exists(
    select 1 from knowledge_review_queue_v3 q
    where q.release_id=target.id and q.status='open'
      and (q.source_unit_id is not null or q.fact_id is null)
  ) then raise exception 'v3 release has unresolved document review items'; end if;

  update knowledge_release_v3 set status='superseded'
   where status='active' and id<>target.id and scope_kind=target.scope_kind
     and owner_id is not distinct from target.owner_id;
  update knowledge_release_v3 set status='active',activated_at=now() where id=target.id;
  if target.scope_kind='shared' then
    insert into knowledge_release_pointer_v3(scope_kind,owner_id,release_id)
    values('shared',null,target.id)
    on conflict(scope_kind) where scope_kind='shared'
    do update set release_id=excluded.release_id,activated_at=now();
  else
    insert into knowledge_release_pointer_v3(scope_kind,owner_id,release_id)
    values('owner',target.owner_id,target.id)
    on conflict(owner_id) where scope_kind='owner'
    do update set release_id=excluded.release_id,activated_at=now();
  end if;
  update knowledge_document d set active_release_v3_id=target.id
   where (target.scope_kind='shared' and d.visibility='shared')
      or (target.scope_kind='owner' and d.visibility='private' and d.owner_id=target.owner_id);
end $$;

comment on function activate_knowledge_release_v3(uuid) is
  'Atomically activates a complete v3 release; open fact reviews remain quarantined by serving queries.';
