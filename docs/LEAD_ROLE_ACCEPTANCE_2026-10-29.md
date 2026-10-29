# Channel discovery acceptance

This procedure extends sales-lead acceptance; prior email/customer Q&A acceptance does not establish discovery quality.

## Scope and execution

Keep each requested channel role in a separate search plan with its own target. The current taxonomy has 13 roles: Distributor, VAD, VAR, Dealer, Reseller, Retailer, E-tailer, SI, Installer, MSP, ISP, Agent and Brand Owner. OEM/ODM is a cooperation opportunity, not another role. Country and target values, action identities and actual business evidence are recorded in local acceptance records.

Start one case, verify the complete execution and review its companies before proceeding through the remaining roles. Do not equate a created plan, synthetic test, provider configuration or queued job with an executed search or accepted result.

## Operational prerequisites

The verified local starter supports an optional sixth `lead` component. After validating the existing runtime, `node scripts/configure-local-lead-worker.mjs` builds a content-addressed worker and updates its manifest without starting a search. `node scripts/start-local-runtime.mjs start` starts/adopts configured components. Changes to an already running component require an idle, identity-checked cutover; configuration alone does not replace an existing process.

Provider configuration is explicitly forwarded, including the legacy SearchAPI key alias. No credential values belong in logs or Git. Transient queue polling failures use bounded database deadlines and recovery; executed jobs retain their existing checkpoint and paid-effect protection.

Product-family labels must not hide current V3 model evidence. If product retrieval lacks structured/text corroboration, retry within the same authorized product collection without an exact-model family filter. Existing authority, visibility and pre-search corroboration gates still apply.

Plan generation explicitly disables streaming. LangGraph message listeners otherwise turn an ordinary model invocation into a streaming request, which conflicts with this structured-output request contract. Keep the request safety gate intact.

## Required evidence per case

1. Confirm role, country and independently requested target from the stored plan.
2. Inspect completed graph stages and actual provider/search records. Report selected providers, errors, skipped providers and early stopping accurately; configuration is not execution evidence.
3. Verify deduplication, evidence collection, any enrichment rounds and scoring actually recorded for the case. Report unmet evidence requirements and candidates rejected or awaiting processing.
4. Open each qualified company's public source: confirm identity, country presence, channel role and networking/product fit. Check citations support each material claim and score. Missing evidence must remain explicit.
5. Request user judgment of business usefulness and record it separately from automated execution checks. If fewer companies qualify, report the shortfall rather than padding results.

Resume failed work from its original checkpoint after reviewing any paid-effect records. Do not blindly replay uncertain calls or erase completed effects. A multi-role company's qualification in one role does not automatically qualify it in another.

Under the already confirmed MA05 policy, unknown text-call billing does not freeze ordinary work; at most one retry of the same model failure is allowed. A user reporting no visible provider record is an observation, not verified zero billing. Preserve the unknown record and explicitly track the single recovery attempt. Successful output remains non-replayable. Never convert absence from a dashboard into a verified-unbilled settlement.

A provider error envelope inside HTTP 200 is still a failed model call. Show a sanitized numeric error code when available, retain the recorded response metadata and stop SDK retries; do not describe it as token-limit truncation or accept it as a successful plan.

## Verification status

Local regression covers independent role targets, runtime environment forwarding, product retrieval fallback and a real LangGraph message-stream callback with intercepted model transport. The callback test reproduced `stream: true` before the fix and passes with `stream: false` afterward. These tests make no external model call and do not establish real discovery quality. Real role-by-role quality acceptance remains open.
