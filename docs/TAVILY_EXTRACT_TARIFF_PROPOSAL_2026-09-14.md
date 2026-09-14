# A11/Tavily Extract candidate contract — stage 177 (2026-09-14)

Current update, 2026-09-14: user approved this exact contract. Stage 212 activated it in `request-bounds-v1.8.0` and completed no-provider SQL/contract regression; see [acceptance evidence](TAVILY_EXTRACT_ACTIVE_CONTRACT_ACCEPTANCE_2026-09-14.md). The original inactive proposal text below records its earlier state. No real paid A11 run was authorized by this approval.

Status: **proposal, inactive**. The active billing policy has no `/extract` rule. `budgetedFetch` therefore rejects a product-scope Tavily Extract request as `missing-tariff` before network transmission. No API credit, budget reservation or provider response was created in this investigation.

## Why this matters

The current evidence collector performs a Tavily basic `/search` and, when it finds official URLs, calls `/extract` for up to four URLs. Contact enrichment can call the same provider for up to 20 URLs. The former has a verified search bound; Extract has none. A successful official search can therefore reach an unpriced paid step and pause the workflow. This is a **technical tariff gap**, not evidence that the candidate or market failed qualification.

## Reviewable candidate

The exact candidate is [tavily-basic-extract-candidate-2026-09-14.json](../config/billing/tavily-basic-extract-candidate-2026-09-14.json): `POST https://api.tavily.com/extract`, 1–20 HTTPS URLs, `extract_depth=basic`, `format=text`, `include_images=false`, `include_usage=true`, `timeout` 1–20, no query reranking or other fields. Maximum request body is 32,768 bytes. The proposed conservative per-request reservation is **USD0.032000**: 20 successful URLs / 5 per credit = 4 credits, at the published pay-as-you-go **USD0.008 per credit**. It assumes no free-credit or volume discount. The verified window ends 2026-09-21 00:00 UTC; expiry again blocks the route.

The [official pricing page](https://docs.tavily.com/documentation/api-credits) states basic Extract costs one API credit per five successful URLs, and lists USD0.008 per credit for pay-as-you-go. The [official endpoint reference](https://docs.tavily.com/documentation/api-reference/endpoint/extract) documents basic depth, text format, usage and timeout fields, and a maximum-20-URLs error. These public prices do not establish a custom enterprise contract; the current Search rule also excludes custom enterprise pricing.

The validator is implemented against the candidate only. A synthetic provider transport captured the current 2-URL and 20-URL requests and passed the contract; altered depth, query, images, URL count, method and query string fail before reservation. The active policy remains version `request-bounds-v1.7.0.json` with nine rules; the new candidate is **not** referenced by it. Full regression passed (1,018 tests / 207 files), as did typecheck and production build; lint has no errors and 11 pre-existing warnings. The [read-only A11 preflight](A11_EXTRACT_PREFLIGHT_VISIBILITY_2026-09-14.md) now explicitly reports Extract as missing, with USD12.324404 occupied and zero provider calls. A product SQL budget test and full regression are still required **after** any approved activation.

## Decision and remaining gates

Under confirmed rule A11, adding a new billable endpoint contract requires user confirmation. Approval would permit adding this exact candidate to a new active policy version, with the same strict validator and no change to Tavily Search or discovery routes. It would **not** authorize a paid call, raise the cumulative USD30 cap, resolve unknown historical bills, validate account-specific enterprise pricing, prove full A11 run cost, or mark acceptance complete. Until approval, `/extract` stays blocked. The previously approved S01 market-plan route is unaffected.
