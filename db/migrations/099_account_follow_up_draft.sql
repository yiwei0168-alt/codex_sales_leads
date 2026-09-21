-- Account-owned follow-up drafts also support sent mail without company/workspace.
create table if not exists account_follow_up_draft (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  parent_id uuid not null references outbound_mail(id),
  draft_ciphertext text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(user_id,id)
);
create index if not exists account_follow_up_draft_parent_time on account_follow_up_draft(user_id,parent_id,created_at desc);
-- Preserve drafts written by the earlier workspace-audit implementation.
insert into account_follow_up_draft(id,user_id,parent_id,draft_ciphertext,metadata,created_at)
select md5('follow-up-audit:' || e.id::text)::uuid,e.actor_user_id,m.id,e.changes->>'draftCiphertext',
  (e.changes - 'draftCiphertext') || jsonb_build_object('migratedAuditId',e.id),e.created_at
from workspace_audit_event e join outbound_mail m on m.id::text=e.entity_id and m.user_id=e.actor_user_id
where e.action='follow-up.generated' and nullif(e.changes->>'draftCiphertext','') is not null
on conflict(id) do nothing;
alter table account_follow_up_draft enable row level security;
alter table account_follow_up_draft force row level security;
drop policy if exists account_follow_up_draft_owner on account_follow_up_draft;
create policy account_follow_up_draft_owner on account_follow_up_draft
  using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert on account_follow_up_draft to network_copilot_app;
