# Authenticated process statements and retained runtime packages

Existing MA24-06; G01-G13 only. No additional product confirmation or model-call permission.

## Implemented

- The immutable-image inspector records independently measured `start.mjs` and model-execution artifact hashes. New registrations require complete, distinct artifact paths for their role; old registrations remain readable but cannot supply missing process-artifact evidence.
- Original and candidate model-journal audits retain a record for every verified successful or fallback statement. An old statement has `proof:null`; its signature is not reinterpreted as process evidence.
- The retained acceptance reader rebuilds all original-task and evaluation-arm coverage. Missing, additional, duplicate or reordered receipt coverage is rejected. A missing legacy claim keeps coverage incomplete.
- Under the existing publication lock and latest-registration/time/key/source checks, the package reader compares each claim's signing identity, role, deployment, Node binary, entry and executing artifact to the enrolled package. It never selects a convenient duplicate or falls back to an older registration.
- Final readiness receives both complete authenticated receipt coverage and the separate package-binding result. `runtimeProcessPackagesRevalidated` is a component result, not `productionAgentEquivalent` or permission to activate.

This adds no database migration and does not rewrite old receipts or registrations. Expired/withdrawn registrations, old artifact metadata and legacy process statements remain nonqualifying for the new component.

## Verification

Seven suites / 148 tests, full typecheck and 14-file lint passed. Tests cover missing fallback claims, receipt coverage tamper, wrong Node/entry/role/deployment/enrollment, absent or duplicate artifact registrations, retained publication admission, withdrawal and readiness forwarding. Initial failures were two test typing issues and an incomplete mock missing its signature enrollment; the mock now preserves the final-reread mutation assertion.

Next: run the amended operator-publication verification against fresh isolated databases for both main-agent and collector signing purposes. It measures real immutable image bytes but uses manually constructed **synthetic component claims**; it cannot prove that a model request executed in those images.

## Remaining

The full production execution qualification producer, actual first provider execution, real task/quality acceptance and positive activation remain unfinished. The new source is not yet in fixed product images. Prior `6fd7142a` composition 2592/TLS 4843 remains version-scoped evidence. The next image freeze should include the remaining qualification wiring, rather than repeatedly rebuilding between its component changes.

[Evidence](evidence/ma24-g09-runtime-process-package-binding-2026-10-21.json).
