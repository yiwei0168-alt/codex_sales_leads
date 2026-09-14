-- Migration 053 introduced append-only public FX observations, but pre-existing
-- application grants can survive a narrower GRANT. Normalize the effective ACL.
-- Rollback (if required): restore the prior table grants from the deployment ACL
-- backup; no rows or reference values are changed by this migration.
revoke all privileges on table billing_fx_reference_snapshot,
  billing_reference_refresh_observation,
  billing_reference_refresh_state from public, network_copilot_app;

grant select, insert on table billing_fx_reference_snapshot,
  billing_reference_refresh_observation to network_copilot_app;
grant select, insert, update on table billing_reference_refresh_state
  to network_copilot_app;
