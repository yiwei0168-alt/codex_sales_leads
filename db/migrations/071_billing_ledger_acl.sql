-- Migration 014 re-grants SELECT/INSERT/UPDATE/DELETE on every replay.
-- These billing records are append-only; the four state tables need UPDATE but
-- no application DELETE. Revoke inherited broad grants before the exact grant.
-- Reversible without data changes by restoring the pre-deployment ACL backup.
revoke all privileges on table
  billing_tariff_evidence_snapshot,
  billing_tariff_refresh_observation,
  paid_cost_observation,
  paid_rule_hold,
  spend_budget_change,
  billing_tariff_refresh_state,
  paid_call_reservation,
  task_spend_limit,
  user_spend_budget
  from public, network_copilot_app;

grant select, insert on table
  billing_tariff_evidence_snapshot,
  billing_tariff_refresh_observation,
  paid_cost_observation,
  paid_rule_hold,
  spend_budget_change
  to network_copilot_app;

grant select, insert, update on table
  billing_tariff_refresh_state,
  paid_call_reservation,
  task_spend_limit,
  user_spend_budget
  to network_copilot_app;
