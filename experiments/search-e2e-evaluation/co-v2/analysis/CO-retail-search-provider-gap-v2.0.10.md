# CO Retail SearchAPI provider-gap analysis v2.0.10

Date: 2026-09-08

## Observed defect

The clean, consistency-normalized CO Retail Product artifact contains 12/50 valid Retailer/E-tailer candidates after eight search rounds. SearchAPI had 40 planned calls: five failed with the confirmed monthly-quota HTTP 429, 35 were skipped by the provider circuit or recovery cooldown, and none returned a raw or unique candidate. National Retail and E-tail both used SearchAPI as their broad Google-index route. Brave, Exa and Google Places remained useful complementary mechanisms but did not replace that missing recall layer.

This is a provider-availability underfill, not evidence that Colombia contains only 12 suitable companies. Repeating the existing rounds without a complementary broad-index replacement would spend latency and downstream effort without addressing the unavailable route.

## Frozen repair

Hybrid-search v1.6.0 adds a `provider-gap` Gemini Full step after SearchAPI in configured Retail/E-tail and Reseller/VAR tracks. It runs only when the corresponding SearchAPI track failed, a SearchAPI provider/invocation circuit is open, or SearchAPI is in recovery cooldown. If SearchAPI is healthy, the step records `fallback-provider-healthy` and makes no provider call. It is not Gemini Product, does not use Tavily discovery and does not run as an always-on duplicate of a healthy search mechanism.

The existing shared candidate registry, cached-domain exclusions and first-discovery provenance apply to fallback results. The CO Retail `--repair-search` extension reuses the 12 valid outputs plus compatible evidence, corrections and scores. Previously acquired work is not repeated; only newly discovered candidates can enter homepage, light-gate, Tavily evidence, correction and scoring stages.

## Efficiency contract

- Implementation input: 40 planned SearchAPI calls, five quota failures, 35 zero-cost circuit/cooldown skips, zero SearchAPI raw/valid/downstream-used output.
- Implementation output: one conditional route primitive applied to five Retail/Reseller tracks, provider-gap validation, explicit fallback/skip telemetry and regression coverage.
- External implementation cost: zero tokens, zero paid search credits and zero cash cost.
- Runtime measurement required: Gemini fallback requests/tokens/cost/latency/retries; raw, unique, light-gate, corrected and final in-role yield; cached-domain overlap; Tavily credits per incremental final candidate; and whether the Retail cell reaches 50.
- Optimization opportunity: persist provider quota/circuit health across cells so a known task-wide quota failure does not require one fresh failing probe in every later Product process.
