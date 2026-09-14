# A11 evidence Extract in whole-run preflight — stage 179 (2026-09-14)

The read-only minimal-business preflight now enumerates the active Tavily `/extract` dependency separately from `/search`. It reports `tariffKey=null`, `tariffStatus=missing-strict-contract`, `maximumPerCallUsd=null`, at most four official-evidence URLs per company and at most 20 URLs in the contact-enrichment caller. `checkedTariffsAvailable` requires this Extract bound as well as the previously listed model and search contracts. The [USD0.032000 candidate](TAVILY_EXTRACT_TARIFF_PROPOSAL_2026-09-14.md) remains inactive pending A11 confirmation.

The executed preflight returned `checkedTariffsAvailable=false`, `totalRunBoundUsd=null`, occupied USD12.324404 of USD30, and zero provider calls. Typecheck and the 13 contract tests passed. No task was claimed, no paid request was sent and no billing rule was activated. This is improved blocker visibility, not an accepted whole-run cost estimate or a live A11 result.

Efficiency observation: one local preflight input, one valid structured diagnostic output, one downstream-used blocker flag, zero model tokens/API credits/cash/retries; provider latency and real candidate yield remain unknown. The optimization is to surface the missing endpoint before a live run reaches it, preserving all evidence and budget state.
