# Multi-source professional lead-discovery benchmark — measurement report

> Historical v1.2 report. Its raw leaderboard was rejected by human calibration. The current main conclusion is the [v1.4 independent candidate-value report](v1.4-independent-value-final-report.md).

Status: **historical and superseded for the main ranking; raw measurement preserved**

Protocol: `multi-source-professional-discovery-v1.2` with human-audit amendment `blind-audit-v1.1`

Run: `2026-08-26-de-v1`

## Executive conclusion

The raw Codex scoring placed product + Exa first at 87.53, ahead of Gemini Full at 78.50. That ordering is not accepted as a final benchmark conclusion because the frozen six-case core human audit failed four calibration thresholds: category agreement, weighted score-band kappa, score mean absolute error and per-category mean bias. The raw leaderboard is preserved but remains `provisional-not-calibrated`; no numeric correction has been applied and no winner is declared.

The most important observed weakness is downstream interpretation, not candidate discovery alone. The scorer overvalued generic enterprise infrastructure, cloud or broadcast-network descriptions as evidence of Cudy-relevant networking demand. It also inferred complete cooperation paths from partial service descriptions. Two core candidates that the model treated as valid—Skaylink and BFE—failed the human networking-relevance gate and created errors of 63 and 79 points. Under the frozen protocol, a category failure requires rubric revision, an expanded audit and full-pool rescoring; a simple category offset is prohibited.

The problem sample also showed why low evidence quality must be separated from candidate quality. WLAN-Shop24 was sampled because the model assigned evidence reliability 1, yet the reviewer found a live Cudy listing on its official site and independently gave the same total score, 84. The search result was good; the captured evidence was poor.

## Research question

The benchmark asked whether the product's candidate-discovery workflow, using different discovery providers, produces more precise and commercially relevant German sales leads than Gemini used independently end to end.

Only three confirmed channels were measured:

| Channel | Eligible roles | Final slots |
|---|---|---:|
| Tier-1 distribution | Distributor, VAD | 10 |
| B2B resale | Reseller, VAR/DVAR, Dealer | 10 |
| Project services | SI, Installer | 10 |

Company size, revenue, employee count, website traffic and market coverage had zero score weight. Candidates were compared inside their submitted channel; pooled recall was excluded. The frozen protocol and exact query/prompt inputs are recorded in [`../docs/01-protocol.md`](../docs/01-protocol.md), [`../config/inputs.json`](../config/inputs.json) and [`../artifacts/input-manifest.json`](../artifacts/input-manifest.json).

## Measured systems and execution

Seven systems were measured:

- Gemini Full: one independent end-to-end search, classification and output;
- product + Gemini discovery;
- product + Tavily;
- product + Google Places;
- product + Exa;
- product + Brave;
- product + SearchAPI.io.

Each discovery-only provider received the same three queries per channel and up to ten results per query. Gemini Full received one end-to-end task. The run produced 21 committed discovery artifacts, 540 normalized records and 119 deduplicated companies across 163 scored occurrences. There were 57 measured external discovery requests: 55 planned successful requests and two additional Gemini Full recovery requests caused by an output-parser capture defect. The defect and recovery are recorded in [`../docs/03-execution-log.md`](../docs/03-execution-log.md) and the discovery manifest.

The planned Claude evaluator failed before scoring. An OpenAI-compatible `gpt-5.6-sol` diagnostic succeeded for 12 of 21 batches but failed unevenly across providers; those API results were excluded. All primary raw scores were produced by one complete, in-session Codex blind review. The 21 model decisions were committed at `cc4052c` before deblinding.

## Raw quality scores before human calibration

These are preserved measurements, not an accepted final ranking:

| Raw rank | System | Tier-1 | B2B resale | Project services | Raw macro mean |
|---:|---|---:|---:|---:|---:|
| 1 | product + Exa | 85.10 | 83.80 | 93.70 | 87.53 |
| 2 | Gemini Full | 79.20 | 78.70 | 77.60 | 78.50 |
| 3 | product + Tavily | 76.80 | 59.20 | 88.40 | 74.80 |
| 4 | product + Gemini | 64.70 | 71.00 | 82.40 | 72.70 |
| 5 | product + Brave | 70.50 | 40.40 | 86.40 | 65.77 |
| 6 | product + SearchAPI.io | 66.60 | 29.20 | 84.20 | 60.00 |
| 7 | product + Google Places | 0.00 | 0.00 | 26.00 | 8.67 |

