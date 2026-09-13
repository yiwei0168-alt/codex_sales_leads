-- Extend the append-only public review ledger to the two existing DeepSeek static tariffs.
-- The replaying migration runner must preserve source pairs admitted by 058/059.
-- This does not alter an admitted rule, historical cost or the static verification deadline.
alter table billing_tariff_evidence_snapshot
  drop constraint if exists billing_tariff_evidence_snapshot_source_key_check,
  drop constraint if exists billing_tariff_evidence_snapshot_tariff_key_check,
  drop constraint if exists billing_tariff_evidence_snapshot_source_tariff_check;
alter table billing_tariff_evidence_snapshot
  add constraint billing_tariff_evidence_snapshot_source_tariff_check check (
    (source_key='openrouter-sol-standard-text-json-v1' and tariff_key='openrouter-sol-credits-standard-text-json')
    or (source_key='deepseek-flash-public-pricing-v1' and tariff_key='deepseek-flash-v41-text-json')
    or (source_key='deepseek-pro-public-pricing-v1' and tariff_key='deepseek-pro-0813-nonthinking-text')
    or (source_key='brave-search-public-pricing-v1' and tariff_key='brave-standard-web-search')
    or (source_key='tavily-search-public-pricing-v1' and tariff_key='tavily-standard-search')
    or (source_key='exa-search-public-pricing-v1' and tariff_key='exa-company-auto-text-search')
    or (source_key='google-places-text-enterprise-public-pricing-v1' and tariff_key='google-places-text-search-enterprise'));

alter table billing_tariff_refresh_state
  drop constraint if exists billing_tariff_refresh_state_source_key_check,
  drop constraint if exists billing_tariff_refresh_state_tariff_key_check,
  drop constraint if exists billing_tariff_refresh_state_source_tariff_check;
alter table billing_tariff_refresh_state
  add constraint billing_tariff_refresh_state_source_tariff_check check (
    (source_key='openrouter-sol-standard-text-json-v1' and tariff_key='openrouter-sol-credits-standard-text-json')
    or (source_key='deepseek-flash-public-pricing-v1' and tariff_key='deepseek-flash-v41-text-json')
    or (source_key='deepseek-pro-public-pricing-v1' and tariff_key='deepseek-pro-0813-nonthinking-text')
    or (source_key='brave-search-public-pricing-v1' and tariff_key='brave-standard-web-search')
    or (source_key='tavily-search-public-pricing-v1' and tariff_key='tavily-standard-search')
    or (source_key='exa-search-public-pricing-v1' and tariff_key='exa-company-auto-text-search')
    or (source_key='google-places-text-enterprise-public-pricing-v1' and tariff_key='google-places-text-search-enterprise'));

alter table billing_tariff_refresh_observation
  drop constraint if exists billing_tariff_refresh_observation_source_key_check;
alter table billing_tariff_refresh_observation
  add constraint billing_tariff_refresh_observation_source_key_check check (source_key in (
    'openrouter-sol-standard-text-json-v1','deepseek-flash-public-pricing-v1','deepseek-pro-public-pricing-v1',
    'brave-search-public-pricing-v1','tavily-search-public-pricing-v1',
    'exa-search-public-pricing-v1','google-places-text-enterprise-public-pricing-v1'));

comment on table billing_tariff_evidence_snapshot is 'Append-only public pricing evidence for admitted static tariffs, not invoices or spending authorization. No user data.';

-- A prior acceptance probe may have written the initial seven-day due time before
-- the final daily review interval was selected. Shorten only these two public checks.
update billing_tariff_refresh_state set next_attempt_at=least(next_attempt_at,checked_at+interval '24 hours')
  where source_key in ('deepseek-flash-public-pricing-v1','deepseek-pro-public-pricing-v1');
