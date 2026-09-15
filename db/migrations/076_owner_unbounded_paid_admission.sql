-- A33: exact-owner paid calls may be admitted without asserting a reviewed monetary ceiling.
alter table paid_call_reservation add column if not exists cost_bound_known boolean not null default true;
alter table paid_call_reservation drop constraint if exists paid_call_reservation_reserved_micros_check;
alter table paid_call_reservation add constraint paid_call_reservation_reserved_micros_check check(
  (cost_bound_known and reserved_micros > 0) or (not cost_bound_known and reserved_micros = 0)
);
comment on column paid_call_reservation.cost_bound_known is
  'False means owner-authorized unbounded admission: reserved_micros=0 is an unknown ceiling marker, never a claim of zero cost.';
