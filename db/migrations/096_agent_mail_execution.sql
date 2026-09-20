alter table agent_run add column if not exists execution_kind text not null default 'main-agent';
alter table agent_run add column if not exists execution_spec jsonb;
alter table agent_run drop constraint if exists agent_run_execution_kind_check;
alter table agent_run add constraint agent_run_execution_kind_check check(execution_kind in('main-agent','mail'));
