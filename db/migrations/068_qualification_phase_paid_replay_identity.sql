-- Nullable for preexisting completed rows; only rows with the exact HTTP replay identity
-- may exempt a completed phase from the graph's post-checkpoint response guard.
alter table lead_qualification_phase_checkpoint
  add column if not exists paid_request_fingerprint text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='qualification_phase_paid_request_fingerprint_format') then
    alter table lead_qualification_phase_checkpoint
      add constraint qualification_phase_paid_request_fingerprint_format
      check (paid_request_fingerprint is null or paid_request_fingerprint ~ '^[a-f0-9]{64}$');
  end if;
end $$;
create index if not exists qualification_phase_paid_replay_lookup
  on lead_qualification_phase_checkpoint(user_id,action_id,paid_request_fingerprint)
  where paid_request_fingerprint is not null;
