create unique index if not exists knowledge_upload_job_owner_id_idx on knowledge_upload_job(user_id,id);
create table if not exists knowledge_upload_extraction_review (
 owner_id uuid not null, job_id uuid not null,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
 extractor_version text not null, block_id text not null,
 revision integer not null check(revision>0),
 decision text not null check(decision in('evidence','decoration','unresolved')),
 evidence_text text not null check(length(evidence_text)<=20000),
 note text not null check(length(note) between 1 and 2000),
 source_location jsonb not null,
 reviewer_id uuid not null references app_user(id),
 created_at timestamptz not null default now(),
 primary key(job_id,artifact_sha256,block_id,revision),
 foreign key(owner_id,job_id) references knowledge_upload_job(user_id,id),
 check(reviewer_id=owner_id),
 check((decision='evidence' and length(trim(evidence_text))>0) or (decision<>'evidence' and evidence_text=''))
);
alter table knowledge_upload_extraction_review enable row level security;
alter table knowledge_upload_extraction_review force row level security;
create policy owned_read on knowledge_upload_extraction_review for select using(owner_id=app_current_user_id());
create policy owned_insert on knowledge_upload_extraction_review for insert with check(owner_id=app_current_user_id() and reviewer_id=app_current_user_id());
revoke all on knowledge_upload_extraction_review from network_copilot_app;
grant select,insert on knowledge_upload_extraction_review to network_copilot_app;
