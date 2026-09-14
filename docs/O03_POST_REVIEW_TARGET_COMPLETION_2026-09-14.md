# O03 final-qualified target decision — stage 176 (2026-09-14)

Status: implemented and verified with synthetic workflow inputs. This is a production wiring correction under the user's existing O01–O05 approval; it is not a new scoring rule or Colombia benchmark rerun.

## Defect and correction

The graph previously decided whether to search again immediately after primary scoring. Independent assessment review ran only after that decision. A primary eligible lead could be downgraded or marked `retry-required`, leaving fewer final qualified leads than the requested target even though the graph had already stopped discovery.

The graph now reviews completed primary assessments before each continuation decision. `acceptedCandidateCount`, no-final-round streak and `targetCompletionReason` are set from the reviewed assessment set. A downgrade can trigger another existing search round, subject to the unchanged five-round, provider-health and evidence-based exhaustion stops. A review that requires targeted research pauses as `processing-incomplete` without claiming a market shortage or launching another search. Original primary assessments remain in the checkpoint so later rounds reuse their exact scoring and review contracts; final reviewed assessments alone go to handoff and persistence. The score-stage telemetry labels its counts as pre-review, while the review-stage telemetry records final count and stop reason.

The read-only A11 preview now shares the graph's five-round ceiling and exposes at most 20 scheduled route actions for the four-step minimal route. This is an action count, not a request or price ceiling: conditional steps, retries, server-side searches, evidence work and per-candidate model phases still require independent bounds. `totalRunBoundUsd` remains `null` and no paid business run was started.

## Verification and limits

- Synthetic two-round graph: first primary eligible company is downgraded in review; a second unique company is discovered, scored and retained as the final eligible result. The first primary score remains reusable on round two. No eligibility threshold, role scope or company identity is relaxed.
- Synthetic targeted-research graph: review changes a completed score to `retry-required`; the checkpoint retains `processing-incomplete`, does not persist, and does not search again.
- Existing recovery, routing, cache and stop tests pass. Full suite: 1,017 tests / 207 files; TypeScript, production build and lint pass (11 pre-existing warnings, no errors). Read-only preflight: USD12.324404 occupied of USD30, USD17.675596 remaining, zero provider calls.

The frozen Colombia 39 output slots / 38 unique evaluation companies and all historical loss classifications remain unchanged. The synthetic case proves control flow, not a measured increase in real-market fill rate. Actual review provider behavior, full conservative run cost, fresh FX and the real A11 business closure remain unverified; the USD30 cumulative gate and unknown historical charges are unchanged.
