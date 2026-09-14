-- Full migration replay restores broad CRUD from migration 014; migration 044
-- also grants direct DELETE. Revisions are historical content snapshots.
-- Deleting the parent document still cascades to its revisions.
-- Rollback, only for an explicit compatibility change:
-- GRANT UPDATE, DELETE ON knowledge_document_revision TO network_copilot_app;
-- This would reopen direct history mutation without rewriting rows.
revoke all privileges on table knowledge_document_revision from public, network_copilot_app;
grant select, insert on table knowledge_document_revision to network_copilot_app;
