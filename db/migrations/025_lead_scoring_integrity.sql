alter table lead_candidate_assessment
  add column if not exists fact_ledger jsonb not null default '[]'::jsonb;

alter table lead_candidate_assessment
  add column if not exists dimension_rationales jsonb not null default '[]'::jsonb;

alter table lead_candidate_assessment
  add column if not exists scoring_status text not null default 'completed'
    check (scoring_status in ('completed', 'retry-required'));

create index if not exists lead_candidate_assessment_scoring_status_idx
  on lead_candidate_assessment(run_id, scoring_status, selected desc);
