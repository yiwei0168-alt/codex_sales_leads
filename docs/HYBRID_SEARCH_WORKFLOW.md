# Hybrid Lead Search Workflow

Status: active
Current policy: `cudy-hybrid-lead-search` v1.6.0
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

Planning capacity also controls request breadth. The executor divides the current pool target across active tracks and requests 12–20 results per provider call. Brave and SearchAPI queries include at most 20 safe `-site:` exclusions, split between the earliest and most recently seen domains, so a later localized round does not keep paying for the same top results.

The formal-evaluation harness and production LangGraph import the same target-completion policy. Production executes discovery, evidence, role correction and in-role scoring per round; corrected off-category companies remain available in the candidate library but do not consume scoring-model calls for the current request.

## Provider failure and fallback

Failures are classified as authentication, quota, rate limit, timeout, transport, HTTP, invalid response or configuration. Authentication/quota/configuration failures are not repeatedly retried. Transient failures receive at most two total attempts with exponential jitter. A provider failure never increments a no-value counter.

Provider-level failures open a provider circuit; route-level failures isolate only the provider/engine route. Two transient route failures from one provider open the current-round circuit, skip the next discovery round, and permit one bounded recovery probe in the following round. A successful probe clears the cooldown. A fallback must use a complementary index or mechanism. Tavily is never a discovery fallback.

Brave accepts only a limited market-country enum. When the requested country is unsupported (including Colombia), its request uses `country=ALL` while the localized query continues to name the country; an unsupported ISO code must never be sent as if it were valid. A confirmed quota failure such as SearchAPI HTTP 429 is a provider failure, not an empty successful batch and not evidence that the search track has no value.

Retail/E-tail and Reseller/VAR routes that use SearchAPI for broad Web recall have a conditional Gemini Full provider-gap step. It is eligible only after the corresponding SearchAPI track fails, SearchAPI has opened a provider/invocation circuit, or its bounded recovery is in cooldown. A healthy SearchAPI route records the Gemini step as `fallback-provider-healthy` with zero provider request, tokens, credits and cash cost. The backup is neither Gemini Product nor a routine duplicate search, and it never turns Tavily into a discovery engine.

DeepSeek remains the primary semantic-gate, correction and scoring provider. After bounded direct-provider failure, public-only packets may use the same DeepSeek Flash/Pro tier through the configured OpenRouter gateway. Requests containing user/workspace cooperation-path memory remain private and cannot use this automatic public route. Requested/actual provider and model, aggregate attempts, tokens, gateway cash cost and fallback reason are retained.

Default Retail/Reseller discovery excludes Gemini Product. It may return only after a measured experiment demonstrates independent incremental value.

Calls sharing one provider execute serially so the first result updates the exclusion registry before the next same-provider query. Different provider mechanisms remain concurrent.

## Market and category behavior

Mexico Retail/E-tail starts three tracks in the first round:

- national retailer Web search;
- E-tail/shopping-intent Web search;
- Google Places local-retail recall.

Mature markets begin with national/E-tail coverage and open the local track after an observed final-slot gap. Google Places is recall only; evidence and the role Agent must still verify a real consumer shopping loop.

Spanish queries use local commercial language, retail checkout signals and major-city rotation. English markets also rotate commercial cities and product/task-family focus. Equivalent queries are grouped by query-cluster key; tools using the same mechanism are not repeated without a documented incremental capability.

Google Places receives a compact category + city + market query rather than the longer Web-search exclusion prompt. Its candidates remain recall-only until evidence and role correction verify the business.

## Cache and downstream reuse

The first execution creates:

- a task-scoped call fingerprint over provider, query, requested depth and domain-exclusion context, plus a broader query-cluster record;
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

### v1.6.0 conditional provider-gap backup — 2026-09-08

- Adds Gemini Full only behind observed SearchAPI unavailability on configured Retail/E-tail and Reseller/VAR tracks.
- Keeps Gemini Full idle and records a zero-cost skip while SearchAPI is healthy, preserving the rule that equivalent search mechanisms are not routinely duplicated.
- Treats provider failure, provider/invocation circuits and recovery cooldown as eligible fallback states; ordinary no-value output is not a provider failure.
- Keeps shared identity deduplication, cached-domain exclusions, Tavily evidence-only scope and final-role feedback unchanged.
- Introduces explicit `fallbackForProvider`, `fallbackUsed` and skip-reason telemetry so later contribution analysis can distinguish primary from contingency yield and cost.

The trigger was the clean Colombia Retail run: across eight rounds, SearchAPI had 40 planned calls, five quota failures, 35 circuit/cooldown skips, zero raw results and zero unique companies. The deterministic consistency repair left 12/50 valid Retail/E-tail outputs. The new repair-search run will reuse those 12 outputs and all compatible evidence/role/score records; only new candidates can incur new downstream acquisition cost.

