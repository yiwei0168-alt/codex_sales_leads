create table if not exists mailbox_work_job (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references app_user(id),
 kind text not null check(kind in ('learn','sync')), target_id uuid not null,
 payload jsonb not null default '{}', status text not null default 'queued'
 check(status in ('queued','running','completed','failed','uncertain','cancelled')),
 result jsonb, error text, lease_token uuid, lease_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists mailbox_work_active on mailbox_work_job(user_id,kind,target_id)
 where status in ('queued','running','uncertain');
alter table mailbox_work_job enable row level security;
alter table mailbox_work_job force row level security;
drop policy if exists mailbox_work_owner on mailbox_work_job;
create policy mailbox_work_owner on mailbox_work_job using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update,delete on mailbox_work_job to network_copilot_app;
create or replace function claim_mailbox_work() returns table(id uuid,user_id uuid,lease_token uuid)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Learning may have reached the provider: never replay a lost lease automatically.
 update public.mailbox_work_job set status=case when kind='learn' then 'uncertain' else 'queued' end,
 error='Worker interrupted; reconcile original receipts before retrying learning',updated_at=now()
 where status='running' and lease_until<now();
 return query update public.mailbox_work_job j set status='running',lease_token=gen_random_uuid(),
 lease_until=now()+interval '90 seconds',updated_at=now()
 where j.id=(select q.id from public.mailbox_work_job q join public.app_user u on u.id=q.user_id
 where q.status='queued' and u.status='active' order by q.created_at for update of q skip locked limit 1)
 returning j.id,j.user_id,j.lease_token;
end $$;
revoke all on function claim_mailbox_work() from public;
grant execute on function claim_mailbox_work() to network_copilot_app;
