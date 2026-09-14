-- Migration 014 re-grants broad table privileges whenever migrations replay.
-- Recovery lineage is immutable after INSERT: editing a parent or child would
-- change which paid reservations inherit a task budget.
-- Rollback to migration 014's broad CRUD grant, if explicitly required:
-- GRANT UPDATE, DELETE ON lead_processing_recovery TO network_copilot_app;
-- That reopens lineage mutation; this migration does not rewrite rows.
revoke all privileges on table lead_processing_recovery from public, network_copilot_app;
grant select, insert on table lead_processing_recovery to network_copilot_app;
