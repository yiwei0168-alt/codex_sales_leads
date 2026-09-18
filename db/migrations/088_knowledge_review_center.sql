alter table knowledge_review_queue_v3
  add column if not exists correction jsonb;

create table if not exists knowledge_evaluation_review_v3 (
  id uuid primary key default gen_random_uuid(),
  corpus_version text not null,
  case_id text not null,
  case_sha256 text not null,
  split text not null check(split in('development','validation','holdout')),
  expected_answer text not null,
  expected_sources jsonb not null default '[]'::jsonb,
  review_note text,
  reviewed_by uuid not null references app_user(id),
  reviewed_at timestamptz not null default now(),
  revision integer not null default 1 check(revision > 0),
  unique(corpus_version,case_id),
  check(jsonb_typeof(expected_sources)='array')
);
create index if not exists knowledge_evaluation_review_v3_progress_idx
  on knowledge_evaluation_review_v3(corpus_version,split,reviewed_at);

create table if not exists knowledge_evaluation_holdout_gate_v3 (
  corpus_version text primary key,
  retrieval_profile_key text not null,
  retrieval_profile_sha256 text not null check(retrieval_profile_sha256~'^[0-9a-f]{64}$'),
  frozen_by uuid not null references app_user(id),
  frozen_at timestamptz not null default now()
);

alter table knowledge_evaluation_review_v3 enable row level security;
alter table knowledge_evaluation_review_v3 force row level security;
drop policy if exists knowledge_evaluation_review_v3_admin on knowledge_evaluation_review_v3;
create policy knowledge_evaluation_review_v3_admin on knowledge_evaluation_review_v3
  using(app_current_user_role()='admin') with check(app_current_user_role()='admin');

alter table knowledge_evaluation_holdout_gate_v3 enable row level security;
alter table knowledge_evaluation_holdout_gate_v3 force row level security;
drop policy if exists knowledge_evaluation_holdout_gate_v3_admin on knowledge_evaluation_holdout_gate_v3;
create policy knowledge_evaluation_holdout_gate_v3_admin on knowledge_evaluation_holdout_gate_v3
  using(app_current_user_role()='admin') with check(app_current_user_role()='admin');

grant select,insert,update on knowledge_evaluation_review_v3,knowledge_evaluation_holdout_gate_v3
  to network_copilot_app;

create or replace function guard_knowledge_release_v3_gold_activation() returns trigger
language plpgsql security invoker as $$
begin
  if new.status='active' and old.status is distinct from 'active' then
    if not exists(select 1 from knowledge_evaluation_holdout_gate_v3 where corpus_version='knowledge-eval-v3-baseline') then
      raise exception 'v3 release gold holdout is still locked';
    end if;
    if (select count(*) from knowledge_evaluation_review_v3 where corpus_version='knowledge-eval-v3-baseline')<>300 then
      raise exception 'v3 release requires 300 reviewed gold cases';
    end if;
    if (select count(*) from knowledge_evaluation_review_v3 where corpus_version='knowledge-eval-v3-baseline' and split='holdout')<>50 then
      raise exception 'v3 release requires the one-time 50-case holdout review';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists knowledge_release_v3_gold_activation_guard on knowledge_release_v3;
create trigger knowledge_release_v3_gold_activation_guard before update of status on knowledge_release_v3
  for each row execute function guard_knowledge_release_v3_gold_activation();
