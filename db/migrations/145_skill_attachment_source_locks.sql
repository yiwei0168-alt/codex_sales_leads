-- G09: lock accessible attachment metadata, not source bytes or quality approval.
create or replace function lock_skill_attachment_sources(asset_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; document_ids uuid[]; locked_count integer;
begin
 actor=public.app_current_user_id();
 if actor is null or asset_ids is null or cardinality(asset_ids)>100 or array_position(asset_ids,null) is not null
  or cardinality(asset_ids)<>(select count(distinct value) from unnest(asset_ids) as value) then
  raise exception 'Invalid Skill attachment lock request';
 end if;
 if cardinality(asset_ids)=0 then return 0; end if;
 select count(a.id),array_agg(distinct d.id order by d.id) into locked_count,document_ids
 from public.knowledge_asset a join public.knowledge_document d on d.id=a.document_id
 where a.id=any(asset_ids) and (d.owner_id=actor or d.visibility='shared');
 if locked_count<>cardinality(asset_ids) then raise exception 'Skill attachment unavailable'; end if;
 perform id from public.knowledge_document where id=any(document_ids) and (owner_id=actor or visibility='shared') order by id for share;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(document_ids) then raise exception 'Skill attachment unavailable'; end if;
 perform id from public.knowledge_asset where id=any(asset_ids) and document_id=any(document_ids) order by id for share;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(asset_ids) then raise exception 'Skill attachment unavailable'; end if;
 perform v.id from public.knowledge_tree_version v join public.knowledge_document d on d.current_tree_version_id=v.id
 where d.id=any(document_ids) order by v.id for share of v;
 return locked_count;
end $$;
revoke all on function lock_skill_attachment_sources(uuid[]) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_attachment_sources(uuid[]) to network_copilot_app;
