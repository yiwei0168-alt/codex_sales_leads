alter table lead_candidate_assessment
  add column if not exists handoff_report jsonb not null default '{}'::jsonb;

create index if not exists lead_candidate_assessment_handoff_ready_idx
  on lead_candidate_assessment (((handoff_report -> 'quality' ->> 'readyForEmail')::boolean))
  where handoff_report <> '{}'::jsonb;

alter table outreach_draft
  add column if not exists handoff_report jsonb not null default '{}'::jsonb;
