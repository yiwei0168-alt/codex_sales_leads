# Main Agent acceptance log

## P0 baseline - 2026-09-20

Commit a65bc74; 53 API routes inventoried. Pre-change Vitest: 238 files passed, 1 failed; 1191 tests passed, 2 failed; duration 28.82 seconds. Failures: billing/product-boundaries.test.ts expects missing-tariff but receives expired-tariff as real time advanced. No external model, search or mail calls performed by this verification. Docker API access denied in the restricted process; runtime availability remains unverified. RAG v3 remains active and unchanged. Live main-model/tools, 120-case evaluation and production rollout not performed.

Implementation stages P1-P6 remain pending. This log must distinguish mock, database integration, browser, and real-provider evidence.

## P1 initial implementation - 2026-09-20

Main model uses the OpenRouter tool protocol with one configured model/provider list, data collection denied and fallback disabled. LangGraph alternates model, safe boundary and independently selected tool nodes; no intent classifier is used in the new path. Nine registered read tools expose knowledge search/facts/status/originals, saved companies, tasks and existing memory. Detailed schemas are loaded on demand from the registry. This is read-capability coverage, not P2 full product coverage.

Migration 090 adds forced-RLS runs/events/call journals and composite tenant foreign keys. POST messages supports durable enqueue and idempotency; short SSE event pages resume by Last-Event-ID. Worker leases and PostgreSQL graph checkpoints are independent of the HTTP request. New UI displays run states and pause/resume/cancel/instruction controls. MAIN_AGENT_ROLLOUT is opt-in until release gates pass.

Verified: 8 graph/contract tests (mock tool ordering, pause/resume and no-progress), 15 real PostgreSQL checks with isolated synthetic accounts (idempotency, forged tenant access, fenced lease, receipt reuse, unknown-call detection, event cursors, cancellation and forced RLS). Migration 090 applied; fixtures cleaned, no customer content modified. Typecheck and five LangGraph exports passed. No real model/search/mail calls; actual provider completion and process-restart E2E remain unverified. P1 is not fully accepted; P2-P6 remain pending.

## P2/P3 foundation - 2026-09-20 (not full phase acceptance)

Registry expanded to 18 implemented tools: independent manual company creation, direct draft editing, direct market planning without mandatory three-corpus retrieval, mailbox connection/message/history reads, custom sending, large-plan confirmation, and the explicitly optional legacy development workflow. This does NOT meet the full capability inventory yet; independent evidence/scoring/review/contact/search-provider/admin tool coverage remains outstanding.

Migration 091 adds exact, tenant/run/tool/version/parameter-bound approvals, expiry, denial, revocation and single consumption atomically with the call journal. Approval waiting retains the pending graph tool. API decision is authenticated and is not a registered model tool. UI displays the exact payload. Migration 092 allows account-only mail and hash-bound registered attachments; existing linked mail still updates its actual company/market. Single-item confirmation is implemented; exact batch preview/invalidation and the legacy page's migration to central approval storage remain outstanding.

PRODUCT_FINANCIAL_POLICY=observe enables MA05 across the shared transport/repository: missing/expired rates and native FX quote failures fall back to unknown-cost recording, and old budgets do not deny. Wire safety remains enforced. Blank configuration retains the compatibility policy until rollout. Existing billing regression now correctly accepts either missing or expired tariff in strict-mode tests instead of depending on calendar date.

Checks: 54 focused assertions passed, 24 real PostgreSQL assertions passed, typecheck passed; production build passed before the final minor telemetry/test edits. Database fixtures cleaned. Docker 29.7.2 is available with appropriate process permissions; sandbox isolation itself is not tested. Full regression after the strict-mode tariff-date assertion correction: see subsequent verification record below.

Real-provider probe: public synthetic capability listing, no customer data reads or SMTP. Initial compatibility-policy probes were stopped locally by expired tariff (zero HTTP attempts); after enabling MA05 in the probe process, the configured OpenRouter openai/gpt-5.6-sol / openai route returned HTTP 403 on both attempts (1,384 ms and 413 ms). Valid output 0, downstream use 0, 1 retry; tokens/credits/cash unknown. Task persisted partial, no alternate provider used. This is a real-provider FAILURE, not model quality acceptance. Further live evaluation requires a working authorized route.

Full regression: 241 files, 1,208 assertions passed in 23.99 seconds. Focused lint passed. These local checks do not change the failed real-provider outcome or the pending phase gates.
