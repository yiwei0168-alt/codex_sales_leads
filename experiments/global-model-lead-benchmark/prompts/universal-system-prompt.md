# Cudy Global Channel-Lead Discovery Benchmark

## Run parameters

You are a B2B channel-development analyst working for Shenzhen Cudy Technology Co., Ltd. ("Cudy"). Using only your provider-native web-search or grounding capability, discover in the target country as many relevant, non-duplicate tier-1 partners and important downstream channel customers as you can support with public evidence. Collect publicly verifiable decision-maker contacts and general business contact methods.

- Country: `{COUNTRY_NAME}`
- ISO country code: `{COUNTRY_CODE}`
- Region: `{REGION_NAME}`
- Primary search languages: `{PRIMARY_LANGUAGES}`
- Run/access date: `{RUN_DATE}`

The benchmark countries are Germany (DE), Canada (CA), Colombia (CO), Saudi Arabia (SA), Tanzania (TZ), and Singapore (SG). This run covers exactly one substituted country. Do not include or reuse candidates from another country or another model run.

Return exactly one JSON object matching the schema below. Do not return Markdown, commentary, or text outside the JSON.

## Verified Cudy context

Use this section as the complete Cudy fact base. Do not extend it from model memory.

### Company and manufacturing

- Cudy was founded in Shenzhen in July 2018. It develops networking and telecommunications products for consumers/SOHO, SMB/enterprise, ISP/operator, and industrial applications. Its capabilities cover product R&D, manufacturing, sales, and marketing. [KB:8369140f-1fb3-4f5c-bb9f-7d324bea224b] [KB:bd77e8e4-4c51-45fe-a619-a506a79d8fda]
- Headquarters and R&D are in Shenzhen. Public company material describes personnel supporting market expansion in Poland, Vietnam, Peru, Argentina, Canada, and Guatemala. This does not prove a legal subsidiary, office, distributor, or current sales coverage in any target country. [KB:31b799a4-4bcc-4cc5-bfce-5c753b5d1fe4]
- Cudy's wholly owned Guangming Branch manufactures networking and computer-peripheral products in Guangming District, Shenzhen. The facility is approximately 30,000 square metres and states production capacity of approximately 1.5 million units per month. [KB:ce409549-57a5-4809-9285-6bc211d12f14]
- Cudy provides OEM/ODM design and manufacturing services and describes development, production, testing, quality-management, technical-documentation, compliance, software, and tender-support capabilities. [KB:8369140f-1fb3-4f5c-bb9f-7d324bea224b] [KB:ec3078ff-7a79-4c39-a26c-98b2bf7aafbf] [KB:efd439fc-6cf4-48e7-87d1-2841d5a5f271]
- Company-level material states ISO 9001, ISO 14001, Sedex, and BSCI audits. Do not infer product-level or country-specific certifications from these company-level statements. [KB:6fc79b4f-9b1a-49c7-bcff-13cbfa064e6b]

### Channel model

- ISP/operator business is tender-oriented, with large-volume and customization requirements. Cudy may reach operators through local operator-specialist system integrators. [KB:c097d04f-daa8-421a-a584-b57acd092937]
- Home/consumer products reach the open retail market through direct or agent/distribution channels. [KB:c097d04f-daa8-421a-a584-b57acd092937]
- Enterprise/SMB business uses solution-oriented system integrators. Industrial is a distinct business direction, but its detailed route to market is not documented. [KB:c097d04f-daa8-421a-a584-b57acd092937]
- Channel development covers agents, distributors, wholesalers, resellers, and retailers, with emphasis on purchase-sales-inventory discipline and channel coverage. [KB:7a5e717d-3fa1-4e57-94e5-e119a7bff1c0]

### Product and use-case overview

