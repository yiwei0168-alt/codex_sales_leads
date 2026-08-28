alter table lead_candidate_assessment
  add column if not exists assessment_review jsonb not null default '{}'::jsonb;

create index if not exists lead_candidate_assessment_review_status_idx
  on lead_candidate_assessment ((assessment_review ->> 'status'));
