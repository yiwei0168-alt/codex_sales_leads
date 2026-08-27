# Post-audit corrective rubric

Status: **rules 1 through 6 confirmed on 2026-08-27; later corrective rules remain under sequential user review**

The v1.2 human audit failed the frozen calibration thresholds, so the published scores remain provisional and no provider winner is declared. This document records corrective rules for the required future full-pool rescoring. It does not retroactively change the frozen v1.2 prompts, packets, decisions or raw scores.

## Corrective rule 1 — active-networking relevance

The original wording allowed generic IT adjacency to pass the `networkingRelevant` eligibility gate. The corrected gate requires explicit supplied evidence that the company sells, distributes, specifies, buys, designs, installs, deploys, operates or maintains active networking hardware, or implements a WLAN/LAN project that directly requires it.

Active networking includes routers and gateways, 4G/5G CPE, wireless APs, mesh and WLAN controllers, Ethernet/PoE switches, modems, outdoor and point-to-point wireless, network firewalls, security gateways and network-management controllers. A candidate can pass through an official product/catalog/listing, explicit distribution or resale, explicit design/specification/BOM/procurement/deployment/maintenance responsibility, a named relevant vendor relationship, or a concrete relevant project.

The following language is insufficient by itself: IT infrastructure, cloud connectivity, edge infrastructure, digital transformation, managed IT, IP solutions, system integration, network consulting, data center, broadcast IP and IT procurement. Pure structured cabling, copper, fiber or low-voltage work can establish an Installer role but does not pass the Cudy relevance gate without evidence involving active equipment.

The gate and the 45-point product/use-case fit dimension remain separate. A company materially involved in enterprise-only active networking can pass the gate while receiving a low Cudy-fit level. Missing public proof is recorded as `not demonstrated`, not as a factual assertion that the company is unrelated; `not demonstrated` nevertheless fails this benchmark gate.

## Executable enforcement

The shared `active-networking-relevance-v1` policy is now sent to the benchmark evaluator and the production qualification agent. Both pipelines independently recompute the gate from supplied evidence and can only preserve a model `true` when at least one explicit active-networking signal is present. Generic and passive-cabling examples are covered by automated tests in English and German.

The machine-readable next-iteration amendment is [`../config/corrective-rubric-v1.3.json`](../config/corrective-rubric-v1.3.json). The frozen v1.2 input manifest and result artifacts remain unchanged for reproducibility.

## Corrective rule 2 — claim-linked evidence and long-tail exception

Search snippets, provider summaries and AI-generated company summaries remain discovery material and cannot independently prove identity, market presence, networking relevance, channel role or cooperation path. Each material judgment must be linked to a concrete URL and excerpt. The company name, claimed official URL/domain and evidence entity must refer to the same business; a wrong or unmatched official URL fails `sufficientEvidence` until corrected. Mirrors, duplicate excerpts and repeated pages from the same origin count once.

One concrete company-owned official page can satisfy the basic evidence floor. Without direct official evidence, a standard candidate normally needs two non-duplicative public origins. Source quality and claim directness matter more than page count, and additional corroboration remains part of the evidence-reliability score.

Small long-tail leads have an explicit single-source exception. They do not need multiple independent sources when one identity-clear official Marketplace store, official LinkedIn/company/social profile, Google Business-style page or other concrete auditable public source shows the relevant products, brands, projects, installation services or business actions. The exception changes the admission threshold only: it does not relax identity consistency, content specificity, active-networking relevance or role requirements, and it does not automatically increase the evidence-reliability level.

## Corrective rule 3 — evidence-capped cooperation path

Cooperation-path scores are now capped by demonstrated transaction control rather than inferred from role or company size. With no explicit procurement, listing, ordering, quotation, specification, BOM, brand-recommendation or deployment control, the maximum level is 2. One demonstrated lever permits at most 3; multiple complementary levers permit at most 4. Level 5 requires an evidenced active transaction/listing/direct-procurement path or a complete repeatable cooperation chain.

Tier-1 evidence focuses on brand onboarding, direct procurement/import and repeatable downstream supply. B2B resale focuses on purchasing, live listing/ordering, quotation and recommendation. Project services focus on design/specification/BOM, procurement or vendor selection and deployment. An Installer explicitly limited to customer-supplied equipment is capped at 2.

