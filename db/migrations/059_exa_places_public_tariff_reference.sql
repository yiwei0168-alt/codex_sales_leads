-- Admit only public Exa Search and Google Places Text Search Enterprise review sources.
-- Static price bounds, expiry, provider routes, historical spend, and invoices are unchanged.
alter table billing_tariff_evidence_snapshot
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
    'openrouter-sol-standard-text-json-v1','deepseek-flash-public-pricing-v1',
    'deepseek-pro-public-pricing-v1','brave-search-public-pricing-v1','tavily-search-public-pricing-v1',
    'exa-search-public-pricing-v1','google-places-text-enterprise-public-pricing-v1'));
