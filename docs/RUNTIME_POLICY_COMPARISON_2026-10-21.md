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

Three test suites / 25 tests, full typecheck, audit-module lint and the amended database fixture typecheck/lint passed. Targeted fresh database session 76848 exited 0 with graph, policy-comparison and unified review-material checks. Matching 6fd7142a images are built and their package checks passed; current full composition 2592 and separate TLS/database-trust 4843 both exited 0. Product 47be3168 / fixture 6b4f51c9 composition 37984 remains the previous accepted full composition.

Production entrypoint proof, a complete execution qualification producer, real provider/quality acceptance and positive activation remain unfinished. This comparison is one input to that work, not qualification itself.

[Machine-readable evidence](evidence/ma24-g09-runtime-policy-comparison-2026-10-21.json).


2026-10-21 / Targeted database **76848 exited 0** on source `d3be2e7a`, current schema 170/file trust. Execution-policy comparison, persisted graph reconstruction, unified review-material readback, task/tool locks, changed-result fingerprints, persisted-tool tamper rejection and terminal recovery without replay passed. All five recorded source files matched their pre-run hashes at completion. The two result records retain synthetic/provider/qualification boundaries; no human judgment, actual provider call or activation was created. Disposable cluster removed; original three services remain. This does not cover new fixed images or a whole production entrypoint. [Evidence](evidence/ma24-g09-runtime-policy-comparison-2026-10-21.json).


2026-10-21 / Policy-comparison packages fixed at `6fd7142a`: main/collector/Web builds 52551/58079/14172 exited 0; source/Node pair checks, full dependency bytes/ESM, collector isolation/tamper/enrollment and Web source/private-root exclusion passed (1039 source inputs). Collector deployment hash `9b39369a3fdd090f828f0c31fa9b067b2a881528aad2804a62b54942fb2b2ab2`. Full current Linux composition **2592** and separate collector TLS/database-trust **4843** are running, not accepted. Their immutable image IDs and logs are recorded in [evidence](evidence/ma24-g09-runtime-policy-comparison-2026-10-21.json). No actual provider/quality/qualification/activation inferred.


2026-10-21 / Current collector TLS/database-trust **4843 exited 0** for fixed 6fd7142a, including registry disablement waiting for commit and key/purpose/revocation/NODE_OPTIONS rejection; declaration cluster removed. Full Linux composition 2592 remains running, not accepted. Separate G07 existing-account READ ONLY metadata inventory passed: 11 completed main tasks, zero created since 2026-10-15 +08:00, four current-contract metadata candidates, zero timeline candidates. Source payloads and semantic relevance were not validated; this does not grant quality acceptance or establish unchanged old payloads. No model calls/effects/activation. [G07 scope and receipt](evidence/ma24-g07-current-source-metadata-2026-10-21.json); [package/TLS receipt](evidence/ma24-g09-runtime-policy-comparison-2026-10-21.json).


2026-10-21 / Final current fixed composition **2592 exited 0** on matching product/fixture `6fd7142a`. All 10 result records inspected: policy comparison, quota readback/change rejection, case-variant UUID race, five cases/eight ledger tasks, current live-source revalidation, measured registration/provenance and fixed-launcher completed reuse passed. Actual termination after committed customer_timeline read, default-lease natural expiry/new-process recovery, preserved spec/capture/model/tool rows and no replay of completed HTTP steps passed. All five recorded source files remain unchanged. Independent current collector TLS/database-trust 4843 also exited 0. Both disposable clusters are removed; only the original three services remain. Whole-fixture production entrypoint and database TLS are still false; actual model calls 0, production equivalence/qualification/activation false. Real provider/quality and full qualification producer remain pending. [Final current receipt](evidence/ma24-g09-runtime-policy-comparison-2026-10-21.json).
