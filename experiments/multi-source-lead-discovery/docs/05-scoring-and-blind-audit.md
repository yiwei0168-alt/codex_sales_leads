# Scoring and blinded human audit

Status: **confirmed and frozen on 2026-08-26; judge-only amendment in v1.1 and transport-only amendment in v1.1.1**

All raw model scores use one evaluator configuration: OpenAI `gpt-5.6-sol`, Responses API, `medium` reasoning and strict JSON Schema. The application recomputes the 45/35/20 total from returned integer levels and forces failed gates to zero, so the model cannot directly set its total score. The earlier Claude route produced no candidate score and is not mixed into the results.

## Eligibility gates

A final candidate must be a unique real company, operate in Germany, be relevant to networking/communications hardware, have a material role in its submitted measured channel, and have sufficient public evidence. Role/category is a hard eligibility gate and is also reported as a separate category-placement accuracy metric; it is not part of the weighted 100 points. A failed gate produces a zero score for that final slot. Current Cudy relationship remains zero-weight metadata.

## Candidate score

Both the scoring model and the human reviewer use integer levels from 0 to 5 for each dimension:

| Dimension | Weight | Conversion |
|---|---:|---:|
| Cudy product and use-case fit | 45 | level × 9 |
| Practical cooperation path | 35 | level × 7 |
| Evidence directness and reliability | 20 | level × 4 |

`candidate score = product level × 9 + cooperation level × 7 + evidence level × 4`.

Company size, revenue, employee count, website traffic and geographic coverage contribute zero points. Category-specific anchors must allow a small specialist to receive the same maximum score as a large company when product fit, cooperation path and evidence are equally strong.

### Level anchors

Product/use-case fit ranges from 0 (no relevant overlap) through 3 (clear material networking overlap) to 5 (direct, exceptionally strong overlap with core Cudy product families and target use cases). It measures relevance, not company scale or breadth for its own sake.

Cooperation path ranges from 0 (no plausible decision or transaction influence) through 3 (plausible, evidence-supported control or influence) to 5 (multiple direct, verified levers with no known structural blocker). For Tier-1 this means brand onboarding, direct procurement/import and downstream supply; for B2B resale it means purchasing, listing, quotation and recommendation; for project services it means design, specification, BOM, procurement and deployment. An eligible Installer that only installs customer-supplied equipment can have a low cooperation score without failing the Installer role gate.

Evidence reliability ranges from 0 (no usable support) through 3 (direct official evidence or multiple credible corroborating sources) to 5 (direct official evidence plus independent corroboration for the material role and fit claims). Unknown or undisclosed facts are not converted into negative claims.

## System aggregation

Each channel has ten fixed final slots. The channel quality score is the sum of its ten candidate scores divided by ten; invalid, duplicate, miscategorized and missing slots score zero. The overall score is the equal-weight mean of the three channel quality scores. Pooled recall and cross-category company ranking are excluded.

Validity/precision, category-placement accuracy, duplicate rate, evidence-supported rate, latency, requests, credits and cost are reported separately. They are not mixed into the quality score.

## Blind audit

The core sample is 20% of the deduplicated company pool, with a minimum of 24 and maximum of 36 unique companies. Sampling is deterministic and stratified across all three categories and raw score bands. The reviewer does not see provider/system identity, Gemini mode, rank, model score, occurrence count or Cudy relationship status.

The reviewer receives the same normalized evidence packet as the scoring model, chooses the valid category independently, evaluates all gates and assigns the same three 0–5 levels. A risk supplement of at most six companies is added only when required and is reported separately from the representative core sample.

## Calibration rules

- target gate agreement: at least 90%;
- target category agreement: at least 90%;
- weighted kappa for score bands: at least 0.75;
- total-score mean absolute error: at most 8 points;
- absolute mean bias within each category: at most 5 points.

If agreement passes, raw model scores remain unchanged and the human result supplies an uncertainty interval. If only the numerical scale is systematically biased, one category-level correction may be applied uniformly to every system, capped at ±8 points. No provider-specific correction is allowed. Gate or category failure requires rubric revision, expanded audit and full-pool rescoring rather than a numeric offset.

Human labels calibrate the scoring procedure uniformly; they do not selectively replace scores only for sampled companies. Raw scores, calibrated scores, agreement measures and all material disagreements are preserved in the final report.
