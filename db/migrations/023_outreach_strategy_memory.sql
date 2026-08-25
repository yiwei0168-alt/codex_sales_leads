create table if not exists outreach_knowledge_item (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references app_user(id) on delete cascade,
  visibility text not null check (visibility in ('shared', 'private')),
  kind text not null check (kind in ('company-profile', 'distribution-policy', 'market-proof', 'feedback-memory')),
  external_id text not null,
  title text not null,
  content text not null,
  market_codes text[] not null default '{}',
  channel_roles text[] not null default '{}',
  priority_weight real not null default 1 check (priority_weight between 0.1 and 5),
  source_refs jsonb not null default '{}',
  embedding vector(1536),
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))) stored,
  approval_status text not null default 'active' check (approval_status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility='shared' and owner_id is null) or (visibility='private' and owner_id is not null))
);
create unique index if not exists outreach_knowledge_external_idx
  on outreach_knowledge_item(coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), external_id);
create index if not exists outreach_knowledge_search_idx on outreach_knowledge_item using gin(search_vector);
create index if not exists outreach_knowledge_market_idx on outreach_knowledge_item using gin(market_codes);
create index if not exists outreach_knowledge_embedding_idx on outreach_knowledge_item using hnsw (embedding vector_cosine_ops);

alter table outreach_draft add column if not exists revision integer not null default 1;
alter table outreach_draft add column if not exists generation_metrics jsonb not null default '{}';

create table if not exists outreach_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  draft_id uuid not null references outreach_draft(id) on delete cascade,
  feedback text not null,
  source_revision integer not null default 1,
  memory_allowed boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted', 'applied', 'failed')),
  previous_body text not null,
  revised_body text,
  memory_valuable boolean,
  memory_summary text,
  memory_reason text,
  memory_id uuid references outreach_knowledge_item(id) on delete set null,
  model text,
  generation_metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
alter table outreach_feedback add column if not exists source_revision integer not null default 1;
alter table outreach_feedback add column if not exists memory_allowed boolean not null default false;
alter table outreach_feedback add column if not exists generation_metrics jsonb not null default '{}';
create index if not exists outreach_feedback_draft_time_idx on outreach_feedback(user_id, draft_id, created_at desc);

update outreach_template set approval_status='archived', updated_at=now()
 where source_ref in ('shared-channel-introduction-v1', 'shared-solution-partner-v1');