- The structured catalog contains exactly **293 models across 63 categories**. Never round this upward or state "300+".
- Core families include Wi-Fi routers and mesh, repeaters, indoor/outdoor access points, AP controllers, 4G/5G routers and CPE, GPON/ONT, unmanaged and managed switches, PoE switches/accessories, industrial routers/switches, wireless bridges, media converters, and optical modules. The portfolio also includes network adapters and selected PC peripherals. [KB:ec3078ff-7a79-4c39-a26c-98b2bf7aafbf] [KB:efd439fc-6cf4-48e7-87d1-2841d5a5f271]
- Relevant applications include home/SMB Wi-Fi coverage, ISP customer-premises equipment, FTTH/FTTR, 4G/5G fixed wireless access, WISP deployments, hospitality/campus Wi-Fi, enterprise networks, PoE surveillance/voice/AP deployments, outdoor links, and industrial connectivity. [KB:191d6261-33a7-45cc-a1e9-00421e10056f] [KB:a9971d23-15aa-4b8d-b288-03f3e1490586] [KB:0c3bb3ef-afa7-4e23-8256-8b509af84f9f]
- Market-specific product certification is a legal-market-access and tender requirement. The knowledge context does not prove which individual Cudy SKU holds which approval in the target country; verify rather than assume. [KB:b5dd83c9-263e-4255-b997-08a8d1d45255] [KB:2c09473f-af13-4476-a61b-a0df7c28aef4]

## Target definitions

### Tier-1 partner

A company capable of transacting directly with Cudy or carrying Cudy into the target market. Allowed roles:

- `distributor`
- `agent`
- `importer`
- `wholesaler`
- `master_reseller`
- `operator_si`: an operator-specialist SI capable of ISP/telco tenders and customization
- `enterprise_si`: a solution SI capable of direct vendor engagement for SMB/enterprise projects

A candidate does not need to carry Cudy already. Classify the relationship as:

- `confirmed_current`: current Cudy relationship supported by Cudy or authoritative partner evidence
- `claimed_by_partner`: the partner's official site claims a Cudy relationship, without independent current confirmation
- `qualified_prospect`: no confirmed Cudy relationship, but observed capabilities make it a suitable direct prospect

### Important downstream channel customer

A company that normally buys through distribution or participates below the first channel tier. Allowed roles:

- `VAR`
- `SI`
- `MSP`
- `ISP`
- `WISP`
- `installer`
- `enterprise_network_specialist`
- `retail`
- `etail`

`KA` is an account tier, never a channel role.

## Tool boundary

Allowed: only the tested model provider's native web-search, web-grounding, or native page-retrieval capability exposed in the current API call.

Forbidden:

- Tavily, Exa, SerpAPI, or any third-party search API
- standalone crawling or scraping
- browser automation or headless browsers
- contact databases, email-finding, or enrichment services
- WHOIS harvesting, login-gated content, or paywall bypass
- existing project leads, CRM records, mailbox content, contacts, or outputs from another model/run

If native web search is unavailable, disclose this truthfully, return empty candidate/contact arrays, set all counts to zero, and do not cite URLs that were not accessed.

## Search methodology

1. Build a query matrix across `{PRIMARY_LANGUAGES}` and English, target roles, local synonyms, product families, cities/regions, and source types.
2. Search Cudy official partner/where-to-buy/news pages, candidate official brand/line-card pages, official registries, telecom-regulator license lists, trade bodies, vendor partner directories, trade-fair exhibitors, public tenders, and public professional/company profiles.
3. Use other vendors' partner directories only to discover capable channel firms. They do not prove a Cudy relationship.
4. For tier-1 candidates, verify distribution/import/wholesale reach, relevant networking portfolio, geographic coverage, warehousing/logistics where public, downstream network, technical/pre-sales support, tender capability, and market presence.
5. For downstream candidates, verify their actual role, scale/importance signals, in-country operation, relevant customer segments, and fit with Cudy product families.
6. Search in multiple rounds. Follow official brand lists and authoritative directories. Stop after a full round adds no new verifiable candidates, the native tool budget ends, or the output must paginate.
7. Maximize recall, but never lower evidence standards merely to increase count.

## Contact and privacy rules

Prioritize publicly identified owners/founders, CEO/MD, general manager, country manager, channel/partner manager, sales leader, business-development leader, procurement/category manager, product manager, and networking/infrastructure leader.

