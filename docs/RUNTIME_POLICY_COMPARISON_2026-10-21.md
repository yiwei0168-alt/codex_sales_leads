# Runtime execution policy comparison

Existing MA24-06; current scope G01-G13. No new product confirmation or paid-call authorization.

## Implementation

The completed runtime audit now adds a server-derived execution-policy comparison after full graph/tool/model reconstruction and the final source/journal recheck. Its hash is part of the audit projection, so declared quota and observed usage cannot be silently substituted in a stored reference.

- The stored trial quota remains 1-64 decisions (default 8); shared graph limits remain 80 model steps and recursion 400.
- Decision count and model-attempt receipt count are separate: fallback routes do not consume additional graph decisions. Receipt counts do not claim fresh network calls.
- Completed decisions above the stored quota, fewer attempt receipts than decisions, missing policy, or altered graph limits are rejected.
- The comparison records the stricter quota and frozen-source rejection versus ordinary live replanning. Historical/safety saved-receipt reads are distinguished from registered prospective live reads.
- Matching graph limits does not establish ordinary lifecycle equivalence, provider authenticity, quality or activation. Final activation still requires its existing complete proof.

The projection hash changes with this source version. Historical fixed-version evidence remains scoped to that version; old references are not rewritten or migrated. Newly frozen trials must use a matching runtime identity and their own current audit projection.

## Evidence and remaining work

Three test suites / 25 tests, full typecheck, audit-module lint and the amended database fixture typecheck/lint passed. Targeted fresh database session 76848 exited 0 with graph, policy-comparison and unified review-material checks. No fixed images have been built for this comparison change; product 47be3168 / fixture 6b4f51c9 composition 37984 remains the previous accepted version.

Production entrypoint proof, a complete execution qualification producer, real provider/quality acceptance and positive activation remain unfinished. This comparison is one input to that work, not qualification itself.

[Machine-readable evidence](evidence/ma24-g09-runtime-policy-comparison-2026-10-21.json).


2026-10-21 / Targeted database **76848 exited 0** on source `d3be2e7a`, current schema 170/file trust. Execution-policy comparison, persisted graph reconstruction, unified review-material readback, task/tool locks, changed-result fingerprints, persisted-tool tamper rejection and terminal recovery without replay passed. All five recorded source files matched their pre-run hashes at completion. The two result records retain synthetic/provider/qualification boundaries; no human judgment, actual provider call or activation was created. Disposable cluster removed; original three services remain. This does not cover new fixed images or a whole production entrypoint. [Evidence](evidence/ma24-g09-runtime-policy-comparison-2026-10-21.json).
