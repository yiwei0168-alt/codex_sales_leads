# Measurement protocol

Status: **frozen for measurement on 2026-08-26**

Protocol ID: `multi-source-professional-discovery-v1.2`

Amendment scope: version 1.1 changed the planned API evaluator before any candidate score was produced. Version 1.1.1 changed only API retry handling. Version 1.2 makes a blind in-session Codex review the primary evaluator after the API route succeeded for only 12 of 21 batches. The version 1 discovery prompts, query packs, provider outputs, evaluator rules, scoring rubric and human blind-audit rules are unchanged. API scores are diagnostic only and cannot enter the leaderboard.

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
- The primary common evaluator is this Codex agent working in-session without a scoring API. It reviews randomized blind packets, cannot browse, and does not see system/provider identity or API scores until all 21 decisions are frozen.
- The attempted OpenAI `gpt-5.6-sol` Responses evaluator is retained only as an infrastructure diagnostic. Its successful and failed attempts cannot enter the final leaderboard.
- Run order is fixed in configuration. No measured system sees another system's output until all discovery has completed.

The API evaluator was first amended after the originally frozen Claude route failed every real request. Although a strict-schema `gpt-5.6-sol` probe succeeded, long evaluation batches later failed unevenly across search sources. The user therefore selected Codex direct review so infrastructure stability cannot become a search-quality metric. Final scores do not mix judges: all systems are re-evaluated by Codex under the same blind procedure.

## Confirmed scoring and audit

Role/category is a hard eligibility gate and a separately reported accuracy measure. Eligible candidates receive 45 points for Cudy product/use-case fit, 35 for practical cooperation path, and 20 for evidence reliability. Invalid, duplicate, miscategorized and missing final slots receive zero. Full anchors, aggregation, sampling and calibration rules are frozen in [`05-scoring-and-blind-audit.md`](05-scoring-and-blind-audit.md).

The exact prompt texts and query packs are frozen in [`../config/inputs.json`](../config/inputs.json). The generated input manifest records their SHA-256 hashes before the first measured call.
