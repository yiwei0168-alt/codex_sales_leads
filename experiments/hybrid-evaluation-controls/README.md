# Prospective qualification controls and discovery candidate

`runGuardedBatch` preflights every saved trace before submitting any missing scheduled task and stops on the first newly observed HTTP 402. It propagates submission uncertainty without retrying or assigning zero charges. The caller must use an exclusive claim and durable observation/trace persistence, as existing evaluation runners do. This guard is for the next registered runner; frozen V11 was not retroactively modified. Six orchestration tests and a read-only replay against V11 traces verify that a future missing task is never submitted when any saved trace contains 402.

## Product candidate

Set `HYBRID_KNOWLEDGE_DISCOVERY=1` only in the new isolated runner process before configuration capture. It selects `hybrid-auto-v2-discovery` at enqueue time. Default and historical `hybrid-auto-v1` jobs retain their exact prompt. Historical manual modes are unchanged. No model profile, route threshold, tool permission, sharing, publication or financial policy changes.

The candidate distinguishes an ambiguous request for a particular document from a criteria-based product recommendation. For the latter, search the authorized scope first, then verify candidates against returned originals and approval/version evidence. Search order alone does not prove relevance or approval. Never select another account's private content, invent IDs or turn missing evidence into a negative specification. An unresolved requirement may be reported conditionally where evidence supports that; genuinely blocking ambiguity still requires clarification. This is a prompt candidate, not an enforced guarantee of model behavior.

## Historical V11 follow-up registration (retained)

1. Restore usable OpenRouter credit capacity. Read-only balance checks do not authorize charging or prove that every larger request will be admitted.
2. Register and freeze a new run with the candidate policy, unchanged task prompts and quality/cost/time gates, all current source/model/fixture hashes and the guard included. Never reuse V11's freeze or relabel its outcomes. Keep its 12 unknown charges and the earlier 33 separate.
3. Re-run the six-task first repeat (18 new submissions), including P20 unchanged. Before proceeding to the other 36, require the existing >=95% correct-completed gate, full required source coverage and zero critical violations. Reviewer requests are also one-shot; stop further review submissions on a confirmed 402.
4. Include separate challenge cases: ambiguous specific document, cross-account request, approved/current vs draft/stale candidates, missing PoE budget, total vs PoE port ambiguity. These must not be replaced by prompt-string tests or called independent Gold.
5. Only after quality passes, complete all three repetitions and apply the original cost/latency gates with full submitted-cost accounting. Then continue the outstanding full-24 and live-external strata. This small known-family development test cannot establish whole-product acceptance.

No paid request was made to validate this new policy while credit-blocked. Default production settings and running services remain unchanged.

## After V14: graceful batch controls

`guarded-batch.mjs` is the frozen historical HTTP-402-only guard. Do not retrofit completed versions with different stop semantics.

New runs can register `controlled-batch.mjs`: supply `stopRequested: () => fileStopRequested(runtimeStopPath)` and freeze `maximumConsecutiveTransportFailures` (default 2). Create the separate runtime STOP file to request an operator stop. The current task finishes and saves its trace/observation; the scheduler checks the signal before the next submission. Do not kill a process based on observing a result file: the next task may already be running. In-flight model transports retain their existing bounded deadlines.

Two successive tasks with transport/stream failures stop further new tasks; HTTP 402 stops immediately. Saved failures are checked too. This is an aborted qualification, not success on the remaining subset. Keep all submitted tasks, unknown charges and missing observations in the final denominator. A new frozen run is required after changing code, configuration or the stop policy. No task/provider retries, automatic zero-cost inference, or permission changes.
