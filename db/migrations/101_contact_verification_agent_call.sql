alter table contact_verification_run add column if not exists agent_call_id uuid;
create unique index if not exists contact_verification_run_agent_call_unique
  on contact_verification_run(workspace_id,agent_call_id) where agent_call_id is not null;
