# Google Places Local control extension

Status: **protocol frozen before external discovery calls**

This extension adds `product-google-places-local` as a separate control system. It does not overwrite the frozen `product-google-places` measurement from v1.2.

Google Places is treated as a local-entity discovery source, not as a self-contained evidence source. A place may enter the discovery pool without submitted role or networking evidence. Final eligibility and scoring receive no exemption: every candidate is subsequently resolved to a company, merged into the provider-neutral dossier pool, enriched from public web sources, and evaluated under the same corrective v1.3 identity, Germany-presence, active-networking, lane-membership and cooperation-path rules as every other system.

## Search design

- Three measured lanes remain unchanged.
- Each lane uses short German local-intent phrases instead of the original web-search-style prompts.
- Eight metro-region rectangles cover different parts of Germany; `locationRestriction` is mandatory.
- The address country component must be `DE` and `businessStatus` must be `OPERATIONAL`.
- `place_id` is retained for place-level deduplication. Official domain and legal identity are used later for company-level aggregation.
- Each cell requests 20 results. A second page is requested only when the first page produces fewer than ten operational German places.
- Place category/type is retrieval metadata only and cannot prove networking relevance or a channel role.

## Evidence and persistence boundary

The discovery admission rule intentionally does not require evidence from Google Places. This prevents shallow Places fields from being compared directly with rich web-search excerpts. It does not turn a place category or address into scoring evidence.

Raw Places response content is stored only under the ignored `runs/raw` workspace for temporary processing. Committed discovery artifacts retain place IDs, request/filter counts, protocol hashes and Google attribution. Candidate names, URLs and claims enter long-term scored artifacts only after independent public-web resolution and shared evidence enrichment. No latitude or longitude is committed.

The API implementation follows Google Text Search (New): field masks are explicit, page size is at most 20, pagination preserves the original parameters, and `locationRestriction` is used instead of an IP or soft location bias.

## Commands

- Discovery: `npm run benchmark:google-places-local:discover`
- Focused tests: `npm test -- --run experiments/multi-source-lead-discovery/lib/google-places-local.test.ts`
