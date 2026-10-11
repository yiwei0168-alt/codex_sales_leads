create table if not exists knowledge_upload_review_completion (
 id uuid primary key, owner_id uuid not null, job_id uuid not null unique,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 original_artifact_key text not null, original_artifact_sha256 text not null check(original_artifact_sha256 ~ '^[a-f0-9]{64}$'),
 reviewed_artifact_key text not null, reviewed_artifact_sha256 text not null check(reviewed_artifact_sha256 ~ '^[a-f0-9]{64}$'),
 extractor_version text not null, created_at timestamptz not null default now(),
 foreign key(owner_id,job_id) references knowledge_upload_job(user_id,id)
);
alter table knowledge_upload_review_completion enable row level security;
alter table knowledge_upload_review_completion force row level security;
create policy owned_read on knowledge_upload_review_completion for select using(owner_id=app_current_user_id());
create policy owned_insert on knowledge_upload_review_completion for insert with check(owner_id=app_current_user_id());
revoke all on knowledge_upload_review_completion from network_copilot_app;
grant select,insert on knowledge_upload_review_completion to network_copilot_app;
