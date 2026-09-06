# Cudy UK/Mexico end-to-end search evaluation v1.0.15

Generated: 2026-09-06T20:48:18.152Z

## Outcome

Quality conclusion is inconclusive because the independent blind-audit gate failed after the frozen sample rule.

Macro Slot Utility@30 was 36.31 for Gemini and 59.00 for Product E2E, a delta of 22.69. Product won 7/8 cells. The stratified 10,000-iteration bootstrap 95% interval was [18.48, 26.92]. Runtime is not a win gate: summed cell wall time was 4.52 minutes for Gemini and 120.58 minutes for Product.

## Cell results

| Cell | Gemini utility | Product utility | Delta | Gemini valid | Product valid |
|---|---:|---:|---:|---:|---:|
| MX-retail | 51.50 | 47.90 | -3.60 | 24 | 21 |
| GB-distribution | 70.40 | 80.67 | 10.27 | 27 | 30 |
| MX-si-msp | 25.10 | 73.93 | 48.83 | 11 | 30 |
| GB-resale | 21.77 | 61.23 | 39.47 | 10 | 26 |
| MX-distribution | 54.03 | 74.10 | 20.07 | 23 | 30 |
| GB-retail | 33.77 | 41.57 | 7.80 | 15 | 18 |
| MX-resale | 0.00 | 22.27 | 22.27 | 0 | 11 |
| GB-si-msp | 33.93 | 70.37 | 36.43 | 16 | 30 |

## Frozen win gates

| Gate | Actual | Threshold | Result |
|---|---:|---:|---|
| macroGain | 22.69166666666667 | 5 | PASS |
| cellsWon | 7 | 6 | PASS |
| worstMarket | 21.891666666666666 | -3 | PASS |
| worstCell | -3.6000000000000014 | -5 | PASS |
| uniqueHighValue | 40 | 1 | PASS |
| bootstrapLowerBound | 18.47895833333333 | 0 | PASS |
| blindAudit | false | true | FAIL |

Market deltas: GB 23.49, MX 21.89. Unique 75+ companies: Gemini 50, Product 90.

## Blind-audit calibration

Sample 64; primary-role agreement 60.9%; qualified-status agreement 70.3%; Spearman 0.691; mean bias 2.91; MAE 10.75; citation alignment 100.0%. Result: FAIL.

## Cost and utilization

Total budget cost: $24.9223 across 495 events. Ledgers: Gemini $1.8782, Product $18.8099, evaluation overhead $4.2342. Unit cost: $0.0519 per requested slot, $0.0586 per returned final candidate, $0.0774 per valid candidate, $0.1093 per 65+ candidate and $0.1780 per 75+ candidate.

| Product discovery provider | Requests | Raw | New unique | Duplicate hits | Fractional Top-30 credit | Paid credits | Discovery cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| brave | 55 | 994 | 240 | 744 | 0.00 | 55.00 | $0.1700 |
| exa | 28 | 219 | 174 | 45 | 0.00 | 28.00 | $0.3440 |
| google-places | 22 | 203 | 143 | 60 | 0.00 | 22.00 | $0.5250 |
| searchapi | 105 | 417 | 135 | 263 | 0.00 | 49.00 | $0.2680 |
| gemini-full | 10 | 166 | 113 | 53 | 0.00 | 10.00 | $0.5040 |

## Hybrid-search optimization analysis

- brave: only 0.0% of newly unique output received fractional Top-30 credit; review category-specific activation before removing it.
- brave: duplicate/normalized ratio was 75.6%; tighten real-time stopping or start this route after cheaper core routes.
- exa: only 0.0% of newly unique output received fractional Top-30 credit; review category-specific activation before removing it.
- google-places: only 0.0% of newly unique output received fractional Top-30 credit; review category-specific activation before removing it.
- searchapi: only 0.0% of newly unique output received fractional Top-30 credit; review category-specific activation before removing it.
- searchapi: duplicate/normalized ratio was 66.1%; tighten real-time stopping or start this route after cheaper core routes.
- gemini-full: only 0.0% of newly unique output received fractional Top-30 credit; review category-specific activation before removing it.
- Do not optimize from Top-N alone in production; use accumulated unique yield, final downstream use, quality and cost by market/category.
- Any route change remains a future versioned product decision and does not alter this frozen experiment.

## Interpretation boundary

This is a cold-start comparison in two markets and four categories. Product used its frozen multi-stage workflow; Gemini used one interaction per cell with Google Search and no follow-up. Gemini-only final companies were evaluated with the same evidence/correction/scoring mechanism as product companies, without changing Gemini rank. Independent blind audit calibrated the shared scoring rather than redundantly rescoring every company.
