create table if not exists knowledge_fact(
  id uuid primary key default gen_random_uuid(), source_revision_id uuid not null references knowledge_source_revision(id),
  entity_id uuid not null references knowledge_entity(id), entity_version text, market text, effective_from date, effective_to date,
  attribute_key text not null, typed_value jsonb not null, raw_value text not null, unit text, qualifiers jsonb not null default '{}',
  polarity text not null check(polarity in('positive','negative','unknown')), evidence_location jsonb not null, evidence_hash text not null,
  extraction_method text not null, extractor_version text not null,
  verification_status text not null check(verification_status in('candidate','verified','conflicting','rejected')),
  created_at timestamptz not null default now(), unique(source_revision_id,entity_id,attribute_key,evidence_hash)
);
create index if not exists knowledge_fact_lookup_idx on knowledge_fact(entity_id,attribute_key,verification_status);
grant select,insert,update,delete on knowledge_fact to network_copilot_app;
alter table knowledge_fact enable row level security;alter table knowledge_fact force row level security;
drop policy if exists knowledge_fact_acl on knowledge_fact;
create policy knowledge_fact_acl on knowledge_fact using(exists(select 1 from knowledge_source_revision r join knowledge_asset a on a.id=r.asset_id join knowledge_document d on d.id=a.document_id where r.id=source_revision_id and(d.visibility='shared' or d.owner_id=app_current_user_id()))) with check(app_current_user_role()='admin');
