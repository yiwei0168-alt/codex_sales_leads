-- Contact and verification artifacts are private to their market workspace.
-- Existing rows and provider outcomes are unchanged. Quarantined legacy emails
-- without a workspace remain invisible to the application role.
alter table company_enrichment_run enable row level security;
alter table company_enrichment_run force row level security;
drop policy if exists company_enrichment_run_owner on company_enrichment_run;
create policy company_enrichment_run_owner on company_enrichment_run
  using (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id()))
  with check (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id()));

alter table company_enrichment_run_item enable row level security;
alter table company_enrichment_run_item force row level security;
drop policy if exists company_enrichment_run_item_owner on company_enrichment_run_item;
create policy company_enrichment_run_item_owner on company_enrichment_run_item
  using (exists(select 1 from company_enrichment_run r where r.id=run_id))
  with check (exists(select 1 from company_enrichment_run r where r.id=run_id));

alter table company_web_evidence enable row level security;
alter table company_web_evidence force row level security;
drop policy if exists company_web_evidence_owner on company_web_evidence;
create policy company_web_evidence_owner on company_web_evidence
  using (exists(select 1 from company_enrichment_run r where r.id=run_id and r.workspace_id=workspace_id))
  with check (exists(select 1 from company_enrichment_run r where r.id=run_id and r.workspace_id=workspace_id));

alter table company_contact enable row level security;
alter table company_contact force row level security;
drop policy if exists company_contact_owner on company_contact;
create policy company_contact_owner on company_contact
  using (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id()))
  with check (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id()));

alter table company_email_candidate enable row level security;
alter table company_email_candidate force row level security;
drop policy if exists company_email_candidate_owner on company_email_candidate;
create policy company_email_candidate_owner on company_email_candidate
  using (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id()))
  with check (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id())
    and (contact_id is null or exists(select 1 from company_contact ct
      where ct.id=contact_id and ct.workspace_id=workspace_id and ct.company_id=company_id)));

alter table contact_verification_run enable row level security;
alter table contact_verification_run force row level security;
drop policy if exists contact_verification_run_owner on contact_verification_run;
create policy contact_verification_run_owner on contact_verification_run
  using (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id()))
  with check (exists(select 1 from market_workspace w where w.id=workspace_id and w.owner_id=app_current_user_id()));

alter table contact_model_assessment enable row level security;
alter table contact_model_assessment force row level security;
drop policy if exists contact_model_assessment_owner on contact_model_assessment;
create policy contact_model_assessment_owner on contact_model_assessment
  using (exists(select 1 from contact_verification_run r
    join company_email_candidate em on em.id=email_candidate_id
    where r.id=run_id and em.workspace_id=r.workspace_id and em.company_id=company_id))
  with check (exists(select 1 from contact_verification_run r
    join company_email_candidate em on em.id=email_candidate_id
    where r.id=run_id and em.workspace_id=r.workspace_id and em.company_id=company_id));

alter table contact_verification_decision enable row level security;
alter table contact_verification_decision force row level security;
drop policy if exists contact_verification_decision_owner on contact_verification_decision;
create policy contact_verification_decision_owner on contact_verification_decision
  using (exists(select 1 from contact_verification_run r
    join company_email_candidate em on em.id=email_candidate_id
    where r.id=run_id and em.workspace_id=r.workspace_id and em.company_id=company_id))
  with check (exists(select 1 from contact_verification_run r
    join company_email_candidate em on em.id=email_candidate_id
    where r.id=run_id and em.workspace_id=r.workspace_id and em.company_id=company_id)
    and (contact_id is null or exists(select 1 from company_contact ct
      join contact_verification_run r on r.workspace_id=ct.workspace_id
      where r.id=run_id and ct.id=contact_id and ct.company_id=company_id)));

alter table contact_review_queue enable row level security;
alter table contact_review_queue force row level security;
drop policy if exists contact_review_queue_owner on contact_review_queue;
create policy contact_review_queue_owner on contact_review_queue
  using (exists(select 1 from contact_verification_decision d where d.id=decision_id))
  with check (exists(select 1 from contact_verification_decision d where d.id=decision_id));
