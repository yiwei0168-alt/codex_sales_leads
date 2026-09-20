# Main Agent acceptance log

## P0 baseline - 2026-09-20

Commit a65bc74; 53 API routes inventoried. Pre-change Vitest: 238 files passed, 1 failed; 1191 tests passed, 2 failed; duration 28.82 seconds. Failures: billing/product-boundaries.test.ts expects missing-tariff but receives expired-tariff as real time advanced. No external model, search or mail calls performed by this verification. Docker API access denied in the restricted process; runtime availability remains unverified. RAG v3 remains active and unchanged. Live main-model/tools, 120-case evaluation and production rollout not performed.

Implementation stages P1-P6 remain pending. This log must distinguish mock, database integration, browser, and real-provider evidence.

## P1 initial implementation - 2026-09-20

Main model uses the OpenRouter tool protocol with one configured model/provider list, data collection denied and fallback disabled. LangGraph alternates model, safe boundary and independently selected tool nodes; no intent classifier is used in the new path. Nine registered read tools expose knowledge search/facts/status/originals, saved companies, tasks and existing memory. Detailed schemas are loaded on demand from the registry. This is read-capability coverage, not P2 full product coverage.

Migration 090 adds forced-RLS runs/events/call journals and composite tenant foreign keys. POST messages supports durable enqueue and idempotency; short SSE event pages resume by Last-Event-ID. Worker leases and PostgreSQL graph checkpoints are independent of the HTTP request. New UI displays run states and pause/resume/cancel/instruction controls. MAIN_AGENT_ROLLOUT is opt-in until release gates pass.

Verified: 8 graph/contract tests (mock tool ordering, pause/resume and no-progress), 15 real PostgreSQL checks with isolated synthetic accounts (idempotency, forged tenant access, fenced lease, receipt reuse, unknown-call detection, event cursors, cancellation and forced RLS). Migration 090 applied; fixtures cleaned, no customer content modified. Typecheck and five LangGraph exports passed. No real model/search/mail calls; actual provider completion and process-restart E2E remain unverified. P1 is not fully accepted; P2-P6 remain pending.
