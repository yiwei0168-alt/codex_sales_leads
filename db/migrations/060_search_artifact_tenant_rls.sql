-- Search runs and their provider evidence belong to the workspace owner. Historical
-- rows retain their original owner; this migration does not rewrite results.
alter table lead_search_run enable row level security;
alter table lead_search_run force row level security;
drop policy if exists lead_search_run_owner on lead_search_run;
create policy lead_search_run_owner on lead_search_run
  using (exists (select 1 from market_workspace w
    where w.id = workspace_id and w.owner_id = app_current_user_id()))
  with check (exists (select 1 from market_workspace w
    where w.id = workspace_id and w.owner_id = app_current_user_id()));

alter table lead_search_query enable row level security;
alter table lead_search_query force row level security;
drop policy if exists lead_search_query_owner on lead_search_query;
create policy lead_search_query_owner on lead_search_query
  using (exists (select 1 from lead_search_run r where r.id = run_id))
  with check (exists (select 1 from lead_search_run r where r.id = run_id));

alter table lead_search_result enable row level security;
alter table lead_search_result force row level security;
drop policy if exists lead_search_result_owner on lead_search_result;
create policy lead_search_result_owner on lead_search_result
  using (exists (select 1 from lead_search_query q
    where q.id = query_id and q.run_id = run_id))
  with check (exists (select 1 from lead_search_query q
    where q.id = query_id and q.run_id = run_id));

alter table lead_search_provider_call enable row level security;
alter table lead_search_provider_call force row level security;
drop policy if exists lead_search_provider_call_owner on lead_search_provider_call;
create policy lead_search_provider_call_owner on lead_search_provider_call
  using (exists (select 1 from lead_search_run r where r.id = run_id))
  with check (exists (select 1 from lead_search_run r where r.id = run_id)
    and (query_id is null or exists (select 1 from lead_search_query q
      where q.id = query_id and q.run_id = run_id)));

alter table lead_search_provider_occurrence enable row level security;
alter table lead_search_provider_occurrence force row level security;
drop policy if exists lead_search_provider_occurrence_owner on lead_search_provider_occurrence;
create policy lead_search_provider_occurrence_owner on lead_search_provider_occurrence
  using (exists (select 1 from lead_search_provider_call c
    where c.id = provider_call_id and c.run_id = run_id))
  with check (exists (select 1 from lead_search_provider_call c
    where c.id = provider_call_id and c.run_id = run_id));