The first extension measurement exposed an integration defect rather than a route-policy defect: prior candidate domains were not preloaded into the new discovery session. Runtime v3.9.1 now collects domains from cached discovered, rejected, enriched and corrected records before an extension starts. Matching search results remain visible as raw duplicate telemetry but are filtered before the semantic gate; they cannot re-enter homepage/evidence acquisition, role correction or scoring.

### Colombia formal evaluation harness v2.0.0 — 2026-09-08

- Freezes Colombia across the four core categories with 50 requested candidates per arm/category.
- Preserves production within-run search, identity, evidence and role-correction reuse while disabling historical cold-start reads and writes.
- Evaluates only Gemini-unique companies after arm freeze, so overlap never repeats evidence or scoring work.
- Applies blind-audit v2.1 with 24 representative and 8 stress packets, dual independent judges and conditional arbitration.
- Enforces a USD 50 hard cap with real-cost checks at USD 10, 20 and 30; every checkpoint records forecast, stage/ledger cost, input/raw/valid/used volume, discard reasons, latency and retries.
- Creates no external input/output or cost during preregistration. Measured route contribution and unit cost are recorded by the formal run rather than inferred.
- v2.0.1 repair: a lightweight Kimi template-fit result cannot override already confirmed country, target count or category. Divergence remains visible in telemetry, while the confirmed plan controls execution. The first rejected CO Retail plan used USD 0.0051770629 and stopped before Product search; its unchanged Gemini control is reused.
- v2.0.2 recovery: invalid/truncated Kimi JSON receives one bounded retry with aggregate usage; persistent failure routes to disclosed DeepSeek Flash as the same-capability fallback. The second rejected intent used USD 0.0085371301 and still stopped before Product search. No search or scoring rule changed.
- v2.0.3 recovery: CO Retail produced 65 raw results, 31 unique companies and 27 evidence-enriched/corrected candidates but zero scored outputs because the DeepSeek account returned `Insufficient Balance` and no runtime fallback was configured. Public semantic packets now use the same DeepSeek tier through OpenRouter after bounded failure; private-memory packets do not. Brave unsupported countries use `ALL`. Same-run recovery reuses intent, RAG, playbook, search, fresh evidence and supplemental evidence before repeating correction/scoring, so the USD 0.7530831701 Product attempt is not followed by duplicate acquisition spend.
- v2.0.4 recovery: CO Retail v2.0.3 reached four rounds and USD 1.6755584861 cumulative experiment cost but still published 0/50 because OpenRouter's default reasoning made large Flash requests exceed their routine timeout; generic catch handlers then spent Pro budget on infrastructure recovery. Public DeepSeek fallback now explicitly disables optional reasoning, shares one primary circuit for the cell, limits malformed-output repair to one same-tier call, and reserves Pro solely for valid semantic outputs predicting a score change of at least eight points or a critical-state resolution. Same-run evidence is reused without another search or Tavily pass.
- v2.0.5 recovery: the next cached correction attempt exposed oversized multi-candidate packets and a recovery-boundary bug. The zero-result recovery mistakenly opened round five and spent USD 0.368 on new acquisition. Correction packets now retain ten relevance-prioritized current sources with 1,200-character excerpts, batch under 28,000 serialized characters, and use one-candidate/two-way-concurrency calls for formal recovery. Request timeouts remain local, and `--resume-product` is now acquisition-closed.
- v2.0.6 localization repair: CO Retail queries incorrectly reused Mexico city focuses, Exa profile URLs merged unrelated identities, Latin American public suffixes collapsed to values such as `com.pe`, and same-family Retailer+E-tailer companies were incorrectly excluded as Hybrid. Country-code-specific focuses, provider-domain isolation, corrected registrable domains and concrete same-family primary roles are now enforced. The formal repair-search extension preserves cached evidence and valid scores while excluding every cached domain from new acquisition.
- v2.0.7 evidence-lineage repair: only domain-bearing company identities count as normalized/new discovery yield; Exa-owned profile URLs and unresolved external IDs are retained only as discarded provenance. Light-gate strings and enum arrays are bounded before validation so one malformed reason cannot send an entire batch to paid downstream evidence. Official evidence acquisition requires a valid registrable company domain, correction search retains only candidate-affiliated independent sources, and target-country eligibility cannot override the correction-stage country finding. Model-failed rounds do not advance the no-final stop counter; explicit 50-company tasks have a bounded ten-round ceiling.
- v2.0.8 model recovery: incomplete cached semantic records retry through bounded same-tier OpenRouter DeepSeek and then an OpenAI peer without repeating discovery or evidence acquisition.
- v2.0.9 deterministic consistency: supported marketplace findings remove Retail/E-tail roles; unknown scale and buying influence obey deterministic caps without a model or acquisition call.
- v2.0.10 provider-gap recovery: SearchAPI-dependent Retail and Reseller tracks use Gemini Full only during an observed SearchAPI outage and otherwise skip it at zero cost.
- v2.0.11 cache-boundary repair: search extensions preload all earlier candidate identity domains before discovery, preventing repeated semantic-gate, Tavily, correction and scoring work.

