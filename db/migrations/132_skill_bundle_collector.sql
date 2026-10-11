-- Restricted collector can append review artifacts, never judgments or activation.
drop policy if exists collector_insert on agent_skill_acceptance_bundle;
create policy collector_insert on agent_skill_acceptance_bundle for insert to network_copilot_skill_collector
 with check(owner_id=app_current_user_id());
grant select,insert on agent_skill_acceptance_bundle to network_copilot_skill_collector;
