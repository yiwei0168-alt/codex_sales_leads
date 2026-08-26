# Scoring and blinded human audit

Status: **proposed — pending final user confirmation**

## Eligibility gates

A final candidate must be a unique real company, operate in Germany, be relevant to networking/communications hardware, have a material role in its submitted measured channel, and have sufficient public evidence. A failed gate produces a zero score for that final slot. Current Cudy relationship remains zero-weight metadata.

## Proposed candidate score

Both the scoring model and the human reviewer use integer levels from 0 to 5 for each dimension:

| Dimension | Weight | Conversion |
|---|---:|---:|
| Category-role precision | 35 | level × 7 |
| Cudy product and use-case fit | 30 | level × 6 |
| Practical cooperation path | 20 | level × 4 |
| Evidence directness and reliability | 15 | level × 3 |

Company size, revenue, employee count, website traffic and geographic coverage contribute zero points. Category-specific anchors must allow a small specialist to receive the same maximum score as a large company when role precision, product fit, cooperation path and evidence are equally strong.

## Proposed system aggregation

Each channel has ten fixed final slots. The channel quality score is the sum of its ten candidate scores divided by ten; invalid, duplicate, miscategorized and missing slots score zero. The overall score is the equal-weight mean of the three channel quality scores. Pooled recall and cross-category company ranking are excluded.

Validity/precision, category-placement accuracy, duplicate rate, evidence-supported rate, latency, requests, credits and cost are reported separately. They are not mixed into the quality score.

## Proposed blind audit

The core sample is 20% of the deduplicated company pool, with a minimum of 24 and maximum of 36 unique companies. Sampling is deterministic and stratified across all three categories and raw score bands. The reviewer does not see provider/system identity, Gemini mode, rank, model score, occurrence count or Cudy relationship status.

The reviewer receives the same normalized evidence packet as the scoring model, chooses the valid category independently, evaluates all gates and assigns the same four 0–5 levels. A risk supplement of at most six companies is added only when required and is reported separately from the representative core sample.

## Proposed calibration rules

- target gate agreement: at least 90%;
- target category agreement: at least 90%;
- weighted kappa for score bands: at least 0.75;
- total-score mean absolute error: at most 8 points;
- absolute mean bias within each category: at most 5 points.

If agreement passes, raw model scores remain unchanged and the human result supplies an uncertainty interval. If only the numerical scale is systematically biased, one category-level correction may be applied uniformly to every system, capped at ±8 points. No provider-specific correction is allowed. Gate or category failure requires rubric revision, expanded audit and full-pool rescoring rather than a numeric offset.

Human labels calibrate the scoring procedure uniformly; they do not selectively replace scores only for sampled companies. Raw scores, calibrated scores, agreement measures and all material disagreements are preserved in the final report.
