alter table workspace_company add column if not exists user_overrides jsonb not null default '{}';
alter table user_outreach_memory drop constraint if exists user_outreach_memory_kind_check;
alter table user_outreach_memory add constraint user_outreach_memory_kind_check
  check (kind in ('email-style','cooperation-path-preference','user-approved-marketing-claim','company-classification'));
