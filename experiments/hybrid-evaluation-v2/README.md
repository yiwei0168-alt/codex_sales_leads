# Hybrid evaluation amendment v2 — 2026-11-09

This is a fresh version, not a retry or replacement of v1 outcomes. Preserve v1's four unknown provider charges and stopped P09/B attempt. All v2 task identities include a new runtime hash. Production deployment remains unchanged.

## Changes registered before new model calls

- Interpreter ABI `interpreter-time-receipts-v1`: explicit timestamp conversion via `tools.time`, same-run original leaf receipts via `tools.receipt`. Date/current clocks remain unavailable. Existing source, tenant, capability, lease and instruction checks apply. No new external tool permissions.
- Full runtime source freeze includes new untracked product files, not just previous tracked files. Original v1 design assets, prompts, proposed labels, synthetic business facts and paired order stay unchanged and are hash-bound by the v2 manifest.
- Disable LangSmith/LangChain tracing only in the runner process before graph imports. No trace-network retries in timed work. Freeze this setting for all arms. V1/v2 timings must not be pooled.
- Six-task smoke starts afresh in the original paired order (18 executions, first repetition). A uses dynamic planning, B hybrid with the same deep model profile, C production automatic profiles. Existing model fallback and financial policy stay in effect. Each task retains the 24 HTTP attempt / 10 minute limits.
- Stop the batch on the first non-answer **or unresolved provider charge**. Never replay claimed tasks or hide failed/uncertain requests. New versions do not reconcile historical charges.
- Only synthetic mail and private text knowledge are bound. No production data, public research, live email, score publication or deployment. Pagination remains unqualified (12 companies versus actual page size 20). Sales/external fixtures, independent holdout labels and blinded answer quality remain outstanding. Do not run the full 216 tasks or claim savings yet.

## Verification and execution

`replay.ts` reuses the previous P09 snapshot, including the company-list receipt and all 12 timeline receipts, through the new interpreter API. No model, database or tool dispatch. `journal-check.ts` separately exercises real journal loading in the isolated database and rejects other runs/accounts/scopes without provider calls.

After relevant tests/typecheck/lint: run `node experiments/hybrid-evaluation-v2/freeze.mjs`, then `node scripts/run-tsx.cjs experiments/hybrid-evaluation-v2/performance-run.ts freeze`, then `node experiments/hybrid-evaluation-v2/smoke.mjs`. Shared synthetic database binding stays at localhost:55439; run state/results are saved under `.local-runtime/hybrid-evaluation-v2`. Raw model traces remain ignored and are not committed.