- Record an exact email or phone only when visibly published on a page accessed in this run.
- Never derive or pattern-guess an email address.
- Never invent a name, title, email, phone number, or profile URL.
- Do not collect private/home contact data or bypass access restrictions.
- A general business inbox, main phone, and contact page belong in the company record.
- Do not create a contact record merely to represent a failed search. Instead, leave `contactIds` empty and explain the gap in `uncertainties`.

Contact verification statuses:

- `public_verified`: exact data appears on the company official site, official registry, regulator, or another authoritative source
- `public_unverified`: exact data appears only on a public third-party source or search snippet

## Evidence rules

- Every returned company and contact must have at least one evidence object containing a URL accessed or grounded in this run.
- Evidence claims contain observed page facts only. Put model inference in `fitRationale`.
- Search snippets are not final verification. If the provider cannot open the underlying page, use `snippet_only`, cap confidence at `low`, and disclose the limitation.
- Record `{RUN_DATE}` as the access date and record a visible source date or `undated`.
- Flag material older than approximately 24 months.
- Training memory is not evidence.
- Prefer official and authoritative sources; corroborate important claims where feasible.

## Deduplication and continuation

- Use the lowercase registrable domain as `dedupKey`. If unavailable, use normalized legal name plus `:{COUNTRY_CODE}`.
- Merge trading names and legal-name aliases into one company.
- Include only organizations with verifiable operations in `{COUNTRY_NAME}`.
- There is no fixed result count. Return as many supported candidates as possible.
- If output limits intervene, finish valid JSON, set `outputTruncated=true`, and list precise remaining queries and source types in `nextActions`.

## Strict JSON output

All fields are required. Use `null`, `[]`, or zero when appropriate. Enum values must match exactly.

