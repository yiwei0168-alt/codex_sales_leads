# Measurement protocol

Status: **frozen for measurement on 2026-08-26**

Protocol ID: `multi-source-professional-discovery-v1`

Market: Germany (`DE`), with German and English search terminology where applicable.

## Confirmed scope

Three search channels are measured, with ten final candidate companies per channel:

| Channel | Included roles | Final target |
|---|---|---:|
| Tier-1 distribution | Distributor, VAD | 10 |
| B2B resale | Reseller, VAR/DVAR, Dealer | 10 |
| Project services | SI, Installer | 10 |

Retailer/E-tailer, MSP/ISP and Commission Agent are outside this measured round. A discovered company that only belongs to an excluded channel cannot fill a selected-channel slot.

## Confirmed measured systems

- `gemini-full`: Gemini independently performs the complete search, classification, ranking and final output.
- `product-gemini`: Gemini only discovers candidates inside the product workflow.
- `product-tavily`
- `product-google-places`
- `product-exa`
- `product-brave`
- `product-searchapi`

All systems except `gemini-full` use the same downstream entity normalization, evidence verification, role classification, scoring and final selection process. No system may read another system's candidates or outputs before every measured discovery run has finished.

## Confirmed comparison principles

- Companies are scored only against other companies in the same verified channel category.
- The three category scores are reported separately and combined only through equal-weight macro averaging.
- Candidate company size, revenue, employee count, website traffic and geographic market coverage have zero scoring weight.
- Pooled recall is not a ranking metric.
- Current Cudy relationship is zero-weight metadata and receives no dedicated search effort.
- Contacts and personal information are outside the experiment.
- Cost, latency, request count and credits are reported separately from candidate quality.

## Confirmed execution budget

- Each discovery-only provider receives the same three queries per channel and may return at most ten results per query: nine discovery requests per provider.
- `gemini-full` receives one end-to-end prompt and independently returns three ranked lists of ten.
- Provider request retry limit is one retry after a failed attempt; failures and retries remain in the execution journal.
- The common downstream evaluator is Claude Sonnet 4.6 at temperature 0 with a 12,000-token output ceiling.
- Run order is fixed in configuration. No measured system sees another system's output until all discovery has completed.

## Confirmed scoring and audit

Role/category is a hard eligibility gate and a separately reported accuracy measure. Eligible candidates receive 45 points for Cudy product/use-case fit, 35 for practical cooperation path, and 20 for evidence reliability. Invalid, duplicate, miscategorized and missing final slots receive zero. Full anchors, aggregation, sampling and calibration rules are frozen in [`05-scoring-and-blind-audit.md`](05-scoring-and-blind-audit.md).

The exact prompt texts and query packs are frozen in [`../config/inputs.json`](../config/inputs.json). The generated input manifest records their SHA-256 hashes before the first measured call.
