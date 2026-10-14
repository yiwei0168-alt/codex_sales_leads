-- The dedicated collector may inspect only account-visible Skill versions before
-- recording a plan. Existing tenant RLS still restricts reads to the owner.
grant select on agent_skill,agent_skill_version,agent_run_skill to network_copilot_skill_collector;
