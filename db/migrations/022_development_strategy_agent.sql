create table if not exists outreach_template (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references app_user(id) on delete cascade,
  visibility text not null check (visibility in ('shared', 'private')),
  source text not null check (source in ('team-library', 'mailbox-approved', 'user-created')),
  source_ref text,
  title text not null,
  language text not null default 'en',
  channel_roles text[] not null default '{}',
  target_titles text[] not null default '{}',
  subject_pattern text not null default '',
  body text not null,
  style_profile jsonb not null default '{}',
  approval_status text not null default 'active' check (approval_status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'shared' and owner_id is null) or (visibility = 'private' and owner_id is not null))
);
create unique index if not exists outreach_template_source_ref_idx
  on outreach_template(coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), source, source_ref)
  where source_ref is not null;
create index if not exists outreach_template_retrieval_idx on outreach_template(visibility, language, approval_status);

insert into outreach_template (
  owner_id, visibility, source, source_ref, title, language, channel_roles, target_titles,
  subject_pattern, body, style_profile
) values
  (null, 'shared', 'team-library', 'shared-channel-introduction-v1', 'Concise channel introduction', 'en',
   array['Distributor','VAD','VAR','Dealer','Reseller','Retailer','E-tailer'],
   array['Commercial Director','Category Manager','Vendor Manager'],
   'Exploring a networking portfolio fit with {{company_name}}',
   E'Hi {{first_name}},\n\nI noticed {{company_name}} serves customers looking for practical networking solutions. I would like to explore whether a focused Cudy portfolio could complement your current offer.\n\nIf relevant, could we schedule a short call to compare customer segments and the products most likely to fit?\n\nBest,\n{{sales_owner}}',
   '{"tone":"concise, consultative and respectful","paragraphs":3,"targetWords":80,"cta":"short discovery call"}'::jsonb),
  (null, 'shared', 'team-library', 'shared-solution-partner-v1', 'Solution partner outreach', 'en',
   array['SI','Installer','MSP','ISP'], array['Solutions Director','Technical Director','Business Development Director'],
   'A possible Cudy solution fit for {{company_name}}',
   E'Hi {{first_name}},\n\nYour work around {{customer_or_solution_context}} suggests a possible fit with selected Cudy networking products. The initial opportunity may be to simplify deployment while keeping the commercial offer competitive.\n\nWould a brief working session be useful to validate the use case, technical requirements and route to market?\n\nBest,\n{{sales_owner}}',
   '{"tone":"technical-commercial and collaborative","paragraphs":3,"targetWords":85,"cta":"use-case working session"}'::jsonb)
on conflict do nothing;

create table if not exists outreach_draft (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  workspace_id uuid not null references market_workspace(id) on delete cascade,
  company_id uuid not null references sales_company(id) on delete cascade,
  contact_id uuid references company_contact(id) on delete set null,
  search_run_id uuid references lead_search_run(id) on delete set null,
  status text not null default 'generated' check (status in ('generated', 'approved', 'sent', 'cancelled')),
  language text not null default 'en',
  strategy jsonb not null,
  subject_options text[] not null default '{}',
  body text not null,
  manual_body text,
  evidence_ids text[] not null default '{}',
  knowledge_chunk_ids uuid[] not null default '{}',
  template_ids uuid[] not null default '{}',
  input_snapshot jsonb not null default '{}',
  model text not null,
  prompt_version text not null,
  warnings text[] not null default '{}',
  approved_at timestamptz,
  sent_at timestamptz,
  delivery_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outreach_draft_company_time_idx on outreach_draft(user_id, company_id, created_at desc);

alter table outreach_template enable row level security;
alter table outreach_template force row level security;
drop policy if exists outreach_template_read on outreach_template;
create policy outreach_template_read on outreach_template for select
  using (visibility = 'shared' or owner_id = app_current_user_id());
drop policy if exists outreach_template_private_write on outreach_template;
create policy outreach_template_private_write on outreach_template for all
  using (owner_id = app_current_user_id() and visibility = 'private')
  with check (owner_id = app_current_user_id() and visibility = 'private');

alter table outreach_draft enable row level security;
alter table outreach_draft force row level security;
drop policy if exists outreach_draft_tenant on outreach_draft;
create policy outreach_draft_tenant on outreach_draft
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

grant select, insert, update, delete on outreach_template, outreach_draft to network_copilot_app;
