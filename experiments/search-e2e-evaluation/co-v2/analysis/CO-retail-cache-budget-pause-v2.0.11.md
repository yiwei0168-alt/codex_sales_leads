# CO Retail cache violation and budget pause v2.0.11

Date: 2026-09-08

## Outcome

The five real provider-gap rounds increased Product Retail from 12 to 14 candidates. Incremental cost was USD 4.0500391788, or USD 2.0250 per added final candidate. Total experiment spend is USD 9.4482299967. The expected completion forecast is USD 45.7926 and the conservative upper forecast is USD 59.6814, so the runner correctly entered `budget-paused` before the USD 10 mandatory checkpoint.

| Stage/provider | Cost (USD) | Observable output |
|---|---:|---|
| Gemini Full fallback | 1.848 | 15 calls, 132 grounding queries, 300 raw, 49 unique, 1 first-discovery final |
| Google Places | 0.175 | 25 raw, 14 unique, 1 first-discovery final |
| Brave | 0.075 | 300 raw, 40 unique, 0 first-discovery final |
| Exa | 0.333 | 180 raw, 32 unique, 0 first-discovery final |
| SearchAPI | 0.032 | 4 failed probes, 21 skips, 0 output |
| Tavily evidence/correction | 1.488 | 81 correction inputs, 6 in-role, 2 final |
| Semantic gate/correction/scoring models | 0.099039 | 81 gate/correction inputs, 6 in-role, 2 final |

The five rounds converted 805 raw results to 135 reported unique candidates, 81 light-gate/evidence/correction inputs, six requested-family roles and two eligible final outputs. This is 0.25% raw-to-final and 1.48% reported-unique-to-final utilization.

## Cache defect

Twenty-five of the 81 downstream candidate inputs already existed in the prior artifact: 16 in round 10, five in round 11, two in round 12 and two in round 14. The search-extension branch documented cached-domain exclusion but did not preload the prior domains into its new discovery session. These candidates were therefore gated, enriched and corrected again. Existing correction/score records were not overwritten, so quality output is retained; all repeated cost remains charged.

v2.0.11 preloads domains from prior discovered candidates, rejected candidates, enriched candidates and corrected identities. Returned duplicates remain part of raw provider telemetry but are removed before the semantic gate, Tavily evidence, role correction and scoring. This directly implements the product rule that the first overlapping task establishes the cache consumed downstream.

## Budget decision boundary

No more paid call is authorized while `budget-paused`. The current conservative forecast extrapolates every sunk Retail debug/recovery dollar from the only completed cell, so its upper bound is intentionally wider than the likely remaining category cost. Resumption can preserve all 14 valid outputs and use the repaired cache boundary. The two quality-changing opportunities—one Gemini category-level fallback instead of three track calls, and a stricter pre-evidence Retail commercial-action/networking gate—are recorded but not silently applied inside the frozen experiment.
