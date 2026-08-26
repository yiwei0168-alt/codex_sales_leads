# Step-result ledger

No measured result exists yet. This ledger must be updated in the same commit as each published normalized artifact.

| Step ID | Stage | System | Channel | Normalized artifact | Raw SHA-256 | Record count | Validation | Notes |
|---|---|---|---|---|---|---:|---|---|
| preflight-001 | connectivity preflight | Gemini, Tavily, Google Places, Exa, Brave, SearchAPI.io | n/a | `artifacts/runs/2026-08-26-de-v1/preflight/provider-connectivity.json` | six hashes inside artifact | 6 | passed | All configured providers succeeded on their first request; personal contact values and provider-internal asset/search URLs are excluded from the committed representation. |
| discovery-gemini-full-tier1 | measured discovery | gemini-full | tier1-distribution | `artifacts/runs/2026-08-26-de-v1/discovery/gemini-full/tier1-distribution.json` | inside artifact | 10 | passed with recovery deviation | Fixed Gemini Full ranking; only successful recovery response retained. |
| discovery-gemini-full-b2b | measured discovery | gemini-full | b2b-resale | `artifacts/runs/2026-08-26-de-v1/discovery/gemini-full/b2b-resale.json` | inside artifact | 10 | passed with recovery deviation | Fixed Gemini Full ranking; only successful recovery response retained. |
| discovery-gemini-full-project | measured discovery | gemini-full | project-services | `artifacts/runs/2026-08-26-de-v1/discovery/gemini-full/project-services.json` | inside artifact | 10 | passed with recovery deviation | Fixed Gemini Full ranking; only successful recovery response retained. |
| discovery-product-gemini-tier1 | measured discovery | product-gemini | tier1-distribution | `artifacts/runs/2026-08-26-de-v1/discovery/product-gemini/tier1-distribution.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-gemini-b2b | measured discovery | product-gemini | b2b-resale | `artifacts/runs/2026-08-26-de-v1/discovery/product-gemini/b2b-resale.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-gemini-project | measured discovery | product-gemini | project-services | `artifacts/runs/2026-08-26-de-v1/discovery/product-gemini/project-services.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-tavily-tier1 | measured discovery | product-tavily | tier1-distribution | `artifacts/runs/2026-08-26-de-v1/discovery/product-tavily/tier1-distribution.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-tavily-b2b | measured discovery | product-tavily | b2b-resale | `artifacts/runs/2026-08-26-de-v1/discovery/product-tavily/b2b-resale.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-tavily-project | measured discovery | product-tavily | project-services | `artifacts/runs/2026-08-26-de-v1/discovery/product-tavily/project-services.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-google-places-tier1 | measured discovery | product-google-places | tier1-distribution | `artifacts/runs/2026-08-26-de-v1/discovery/product-google-places/tier1-distribution.json` | 3 hashes inside artifact | 22 | passed | Three frozen queries. |
| discovery-product-google-places-b2b | measured discovery | product-google-places | b2b-resale | `artifacts/runs/2026-08-26-de-v1/discovery/product-google-places/b2b-resale.json` | 3 hashes inside artifact | 26 | passed | Three frozen queries. |
| discovery-product-google-places-project | measured discovery | product-google-places | project-services | `artifacts/runs/2026-08-26-de-v1/discovery/product-google-places/project-services.json` | 3 hashes inside artifact | 21 | passed | Three frozen queries. |
| discovery-product-exa-tier1 | measured discovery | product-exa | tier1-distribution | `artifacts/runs/2026-08-26-de-v1/discovery/product-exa/tier1-distribution.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-exa-b2b | measured discovery | product-exa | b2b-resale | `artifacts/runs/2026-08-26-de-v1/discovery/product-exa/b2b-resale.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-exa-project | measured discovery | product-exa | project-services | `artifacts/runs/2026-08-26-de-v1/discovery/product-exa/project-services.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-brave-tier1 | measured discovery | product-brave | tier1-distribution | `artifacts/runs/2026-08-26-de-v1/discovery/product-brave/tier1-distribution.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-brave-b2b | measured discovery | product-brave | b2b-resale | `artifacts/runs/2026-08-26-de-v1/discovery/product-brave/b2b-resale.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-brave-project | measured discovery | product-brave | project-services | `artifacts/runs/2026-08-26-de-v1/discovery/product-brave/project-services.json` | 3 hashes inside artifact | 30 | passed | Three frozen queries. |
| discovery-product-searchapi-tier1 | measured discovery | product-searchapi | tier1-distribution | `artifacts/runs/2026-08-26-de-v1/discovery/product-searchapi/tier1-distribution.json` | 3 hashes inside artifact | 27 | passed | Three frozen queries. |
| discovery-product-searchapi-b2b | measured discovery | product-searchapi | b2b-resale | `artifacts/runs/2026-08-26-de-v1/discovery/product-searchapi/b2b-resale.json` | 3 hashes inside artifact | 27 | passed | Three frozen queries. |
| discovery-product-searchapi-project | measured discovery | product-searchapi | project-services | `artifacts/runs/2026-08-26-de-v1/discovery/product-searchapi/project-services.json` | 3 hashes inside artifact | 27 | passed | Three frozen queries. |
| evaluator-preflight-001 | evaluator connectivity | claude-sonnet-4-6 and same-gateway Claude alternatives | n/a | none | local failure records only | 0 scored candidates | failed before scoring | The gateway lists models but has no usable Claude message channel for the configured key. No partial scores exist and no alternative judge has been substituted. |
| evaluator-amendment-001 | evaluator connectivity and protocol amendment | gpt-5.6-sol via Lingyu OpenAI-compatible Responses API | n/a | regenerated v1.1 input manifest | connectivity response retained locally only | 0 scored candidates | passed | Model listing advertised `gpt-5.6-sol`; a `medium`-reasoning strict JSON Schema response succeeded. Formal scoring begins only after the amendment commit. |
| evaluator-runner-amendment-001 | evaluator execution resilience | all OpenAI evaluator batches | n/a | regenerated v1.1.1 input manifest | failure attempts retained locally | 6 previously successful batches unchanged | passed | Uniform three-attempt cap, failure isolation and transport-attempt accounting added without changing model input or score computation. |
| api-evaluator-diagnostic-001 | evaluator infrastructure diagnostic | gpt-5.6-sol via Lingyu | all | 12 evaluation artifacts; failures retained locally | hashes inside successful artifacts | 12 successful / 9 failed batches | excluded from ranking | Failures crossed Tavily, Exa, Brave and SearchAPI. User directed that infrastructure stability must not affect search quality. |
| codex-review-amendment-001 | primary evaluator protocol | runtime-managed Codex, in-session | all | `artifacts/runs/2026-08-26-de-v1/codex-review/` | packet hashes in manifest | 21 blind batches planned | frozen before Codex scores | System/provider identity, provider rank and API scores stay hidden until every Codex decision is frozen. |

## Required artifact stages

- environment and connectivity preflight;
- frozen input manifest;
- one discovery output per system and channel;
- Gemini Full final output;
- entity normalization and cross-system deduplication;
- independent evidence verification;
- raw model scoring;
- blind-audit sample manifest without provider identity;
- aggregate human-audit results;
- calibration decision and calibrated scores;
- category leaderboards, resource metrics and final conclusions.

Committed normalized artifacts may contain public company names, official company URLs, non-personal business evidence, classification results and scores. They must not contain personal contacts, API secrets, request headers, reviewer identities or blind salts.
