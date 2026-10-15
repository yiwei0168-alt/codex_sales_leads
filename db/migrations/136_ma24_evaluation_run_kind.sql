-- Independent MA24 runs use the same scoped Agent graph without entering
-- ordinary conversation memory extraction or Skill shadow capture.
alter table agent_run drop constraint if exists agent_run_execution_kind_check;
alter table agent_run add constraint agent_run_execution_kind_check
  check(execution_kind in ('main-agent','mail','main-agent-evaluation'));
