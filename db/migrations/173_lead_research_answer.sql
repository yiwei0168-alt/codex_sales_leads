-- Private, append-only owner declarations. Never add these to public evidence packets.
create table if not exists lead_research_answer (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  action_id uuid not null references assistant_action(id) on delete cascade,
  graph_thread_id text not null,
  candidate_id text not null,
  question_hash text not null check(question_hash ~ '^[a-f0-9]{64}$'),
  question text not null,
  relationship_status text not null check(relationship_status in ('none','exists','unknown')),
  answer text not null check(length(answer) between 1 and 1000),
  received_at timestamptz not null default now(),
  unique(user_id,action_id,candidate_id,question_hash)
);
alter table lead_research_answer enable row level security;
alter table lead_research_answer force row level security;
drop policy if exists lead_research_answer_tenant on lead_research_answer;
create policy lead_research_answer_tenant on lead_research_answer
  using(user_id=app_current_user_id() and exists(
    select 1 from assistant_action a where a.id=action_id and a.user_id=app_current_user_id()))
  with check(user_id=app_current_user_id() and exists(
    select 1 from assistant_action a where a.id=action_id and a.user_id=app_current_user_id()));
grant select,insert on lead_research_answer to network_copilot_app;
revoke update,delete on lead_research_answer from network_copilot_app;
