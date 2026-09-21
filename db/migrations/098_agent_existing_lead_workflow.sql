-- MA11: bind an optional existing lead workflow to one persisted Agent tool call.
alter table assistant_action add column if not exists source_agent_call_id uuid;
create unique index if not exists assistant_action_agent_call_once
  on assistant_action(user_id, source_agent_call_id) where source_agent_call_id is not null;
