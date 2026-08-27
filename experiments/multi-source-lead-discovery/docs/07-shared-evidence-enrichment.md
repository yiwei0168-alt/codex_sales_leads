# Shared provider-neutral evidence enrichment

Status: **corrective rule 6 implemented; full direct collection and priority-1 fallback completed on 2026-08-27**

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

## Resumable full-pool collection

The collector now maintains `shared-evidence-dossiers.v1.json` as a resumable 113-company master artifact. It processes ten uncompleted dossiers by default with concurrency capped at three, checkpoints after every completed company, and validates the exact seed hash before resuming. Completed dossiers are not requested again unless an explicit retry mode is selected. Company dossiers and collection metrics are stored separately to avoid duplicating evidence payloads.

The free direct-only pass completed all 113 canonical dossiers and collected 422 of 448 attempted official pages (94.2%). Before paid fallback, 17 dossiers were ready for rescoring, 76 were partially supported and 20 still had no recognized core support. These labels describe evidence completeness under the corrective rubric, not lead quality.

## Cost-gated fallback result

The fallback planner split the 96 non-ready dossiers into three marginal-value tiers. Tier 1 contained 23 dossiers with no canonical official URL, zero successful official pages, or at least one failed official target. Tier 2 contained two dossiers whose official pages were retrieved but established no recognized core claim. Tier 3 contained 71 partially supported dossiers with complete direct retrieval and was deliberately deferred.

Only tier 1 was run. It collected the full cumulative budget of 46 fallback sources across 23 dossiers. The final state is 18 ready, 90 partially supported and 5 still unsupported: 16 tier-1 dossiers improved at least one status level, while only one reached the complete automatic rescoring threshold. The result supports fallback as a recovery mechanism for failed or missing official pages, but not as an economical blanket expansion step. Tier 2 and tier 3 remain uncalled.

Fallback-only retries skip direct retrieval, preserve the existing dossier, and enforce the two-source cap cumulatively across process restarts. Exhausted dossiers are automatically removed from the actionable queue, preventing duplicate paid calls.

## Artifacts and commands

- Seed dossiers: `artifacts/runs/2026-08-26-de-v1/evidence/shared-evidence-dossiers.seed.json`
- Direct pilot: `artifacts/runs/2026-08-26-de-v1/evidence/shared-evidence-direct-pilot.json`
- Resumable master: `artifacts/runs/2026-08-26-de-v1/evidence/shared-evidence-dossiers.v1.json`
- Cost-gated queue: `artifacts/runs/2026-08-26-de-v1/evidence/shared-evidence-fallback-queue.json`
- Prepare: `npm run benchmark:discovery:prepare-shared-evidence`
- Collect: `npm run benchmark:discovery:collect-shared-evidence -- --limit=10`
- Plan fallback: `npm run benchmark:discovery:plan-evidence-fallback`
- Run priority-1 fallback deliberately: `npm run benchmark:discovery:collect-shared-evidence -- --fallback-only --fallback-tier=1 --allow-paid-fallback`
- Verify: `npm run benchmark:discovery:verify-shared-evidence`
