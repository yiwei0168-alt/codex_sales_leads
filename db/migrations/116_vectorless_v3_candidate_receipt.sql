alter table knowledge_retrieval_session add column if not exists fallback_used boolean not null default false;
grant update(fallback_used) on knowledge_retrieval_session to network_copilot_app;

alter table knowledge_retrieval_step drop constraint if exists knowledge_retrieval_step_operation_check;
alter table knowledge_retrieval_step add constraint knowledge_retrieval_step_operation_check
  check(operation in('search','browse','read','filter','aggregate','budget-exceeded','v3-candidate'));
