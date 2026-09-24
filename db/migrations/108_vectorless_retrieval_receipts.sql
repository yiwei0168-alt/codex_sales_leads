create table if not exists knowledge_retrieval_session (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_user(id),
  question text not null,
  route text not null default 'vectorless-shadow' check(route in('vectorless-shadow','vectorless-primary')),
  search_used integer not null default 0 check(search_used between 0 and 1),
  navigation_used integer not null default 0 check(navigation_used between 0 and 8),
  evidence_used integer not null default 0 check(evidence_used between 0 and 8),
  candidate_ids uuid[] not null default '{}',
  matched_count integer not null default 0 check(matched_count>=0),
  created_at timestamptz not null default now()
);
create table if not exists knowledge_retrieval_step (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references knowledge_retrieval_session(id),
  operation text not null check(operation in('search','browse','read','filter','aggregate','budget-exceeded')),
  request jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_retrieval_step_session_idx on knowledge_retrieval_step(session_id,created_at,id);
grant select,insert,update(search_used,navigation_used,evidence_used,candidate_ids,matched_count) on knowledge_retrieval_session to network_copilot_app;
grant select,insert on knowledge_retrieval_step to network_copilot_app;
alter table knowledge_retrieval_session enable row level security;
alter table knowledge_retrieval_session force row level security;
drop policy if exists knowledge_retrieval_session_owner on knowledge_retrieval_session;
create policy knowledge_retrieval_session_owner on knowledge_retrieval_session for all
  using(owner_id=app_current_user_id()) with check(owner_id=app_current_user_id());
alter table knowledge_retrieval_step enable row level security;
alter table knowledge_retrieval_step force row level security;
drop policy if exists knowledge_retrieval_step_owner on knowledge_retrieval_step;
create policy knowledge_retrieval_step_owner on knowledge_retrieval_step for all
  using(exists(select 1 from knowledge_retrieval_session s where s.id=session_id and s.owner_id=app_current_user_id()))
  with check(exists(select 1 from knowledge_retrieval_session s where s.id=session_id and s.owner_id=app_current_user_id()));
