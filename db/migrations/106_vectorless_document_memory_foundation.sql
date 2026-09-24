-- A document switches to a searchable revision only after all evidence nodes exist.
create table if not exists knowledge_tree_version (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_document(id),
  asset_id uuid not null references knowledge_asset(id),
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  extractor_version text not null,
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'building' check(status in('building','ready','failed','withdrawn')),
  error_code text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique(document_id,source_sha256,extractor_version)
);
create table if not exists knowledge_tree_node (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references knowledge_tree_version(id),
  parent_id uuid references knowledge_tree_node(id),
  ordinal integer not null check(ordinal >= 0),
  node_kind text not null check(node_kind in('unit','evidence')),
  title text not null,
  heading_path text[] not null default '{}',
  unit_type text not null check(unit_type in('page','slide','sheet','document')),
  unit_index integer not null check(unit_index >= 1),
  source_location jsonb not null,
  content text,
  content_sha256 text check(content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  search_vector tsvector generated always as (to_tsvector('simple',coalesce(content,''))) stored,
  unique(version_id,unit_type,unit_index,node_kind,ordinal),
  check((node_kind='unit' and parent_id is null and content is null) or
        (node_kind='evidence' and parent_id is not null and content is not null and content_sha256 is not null))
);
create index if not exists knowledge_tree_node_parent_idx on knowledge_tree_node(version_id,parent_id,ordinal);
create index if not exists knowledge_tree_node_search_idx on knowledge_tree_node using gin(search_vector);
alter table knowledge_document add column if not exists current_tree_version_id uuid references knowledge_tree_version(id);

-- Observations are immutable. Unknown business validity is represented by NULL, not now().
create table if not exists agent_memory_observation (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_user(id),
  market_code text,
  company_id text,
  kind text not null check(kind in('preference','experience','business-fact','method')),
  content text not null check(length(trim(content)) > 0),
  source_receipt jsonb not null,
  recorded_at timestamptz not null default now(),
  valid_from timestamptz,
  valid_until timestamptz,
  confidence numeric(4,3) check(confidence between 0 and 1),
  visibility text not null default 'private' check(visibility in('private','internal')),
  corrects_id uuid references agent_memory_observation(id),
  invalidates_id uuid references agent_memory_observation(id),
  check(valid_until is null or valid_from is null or valid_until > valid_from)
);
create index if not exists agent_memory_observation_time_idx on agent_memory_observation(owner_id,recorded_at desc,valid_from,valid_until);
create table if not exists agent_memory_graph_outbox (
  observation_id uuid primary key references agent_memory_observation(id),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempt_count integer not null default 0,
  last_error text
);

grant select,insert,update on knowledge_tree_version,knowledge_tree_node to network_copilot_app;
grant select,update(current_tree_version_id) on knowledge_document to network_copilot_app;
grant select,insert on agent_memory_observation,agent_memory_graph_outbox to network_copilot_app;
grant update(delivered_at,attempt_count,last_error) on agent_memory_graph_outbox to network_copilot_app;
alter table knowledge_tree_version enable row level security;
alter table knowledge_tree_version force row level security;
drop policy if exists knowledge_tree_version_read on knowledge_tree_version;
create policy knowledge_tree_version_read on knowledge_tree_version for select using(exists(
  select 1 from knowledge_document d where d.id=document_id and (d.owner_id=app_current_user_id() or d.visibility='shared')));
drop policy if exists knowledge_tree_version_write on knowledge_tree_version;
create policy knowledge_tree_version_write on knowledge_tree_version for all using(app_current_user_role()='admin') with check(app_current_user_role()='admin');
alter table knowledge_tree_node enable row level security;
alter table knowledge_tree_node force row level security;
drop policy if exists knowledge_tree_node_read on knowledge_tree_node;
create policy knowledge_tree_node_read on knowledge_tree_node for select using(exists(
  select 1 from knowledge_tree_version v where v.id=version_id));
drop policy if exists knowledge_tree_node_write on knowledge_tree_node;
create policy knowledge_tree_node_write on knowledge_tree_node for all using(app_current_user_role()='admin') with check(app_current_user_role()='admin');
alter table agent_memory_observation enable row level security;
alter table agent_memory_observation force row level security;
drop policy if exists agent_memory_observation_read on agent_memory_observation;
create policy agent_memory_observation_read on agent_memory_observation for select using(owner_id=app_current_user_id());
drop policy if exists agent_memory_observation_insert on agent_memory_observation;
create policy agent_memory_observation_insert on agent_memory_observation for insert with check(owner_id=app_current_user_id());
alter table agent_memory_graph_outbox enable row level security;
alter table agent_memory_graph_outbox force row level security;
drop policy if exists agent_memory_graph_outbox_owner on agent_memory_graph_outbox;
create policy agent_memory_graph_outbox_owner on agent_memory_graph_outbox for all using(exists(
  select 1 from agent_memory_observation m where m.id=observation_id and m.owner_id=app_current_user_id()))
  with check(exists(select 1 from agent_memory_observation m where m.id=observation_id and m.owner_id=app_current_user_id()));

create or replace function reject_memory_observation_mutation() returns trigger language plpgsql as $$
begin raise exception 'memory observations are immutable'; end $$;
drop trigger if exists agent_memory_observation_immutable on agent_memory_observation;
create trigger agent_memory_observation_immutable before update or delete on agent_memory_observation
  for each row execute function reject_memory_observation_mutation();