The raw table suggests Exa supplied unusually rich candidate and evidence text, while Google Places snippets were too shallow for this workflow. It does not prove Exa produces the best final leads because the shared scorer was not human-calibrated successfully. The immutable raw and post-audit status artifacts are [`../artifacts/runs/2026-08-26-de-v1/scoring/raw-system-scores.json`](../artifacts/runs/2026-08-26-de-v1/scoring/raw-system-scores.json) and [`../artifacts/runs/2026-08-26-de-v1/scoring/leaderboard-post-human-audit.json`](../artifacts/runs/2026-08-26-de-v1/scoring/leaderboard-post-human-audit.json).

## Human blind audit

The user reduced the audit before recording any decision from 24 core + 6 risk cases to a fixed 6 core + 6 problem cases. The core assigned two companies to each channel and used deterministic score-band stratification. Problem cases were selected separately for cross-category occurrence, evidence reliability at most 1 or a score within five points of 50.

Provider, system, Gemini mode, rank, model score, occurrence count, current Cudy relationship and exact problem trigger remained hidden during review. The 12 completed human decisions were validated and committed at `67fff9a` before the identity map was read. The reviewer did inspect some supplied official-site URLs; those supplemental observations are preserved in notes. Current Cudy relationship itself remained zero-weight, although an official product listing could demonstrate that a purchasing/listing path exists.

### Core calibration metrics

| Metric | Required | Observed | Result |
|---|---:|---:|---|
| Four-field gate agreement | ≥ 90% | 91.67% | pass |
| Complete four-gate vector agreement | descriptive | 66.67% | — |
| Category agreement | ≥ 90% | 66.67% | fail |
| Exact score-band agreement | descriptive | 33.33% | — |
| Quadratic weighted kappa | ≥ 0.75 | 0.471 | fail |
| Score mean absolute error | ≤ 8 | 29.50 | fail |
| Tier-1 absolute mean bias | ≤ 5 | 9.00 | fail |
| B2B resale absolute mean bias | ≤ 5 | 32.00 | fail |
| Project-services absolute mean bias | ≤ 5 | 47.50 | fail |

All six model-minus-human core differences were non-negative, producing an overall +29.5-point model bias. The small six-company core cannot support broad statistical claims; even so, the observed errors are too large and structurally tied to gate/category decisions, so a numeric adjustment would be invalid.

### Material core disagreements

| Company | Model | Human | Finding |
|---|---:|---:|---|
| SCALCOM | 85 | 84 | Strong agreement; both classified it as B2B resale in the sampled anchor, with a VAD/VAR boundary note. |
| Netzwerk-Arzt | 85 | 69 | Valid Installer/project service, but the model overstated product fit and cooperation-path completeness. |
| Red Eagle IT Distribution | 85 | 80 | Strong agreement on Tier-1/VAD; human noted possible sub-distributor procurement. |
| Infinigate Deutschland | 75 | 62 | Correct VAD role, but generic enterprise-network evidence did not establish high Cudy product fit. |
| Skaylink | 63 | 0 | Human rejected networking relevance; cloud and consulting language did not prove Cudy-relevant hardware activity. |
| BFE Studio und Medien Systeme | 79 | 0 | Human rejected networking relevance; broadcast/IP integration did not prove overlap with Cudy target products. |

### Problem-sample diagnoses

| Company | Frozen trigger | Model → human | Diagnosis |
|---|---|---:|---|
| WLAN-Shop24 | evidence reliability ≤ 1 | 84 → 84 | Excellent candidate hidden behind weak captured evidence; reviewer found a live Cudy listing. |
| smaRTtechnik | evidence reliability ≤ 1 | 75 → 51 | Wrong submitted domain (`.de` instead of `.eu`), enterprise-oriented Installer and overstated brand/procurement path. |
| SoftwareOne Deutschland | score near 50 | 54 → 0 | Human found insufficient networking-hardware relevance. |
| ADN | evidence reliability ≤ 1 | 84 → 58 | Valid VAD, but evidence URL pointed to Westcon and product fit was overstated. |
| Avanis | cross-category occurrence | 92 → 80 | Valid company, but primary role is Tier-1 Distributor/VAD rather than the sampled B2B-resale anchor. |
| IT-HAUS | evidence reliability ≤ 1 | 77 → 93 | Strong VAR + SI candidate; captured evidence was weak, while official-site product fit was high. |

