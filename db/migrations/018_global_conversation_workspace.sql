update market_workspace
set slug = 'global-sales', name = 'Global Sales Workspace', market = 'Global', country_code = 'WW',
    objective = 'Discover, evaluate, and develop qualified sales opportunities in any market.', updated_at = now()
where slug = 'mexico-pilot';

alter table lead_search_run add column if not exists country_code char(2);
alter table lead_search_run add column if not exists market_name text;
alter table lead_search_run add column if not exists objective text;
update lead_search_run r set country_code = coalesce(r.country_code, w.country_code),
  market_name = coalesce(r.market_name, w.market), objective = coalesce(r.objective, w.mode)
from market_workspace w where w.id = r.workspace_id
  and (r.country_code is null or r.market_name is null or r.objective is null);

alter table workspace_company add column if not exists market_country_code char(2);
alter table workspace_company add column if not exists search_run_id uuid references lead_search_run(id) on delete set null;
update workspace_company wc set market_country_code = coalesce(wc.market_country_code, c.country_code)
from sales_company c where c.id = wc.company_id and wc.market_country_code is null;
create index if not exists workspace_company_country_idx on workspace_company(workspace_id, market_country_code, opportunity_stage);

alter table lead_search_query alter column region set default 'Global';

create table if not exists assistant_conversation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  title text not null default '新对话',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create index if not exists assistant_conversation_user_time_idx on assistant_conversation(user_id, updated_at desc);

create table if not exists assistant_message (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  intent text not null default 'general',
  content text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (user_id, conversation_id) references assistant_conversation(user_id, id) on delete cascade
);
create index if not exists assistant_message_conversation_time_idx on assistant_message(user_id, conversation_id, created_at);

create table if not exists assistant_action (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  conversation_id uuid not null,
  action_type text not null check (action_type in ('lead-search')),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'running', 'completed', 'failed', 'cancelled')),
  payload jsonb not null,
  result jsonb not null default '{}',
  error_message text,
  confirmed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, conversation_id) references assistant_conversation(user_id, id) on delete cascade
);
create index if not exists assistant_action_conversation_time_idx on assistant_action(user_id, conversation_id, created_at desc);

grant select, insert, update, delete on assistant_conversation, assistant_message, assistant_action to network_copilot_app;

alter table assistant_conversation enable row level security;
alter table assistant_conversation force row level security;
drop policy if exists assistant_conversation_tenant on assistant_conversation;
create policy assistant_conversation_tenant on assistant_conversation
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table assistant_message enable row level security;
alter table assistant_message force row level security;
drop policy if exists assistant_message_tenant on assistant_message;
create policy assistant_message_tenant on assistant_message
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table assistant_action enable row level security;
alter table assistant_action force row level security;
drop policy if exists assistant_action_tenant on assistant_action;
create policy assistant_action_tenant on assistant_action
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
