-- Same installed PostgresSaver wire/storage protocol, isolated from ordinary
-- task checkpoints. Runtime setup/DDL is deliberately not granted to collectors.
create schema if not exists skill_candidate_graph;
revoke all on schema skill_candidate_graph from public,network_copilot_app,network_copilot_skill_collector;
grant usage on schema skill_candidate_graph to network_copilot_skill_collector;

create table if not exists skill_candidate_graph.checkpoints (
 thread_id text not null,checkpoint_ns text not null default '',checkpoint_id text not null,
 parent_checkpoint_id text,type text,checkpoint jsonb not null,metadata jsonb not null default '{}',
 primary key(thread_id,checkpoint_ns,checkpoint_id)
);
create table if not exists skill_candidate_graph.checkpoint_blobs (
 thread_id text not null,checkpoint_ns text not null default '',channel text not null,version text not null,
 type text not null,blob bytea,primary key(thread_id,checkpoint_ns,channel,version)
);
create table if not exists skill_candidate_graph.checkpoint_writes (
 thread_id text not null,checkpoint_ns text not null default '',checkpoint_id text not null,task_id text not null,
 idx integer not null,channel text not null,type text,blob bytea not null,
 primary key(thread_id,checkpoint_ns,checkpoint_id,task_id,idx)
);

do $$
declare table_name text;
begin
 foreach table_name in array array['checkpoints','checkpoint_blobs','checkpoint_writes'] loop
  execute format('alter table skill_candidate_graph.%I enable row level security',table_name);
  execute format('alter table skill_candidate_graph.%I force row level security',table_name);
  execute format('drop policy if exists collector_owned on skill_candidate_graph.%I',table_name);
  execute format('create policy collector_owned on skill_candidate_graph.%I for all to network_copilot_skill_collector
   using(split_part(thread_id,'':'',1)=''skill-candidate'' and split_part(thread_id,'':'',2)=app_current_user_id()::text)
   with check(split_part(thread_id,'':'',1)=''skill-candidate'' and split_part(thread_id,'':'',2)=app_current_user_id()::text)',table_name);
  execute format('revoke all on skill_candidate_graph.%I from public,network_copilot_app,network_copilot_skill_collector',table_name);
  execute format('grant select,insert,update,delete on skill_candidate_graph.%I to network_copilot_skill_collector',table_name);
 end loop;
end $$;
