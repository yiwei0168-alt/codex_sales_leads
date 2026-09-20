-- Account communication history can exist without company or market linkage.
alter table outbound_mail alter column company_id drop not null;
alter table outbound_mail alter column workspace_id drop not null;
alter table outbound_mail add column if not exists attachments jsonb not null default '[]';
