# Shared provider-neutral evidence enrichment

Status: **corrective rule 6 implemented and direct-fetch pilot completed on 2026-08-27**

## Purpose

Discovery providers are measured for candidate discovery, not for how much prose their native response happens to include. Every occurrence of the same company now resolves to one shared evidence dossier. All systems will be rescored from that same dossier, so Exa, Gemini, Tavily, Brave, Google Places and SearchAPI cannot gain or lose downstream evidence points because of provider-specific snippets.

## Canonical identity before retrieval

The frozen v1.2 audit artifact contained 119 nominally deduplicated company rows and 163 submitted occurrences. The stricter canonicalization produced 113 company dossiers. Six source-pool pairs were merged using an identical official domain or a strong brand/platform alias without conflicting official domains. Third-party directory hostnames are never treated as company aliases, and equal names with conflicting official domains remain separate.

Every dossier records the original pool names, aliases, legal-identity aliases, official domain, requested lanes and every system occurrence. Directly fetched pages must match both the canonical domain and a company/brand identity in page text. When a submitted legal entity is present, the page evidence must also match a legal-identity alias; sharing a hostname alone is insufficient.

## Evidence separation

All old discovery-provider evidence is preserved with provenance as `discovery-summary` so it can guide target selection and reproduce the experiment. It is excluded from the provider-neutral scoring view. Only directly fetched official content, auditable extraction of a linked page, or qualifying independent public evidence may enter rescoring.

## Confirmed per-company budget and order

1. Fetch up to five official pages, prioritizing home/about, imprint/contact, networking products/brands and the pages relevant to every submitted lane.
2. Recompute identity, Germany presence, active-networking relevance, each requested lane membership, cooperation-path caps and the deterministic small-long-tail profile after every page.
3. Stop early when all requested claims are supported. A confirmed/probable small long-tail dossier may stop with one identity-clear source when that source contains every required claim; the classifier never relies on missing data.
4. If direct retrieval is insufficient, collect at most two fallback sources. Tavily Extract is attempted for failed official URLs first; Tavily or Exa search may locate auditable page content afterward. Search summaries themselves remain inadmissible.
5. Retrieval failures and exhausted budgets preserve `unknown`; they never become negative company facts.

Paid fallback is controlled by an explicit `--allow-paid-fallback` flag. Direct retrieval is the default so a pilot or retry cannot silently consume Tavily/Exa credits.

## Direct-fetch pilot

The pilot used the merged WLAN-Shop24 dossier and made no paid-provider calls. Five official pages were fetched within budget, including the homepage, imprint, contact and networking/product pages. Product, resale and cooperation-path evidence was found, but the dossier correctly remained `partially-supported`: the frozen candidate name identified Varistano GmbH while the current official pages identify DAJB Hamburg GmbH as the operator. The company identity must therefore be corrected before rescoring instead of silently accepting a same-domain page.

This pilot validates the intended failure behavior: stronger evidence collection can invalidate stale candidate identity while retaining the useful product and channel evidence as auditable material.

## Artifacts and commands

- Seed dossiers: `artifacts/runs/2026-08-26-de-v1/evidence/shared-evidence-dossiers.seed.json`
- Direct pilot: `artifacts/runs/2026-08-26-de-v1/evidence/shared-evidence-direct-pilot.json`
- Prepare: `npm run benchmark:discovery:prepare-shared-evidence`
- Collect: `npm run benchmark:discovery:collect-shared-evidence -- --limit=10`
- Enable paid fallback deliberately: add `--allow-paid-fallback`
- Verify: `npm run benchmark:discovery:verify-shared-evidence`
