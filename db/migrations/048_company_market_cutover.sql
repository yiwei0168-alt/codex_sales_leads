-- Read projection keeps business fields out of the global company identity.
create or replace view user_company_market with (security_invoker=true) as
select s.workspace_id,s.company_id,s.country_code as market_country_code,s.candidate_id,
  s.search_run_id,s.revision,s.provenance,s.created_at,s.updated_at,
  s.user_overrides - 'id' - 'country' as user_overrides,
  e.record,
  e.record->>'accountTier' as account_tier,e.record->>'supplyModel' as supply_model,
  e.record->>'brandInvolvement' as brand_involvement,e.record->>'opportunityStage' as opportunity_stage,
  e.record->>'priority' as priority,e.record->>'owner' as owner_name,e.record->>'nextAction' as next_action,
  (e.record->>'manuallyEdited')='true' as manually_edited,
  e.record->>'selectedPathId' as selected_path_id,e.record->>'selectedCooperationPath' as selected_path_type
from workspace_company_market s cross join lateral (
  select s.record || s.user_overrides || jsonb_build_object('id',s.candidate_id,'country',s.country_code,
    'recordCreatedAt',s.created_at,'updatedAt',s.updated_at,'searchRunId',s.search_run_id,
    'assessmentNeedsRefresh',s.provenance='legacy-country-conflict'
      or coalesce((s.user_overrides->>'assessmentNeedsRefresh')='true',(s.record->>'assessmentNeedsRefresh')='true',false)) as record
) e;
grant select on user_company_market to network_copilot_app;

alter table outreach_draft add column if not exists market_country_code text check(market_country_code ~ '^[A-Z]{2}$');
alter table outbound_mail add column if not exists market_country_code text check(market_country_code ~ '^[A-Z]{2}$');
-- Only an existing immutable search association supplies legacy draft provenance.
update outreach_draft d set market_country_code=trim(r.country_code)
from lead_search_run r where d.search_run_id=r.id and d.workspace_id=r.workspace_id
  and d.market_country_code is null and trim(r.country_code) ~ '^[A-Z]{2}$'
  and exists(select 1 from workspace_company_market s where s.workspace_id=d.workspace_id
    and s.company_id=d.company_id and s.country_code=trim(r.country_code));
-- Old outbound messages lack an immutable country field. Leave them unassigned;
-- never infer their country from today's mutable company membership.
create index if not exists outreach_draft_market on outreach_draft(user_id,company_id,market_country_code,updated_at desc);
create index if not exists outbound_mail_market on outbound_mail(user_id,company_id,market_country_code,created_at desc);
