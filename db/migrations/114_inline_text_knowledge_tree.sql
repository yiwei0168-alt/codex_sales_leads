-- Text revisions are already stored immutably in PostgreSQL; they have no file asset.
alter table knowledge_tree_version alter column asset_id drop not null;
alter table knowledge_tree_version drop constraint if exists knowledge_tree_version_document_id_fkey;
alter table knowledge_tree_version add constraint knowledge_tree_version_document_id_fkey
  foreign key(document_id) references knowledge_document(id) on delete cascade;
alter table knowledge_tree_node drop constraint if exists knowledge_tree_node_version_id_fkey;
alter table knowledge_tree_node add constraint knowledge_tree_node_version_id_fkey
  foreign key(version_id) references knowledge_tree_version(id) on delete cascade;
alter table knowledge_tree_node drop constraint if exists knowledge_tree_node_parent_id_fkey;
alter table knowledge_tree_node add constraint knowledge_tree_node_parent_id_fkey
  foreign key(parent_id) references knowledge_tree_node(id) on delete cascade;
