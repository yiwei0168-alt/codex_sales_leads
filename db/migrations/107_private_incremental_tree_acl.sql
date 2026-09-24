-- Owners may build only their own private trees. Shared publication still needs admin.
grant delete on knowledge_tree_node to network_copilot_app;
drop policy if exists knowledge_tree_version_write on knowledge_tree_version;
create policy knowledge_tree_version_write on knowledge_tree_version for all
  using(exists(select 1 from knowledge_document d where d.id=document_id and d.owner_id=app_current_user_id()
    and (d.visibility='private' or app_current_user_role()='admin')))
  with check(exists(select 1 from knowledge_document d where d.id=document_id and d.owner_id=app_current_user_id()
    and (d.visibility='private' or app_current_user_role()='admin')));
drop policy if exists knowledge_tree_node_write on knowledge_tree_node;
create policy knowledge_tree_node_write on knowledge_tree_node for all
  using(exists(select 1 from knowledge_tree_version v join knowledge_document d on d.id=v.document_id
    where v.id=version_id and d.owner_id=app_current_user_id() and (d.visibility='private' or app_current_user_role()='admin')))
  with check(exists(select 1 from knowledge_tree_version v join knowledge_document d on d.id=v.document_id
    where v.id=version_id and d.owner_id=app_current_user_id() and (d.visibility='private' or app_current_user_role()='admin')));
