-- Migrations 014 and 031 grant broad CRUD on these historical observations.
-- Product writers only insert; the opportunity state table remains mutable.
-- Rollback, only if an explicit compatibility change requires mutable history:
-- GRANT UPDATE, DELETE ON workflow_stage_metric, workflow_model_usage,
--   workflow_artifact_event, workspace_audit_event TO network_copilot_app;
-- That would permit rewriting adoption, usage and workspace action history.
revoke all privileges on table workflow_stage_metric, workflow_model_usage,
  workflow_artifact_event, workspace_audit_event from public, network_copilot_app;
grant select, insert on table workflow_stage_metric, workflow_model_usage,
  workflow_artifact_event, workspace_audit_event to network_copilot_app;