### v1.3.0 category purity and cost-accounting repair — 2026-09-07

- Rejects malformed DNS labels, punctuation-contaminated URLs and public-suffix-only identities such as `co.uk` or `com.mx` before any model gate or paid evidence step.
- Defines Retail/E-tail, Reseller/VAR, Distributor/VAD and SI/MSP by their commercial actions in the Flash light gate. Retail tasks explicitly reject directories, non-retail ISPs, manufacturer-owned brand stores without a material independent multi-brand retail business, and general retailers with no demonstrated networking-products category.
- Defers a provider for one complete round after two transient failures, then permits a bounded recovery probe. This retains SearchAPI's measured contribution while avoiding repeated timeout cost in every round.
- Preserves attempts, retries and latency from failed Tavily search/extract calls in workflow telemetry.
- Tightens role correction: multiple roles no longer imply `Hybrid`; subtype labels require their defining action, and duplicate-result conflicts remain `Unresolved` instead of deterministically inventing `Hybrid`.
- Normalizes only structural output noise (bounded text and known enums) before schema validation. This prevents unnecessary Pro retries without converting unsupported claims into supported evidence.

This implementation stage made no paid external calls. Input/output utilization and savings are therefore not yet observed; the next production run must compare pre-evidence category pass rate, Tavily calls per final in-role company, provider cooldown skips/probe recovery, role-family precision, exact subtype precision, `Hybrid` rate and schema-retry cost against formal v1.1.6.

### v1.2.1 formal UK/MX observation — 2026-09-07

The completed cold-start experiment produced 200/240 Product E2E final outputs versus 225/240 for Gemini. Product's shared scorer reported higher slot utility in 7/8 cells, but independent blind calibration failed, so the experiment does not yet prove superiority. The main quality bottlenecks were GB/MX Retail role purity, overuse of `Hybrid`, direct brand stores/ISPs/directories entering Retail, and wrong-role candidates reaching paid evidence acquisition.

A reporting-only defect originally assigned zero final contribution to every discovery provider. A deterministic audit restored source-run provenance for reused cells and accounted for all 200 final Product E2E outputs: Brave 77.5 fractional credits, Gemini Full 44, Exa 27, Google Places 27 and SearchAPI 24.5. SearchAPI therefore must not be removed; repeated timeouts should instead use a lower-frequency bounded recovery probe. The corrected productive discovery cost was USD 2.979. Future provider optimization must validate complete fractional attribution before suggesting route removal.

The eight productive product executions cost USD 15.409182 for 200 final outputs, or USD 0.077046/output. Model cost per output was 66.0% below the v2.0 preselected-pool baseline and Tavily credits per corrected candidate were 33.1% lower, but combined model+Tavily cost per final output was 32.2% higher because too many wrong-role or weak candidates reached evidence collection. The next cost improvement must therefore increase pre-evidence category precision rather than reduce model capability or remove contributing search mechanisms.

### v1.2.1 — 2026-09-05

- Caps the complete Brave/SearchAPI query, including domain exclusions, at 580 characters so provider limits cannot reject generated search plans.
- Keeps authentication, quota and configuration circuits task-wide, but confines repeated transient route failures to the current discovery round.
- Reopens a transiently failed provider in the next round with a bounded recovery probe; a successful probe clears its accumulated transient failure count.
- Does not count a round with provider failures or open circuits toward confirmed search exhaustion, even if another provider completed with zero final additions.
- Invalidates the v1.1.1 MX Retail diagnostic rather than allowing its 8/30 underfill to bias the formal comparison.

### v1.2.0 — 2026-09-05

- Isolated the discovery gate from mutable global model configuration; its production default and frozen experiment model are `deepseek-v4-flash`, with no Pro escalation.
- Froze routine role correction and score-only qualification to Flash for the formal experiment; Pro remains material-trigger-only.
- Connected adaptive candidate-pool size to provider request breadth up to 20 results.
- Added bounded prior-domain exclusions to Brave and SearchAPI queries.
- Replaced verbose Google Places prompts with compact local-commerce queries.
- Added requested-result volume to every discovery call's telemetry.
- Added request depth and exclusion-context hashes to the call cache key so broader follow-up searches cannot reuse a narrower stale response.

### v1.1.0 first formal cell — invalidated diagnostic

The first MX Retail cell improved final fill from the historical 6/30 to 15/30, but the run was invalidated because the mutable global `DEEPSEEK_MODEL` selected Pro for all routine discovery-gate, role-correction and scoring calls. The paid diagnostic also showed 345 raw results collapsing to 62 unique companies and 15 final companies. Adaptive planned pools reached 88, while each provider request still used the fixed 12-result batch size. SearchAPI and Brave produced 282 duplicate occurrences; Exa used eight credits and had zero first-discovery final contribution. The next version must freeze routine model bindings, connect planned pool to provider breadth, shorten Places queries, and send bounded domain exclusions to Web indexes. The detailed actual-cost record is stored with the invalidated run artifacts.

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
