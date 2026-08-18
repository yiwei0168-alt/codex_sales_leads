alter table company_email_candidate add column if not exists source_status text;
update company_email_candidate set source_status = status where source_status is null;
alter table company_email_candidate alter column source_status set default 'Unknown';
alter table company_email_candidate alter column source_status set not null;
do $$ begin
  alter table company_email_candidate add constraint company_email_candidate_source_status_check
    check (source_status in ('Public', 'Verified', 'Pattern-guessed', 'Unknown', 'Invalid'));
exception when duplicate_object then null;
end $$;

alter table contact_verification_decision add column if not exists current boolean not null default false;
alter table contact_verification_decision add column if not exists published_at timestamptz;
alter table contact_verification_decision add column if not exists superseded_at timestamptz;
create unique index if not exists contact_verification_decision_current_email_idx
  on contact_verification_decision(email_candidate_id) where current;

alter table company_email_candidate add column if not exists verification_decision_id uuid;
do $$ begin
  alter table company_email_candidate add constraint company_email_candidate_verification_decision_fkey
    foreign key (verification_decision_id) references contact_verification_decision(id) on delete set null;
exception when duplicate_object then null;
end $$;
create index if not exists company_email_candidate_verification_idx
  on company_email_candidate(workspace_id, verification_decision_id) where verification_decision_id is not null;

alter table contact_verification_run add column if not exists published_count integer not null default 0;
alter table contact_verification_run add column if not exists accepted_count integer not null default 0;
alter table contact_verification_run add column if not exists review_count integer not null default 0;
alter table contact_verification_run add column if not exists invalidated_count integer not null default 0;

comment on column company_email_candidate.source_status is 'Crawler/source status retained independently from the active verification decision.';
comment on column company_email_candidate.verification_decision_id is 'Current formally published Contact Verification Agent decision.';
comment on column contact_verification_decision.current is 'True only for the active automatic decision for an email candidate.';
