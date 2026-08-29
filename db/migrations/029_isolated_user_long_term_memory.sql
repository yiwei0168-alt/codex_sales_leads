create table if not exists user_outreach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid references market_workspace(id) on delete cascade,
  kind text not null check (kind in ('email-style', 'cooperation-path-preference', 'user-approved-marketing-claim')),
  external_id text not null,
  title text not null,
  content text not null,
  market_codes text[] not null default '{}',
  channel_roles text[] not null default '{}',
  context jsonb not null default '{}',
  usage_scope text not null default 'internal-learning'
    check (usage_scope in ('internal-learning', 'external-use-approved')),
  affects_objective_scoring boolean not null default false check (affects_objective_scoring=false),
  embedding vector(1536),
  search_vector tsvector generated always as
    (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))) stored,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id)
);
create index if not exists user_outreach_memory_search_idx on user_outreach_memory using gin(search_vector);
create index if not exists user_outreach_memory_embedding_idx
  on user_outreach_memory using hnsw (embedding vector_cosine_ops);
create index if not exists user_outreach_memory_context_idx
  on user_outreach_memory(user_id, workspace_id, kind, status, updated_at desc);

create table if not exists user_cooperation_path_edit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  company_id uuid not null references sales_company(id) on delete cascade,
  previous_path_id text,
  previous_path_type text,
  selected_path_id text not null,
  selected_path_type text not null,
  primary_business_role text,
  company_scale_class text,
  market_code text,
  development_stage text,
  available_paths jsonb not null default '[]',
  source text not null default 'user-ui' check (source in ('user-ui', 'api', 'import')),
  created_at timestamptz not null default now()
);
create index if not exists user_cooperation_path_edit_lookup_idx
  on user_cooperation_path_edit(user_id, workspace_id, primary_business_role, market_code, created_at desc);

create table if not exists user_outreach_edit_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  draft_id uuid not null references outreach_draft(id) on delete cascade,
  feedback_id uuid references outreach_feedback(id) on delete set null,
  source_revision integer not null,
  edit_source text not null check (edit_source in ('manual-body-edit', 'feedback-revision')),
  user_instruction text,
  previous_body text not null,
  revised_body text not null,
  distilled_memory_id uuid references user_outreach_memory(id) on delete set null,
  distillation_status text not null default 'pending'
    check (distillation_status in ('pending', 'applied', 'not-reusable', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists user_outreach_edit_event_draft_idx
  on user_outreach_edit_event(user_id, draft_id, created_at desc);

alter table workspace_company add column if not exists selected_path_id text;
alter table workspace_company add column if not exists selected_path_type text;
alter table outreach_feedback add column if not exists private_memory_id uuid references user_outreach_memory(id) on delete set null;

insert into user_outreach_memory (
  user_id, kind, external_id, title, content, market_codes, channel_roles, context,
  usage_scope, affects_objective_scoring, embedding, status, created_at, updated_at
)
select owner_id, 'email-style', external_id, title, content, market_codes, channel_roles,
       source_refs || jsonb_build_object('migratedFrom', 'outreach_knowledge_item'),
       'internal-learning', false, embedding, approval_status, created_at, updated_at
  from outreach_knowledge_item
 where visibility='private' and owner_id is not null and kind='feedback-memory'
on conflict (user_id, external_id) do nothing;

update outreach_feedback f
   set private_memory_id=m.id
  from user_outreach_memory m
 where m.user_id=f.user_id and m.external_id='feedback:' || f.id::text;

delete from outreach_knowledge_item where visibility='private';

drop policy if exists outreach_knowledge_read on outreach_knowledge_item;
create policy outreach_knowledge_read on outreach_knowledge_item for select using (visibility='shared');
drop policy if exists outreach_knowledge_private_write on outreach_knowledge_item;
create policy outreach_knowledge_shared_admin_write on outreach_knowledge_item for all
  using (visibility='shared' and app_current_user_role()='admin')
  with check (visibility='shared' and app_current_user_role()='admin');

alter table user_outreach_memory enable row level security;
alter table user_outreach_memory force row level security;
drop policy if exists user_outreach_memory_tenant on user_outreach_memory;
create policy user_outreach_memory_tenant on user_outreach_memory
  using (user_id=app_current_user_id()) with check (user_id=app_current_user_id());
alter table user_cooperation_path_edit enable row level security;
alter table user_cooperation_path_edit force row level security;
drop policy if exists user_cooperation_path_edit_tenant on user_cooperation_path_edit;
create policy user_cooperation_path_edit_tenant on user_cooperation_path_edit
  using (user_id=app_current_user_id()) with check (user_id=app_current_user_id());
alter table user_outreach_edit_event enable row level security;
alter table user_outreach_edit_event force row level security;
drop policy if exists user_outreach_edit_event_tenant on user_outreach_edit_event;
create policy user_outreach_edit_event_tenant on user_outreach_edit_event
  using (user_id=app_current_user_id()) with check (user_id=app_current_user_id());

grant select, insert, update, delete on user_outreach_memory, user_cooperation_path_edit,
  user_outreach_edit_event to network_copilot_app;
