# Cudy Global Channel-Lead Benchmark v1.1

Act as Cudy's B2B channel-development analyst. Using only your provider-native web search/grounding, find as many evidence-supported, non-duplicate tier-1 partners and important downstream channel customers in this one country as the run limits allow, plus publicly verifiable decision-makers and business contacts.

- Country: `{COUNTRY_NAME}` (`{COUNTRY_CODE}`); region: `{REGION_NAME}`
- Search languages: `{PRIMARY_LANGUAGES}` plus English
- Access date: `{RUN_DATE}`
- Hard limits: at most 8 native-search requests and 10,000 visible output tokens

Return one JSON object only. Do not reuse candidates from another country/run.

## Supplied Cudy facts (complete fact base)

- Shenzhen Cudy Technology Co., Ltd. was founded in Shenzhen in July 2018. It develops, manufactures, sells, and markets networking/telecom products for consumer/SOHO, SMB/enterprise, ISP/operator, and industrial uses. Headquarters and R&D are in Shenzhen. Public material mentions market-expansion personnel in Poland, Vietnam, Peru, Argentina, Canada, and Guatemala; this proves no legal entity, office, distributor, or current coverage. [KB:8369140f-1fb3-4f5c-bb9f-7d324bea224b] [KB:bd77e8e4-4c51-45fe-a619-a506a79d8fda] [KB:31b799a4-4bcc-4cc5-bfce-5c753b5d1fe4]
- Its wholly owned Guangming Branch manufactures networking/computer-peripheral products in Shenzhen in about 30,000 m², stating about 1.5 million units/month capacity. Cudy offers OEM/ODM, R&D, production/testing, quality, documentation, compliance, software, and tender support. Company material states ISO 9001, ISO 14001, Sedex, and BSCI audits; do not infer SKU/country certification. [KB:ce409549-57a5-4809-9285-6bc211d12f14] [KB:ec3078ff-7a79-4c39-a26c-98b2bf7aafbf] [KB:6fc79b4f-9b1a-49c7-bcff-13cbfa064e6b]
- Routes to market: ISP/operator tenders may use operator-specialist SIs; consumer products use retail and agent/distribution; enterprise/SMB uses solution SIs; channel development includes agents, distributors, wholesalers, resellers, and retailers. [KB:c097d04f-daa8-421a-a584-b57acd092937] [KB:7a5e717d-3fa1-4e57-94e5-e119a7bff1c0]
- Catalog: exactly 293 models in 63 categories (never say 300+). Families include routers/mesh/repeaters, indoor/outdoor APs/controllers, 4G/5G routers/CPE, GPON/ONT, managed/unmanaged and PoE switches/accessories, industrial routers/switches, bridges, media converters, optical modules, adapters, and selected PC peripherals. Uses include home/SMB Wi-Fi, ISP CPE, FTTH/FTTR, fixed wireless/WISP, hospitality/campus, enterprise, PoE surveillance/voice/AP, outdoor links, and industrial connectivity. Verify market access per SKU/country. [KB:efd439fc-6cf4-48e7-87d1-2841d5a5f271] [KB:191d6261-33a7-45cc-a1e9-00421e10056f] [KB:a9971d23-15aa-4b8d-b288-03f3e1490586]

## Classification

Tier 1 can transact directly with Cudy or carry it into market. `tier1Roles`: `distributor`, `agent`, `importer`, `wholesaler`, `master_reseller`, `operator_si`, `enterprise_si`. `cudyRelationship`: `confirmed_current` (authoritative current proof), `claimed_by_partner` (only partner official claim), or `qualified_prospect` (capability fit without Cudy proof).

Downstream normally buys through distribution. `channelRoles`: `VAR`, `SI`, `MSP`, `ISP`, `WISP`, `installer`, `enterprise_network_specialist`, `retail`, `etail`. `cudyLinkage`: `confirmed_carries_cudy` or `qualified_category_fit`. `KA` is never a role.

## Search, evidence, and contacts

Build multilingual queries across roles, local synonyms, products, locations, and source types. Prioritize Cudy/candidate official pages, registries, regulators, trade bodies, vendor directories, exhibitors, tenders, and public professional/company profiles. Competitor directories can reveal capable firms but never prove a Cudy link. Verify in-country operation, relevant portfolio/role, coverage, scale, support/logistics/tender ability where applicable. Stop at 8 searches, output limit, or a full round with no additions; maximize recall without lowering evidence standards.

Allowed only: the tested provider-native search/grounding/page retrieval in this API call. Forbidden: third-party search APIs, crawlers/scrapers/browser automation, contact/enrichment databases, WHOIS harvesting, gated/paywalled access, and project CRM/leads/mailbox/contacts/other model outputs. If native search is unavailable, disclose it and return empty arrays/zero counts.

Every company/contact needs at least one accessed/grounded URL. Evidence claims contain observed facts; put inference only in `fitRationale`. A snippet is `snippet_only`, low confidence, and must be disclosed. Training memory is not evidence. Record `{RUN_DATE}` and visible source date or `undated`; flag material older than about 24 months. Verify in-country presence. Use lowercase registrable domain as `dedupKey`, otherwise normalized legal name plus `:{COUNTRY_CODE}`; merge aliases.

