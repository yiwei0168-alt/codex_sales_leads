alter table lead_candidate_assessment
  add column if not exists correction jsonb not null default '{}';

create index if not exists lead_candidate_assessment_corrected_domain_idx
  on lead_candidate_assessment ((correction ->> 'originalDomain'), domain);