Missing public procurement or control information remains unknown rather than a negative company fact, but it cannot support a higher score. Company size contributes no cooperation points. A live Cudy product page, price, SKU, stock indication or order path can prove that a transaction path exists; a current-relationship label by itself remains zero-weight.

## Corrective rule 4 — multi-role channel membership

Candidates may retain every role supported by public evidence; the product and benchmark no longer require or score one `primary role`. Public material often proves that a business line exists without revealing its revenue, order or staffing share. Page volume, search rank and model impression must not be used to infer a dominant role.

A submitted lane passes whenever evidence proves that the company genuinely conducts at least one role permitted in that lane, regardless of which other roles exist or appear more prominent. The same company can qualify for several lanes when each business has corresponding evidence. This is a claim requirement, not a multiple-source requirement, so the confirmed long-tail single-source exception still applies.

Distribution requires downstream supply or explicit distributor/wholesaler identity; direct brand buying for final-customer service remains VAR/DVAR. VAD requires Distributor status plus substantive technical enablement. VAR requires actual resale to final customers plus substantive technical value. SI requires solution, architecture, integration or project-outcome responsibility; installation execution alone supports Installer but not SI. Suggested but unproven roles may remain possible/pending and do not pass their lane.

The v1.3 category metric therefore measures whether submitted-lane membership is supported, not whether the evaluator selected the same forced primary role as a reviewer.

## Corrective rule 5 — auditable small long-tail classification

The evaluator and production qualification model may no longer self-assign the evidence exception. In particular, the commercial `accountTier=Long-tail` label is separate from the evidence profile and cannot activate a lower evidence-source threshold. The profile is recomputed deterministically from the supplied, non-discovery evidence and records its supporting URLs and signals.

`confirmed-small-long-tail` requires positive direct small-company evidence plus a long-tail public-information signal. Direct evidence includes an explicit 1–49 employee count, sole-proprietor or individual-enterprise form, or explicit micro-enterprise status. `probable-small-long-tail` requires at least two different positive structural signals—such as owner operation, an explicitly small team, explicitly limited locations, local/regional service scope, or an official small storefront/Marketplace profile—plus a long-tail information signal. Several signals may come from the same identity-clear source; this is not a requirement for two independent sources.

Long-tail information forms include an official Marketplace or platform business profile, a Google Business-style profile, a local/regional business presentation or another fragmented but auditable public-business footprint. Explicit evidence of 250 or more employees or a clearly large national branch/group footprint overrides the exception. A simple website, few search results, weak SEO, low traffic, or missing employee, revenue, warehouse or brand information never proves that a company is small. When positive proof is insufficient, the profile remains `standard`; missing information is recorded as unknown.

This profile only decides whether one concrete, identity-clear public source can satisfy the admission floor. It contributes zero points to product fit, channel role, cooperation path and evidence reliability, and it does not relax entity consistency, active-networking relevance or submitted-lane business proof.

## Corrective rule 6 — one provider-neutral evidence dossier per company

All discovery-provider outputs are deduplicated to canonical companies before evidence enrichment. Each canonical company receives one shared dossier that is reused for every provider/system occurrence and every submitted lane. Provider snippets remain available for retrieval planning and experiment traceability but are excluded from the scoring view, preventing native snippet richness from affecting downstream scores.

Canonicalization prioritizes the official domain and uses strong company, brand and official-platform aliases only when official domains do not conflict. Third-party directory hosts never become company aliases. Directly fetched evidence must match the canonical domain and the company/brand name in page text; submitted legal-entity aliases must also match when present.

The confirmed budget is five official pages plus at most two fallback sources per company. Direct official retrieval runs first. Failed official targets may use Tavily Extract, followed by Tavily/Exa discovery of auditable page content. Search summaries never become evidence. Collection stops when required claims are supported, including the small-long-tail one-source early-stop case; failures and exhausted budgets remain unknown.

The executable protocol and direct-fetch pilot are recorded in [`07-shared-evidence-enrichment.md`](07-shared-evidence-enrichment.md).
