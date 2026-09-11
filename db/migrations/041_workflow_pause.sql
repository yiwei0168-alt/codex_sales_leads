alter table lead_workflow_job add column if not exists stop_requested boolean not null default false;
alter table lead_workflow_job add column if not exists paused_at timestamptz;