The full frozen decisions and deblinded comparison are stored in [`../artifacts/runs/2026-08-26-de-v1/scoring/human-audit-decisions.blind.json`](../artifacts/runs/2026-08-26-de-v1/scoring/human-audit-decisions.blind.json) and [`../artifacts/runs/2026-08-26-de-v1/scoring/human-audit-comparison.json`](../artifacts/runs/2026-08-26-de-v1/scoring/human-audit-comparison.json).

## Calibration decision

Calibration failed because category agreement was below threshold. Under the confirmed rules:

- raw scores remain unchanged for reproducibility;
- the raw ordering remains provisional and is not a final result;
- no provider-specific correction is allowed;
- no uniform numeric offset may be applied to repair gate or category errors;
- the rubric must be revised, the audit expanded and the full candidate pool rescored before a winner can be declared.

## Root causes supported by the audit

1. **Networking relevance is too permissive.** Broad phrases such as cloud connectivity, edge infrastructure, broadcast IP or enterprise infrastructure were treated as sufficient overlap with Cudy's Router, AP, Mesh, Switch and cellular-CPE use cases.
2. **Product fit is inferred from category rather than verified assortment.** VAD, SI or System House status often produced a high fit score without named relevant product families, brands, listings or projects.
3. **Cooperation paths are over-completed.** Installation or consulting evidence was expanded into assumed procurement, specification or brand-selection influence.
4. **Evidence capture is not source-safe enough.** The audit found a wrong official domain, company/source URL mismatch, duplicate evidence presented twice and generated “Here are 10” lists attached to official URLs as if they were direct source excerpts.
5. **Hybrid-role resolution needs stronger priority rules.** Avanis appeared in Tier-1 and B2B resale; the public customer mix supports Distributor/VAD as the primary role. VAR + SI combinations such as IT-HAUS need a declared primary category plus secondary roles.
6. **Evidence quality and candidate quality are conflated.** WLAN-Shop24 and IT-HAUS were good candidates with poor captured evidence. A weak snippet should trigger official-site verification, not automatically suppress the lead.

## Required corrective iteration

Before rerunning the leaderboard:

1. require explicit overlap with Cudy core product families or target use cases for the networking-relevance gate;
2. verify canonical company domains and enforce source-company alignment before scoring;
3. distinguish direct official text, independent corroboration, provider enrichment and generated list summaries;
4. deduplicate identical evidence before reliability scoring;
5. cap cooperation-path levels when procurement, listing, specification or brand-selection control is not demonstrated;
6. add deterministic primary-role rules based on whom the company supplies and who controls the transaction;
7. recollect official evidence for the full candidate pool, rerun the same scorer and perform an expanded blind audit.

## Resource and cost reporting

The measured discovery stage used 57 external requests and produced 540 normalized records. Each product discovery provider used nine successful requests; Gemini Full used three actual attempts for one retained response. Provider latency, token and credit fields are preserved in the individual artifacts where exposed. Providers report incompatible resource units and several do not expose billable cost, so no fabricated cross-provider currency total is presented. Resource measures remain separate from lead-quality scores.

## Limitations

- one country, one date and three of the six planned search channels;
- three query formulations per channel;
- only six representative human cases after the user-approved workload reduction;
- supplemental official-site checks gave the human reviewer more evidence for some cases than the model packet contained;
- public non-disclosure of inventory, procurement or partners cannot be treated as proof that they do not exist;
- no personal contacts or outreach conversion outcomes were measured;
- current Cudy relationship was intentionally zero-weight.

## Final conclusion

The experiment does not currently demonstrate that the product is better than Gemini. It does show that Exa supplied the strongest raw candidate pool under the current pipeline and that specialized search can discover valuable smaller companies such as WLAN-Shop24. However, the downstream evidence-verification and professional-role reasoning layer is not reliable enough to convert that discovery advantage into a defensible final ranking. The next improvement priority is therefore not adding another search provider; it is enforcing source-safe evidence collection, stricter Cudy-specific relevance and explicit transaction-path reasoning, followed by full rescoring and a new blind calibration round.
