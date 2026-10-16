# G09 model transport receipts — implementation stage

This stage adds an internal collector request factory and a verifier for successful model transport receipts. It does not qualify a production runner, enable a Skill, or close G09.

## Protocol and workflow

- Trust registry keys have explicit `runner-declaration` and/or `model-transport` purposes. Existing entries default to declaration only. A transport key cannot sign a runner declaration unless separately enrolled for that purpose.
- The configured factory requires a controlled production process, an enrolled Ed25519 signing key and the official OpenRouter HTTPS endpoint. It accepts no caller transport or signing key. Model calls retain the existing paid-call admission boundary.
- Each successful receipt binds owner, freeze, evaluation, arm, plan, snapshot, step, route, collector and deployment to the exact request manifest and parsed response semantics. Authentication headers and private keys are not included.
- Response hashing normalizes only tool-call IDs, which the durable journal adapter replaces. Text, function names, arguments, ordering and reasoning remain bound. This is a semantic response receipt, not a raw wire-response signature.
- The request factory observes the actual response status and only signs HTTP 200 results. The journal verifier loads server-side records, requires pending-production source classification and all-successful attempts, validates signed times inside persisted attempt times, rejects reused generation IDs and rechecks records and registry after verification.
- Registry revocation is reloaded on each check. No source classification is promoted by these functions; `automaticActivation` remains false and journal verification reports `binaryVerified: false`.

## Evidence and remaining work

The receipt tests use ephemeral Ed25519 keys, synthetic manifests and a mocked registry loader. They cover signature validity, response semantics, correlation ID replacement, binding changes, revocation, purpose and expiry. Runner declaration tests cover the actual registry parser and purpose separation. These tests make zero model requests.

The next behavioral stage passed 72 tests across five files: request factory (10), journal verifier (11), receipt and declaration verification (35), and existing candidate journal audit (16). Factory tests invoke its guarded transport through a mocked model adapter and mocked network; they cover actual status observation, off-origin requests/responses, fabricated adapter output without transport, process injection settings, freeze revocation and key revocation during a call. Temporary test keys are deleted. Journal tests mock tenantQuery and freeze checks while running the real journal audit, manifest reconstruction and signature verification; they cover tenant query parameters, missing/out-of-bounds attempt times, source/freeze/owner mismatch, repeated generation IDs, changed records and final freeze revocation. This is component integration evidence, not an actual database or deployed provider run.

Whole-project TypeScript checking and targeted ESLint passed. A qualified deployed collector run and actual persistent-database integration still remain. Failure/fallback transport receipts, independent binary/provider qualification, production key provisioning and the final locked activation transaction remain unfinished. No paid-call authorization is inferred from this stage.

No new user-confirmed product rule is introduced. This implements a portion of the existing G09 trusted evidence boundary. The current execution scope remains G01–G13; G14–G20 are deferred.
