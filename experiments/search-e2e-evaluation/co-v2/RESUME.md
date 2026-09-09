# Colombia Search E2E Evaluation Resume Point

Updated: 2026-09-09 (Asia/Shanghai)

## Resume status

The Colombia formal search experiment is complete. Do not rerun discovery, Web search,
evidence acquisition, scoring, or blind review when resuming this task unless the user
explicitly requests a new run.

The published experiment state is commit `0d78e82` (`docs(eval): publish Colombia formal
search results`). That commit is present on both `origin/main` and
`origin/experiment/search-e2e-colombia-v2`.

## Frozen result

- Scope: Colombia; Distributor/VAD, Reseller/VAR, Retailer/E-tailer, and SI/MSP;
  50 requested slots per category per arm.
- Product macro Slot Utility@50: 13.08.
- Gemini control macro Slot Utility@50: 3.28.
- Product delta: +9.80; Product won all four category cells.
- Search-outcome gates passed.
- The overall end-to-end result did not pass because blind-review calibration gates failed.
- Corrected blind metrics include 75% role-family agreement, 66.7% qualification
  agreement, 0.285 within-cell macro Spearman, 0.96 mean bias, and 11.54 MAE.
- Total measured cost: USD 27.1385 against the USD 50 hard cap.
- USD 10 and USD 20 reviews fired and passed. Spend never reached the USD 30 review.
- Product returned 39 candidates across 200 requested slots; 38 were evaluation-valid.
  Gemini returned 60 names, of which 10 were evaluation-valid.

## Resume boundary

On the user's next `resume`, begin with calibration improvement, not another market run:

1. Separate role-family and role-subtype enums and normalize all judge-facing role labels.
2. Pass cached search-stage role findings and mandatory corrections downstream so that
   evidence/correction agents do not repeat work.
3. Define role-specific scoring anchors and deterministic caps using the frozen Colombia
   evidence.
4. Run a no-new-search, frozen-evidence calibration check. It may invoke only the minimum
   judging needed to validate the revised calibration mechanism, with cost recorded.
5. Reassess the blind gates before authorizing another formal market experiment.
6. Address absolute Product fill rate separately; a relative win over Gemini does not make
   39/200 sufficient for production.

The highest-cost acquisition stages remain hybrid discovery, fresh evidence, and correction
search. Preserve the project rule that overlapping work is cached at first occurrence and
that downstream agents reuse the structured evidence and role-correction records.

## Authoritative artifacts

- `artifacts/runs/2026-09-08-co-search-e2e-v2/final/FINAL_ANALYSIS.v2.0.22.md`
- `artifacts/runs/2026-09-08-co-search-e2e-v2/final/SEARCH_E2E_EVALUATION_REPORT.v2.0.0.md`
- `artifacts/runs/2026-09-08-co-search-e2e-v2/final/metrics.json`
- `artifacts/runs/2026-09-08-co-search-e2e-v2/final/hybrid-search-optimization-analysis.json`
- `artifacts/runs/2026-09-08-co-search-e2e-v2/blind-audit/calibration-v2.1.json`

Untracked artifacts under `experiments/multi-source-lead-discovery` predate this checkpoint
and are outside the Colombia task. Preserve them without staging or modifying them.