insert into outreach_template (
  owner_id, visibility, source, source_ref, title, language, channel_roles, target_titles,
  subject_pattern, body, style_profile
) values
  (null, 'shared', 'team-library', 'sanitized-benelux-b2b-reseller-v1', 'Benelux B2B IT reseller — consultative long form', 'en',
   array['Reseller','VAR','Retailer','E-tailer'], array['Commercial Director','Category Manager','Vendor Manager'],
   'Potential partnership between {{company_name}} and Cudy',
   E'Dear {{first_name}},\n\nI hope you are doing well.\n\nMy name is {{sender_name}}, Sales Manager at Cudy Technology, responsible for the {{market_name}} market. I am reaching out to explore a potential partnership opportunity between {{company_name}} and Cudy.\n\nCudy is a fast-growing networking brand focused on consumer and SMB networking. I was impressed by {{company_name}}''s ability to provide business customers with a complete IT hardware service. I believe Cudy could complement that portfolio with cost-efficient networking and connectivity solutions.\n\nWhy Cudy could be a good fit:\n\n• A natural extension of the existing B2B IT portfolio — customers purchasing computers and workplace hardware also need reliable connectivity.\n• Cost-efficient networking for SMB customers, helping partners address price-sensitive projects while protecting attractive margins.\n• A complete networking range that lets partners build practical solutions for offices and other business environments.\n• Direct support from Cudy headquarters, including technical support, product training and marketing assistance.\n• European fulfillment options designed to support shorter lead times and flexible supply.\n• Growing recognition in the local market, supported by relevant approved market proof.\n\nI believe Cudy could be a valuable addition to {{company_name}}''s B2B portfolio. I would appreciate the opportunity to briefly introduce Cudy and discuss whether there could be potential cooperation between our companies.\n\nWould you be available for a short call in the coming weeks?\n\nBest regards,\n{{sender_name}}',
   '{"tone":"consultative, detailed and commercially grounded","structure":"intro, company fit, six benefit bullets, conclusion, low-pressure CTA","targetWords":285,"source":"user-provided sanitized template"}'::jsonb),
  (null, 'shared', 'team-library', 'sanitized-benelux-distributor-v1', 'Benelux ICT distributor — portfolio adjacency', 'en',
   array['Distributor','VAD'], array['Commercial Director','Business Development Director','Vendor Manager'],
   'Exploring a Cudy distribution opportunity with {{company_name}}',
   E'Dear {{first_name}},\n\nI hope this email finds you well.\n\nMy name is {{sender_name}}, Sales Manager at Cudy Technology, responsible for {{market_name}}. I am reaching out to explore a potential partnership opportunity between {{company_name}} and Cudy.\n\nI understand that {{company_name}} has built a strong position as an ICT distributor with a broad portfolio and an established reseller network. We believe Cudy could complement the existing offer with cost-efficient and easy-to-deploy networking solutions for SMB customers and resellers.\n\nWhy cooperate with Cudy?\n\n• Complementary networking portfolio for SMB resellers, creating a more complete connectivity offer alongside adjacent ICT categories.\n• Strong opportunity in mobile connectivity for backup links, temporary offices, remote locations and sites without fixed broadband.\n• Competitive positioning with attractive and stable partner economics for price-sensitive SMB projects.\n• Direct support from Cudy headquarters, including technical support, training and marketing assistance.\n• Flexible European supply options to support faster delivery.\n• A fast-growing brand with increasing recognition, supported by market-specific proof where available.\n\nI believe there could be a good opportunity to combine {{company_name}}''s reseller reach with Cudy''s networking portfolio. I would appreciate the opportunity to introduce Cudy and discuss possible cooperation.\n\nWould you be available for a short call in the coming weeks?\n\nBest regards,\n{{sender_name}}',
   '{"tone":"professional, explanatory and benefit-led","structure":"intro, distributor observation, six benefit bullets, partnership close","targetWords":270,"source":"user-provided sanitized template"}'::jsonb),
  (null, 'shared', 'team-library', 'sanitized-eu-retail-distributor-v1', 'EU retail distributor — market expansion narrative', 'en',
   array['Distributor','Retailer','Dealer'], array['Retail Director','Commercial Director','Business Development Director'],
   'Growing Cudy together in {{market_name}}',
   E'Hello {{first_name}},\n\nI hope this email finds you well. My name is {{sender_name}}, Sales Manager at Cudy Technology responsible for {{market_name}}. Cudy is a professional consumer and SMB networking manufacturer.\n\nOver the past few years Cudy has developed rapidly, with a broader portfolio, growing European business, local fulfillment capability and a larger sales and technical team supporting partners. We position Cudy as a high-value alternative to established networking brands, offering competitive pricing, healthy partner margins and a long-term commitment to mutual growth.\n\nI learned that {{company_name}} has strong access to retail channels and valuable experience developing brands in that segment. Cudy has also built retail experience across Europe, supported by approved market references. In {{market_name}}, however, we see room to build a stronger presence in leading retail channels and intend to invest in that opportunity.\n\nYour retail reach and local market knowledge could combine well with Cudy''s portfolio, channel economics and headquarters support. It would be great to connect, compare priorities and explore whether we could grow the market together.\n\nI look forward to your reply.\n\nBest regards,\n{{sender_name}}',
   '{"tone":"direct, relationship-oriented and ambitious","structure":"personal intro, growth update, partner-specific market gap, strategic close","targetWords":215,"source":"user-provided sanitized template"}'::jsonb),
  (null, 'shared', 'team-library', 'sanitized-uk-distributor-v1', 'UK distributor — concise reason-to-believe', 'en',
   array['Distributor','VAD'], array['Buyer','Commercial Director','Vendor Manager'],
   'Strategic Cudy distribution opportunity in {{market_name}}',
   E'Hello {{first_name}},\n\nMy name is {{sender_name}}, Sales Manager at Cudy Technology responsible for {{market_name}}. We are a fast-growing networking brand focused on consumer and SMB products. Cudy is positioned as a value-for-money, high-quality and reliable alternative to established brands, and we are looking for a strategic distribution partner to grow with us.\n\nWhy cooperate with Cudy:\n\n• Broad portfolio: networking solutions across consumer, SMB, industrial and outdoor use cases, plus selected PC peripherals.\n• Stable pricing structure: sufficient and predictable margin for our partners.\n• Tested market acceptance: strong approved local-market proof and customer recognition.\n• Strategic growth potential: expanding European business and a clear commitment to share growth with partners.\n• VIP support: direct access to product, engineering and marketing teams at Cudy headquarters.\n\nI would like to explore this opportunity with {{company_name}}. Please let me know if this is of interest to you.\n\nBest regards,\n{{sender_name}}',
   '{"tone":"concise, confident and commercial","structure":"intro, five reason-to-believe bullets, direct CTA","targetWords":180,"source":"user-provided sanitized template"}'::jsonb)
