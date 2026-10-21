-- Current published original text is shared with the document. Historical and
-- private revisions keep the existing owner-only policy; no write ACL changes.
drop policy if exists knowledge_revision_current_shared_read on knowledge_document_revision;
create policy knowledge_revision_current_shared_read on knowledge_document_revision
for select using (
  app_current_user_id() is not null and reconstructed=false and exists (
    select 1 from knowledge_document d
    left join knowledge_tree_version v on v.id=d.current_tree_version_id and v.document_id=d.id
    left join knowledge_asset a on a.id=v.asset_id and a.document_id=d.id
      and a.registration_status='registered' and a.source_sha256=v.source_sha256
    where d.id=knowledge_document_revision.document_id and d.visibility='shared' and d.status='active'
      and d.content_sha256=knowledge_document_revision.content_sha256
      and ((d.current_tree_version_id is null and not exists (
        select 1 from knowledge_asset legacy_asset where legacy_asset.document_id=d.id))
        or (v.status='ready' and (a.id is not null or (v.asset_id is null and d.content_sha256=v.source_sha256))))
  )
);
