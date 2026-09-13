-- Extend the existing append-only public tariff review ledger to admitted Brave and Tavily Search bounds.
-- Neither prices nor static expiry, historical costs or paid authorization are changed here.
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
    or (source_key='tavily-search-public-pricing-v1' and tariff_key='tavily-standard-search'));

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
    or (source_key='tavily-search-public-pricing-v1' and tariff_key='tavily-standard-search'));

alter table billing_tariff_refresh_observation
  drop constraint if exists billing_tariff_refresh_observation_source_key_check;
alter table billing_tariff_refresh_observation
  add constraint billing_tariff_refresh_observation_source_key_check check (source_key in (
    'openrouter-sol-standard-text-json-v1','deepseek-flash-public-pricing-v1',
    'deepseek-pro-public-pricing-v1','brave-search-public-pricing-v1','tavily-search-public-pricing-v1'));

comment on table billing_tariff_evidence_snapshot is 'Append-only public pricing evidence for admitted static tariffs, not invoices or spending authorization. No user data.';
