# RAG v3 isolation activation evidence — 2026-09-19

## Confirmed release rule

The user explicitly allowed production activation before all fact and Gold review is complete, provided unresolved facts are quarantined. Manifest, document/OCR terminal state, chunk, dual-embedding and ACL gates remain hard blockers. Open fact reviews may remain only when serving queries exclude them from deterministic answers and the structured fact retrieval lane. Gold continues after activation and holdout remains locked.

## Activated state

- Release: `rag-v3-shadow-2026-09-18` / `889a1b5b-9b45-4695-a9b1-e2f2415a028f`
- Status: `active`; shared active pointers: 1
- Registered/release assets: 281/281; incomplete assets: 0
- Source units/chunks: 1,820/3,062
- Qwen/BGE embeddings: 3,062/3,062 and 3,062/3,062
- Document/OCR open reviews: 0
- Open fact reviews: 1,029, all retained and quarantined
- Facts: 1,953 verified, 1,091 candidate, 9 conflicting
- Gold: 11/300; holdout: 0/50 and locked
- Activation violations/blockers: 0/0

Migration 089 replaces the old all-review activation condition with a document-review gate and drops the Gold activation trigger. The activation function still checks every registered asset, terminal resolution, chunk counts and both vector profiles. `resolveVerifiedFacts` now returns only verified v3 facts without an open review; the v3 `fact_candidates` lane applies the same quarantine predicate.

## Post-switch acceptance

- Four focused files passed 18 tests before migration and activation.
- The real database accepted migration 089 and exposed one active pointer.
- Desktop 1366×900 and mobile 390×844 authenticated UI flows passed.
- Authorized original access passed; missing asset returned 404; anonymous access returned 401.
- Thirty document/fact LangGraph→PostgreSQL→UI probes passed: P50 674.7 ms, P95 771.4 ms, max 772.3 ms.
- Activation and UI acceptance made zero model, embedding, search or SMTP calls and incurred no known API cash cost.

The remaining Gold and fact reviews are continuing quality work and are not represented as completed acceptance. Rollback remains a release-pointer operation; neither old nor new release data is deleted.

## Product architecture document

The current architecture, product details, progress, acceptance boundary and actual LangGraph export topology were published to Feishu with two verified whiteboards:

- <https://my.feishu.cn/docx/RxdvdE8QDoU2gnx3FktcWxLgnmh>
