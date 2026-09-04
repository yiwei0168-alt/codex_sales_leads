begin;

alter table workflow_model_usage
  add column if not exists account_cash_cost_usd numeric(18, 9)
  check (account_cash_cost_usd is null or account_cash_cost_usd >= 0);

comment on column workflow_model_usage.account_cash_cost_usd is
  'Provider-reported cash cost for this model call, in USD; null when the provider does not report it.';

commit;
