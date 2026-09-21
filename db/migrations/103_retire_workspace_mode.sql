-- Historical mode remains readable; new workspaces do not infer a global goal.
alter table market_workspace alter column mode drop not null;
alter table market_workspace alter column mode drop default;
comment on column market_workspace.mode is 'Historical compatibility only. Global workspace mode retired in MA15; new records leave this null.';
