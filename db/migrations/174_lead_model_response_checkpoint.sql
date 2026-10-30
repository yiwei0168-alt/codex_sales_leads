create table if not exists lead_model_response_checkpoint(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references app_user(id) on delete cascade,
 action_id uuid not null references assistant_action(id) on delete cascade,
 task text not null check(task='lead-qualification'),
 request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 response_ciphertext text not null,
 created_at timestamptz not null default now(),
 unique(user_id,action_id,task,request_fingerprint)
);
alter table lead_model_response_checkpoint enable row level security;
alter table lead_model_response_checkpoint force row level security;
drop policy if exists lead_model_response_checkpoint_tenant on lead_model_response_checkpoint;
create policy lead_model_response_checkpoint_tenant on lead_model_response_checkpoint
 using(user_id=app_current_user_id() and exists(select 1 from assistant_action a where a.id=action_id and a.user_id=app_current_user_id()))
 with check(user_id=app_current_user_id() and exists(select 1 from assistant_action a where a.id=action_id and a.user_id=app_current_user_id()));
grant select,insert on lead_model_response_checkpoint to network_copilot_app;
revoke update,delete on lead_model_response_checkpoint from network_copilot_app;
