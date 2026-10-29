# Lead acceptance recovery fixes

This is engineering evidence from an incomplete real discovery case. It does not close business quality acceptance or the remaining channel cases.

## Exact scoring-response identity

The DeepSeek adapter sends a canonical `deepseek/*` model through OpenRouter while callers can use an unprefixed model name. Its response correctly records the canonical model and the OpenRouter gateway. The qualification cache previously required both fields to equal the caller's logical model/provider, leaving valid completed assessments without a reusable request contract and deferring unstarted peers.

The adapter now verifies the exact canonical model, gateway and prompt version before returning the original wire cache identity. The resilient wrapper delegates only to its primary adapter. Different models, gateways and prompts remain rejected; a fallback response is not silently stored as a primary response. Actual response metadata remains unchanged. Qualification applies the contract to complete batch members, same-tier repair and escalated results, including the identical-model escalation branch.

## Search language

The discovery adapter previously forwarded the human language name `English` as `search_lang=english`, causing a real Brave HTTP 422. Language normalization now maps supported human names to language codes and retains the existing locale-code behavior. English, en-GB and en are checked through the actual Brave request builder. [Brave parameter documentation](https://api-dashboard.search.brave.com/api-reference/web/search/get) requires a supported language code.

## Verification and limits

126 local tests across provider identity, resilient routing, discovery requests, qualification and workflow recovery pass, together with TypeScript and focused lint. Initial new test fixtures used an invalid task literal; that fixture type was corrected before the final checks. Tests use intercepted/local transports and do not establish provider availability.

The current real case preserves its discovery/evidence/correction checkpoints and three completed assessments. Only three unstarted assessments were selected for recovery. The missing-score request and its one explicit MA05 retry both encountered connection failures; both unknown records remain and no further request is queued. Scoring, required independent review and final handoff remain incomplete. No user quality pass is inferred from these engineering checks.

Actual company names, source snapshots, task identities and per-call recovery records remain local. See the [acceptance procedure](LEAD_ROLE_ACCEPTANCE_2026-10-29.md) for the unchanged role-by-role quality gates.
