-- Knowledge publication and current evidence share memory's source admission key,
-- so a transaction touching both domains has a single global lock order.
create or replace function lock_skill_knowledge_sources() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.lock_skill_decision_memory_sources();
end $$;
revoke all on function lock_skill_knowledge_sources() from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_knowledge_sources() to network_copilot_app;

create or replace function serialize_skill_knowledge_source_statement() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('skill-memory-global',0));
 return null;
end $$;
revoke all on function serialize_skill_knowledge_source_statement() from public,network_copilot_app,network_copilot_skill_collector;
do $$ declare table_name text; begin
 foreach table_name in array array[
  'knowledge_collection','knowledge_document','knowledge_chunk','knowledge_document_revision',
  'knowledge_asset','knowledge_entity','knowledge_document_entity','knowledge_index_generation',
  'knowledge_source_revision','knowledge_chunk_v2','knowledge_fact',
  'knowledge_release_v3','knowledge_release_asset_v3','knowledge_source_revision_v3',
  'knowledge_source_unit_v3','knowledge_chunk_v3','knowledge_chunk_entity_v3',
  'knowledge_embedding_profile_v3','knowledge_chunk_embedding_v3','knowledge_fact_v3',
  'knowledge_review_queue_v3','knowledge_release_pointer_v3','knowledge_tree_version','knowledge_tree_node',
  'knowledge_upload_extraction_review','knowledge_upload_review_completion'] loop
  execute format('drop trigger if exists skill_knowledge_source_statement on public.%I',table_name);
  execute format('create trigger skill_knowledge_source_statement before insert or update or delete or truncate on public.%I for each statement execute function serialize_skill_knowledge_source_statement()',table_name);
 end loop;
end $$;

-- Supersede 145 row locks: a publisher may already hold an asset/document row
-- before reaching its write gate. Plain MVCC metadata reads under admission avoid
-- waiting for that row while holding the gate the publisher needs.
create or replace function lock_skill_attachment_sources(asset_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; locked_count integer;
begin
 actor=public.app_current_user_id();
 if actor is null or asset_ids is null or cardinality(asset_ids)>100 or array_position(asset_ids,null) is not null
  or cardinality(asset_ids)<>(select count(distinct value) from unnest(asset_ids) as value) then
  raise exception 'Invalid Skill attachment lock request';
 end if;
 perform public.lock_skill_knowledge_sources();
 if cardinality(asset_ids)=0 then return 0; end if;
 select count(a.id) into locked_count from public.knowledge_asset a join public.knowledge_document d on d.id=a.document_id
 where a.id=any(asset_ids) and (d.owner_id=actor or d.visibility='shared');
 if locked_count<>cardinality(asset_ids) then raise exception 'Skill attachment unavailable'; end if;
 return locked_count;
end $$;
revoke all on function lock_skill_attachment_sources(uuid[]) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_attachment_sources(uuid[]) to network_copilot_app;
