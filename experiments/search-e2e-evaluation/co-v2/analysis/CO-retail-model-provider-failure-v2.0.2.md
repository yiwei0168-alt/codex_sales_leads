# CO-retail model-provider failure after v2.0.2

## Observed outcome

- Product discovery returned 65 raw results and 31 unique companies over two rounds.
- Fresh evidence processed 27 candidates; correction-stage Tavily supplementation was also completed and retained.
- DeepSeek direct inference returned `Insufficient Balance`. No explicit same-tier fallback route was configured.
- All 27 candidates therefore used the non-publishable deterministic correction fallback; none had an accepted primary Retailer/E-tailer role, so scoring received zero candidates and Product returned 0/50.
- SearchAPI returned a monthly-quota HTTP 429. Brave returned HTTP 422 because its country parameter does not support `CO`.
- Cumulative experiment cost after this attempt was USD 0.9295482701: Gemini USD 0.1764651 and Product USD 0.7530831701. The unavailable DeepSeek call did not consume model tokens; the major avoidable spend was search/evidence whose output could not progress until model recovery.

## Root causes

1. Preflight checked credential presence rather than executing a minimal schema-valid model request.
2. The approved cross-provider redundancy existed in code only through optional `LEAD_AI_FALLBACK_*` variables, but no runtime route was configured.
3. Brave received the ISO country code directly even when that code is outside Brave's accepted country enum.
4. A model outage after evidence acquisition did not have an explicit same-run recovery entry point, risking duplicate search and Tavily work.

## v2.0.3 repair

- A configured OpenRouter key supplies a public-only same-tier DeepSeek fallback (`deepseek/deepseek-v4-flash` / `deepseek/deepseek-v4-pro`) after bounded direct-provider failure. Requested and actual provider/model, aggregate attempts, tokens, gateway cash cost and fallback reason are retained.
- Qualification is marked public only when no private cooperation-path memory enters its packet. Any packet containing user memory remains `private-workspace` and cannot use the automatic public fallback.
- Unsupported Brave countries use `country=ALL`; the market name remains in the query for geographical relevance.
- `--resume-product` is limited to a completed zero-output provider-outage artifact. It reuses same-run intent, RAG, playbook, discovery, fresh evidence and supplemental evidence, then repeats semantic correction/scoring and continues only remaining discovery rounds.
- The failed 0/50 outcome and its sunk cost remain in the experiment ledger and documentation; they are not deleted from history.
