# Shared ordinary and registered-candidate graph limits

Existing MA24-06, current execution scope G01-G13. No budget increase or new provider-call authorization.

The ordinary graph's unchanged limits (80 model decisions and 400 graph iterations) now come from `MAIN_AGENT_EXECUTION_LIMITS`. Registered candidate execution and independent registered-journal reconstruction use the same recursion limit of 400. The standalone saved-result mechanism retains its previous `maximumModelCalls * 32` recursion behavior.

Candidate trials retain their independent 1-64 model-call quota, default 8; financial admission, frozen source guards, control handling and production qualification are unchanged. Sharing graph limits does not prove full budget or control equivalence.

## Verification

- 55 tests across candidate, ordinary graph and recorded-audit suites passed. A valid repeating 12-read response sequence reaches `GraphRecursionError` at the same boundary in ordinary and registered candidate graphs, with identical model/tool invocation counts. This uses synthetic local callbacks only.
- The explicit one-model-call trial quota still stops after one model callback. The ordinary graph accepts the last permitted decision at step 79, retains its read output, and stops at step 80 without another model call.
- Full typecheck and five-file lint passed. The first new test incorrectly submitted 140 calls in one model response, exceeding the existing 12-call schema; it was replaced with valid multi-turn responses. The product reply schema was not loosened.

This change has not yet been included in a new immutable package or actual database composition. Lifecycle session 78222 is pinned to earlier source 7dbab64c and does not validate this change. Real quality, provider identity and production equivalence remain incomplete; automatic activation remains unavailable.

[Stage receipt](evidence/ma24-g09-shared-runtime-graph-limits-2026-10-21.json).
