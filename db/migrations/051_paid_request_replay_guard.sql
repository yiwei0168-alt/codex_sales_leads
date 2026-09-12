-- Nullable for historical reservations whose complete request was not fingerprinted.
alter table paid_call_reservation add column if not exists request_fingerprint text;
create index if not exists paid_request_replay_guard_idx
  on paid_call_reservation(user_id,operation_id,stage,request_fingerprint)
  where request_fingerprint is not null;
comment on column paid_call_reservation.request_fingerprint is
  'SHA-256 of full HTTP method/endpoint/body; scoped by owner/operation/stage. Price-only changes do not permit replay. No raw payload.';
