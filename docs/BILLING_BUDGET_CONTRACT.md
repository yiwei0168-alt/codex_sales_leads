# Budget contract v1.0.0 — 2026-09-12

User approved conservative reservation and fail-closed behavior for missing rates/bounds. This document describes implementation coverage, not a provider billing guarantee.

## Current coverage

The production `runLeadWorkflow` sets an owner/action scope. Its embedding, playbook SDK, discovery (Gemini/Places/Exa/Brave/SearchAPI), Tavily evidence, DeepSeek and compatible fallback transports reserve before **each HTTP attempt**, including SDK retries. The scope follows asynchronous work; independent users/actions do not share in-flight model billing. Deterministic stages and cache reuse do not reserve. Official-website crawler reads are not paid provider transports. Experiments outside the product scope retain their previously approved separate budgeting; this is not authorization to run experiments.

Assistant intent/chat, development generation/revision and follow-up now establish owner scopes. Their Kimi/Claude HTTP, Gemini external search and synthesis SDK transports are gated; generation uses the persisted operation ID. Child scopes isolate parallel attribution and reject cross-owner nesting. Direct Kimi/Claude budget denials bypass retries and template/provider fallback; follow-up returns 402. Existing token caps are unchanged; uncapped requests remain blocked.

Contact lookup, stored relationship analysis, independent RAG/knowledge ingestion, private memory embedding and mailbox learning now establish owner scopes too. Snov forms remain endpoint/size bounded and OAuth is not assumed free. Budget denials propagate through provider fallback and lead assessment layers and receive aggregate-only zero-cost **denied-attempt** telemetry; earlier attempts are not declared free. `/api/tasks/usage` exposes operation and HTTP ledgers separately; never add their overlapping costs.

**Not complete:** audited provider/account request bounds, per-task sub-limits, finer semantic stage utilization and invoice reconciliation/release remain open. SDK-wrapped errors may still cause harmless local retries before being surfaced, but each transport attempt remains gated. No broad “all product costs capped and live-verified” claim is valid yet.

## Storage and concurrency

Migration 046 creates owner-RLS `user_spend_budget` and `paid_call_reservation`. Amounts are integer micro-USD. The budget is cumulative and never resets on restart/month boundary. A locked owner budget row serializes reservations; the sum cannot exceed its configured limit. Record insertion and occupied increment commit together before network I/O. Editing the limit cannot lower it below occupied funds and never unfreezes a provider-bound violation. No budget is auto-created or increased.

Each actual HTTP attempt has its own reservation. Transport timeout, invalid JSON or telemetry failure retains the full reservation. A returned provider cost is recorded separately, but does not release money automatically because not all providers report a complete invoice. A reported charge exceeding the contractual bound freezes future reservations; the already completed remote charge cannot be undone. Concurrent requests already in flight remain accounted by their reservations. Settlement is idempotent and cannot turn successful work into a replayable provider failure.

## Audited request bounds

`config/billing/request-bounds-v1.0.0.json` is version-controlled and intentionally contains **no invented active rates**. Therefore scoped uncached paid requests currently fail closed. Each future rule must have exactly one endpoint/model match, reviewed source/date/expiry, maximum request bytes, an enforced output-token limit for model requests, and a verified all-inclusive maximum fee in micro-USD. Include reasoning, grounding, automatic tool executions, result counts, extraction and upstream server work. A token unit rate alone is not a bound on an unbounded model-search task. Expired/ambiguous/missing rules and unbounded requests block before network I/O. HTTP redirects and streaming are disallowed in this transport gate. Never put API keys or provider URL query credentials in a rule.

New requests are not ready simply because a budget exists. Some existing SDK/Gemini calls have no explicit output cap and intentionally remain blocked until bounded request contracts are implemented and verified. Populate reviewed bounds only after verifying actual account/provider charging terms; do not substitute historical estimated experiment prices.

## Privacy and cost efficiency

Reservation records contain IDs, phase, tariff version, byte/token counts when available, latency, reported cash and outcome. They contain no prompt, company text, response content, headers, URL query, API key or personal data. Unknown metrics remain null. A valid HTTP response is not a downstream-used candidate; downstream use belongs to the existing workflow metrics. Current conservative occupied funds are not actual spend or measured cost savings.

Task Center lazy-loads budget UI; GET does not start work. PUT requires an explicit user's confirmation. All browser tests use synthetic data and intercepted network. SDK transport integration was checked against the installed OpenAI SDK's `fetch` option after consulting [official SDK documentation](https://developers.openai.com/api/docs/libraries); no model migration occurred.
