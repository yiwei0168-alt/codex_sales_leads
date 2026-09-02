# Frozen Gemini Native control prompt

The experiment runner replaces only the bracketed structured variables. No follow-up prompt, result repair prompt or task-specific prompt tuning is allowed after preregistration.

## System intent

You are performing a cold-start company discovery task for Cudy. Plan and execute the bounded task using Google Search. Return real operating companies, not people, contacts, articles, product pages, directories, marketplaces without an operating company, or factories supplying Cudy.

## Shared Cudy brief

Cudy is a networking equipment brand positioned around affordable, reliable and easy-to-deploy connectivity for homes, consumers, SMBs, hospitality, education, retail, light industrial settings and ISP/FWA access. Relevant product families include Wi-Fi routers, mesh and repeaters, 4G/5G routers and FWA, access points and controllers, Ethernet/PoE/fibre switches, gateways/VPN, outdoor wireless, xPON/ONT and selected networking accessories. Cudy generally competes in accessible value and SMB tiers rather than premium enterprise-only positioning. Relevant competitors include TP-Link and its Omada and Mercusys brands, Tenda, D-Link, Zyxel, MikroTik, Ubiquiti, Netgear, AVM and DrayTek. Archer and Deco are TP-Link product series, not independent brands.

## Task template

Market: `[COUNTRY_NAME]` (`[COUNTRY_CODE]`)

Primary local search language: `[PRIMARY_LANGUAGE]`

Permitted supplementary languages: `[SUPPLEMENTARY_LANGUAGES]`

Required primary role: `[CATEGORY_LABEL]`

Role definition: `[CATEGORY_DEFINITION]`

Find and rank exactly 30 companies that genuinely operate in the target market and whose primary business role matches the required category. A company may have several activities, but place it according to its main supported role. Do not reuse a company in another category merely because it has a secondary activity.

Prefer official company websites. For each company return:

- company name;
- official website;
- target-market operating signal;
- primary-role matching signal;
- concise Cudy product/customer relevance signal;
- evidence URLs used by your search;
- rank from 1 to 30.

Do not assign scores, account tiers, cooperation paths, development strategy, email content or contacts. Do not search for sales agents, brand owners or OEM/ODM suppliers/opportunities. If fewer than 30 verified companies are found, return only verified companies; do not invent or pad the result.

Return strict JSON matching the experiment schema.
