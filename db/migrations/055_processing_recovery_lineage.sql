create table if not exists lead_processing_recovery (
  user_id uuid not null references app_user(id),
  parent_action_id uuid primary key references assistant_action(id) on delete cascade,
  child_action_id uuid not null unique references assistant_action(id) on delete cascade,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check(parent_action_id<>child_action_id)
);
alter table lead_processing_recovery enable row level security;
alter table lead_processing_recovery force row level security;
drop policy if exists processing_recovery_owner on lead_processing_recovery;
create policy processing_recovery_owner on lead_processing_recovery
  using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert on lead_processing_recovery to network_copilot_app;

create or replace function validate_processing_recovery_link() returns trigger language plpgsql as $$
begin
  -- Same owner lock as paid reservations and task-limit edits serializes lineage changes.
  perform 1 from user_spend_budget where user_id=new.user_id for update;
  if not found then raise exception 'Recovery requires an existing owner budget'; end if;
  -- Attach a fresh proposal before any spending; existing child costs cannot be
  -- retroactively moved into a family that may already be at its limit.
  if exists(select 1 from paid_call_reservation where user_id=new.user_id and operation_id=new.child_action_id::text)
    or exists(select 1 from lead_processing_recovery where user_id=new.user_id and parent_action_id=new.child_action_id) then
    raise exception 'Recovery child must be an unspent fresh proposal';
  end if;
  if not exists(select 1 from assistant_action p join assistant_action c on c.id=new.child_action_id
    where p.id=new.parent_action_id and p.user_id=new.user_id and c.user_id=new.user_id
      and p.status='completed' and c.status='proposed' and p.action_type='lead-search' and c.action_type='lead-search'
      and p.conversation_id=c.conversation_id and p.payload->>'countryCode'=c.payload->>'countryCode'
      and p.payload->'roles'=c.payload->'roles') then
    raise exception 'Recovery parent, child, owner, conversation or scope mismatch';
  end if;
  if exists(with recursive ancestors(id) as (
      select new.parent_action_id union
      select r.parent_action_id from lead_processing_recovery r join ancestors a on r.child_action_id=a.id where r.user_id=new.user_id
    ) select 1 from ancestors where id=new.child_action_id) then
    raise exception 'Recovery lineage cycle';
  end if;
  return new;
end $$;
drop trigger if exists processing_recovery_link_guard on lead_processing_recovery;
create trigger processing_recovery_link_guard before insert on lead_processing_recovery
  for each row execute function validate_processing_recovery_link();