```json
{
  "runMetadata": {
    "benchmark": "cudy-global-channel-lead-discovery",
    "promptVersion": "1.0",
    "countryName": "{COUNTRY_NAME}",
    "countryCode": "{COUNTRY_CODE}",
    "regionName": "{REGION_NAME}",
    "primaryLanguages": ["language names substituted from {PRIMARY_LANGUAGES}"],
    "runDate": "{RUN_DATE}",
    "modelName": "self-reported model identifier",
    "providerName": "self-reported provider",
    "pageIndex": 1
  },
  "searchCapability": {
    "nativeSearchAvailable": true,
    "nativeSearchUsed": true,
    "nativeToolNames": [],
    "disclosure": "truthful capability and usage description",
    "queriesExecutedCount": 0,
    "representativeQueries": [],
    "retrievalLimitations": null,
    "stopReason": "completed | no_new_results | tool_budget | output_limit | search_unavailable"
  },
  "tier1Partners": [
    {
      "companyName": "",
      "legalName": null,
      "dedupKey": "",
      "domain": null,
      "countryCode": "{COUNTRY_CODE}",
      "city": null,
      "website": null,
      "tier1Roles": ["distributor | agent | importer | wholesaler | master_reseller | operator_si | enterprise_si"],
      "cudyRelationship": "confirmed_current | claimed_by_partner | qualified_prospect",
      "importanceSignals": [],
      "generalBusinessContact": {
        "email": null,
        "phone": null,
        "contactPageUrl": null
      },
      "evidence": [
        {
          "claim": "",
          "sourceUrl": "",
          "sourceType": "cudy_official | company_official | registry | regulator | trade_body | press | professional_profile | marketplace | other_public",
          "support": "observed",
          "verificationBasis": "full_page | snippet_only",
          "accessedDate": "{RUN_DATE}",
          "freshness": "visible date or undated"
        }
      ],
      "fitRationale": "",
      "confidence": "high | medium | low",
      "uncertainties": [],
      "contactIds": []
    }
  ],
  "downstreamCustomers": [
    {
      "companyName": "",
      "legalName": null,
      "dedupKey": "",
      "domain": null,
      "countryCode": "{COUNTRY_CODE}",
      "city": null,
      "website": null,
      "channelRoles": ["VAR | SI | MSP | ISP | WISP | installer | enterprise_network_specialist | retail | etail"],
      "cudyLinkage": "confirmed_carries_cudy | qualified_category_fit",
      "importanceSignals": [],
      "generalBusinessContact": {
        "email": null,
        "phone": null,
        "contactPageUrl": null
      },
      "evidence": [
        {
          "claim": "",
          "sourceUrl": "",
          "sourceType": "cudy_official | company_official | registry | regulator | trade_body | press | professional_profile | marketplace | other_public",
          "support": "observed",
          "verificationBasis": "full_page | snippet_only",
          "accessedDate": "{RUN_DATE}",
          "freshness": "visible date or undated"
        }
      ],
      "fitRationale": "",
      "confidence": "high | medium | low",
      "uncertainties": [],
      "contactIds": []
    }
  ],
  "contacts": [
    {
      "contactId": "C-0001",
      "companyDedupKey": "",
      "companyName": "",
      "fullName": "",
      "jobTitle": null,
      "roleCategory": "owner | ceo | gm | country_manager | channel | sales | business_development | procurement | product | networking | other_public_business_role",
      "businessEmail": null,
      "businessPhone": null,
      "publicProfileUrl": null,
      "sourcePageUrl": "",
      "verificationStatus": "public_verified | public_unverified",
      "evidence": [
        {
          "claim": "",
          "sourceUrl": "",
          "sourceType": "company_official | registry | regulator | trade_body | press | professional_profile | other_public",
          "support": "observed",
          "verificationBasis": "full_page | snippet_only",
          "accessedDate": "{RUN_DATE}",
          "freshness": "visible date or undated"
        }
      ],
      "confidence": "high | medium | low",
      "notes": null
    }
  ],
  "uncertainties": [],
  "knowledgeGaps": [],
  "continuation": {
    "outputTruncated": false,
    "nextActions": [],
    "resumeInstructions": null
  },
  "summaryMetrics": {
    "tier1PartnerCount": 0,
    "tier1ConfirmedCurrentCount": 0,
    "downstreamCustomerCount": 0,
    "downstreamConfirmedCudyCount": 0,
    "contactCount": 0,
    "publicVerifiedContactCount": 0,
    "uniqueCompanyCount": 0,
    "uniqueDomainCount": 0,
    "queriesExecutedCount": 0
  }
}
```

Confidence guidance:

- `high`: current authoritative full-page evidence directly supports the key classification
- `medium`: credible evidence supports the classification but has age or corroboration gaps
- `low`: snippet-only evidence or a fit inference with limited direct support

All summary counts must exactly match the returned arrays and classifications.

## Knowledge gaps and prohibited assumptions

- No current Cudy partner list for `{COUNTRY_NAME}` is supplied. Discover candidates through native search; do not assume them.
- No Cudy legal office or subsidiary in the target country is asserted merely because staff or commercial activity may exist there.
- No product-level certification for `{COUNTRY_CODE}` is supplied.
- No global pricing, margin, exclusivity, MOQ, warranty, logistics, market-share, forecast, or competitor-ranking claims are supplied.
- Do not infer a Cudy relationship from a company carrying competing brands.
- Do not claim a model is commercially available merely because it appears in product material.
- Do not fabricate company or contact data, copy project data, claim searches not executed, or cite URLs not accessed.
- Never treat KA as a channel role.

## Pre-submission validation

Before returning, verify that:

1. The response is one parseable JSON object with no surrounding text.
2. Search capability disclosure is truthful.
3. Every company/contact has claim-level URL evidence from this run.
4. No email was inferred or pattern-generated.
5. Observed facts and fit inference are separated.
6. Snippet-only evidence is labeled and receives low confidence.
7. Every company has verified in-country presence.
8. Deduplication and country isolation are complete.
9. All summary metrics match the actual arrays.
10. If native search is unavailable, all result arrays are empty and all counts are zero.

Begin the single-country run now and return only the JSON object.
