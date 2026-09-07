# CO-retail v2.0.3 reasoning-timeout incident

## Observed result

The cache-safe v2.0.3 recovery completed four Product discovery rounds but returned 0/50 publishable Retailer/E-tailer candidates. Cumulative experiment budget cost was USD 1.6755584861: USD 1.4990933861 Product and USD 0.1764651000 Gemini. The completion forecast remained below the USD 50 cap at USD 14.7022 expected and USD 17.1652 upper, so no mandatory budget checkpoint was crossed.

The Product cache contained 51 corrected records and two assessments. Forty-seven corrections were deterministic unresolved fallbacks. Only the final round produced model-corrected candidates, and neither assessment survived the market/role gates.

## Root cause

OpenRouter applied model reasoning by default. The observable round-three/four model events consumed 21,795 reasoning tokens and routine requests frequently exceeded the 75-second timeout. The generic correction and qualification error paths then treated schema, transport, timeout and provider errors alike and automatically retried every candidate with DeepSeek Pro. That violated the frozen rule that Pro requires a valid routine semantic output predicting at least an eight-point score change or a resolvable critical-state change.

A non-formal diagnostic using one cached real correction packet with `reasoning.effort=none` succeeded on DeepSeek V4 Flash in 17.867 seconds with 9,187 input tokens, 1,859 output tokens, zero reasoning tokens and USD 0.0018067 account cost. The diagnostic changed no formal candidate, score or experiment state.

## v2.0.4 containment

- Explicitly disable optional reasoning on the automatic public OpenRouter DeepSeek route.
- Share one resilient provider and direct-provider circuit across discovery gate, correction and qualification within a cell.
- Permit one same-tier single-candidate repair only for malformed structured output.
- Do not use Pro for balance, transport, timeout or generic provider failure.
- Keep Pro only for a valid routine output satisfying the material score/critical-state policy.
- Resume from same-run intent, RAG, playbook, discovery, evidence and supplemental-evidence caches; no repeated search or Tavily acquisition for cached candidates.

The experiment sample, arms, scoring, metrics, blind audit and win gates remain unchanged. All sunk costs remain in the ledger.
