# Cudy Colombia end-to-end search evaluation v2.0.0

Generated: 2026-09-09T00:27:42.630Z

## Outcome

Product E2E did not pass the frozen Colombia win gates. Macro Slot Utility@50: Gemini 3.28, Product 13.08, delta 9.80. Product won 4/4 categories. Bootstrap 95% interval: [6.31, 13.51].

## Category results

| Category cell | Gemini utility | Product utility | Delta | Gemini valid | Product valid |
|---|---:|---:|---:|---:|---:|
| CO-retail | 3.30 | 17.96 | 14.66 | 3 | 14 |
| CO-distribution | 4.54 | 19.76 | 15.22 | 3 | 13 |
| CO-si-msp | 3.94 | 5.16 | 1.22 | 3 | 4 |
| CO-resale | 1.34 | 9.44 | 8.10 | 1 | 7 |

## Frozen win gates

| Gate | Actual | Threshold | Result |
|---|---:|---:|---|
| macroGain | 9.799999999999999 | 5 | PASS |
| cellsWon | 4 | 3 | PASS |
| worstMarket | 9.8 | -3 | PASS |
| worstCell | 1.2200000000000002 | -5 | PASS |
| uniqueHighValue | 5 | 1 | PASS |
| bootstrapLowerBound | 6.309875 | 0 | PASS |
| blindAudit | false | true | FAIL |

## Blind audit v2.1

Two independent model families reviewed 32 packets: 24 representative and 8 diagnostic stress cases. Representative role-family agreement 75.0%, qualification agreement 66.7%, within-cell macro Spearman 0.285, mean bias -0.96, MAE 11.54, citation ID alignment 100.0%, entailment 94.1%. Arbitration 27/32; blind gate FAIL.

## Cost, time and utilization

Total budget cost $27.1385 across 901 events: Gemini $0.7109, Product $20.5374, evaluation $5.8903. Unit cost $0.0678 per requested slot and $0.2741 per returned candidate. Summed wall time: Gemini 1.33 minutes, Product 180.78 minutes; time is recorded but is not a win gate.

Utilization telemetry: `{"input":3632,"raw":8576,"valid":6515,"used":3690,"retries":45,"latencyMs":22460244,"validOutputRate":0.7596781716417911,"downstreamUtilization":0.5663852647735994,"discardedOutputReasons":{"confirmedPlanMismatch":1,"providerFailure":1,"duplicate":2213,"provider-rate-limit":34,"circuit-open":73,"provider-http":3,"noFreshEvidence":68,"correctedToAnotherRole":830,"provider-recovery-cooldown":83,"wrongPrimaryRoleOrGate":784,"rejected":293,"retryRequired":37,"stageVolumeAttributedToPrimaryModelEvent":113,"unresolved-company-domain":621,"provider-profile-not-company":645,"unresolvedAfterRecovery":0,"marketplaceRoleRemoved":1,"evidenceScoreCapApplied":15,"provider-transport":9,"two-consecutive-no-value-batches":8,"list-page":23,"providerHttpFailure":2,"schemaInvalid":32,"transportFailure":2,"timeout":1}}`.

## Observed optimization opportunities

- brave: duplicate/normalized ratio was 87.5%; tighten real-time stopping or start this route after cheaper core routes.
- gemini-full: duplicate/normalized ratio was 57.5%; tighten real-time stopping or start this route after cheaper core routes.
- exa: only 3.5% of newly unique output received fractional Top-50 credit; review category-specific activation before removing it.
- google-places: duplicate/normalized ratio was 60.5%; tighten real-time stopping or start this route after cheaper core routes.
- searchapi: produced no new unique company in this run; keep disabled by default for the affected category unless it supplies a distinct capability.
- Do not optimize from Top-N alone in production; use accumulated unique yield, final downstream use, quality and cost by market/category.
- Any route change remains a future versioned product decision and does not alter this frozen experiment.

## Interpretation boundary

This is a cold-start comparison in Colombia across Distributor/VAD, Reseller/VAR, Retailer/E-tailer and SI/MSP. Each arm had 50 requested slots per category. Product used the frozen new hybrid-search, evidence and scoring workflow; Gemini used one un-tuned Google Search interaction per category. Gemini-only companies received the same evidence, role-correction and scoring mechanism after both result sets were frozen. Cooperation paths, strategy, email and contact generation were excluded.
