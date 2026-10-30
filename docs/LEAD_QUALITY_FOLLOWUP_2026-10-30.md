# Lead quality follow-up — 2026-10-30

## Confirmed scope

Rule LEAD-QUALITY-FOLLOWUP-01 implements the four approved improvements. The original six merged channel groups, scoring weights, normal path-fit threshold and zero-random-audit policy stay unchanged. Planner-schema repair is deferred.

## Findings

An independent-only public-evidence cache previously stopped official-page collection. A discovered company URL did not guarantee its body was read. Completed scoring responses also contained a role/path incompatibility: VAR or Reseller paired with Direct Tier-1 Supply. Deterministic filtering correctly withheld those paths, but the model summary could still claim eligibility, and required review did not cover every empty-path state.

## Resulting behavior

- Extract up to three known company URLs first. If no usable official content is obtained, search the exact company domain and extract up to four alternative results without repeating a URL in that acquisition. Retain summaries as discovery seeds; failed acquisition remains unknown.
- Independent cache hits retain their evidence while official extraction continues. A recovery with no current official page is explicitly queued for refresh. Original dates, hashes and expiry checks remain binding.
- Validate each path against corrected roles, enabled path types and current citations. Return specific rejection reasons without coercing role or path labels.
- Attempt at most one path-only repair per scoring result. The request cannot revise the seven scoring dimensions or gates; any normalization change to retained scores/gates aborts path-only application. Complete primary scores are checkpointed before batch repair. Raw repair responses use the existing encrypted owner/action/request checkpoint.
- Derive held/rejected summaries from final normalized gates and path availability. Necessary Pro review includes unresolved empty paths; generic warnings and low confidence do not add random audits.
- A separately linked recovery can repair held paths using retained scores and fresh evidence, reuse the source playbook, and acquire evidence only where needed. Source results remain immutable; the child target is only the original shortfall. Expired evidence clears stale downstream primary scores and path-repair work in the child before requalification.
- A subsequent discovery continuation includes recovery-ancestor exclusions, preventing reprocessing the parent's saved/scored companies.

## Verification

Automated checks and live acceptance outcomes are recorded after execution. An implemented workflow is not proof that the group has three qualified results or that users accept their business value. Company identities, account identifiers and live evidence remain in ignored private runtime artifacts.


### Verified development stage

- 169 tests across 15 focused files passed, including real failure-shape fixtures, path-only child execution with no scoring/discovery calls, strict evidence refresh, immutable source binding, ancestor exclusions, and response-checkpoint regressions.
- TypeScript passed. Targeted ESLint completed with zero errors and two existing unused-variable warnings in the review serializer. Diff whitespace check passed.
- Read-only verification against the actual completed checkpoint prepared five companies for a remaining target of two: two fresh path-only seeds and three evidence-refresh seeds. One originally scored company requires fresh evidence because some cited content lacks a retained snapshot; its old score is kept as history, not silently reused as a new result.
- Live task creation was correctly blocked by unresolved historical paid-request state. No new action or paid request was submitted, and no historical fee/outcome was changed. The previous delivered count remains one of three. This is a pending live follow-up, not business acceptance or market exhaustion.


### MA05 admission correction after explicit continuation

The initial live hold exposed an implementation mismatch with the existing MA05 rule: unknown text-call bills must not freeze unrelated work. The deployment was already in observation mode; this stage does not change its policy or financial records. The saved-recovery entrance now allows only recognized text tasks or HTTP-200 completed read-only acquisition to continue with unknown bills. Reserved/bound-exceeded, ambiguous requests, unknown side effects and strict-policy deployments stay blocked.

A recursive same-owner fingerprint check now spans processing-recovery ancestors, regardless of changed action/stage. It rejects both successful and unresolved old requests before transport, while distinct new work remains eligible under the existing policy. The source playbook, old scores, dates and history remain retained. 76 focused tests and TypeScript/lint passed. An actual rollback-only DB test blocked both ancestor success/unknown fingerprints and admitted a distinct synthetic request without any transport; every synthetic task/reservation was rolled back. Read-only real-source preparation now succeeds. Actual result counts and business acceptance remain pending.


### Independent work before acquisition

The first live official extraction ended without a confirmed response. Its unknown receipt remains unchanged and is not replayed. Known read-only Tavily routes can be identified from their trusted tariff key or canonical route hash for MA05 continuation; ambiguous endpoints still stop. Exact request fingerprints now guard same-action stage changes as well as recovery ancestors, including unknown non-model acquisition.

Fresh retained-score path repairs run before evidence acquisition. Once enough primary eligible results exist for the remaining target, other candidates remain explicitly deferred in the checkpoint and acquisition queue is cleared; downstream required review still determines final eligibility and delivery. This does not upgrade deferred evidence or assert that unprocessed companies failed qualification. 61 focused tests, TypeScript/lint and the rollback-only ancestor guard check passed.
