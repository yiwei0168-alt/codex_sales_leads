# Hybrid Lead Search Workflow

Status: active
Current policy: `cudy-hybrid-lead-search` v1.1.0
Scope: user request through final valid, primary-role-correct candidate set. Tavily evidence acquisition, scoring and downstream outreach are connected consumers, not additional discovery engines.

## End-to-end flow

```text
User message and conversation
  -> Kimi light intent/template-fit check
  -> Kimi K3 only for explicit complex planning
  -> local RAG + versioned playbook/query templates
  -> category/market search tracks
  -> real-time identity registry and call/query cache
  -> lightweight identity/market/category gate
  -> necessary evidence acquisition
  -> entity and primary-role correction
  -> target-completion feedback
       | final valid in-role count is short
       +-> localized complementary search round
  -> score only in-role candidates
  -> requested-size ranked result
  -> role/path/evidence handoff to strategy and email Agents
```

The original search category is provenance only. It never forces the primary role and the former upward-priority rule is prohibited.

## Completion contract

A requested count `N` means `N` unique operating companies in the requested market whose evidence-corrected primary role matches the requested category. Raw results, duplicates, wrong-role companies and unresolved identities do not fill slots. A low score does not trigger replacement search unless the user explicitly requested a minimum score.

The initial candidate-buffer plan is `1.5 * N`. Later rounds use the conservative observed end-to-end yield:

```text
remaining valid slots / max(0.25, min(0.80, observed yield * 0.80))
```

The result is planning capacity, not an early-stop substitute. A task ends when the target is met, two completed search rounds add no final valid companies, all required providers are unavailable, or the five-round safety bound is reached. Every shortage is explicit.

The formal-evaluation harness and production LangGraph import the same target-completion policy. Production executes discovery, evidence, role correction and in-role scoring per round; corrected off-category companies remain available in the candidate library but do not consume scoring-model calls for the current request.

## Provider failure and fallback

Failures are classified as authentication, quota, rate limit, timeout, transport, HTTP, invalid response or configuration. Authentication/quota/configuration failures are not repeatedly retried. Transient failures receive at most two total attempts with exponential jitter. A provider failure never increments a no-value counter.

Provider-level failures open a provider circuit; route-level failures isolate only the provider/engine route. Two route failures from one provider open the task-scoped provider circuit. A fallback must use a complementary index or mechanism. Tavily is never a discovery fallback.

Default Retail/Reseller discovery excludes Gemini Product. It may return only after a measured experiment demonstrates independent incremental value.

Calls sharing one provider execute serially so the first result updates the exclusion registry before the next same-provider query. Different provider mechanisms remain concurrent.

## Market and category behavior

Mexico Retail/E-tail starts three tracks in the first round:

- national retailer Web search;
- E-tail/shopping-intent Web search;
- Google Places local-retail recall.

Mature markets begin with national/E-tail coverage and open the local track after an observed final-slot gap. Google Places is recall only; evidence and the role Agent must still verify a real consumer shopping loop.

Spanish queries use local commercial language, retail checkout signals and major-city rotation. English markets also rotate commercial cities and product/task-family focus. Equivalent queries are grouped by query-cluster key; tools using the same mechanism are not repeated without a documented incremental capability.

## Cache and downstream reuse

The first execution creates:

- a task-scoped call fingerprint and query-cluster record;
- a real-time company/domain/place registry;
- search-result provenance and duplicate/assisted-discovery records;
- immutable evidence IDs and content hashes;
- an explicit missing-evidence list;
- a versioned role-correction snapshot keyed by evidence, prompt and role-taxonomy versions.

Cross-run evidence IDs are deliberately not part of the semantic dependency hash because the public library assigns current-run IDs when it rehydrates a document. The cache stores stable URL/content-hash bindings and rebinds every cited ID to the current run; any missing or changed binding invalidates the cache. Supplemental evidence acquired by the correction stage is persisted before its role snapshot so a later run can reproduce the same dependency without repeating the search.

Downstream Agents consume those exact records. They may request additional evidence only for a material unresolved gap expected to change total score by at least eight points or a critical identity, existence, market, networking, eligibility or primary-role state.

Shared public evidence and role facts live under `public_evidence`. User/workspace memory remains isolated and never contaminates public evidence. Cold-start evaluation disables historical company/evidence/score reads, but within-run caching and deduplication remain mandatory.

## Required efficiency telemetry

Every route and stage records input count, raw output, normalized output, new unique companies, downstream-used output, cost, tokens/credits, latency, attempts, retries, cache state, failure class, duplicate/discard reasons and final in-role contribution. Optimization uses final-candidate contribution and cost, not provider rank.

## Version history

### v1.1.0 — 2026-09-05

- Removed Gemini Product from default Retail and Reseller routes.
- Added early national/E-tail/local Retail coverage for configured low-SEO markets.
- Added Spanish commercial queries and market-city query rotation.
- Separated provider failure from completed zero-value search.
- Added bounded retry classification, task-scoped circuit breakers and failure cache.
- Added call fingerprints, query clusters and zero-cost current-task response reuse.
- Added evidence/prompt/taxonomy-keyed public role-correction cache.
- Added final-valid-count feedback and adaptive discovery rounds.
- Connected the same feedback controller to the production LangGraph rather than keeping an experiment-only loop.
- Added explicit underfill completion reasons and experiment anomalies.

### v1.0.0 — 2026-09-02

- Initial category-specific hybrid route, real-time candidate registry, lightweight gate and provider-contribution telemetry.
- Fixed `1.35 * N` light-gate pool and route-exhaustion stopping; later invalidated by the MX Retail 6/30 underfill.
