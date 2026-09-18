-- A document may have multiple registered source revisions in one shadow release.
-- Chunk identity therefore belongs to the exact source revision, not only the
-- logical document. This prevents later assets from overwriting earlier evidence.
alter table knowledge_chunk_v3
  drop constraint if exists knowledge_chunk_v3_release_id_document_id_chunk_index_key;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='knowledge_chunk_v3'::regclass
      and conname='knowledge_chunk_v3_release_revision_chunk_key'
  ) then
    alter table knowledge_chunk_v3
      add constraint knowledge_chunk_v3_release_revision_chunk_key
      unique(release_id,source_revision_id,chunk_index);
  end if;
end $$;

create index if not exists knowledge_chunk_v3_release_document_idx
  on knowledge_chunk_v3(release_id,document_id);
