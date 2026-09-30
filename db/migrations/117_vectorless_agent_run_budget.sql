alter table knowledge_retrieval_session add column if not exists agent_run_id uuid;
create unique index if not exists knowledge_retrieval_session_agent_run_once
  on knowledge_retrieval_session(owner_id,agent_run_id) where agent_run_id is not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='knowledge_retrieval_session_agent_run_owner_fk') then
    alter table knowledge_retrieval_session add constraint knowledge_retrieval_session_agent_run_owner_fk
      foreign key(owner_id,agent_run_id) references agent_run(user_id,id);
  end if;
end $$;
