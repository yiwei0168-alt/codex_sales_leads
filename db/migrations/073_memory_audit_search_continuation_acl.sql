-- Migration 014 re-grants broad CRUD privileges during every full replay.
-- Audit events and search-continuation links are inserted once; owner edits
-- would falsify history or silently redirect a continuation's excluded pool.
-- Rollback, only if explicitly required for compatibility:
-- GRANT UPDATE, DELETE ON user_memory_audit, lead_search_continuation TO network_copilot_app;
-- This reopens the mutation risk; no rows are rewritten here.
revoke all privileges on table user_memory_audit, lead_search_continuation from public, network_copilot_app;
grant select, insert on table user_memory_audit, lead_search_continuation to network_copilot_app;
