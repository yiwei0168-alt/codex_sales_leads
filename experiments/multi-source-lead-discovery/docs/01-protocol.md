# Measurement protocol

Status: **design in progress — scoring awaits final user confirmation**

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

## Decisions awaiting final freeze

- final candidate-level dimension weights and score anchors;
- treatment of invalid, duplicate, miscategorized and missing slots;
- blind-audit sample size, acceptance thresholds and calibration procedure;
- per-provider query/request budgets and result-pool depth;
- exact independent scoring-model identity and version.

Once these decisions are confirmed, this document receives a frozen version, date and SHA-256 hash before any measured call begins.
