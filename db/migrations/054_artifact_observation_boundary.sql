-- Add precise server-side events; retain legacy values and all historical observations.
alter table workflow_artifact_event drop constraint if exists workflow_artifact_event_event_type_check;
alter table workflow_artifact_event add constraint workflow_artifact_event_event_type_check
  check (event_type in ('generated','valid','retrieved','cited','decision-used','displayed','selected','edited','executed',
    'saved','delivery-selected'));

-- Only new, versioned observations are idempotent. Do not deduplicate unknown historical events.
create unique index if not exists workflow_artifact_event_v2_identity
  on workflow_artifact_event(user_id,lead_run_id,stage,artifact_type,event_type)
  where metadata->>'observationVersion'='workflow-artifact-v2' and lead_run_id is not null;
