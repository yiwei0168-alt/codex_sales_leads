# Hybrid evaluation v3 — compact output diagnostic

Fresh, bounded P09 A/B/C diagnostic, registered before execution. This does not resume or replace any unknown v1/v2 request. Six historical charges remain unknown; no refunds, zero-cost inference or bill reconciliation is implied. Production is unchanged.

- Test only P09 (12 companies, latest-contact date sorting), repetition 1, original paired order **B, A, C**. Three new run identities; same synthetic database and business facts. A uses dynamic planning with the deep profile, B hybrid with the same profile, C production automatic profiles. Keep existing Jev policy, timeouts, fallback rules and financial policy.
- New interpreter guidance requires filtering/sorting/aggregation before return, with requested fields, source IDs/URLs and coverage. A model-facing program value above **12,000 JSON characters** is withheld with explicit partial status and receipt references; original journal evidence remains complete. No silent truncation. This is an implementation parameter under evaluation, not a user-confirmed quality gate. Fixed workflows are unaffected.
- Capture allowlisted exception names and nested cause codes (depth 4), never messages, URLs, headers, credentials or private input. Diagnostic metadata does not authorize retry or prove charging state.
- Offline replay first: saved P09/B receipts produce the same 12 sorted rows and latest-mail IDs in 3,734 rather than 37,969 value characters, with no new model/tool calls. This is not a measured latency/cost improvement.
- Each task retains max 24 HTTP attempts and 10 minutes. Trace export disabled only in runner. Stop at the first partial/failed answer or unknown charge; never replay a claimed task. The old v2 batch stays stopped.
- This fresh diagnostic is not the full 18-task smoke, 216-run comparison or independent route/answer acceptance. No new paid label review, public search, email sending or production deployment.

Run `freeze.mjs`, `performance-run.ts freeze`, then `smoke.mjs` using the existing TypeScript launcher. Runtime/source freezes and raw traces live in `.local-runtime/hybrid-evaluation-v3`; only sanitized results are committed. `collect-results.mjs` and `check-p09-answers.mjs` produce summaries and deterministic checks, not independent semantic quality scores.