on conflict do nothing;

insert into outreach_knowledge_item (
  owner_id, visibility, kind, external_id, title, content, market_codes, channel_roles, priority_weight, source_refs
) values
  (null, 'shared', 'market-proof', 'market-proof:nl-mediamarkt-v1', 'Netherlands retail brand proof',
   'Cudy has entered MediaMarkt in the Netherlands. For Dutch retail and channel outreach, this can be used as local brand recognition and offline retail validation when relevant to the target company.',
   array['NL','BENELUX'], array['Distributor','Retailer','Reseller','VAR','VAD'], 2.8,
   '{"provenance":"user-confirmed","confirmedAt":"2026-08-24","usage":"market-specific outreach proof"}'::jsonb),
  (null, 'shared', 'market-proof', 'market-proof:uk-amazon-v1', 'United Kingdom online market proof',
   'Cudy has strong sales performance and high customer ratings on Amazon UK. For UK channel outreach, this can be used as evidence of local consumer demand and market acceptance without inventing precise sales, rank or review figures.',
   array['GB','UK'], array['Distributor','Retailer','Reseller','E-tailer','VAD'], 2.8,
   '{"provenance":"user-confirmed","confirmedAt":"2026-08-24","usage":"market-specific outreach proof"}'::jsonb)
on conflict do nothing;

alter table outreach_knowledge_item enable row level security;
alter table outreach_knowledge_item force row level security;
drop policy if exists outreach_knowledge_read on outreach_knowledge_item;
create policy outreach_knowledge_read on outreach_knowledge_item for select
  using (visibility='shared' or owner_id=app_current_user_id());
drop policy if exists outreach_knowledge_private_write on outreach_knowledge_item;
create policy outreach_knowledge_private_write on outreach_knowledge_item for all
  using ((owner_id=app_current_user_id() and visibility='private')
    or (visibility='shared' and app_current_user_role()='admin'))
  with check ((owner_id=app_current_user_id() and visibility='private')
    or (visibility='shared' and app_current_user_role()='admin'));

alter table outreach_feedback enable row level security;
alter table outreach_feedback force row level security;
drop policy if exists outreach_feedback_tenant on outreach_feedback;
create policy outreach_feedback_tenant on outreach_feedback
  using (user_id=app_current_user_id()) with check (user_id=app_current_user_id());

grant select, insert, update, delete on outreach_knowledge_item, outreach_feedback to network_copilot_app;
