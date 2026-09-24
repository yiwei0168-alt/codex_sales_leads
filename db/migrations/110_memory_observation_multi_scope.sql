alter table agent_memory_observation add column if not exists market_codes text[] not null default '{}';
alter table agent_memory_observation add column if not exists company_ids text[] not null default '{}';
alter table agent_memory_observation drop constraint if exists agent_memory_observation_scope_limit;
alter table agent_memory_observation add constraint agent_memory_observation_scope_limit
  check(cardinality(market_codes)<=100 and cardinality(company_ids)<=100);