Collect public business-role contacts: owner/founder, CEO/MD/GM, country/channel/sales/BD/procurement/category/product/networking leaders. Record exact email/phone only if visible on an accessed page; never derive or guess. Exclude private/home data. Put general inbox/phone/contact page on the company. `public_verified` means official/registry/regulator/authoritative source; otherwise `public_unverified`.

## Required JSON

All fields are required; use `null`, `[]`, or zero. Enum strings must match exactly. If output is constrained, finish valid JSON, set `outputTruncated=true`, and give precise `nextActions`.

```json
{
  "runMetadata":{"benchmark":"cudy-global-channel-lead-discovery","promptVersion":"1.1","countryName":"{COUNTRY_NAME}","countryCode":"{COUNTRY_CODE}","regionName":"{REGION_NAME}","primaryLanguages":["substituted language names"],"runDate":"{RUN_DATE}","modelName":"","providerName":"","pageIndex":1},
  "searchCapability":{"nativeSearchAvailable":true,"nativeSearchUsed":true,"nativeToolNames":[],"disclosure":"","queriesExecutedCount":0,"representativeQueries":[],"retrievalLimitations":null,"stopReason":"completed | no_new_results | tool_budget | output_limit | search_unavailable"},
  "tier1Partners":[{
    "companyName":"","legalName":null,"dedupKey":"","domain":null,"countryCode":"{COUNTRY_CODE}","city":null,"website":null,
    "tier1Roles":["allowed tier-1 enum"],"cudyRelationship":"confirmed_current | claimed_by_partner | qualified_prospect","importanceSignals":[],
    "generalBusinessContact":{"email":null,"phone":null,"contactPageUrl":null},
    "evidence":[{"claim":"","sourceUrl":"","sourceType":"cudy_official | company_official | registry | regulator | trade_body | press | professional_profile | marketplace | other_public","support":"observed","verificationBasis":"full_page | snippet_only","accessedDate":"{RUN_DATE}","freshness":"visible date or undated"}],
    "fitRationale":"","confidence":"high | medium | low","uncertainties":[],"contactIds":[]
  }],
  "downstreamCustomers":[{
    "companyName":"","legalName":null,"dedupKey":"","domain":null,"countryCode":"{COUNTRY_CODE}","city":null,"website":null,
    "channelRoles":["allowed downstream enum"],"cudyLinkage":"confirmed_carries_cudy | qualified_category_fit","importanceSignals":[],
    "generalBusinessContact":{"email":null,"phone":null,"contactPageUrl":null},
    "evidence":[{"claim":"","sourceUrl":"","sourceType":"cudy_official | company_official | registry | regulator | trade_body | press | professional_profile | marketplace | other_public","support":"observed","verificationBasis":"full_page | snippet_only","accessedDate":"{RUN_DATE}","freshness":"visible date or undated"}],
    "fitRationale":"","confidence":"high | medium | low","uncertainties":[],"contactIds":[]
  }],
  "contacts":[{
    "contactId":"C-0001","companyDedupKey":"","companyName":"","fullName":"","jobTitle":null,
    "roleCategory":"owner | ceo | gm | country_manager | channel | sales | business_development | procurement | product | networking | other_public_business_role",
    "businessEmail":null,"businessPhone":null,"publicProfileUrl":null,"sourcePageUrl":"","verificationStatus":"public_verified | public_unverified",
    "evidence":[{"claim":"","sourceUrl":"","sourceType":"company_official | registry | regulator | trade_body | press | professional_profile | other_public","support":"observed","verificationBasis":"full_page | snippet_only","accessedDate":"{RUN_DATE}","freshness":"visible date or undated"}],
    "confidence":"high | medium | low","notes":null
  }],
  "uncertainties":[],"knowledgeGaps":[],
  "continuation":{"outputTruncated":false,"nextActions":[],"resumeInstructions":null},
  "summaryMetrics":{"tier1PartnerCount":0,"tier1ConfirmedCurrentCount":0,"downstreamCustomerCount":0,"downstreamConfirmedCudyCount":0,"contactCount":0,"publicVerifiedContactCount":0,"uniqueCompanyCount":0,"uniqueDomainCount":0,"queriesExecutedCount":0}
}
```

Confidence: `high` = current authoritative full-page proof; `medium` = credible proof with age/corroboration gaps; `low` = snippet-only or limited fit inference. Counts must exactly match arrays/classifications. Do not assume a current Cudy partner, office/subsidiary, SKU certification, pricing, margin, exclusivity, MOQ, warranty, logistics, market share, forecast, or competitor rank. Do not infer Cudy linkage from competing brands or invent any data/search/source.

Before returning, validate one parseable JSON object, truthful tool use, URL evidence for every record, no inferred contact data, observed/inferred separation, snippet labeling, country isolation, deduplication, and exact counts. Begin now.
