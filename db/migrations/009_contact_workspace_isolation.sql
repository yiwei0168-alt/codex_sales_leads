alter table company_web_evidence add column if not exists workspace_id uuid references market_workspace(id) on delete cascade;
update company_web_evidence e
set workspace_id = r.workspace_id
from company_enrichment_run r
where e.run_id = r.id and e.workspace_id is null;
alter table company_web_evidence alter column workspace_id set not null;

alter table company_contact add column if not exists workspace_id uuid references market_workspace(id) on delete cascade;
do $$ begin
  if exists (
    select 1 from company_contact ct
    join workspace_company wc on wc.company_id = ct.company_id
    group by ct.id having count(*) > 1
  ) then
    raise exception 'Cannot assign legacy contacts: a company belongs to multiple workspaces';
  end if;
end $$;
update company_contact ct
set workspace_id = wc.workspace_id
from workspace_company wc
where wc.company_id = ct.company_id and ct.workspace_id is null;
alter table company_contact alter column workspace_id set not null;

alter table company_email_candidate add column if not exists workspace_id uuid references market_workspace(id) on delete cascade;
alter table company_email_candidate add column if not exists isolation_quarantined boolean not null default false;
update company_email_candidate em
set workspace_id = ct.workspace_id
from company_contact ct
where em.contact_id = ct.id and em.workspace_id is null;
do $$ begin
  if exists (
    select 1 from company_email_candidate em
    join workspace_company wc on wc.company_id = em.company_id
    where em.workspace_id is null
    group by em.id having count(*) > 1
  ) then
    raise exception 'Cannot assign legacy email candidates: a company belongs to multiple workspaces';
  end if;
end $$;
update company_email_candidate em
set workspace_id = wc.workspace_id
from workspace_company wc
where wc.company_id = em.company_id and em.workspace_id is null;
update company_email_candidate
set isolation_quarantined = true
where workspace_id is null;

do $$ begin
  alter table company_email_candidate add constraint company_email_candidate_workspace_or_quarantine_check
    check ((workspace_id is not null and not isolation_quarantined) or (workspace_id is null and isolation_quarantined));
exception when duplicate_object then null;
end $$;

alter table company_contact drop constraint if exists company_contact_company_id_full_name_source_url_key;
alter table company_email_candidate drop constraint if exists company_email_candidate_company_id_email_key;
create unique index if not exists company_contact_workspace_company_source_idx
  on company_contact(workspace_id, company_id, full_name, source_url);
create unique index if not exists company_email_workspace_company_email_idx
  on company_email_candidate(workspace_id, company_id, email);
create unique index if not exists company_contact_workspace_id_id_idx
  on company_contact(workspace_id, id);

alter table company_email_candidate drop constraint if exists company_email_candidate_contact_id_fkey;
do $$ begin
  alter table company_email_candidate add constraint company_email_workspace_contact_fkey
    foreign key (workspace_id, contact_id) references company_contact(workspace_id, id) on delete set null (contact_id);
exception when duplicate_object then null;
end $$;

create index if not exists company_contact_workspace_company_idx
  on company_contact(workspace_id, company_id, last_seen_at desc);
create index if not exists company_email_workspace_company_status_idx
  on company_email_candidate(workspace_id, company_id, status);
create index if not exists company_web_evidence_workspace_company_idx
  on company_web_evidence(workspace_id, company_id, captured_at desc);
