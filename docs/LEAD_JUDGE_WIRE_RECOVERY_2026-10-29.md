# Independent lead review: judge wire recovery

The existing real lead case resumed missing scores after an explicit user continuation and three successful read-only connection checks. All six assessments completed; the three prior assessments were retained. A triggered blind secondary review completed and was saved, but its disagreement judge received two explicit HTTP 404 responses. These are distinct from the earlier connection failures.

## Compatibility correction

The current endpoint directory for the original Sol judge lists no temperature support; its OpenAI endpoints accept `max_tokens`. The old request sent `temperature: 0` and `max_completion_tokens` with `require_parameters: true`, which filters out endpoints lacking requested parameters. [Provider routing semantics](https://openrouter.ai/docs/guides/routing/provider-selection); [current model endpoints](https://openrouter.ai/api/v1/models/openai/gpt-5.6-sol/endpoints).

The corrected judge request omits temperature and uses `max_tokens`. It retains the original model, high reasoning, 12,000-token cap, strict JSON schema, two text messages and data-collection restrictions. The new `openrouter-sol-judge-json-v2` contract refuses old fields and excess capabilities. Policy delta v1.14 adds only the judge contract override to the existing v1.13 delta: no monetary bound, verification date, expiry, underlying historical policy or financial admission rule is renewed or changed. Historical judge v1 remains available for old records and is excluded, alongside v2, from generic tariff selection.

The secondary-review request stays byte-compatible, allowing the saved blind secondary response to be reused. Resume preserves all six scores and targets the incomplete judge. No independent review is skipped or replaced by a primary score.

## Verification

76 local tests covering actual adapter wire, exact request guards, admission attribution, independent review and acceptance pass, together with TypeScript and focused lint. Existing judge fixtures were updated to the new wire. A stale native DeepSeek test had been using the current gateway serializer as native input; it now separately checks explicit historical native fixtures and refuses current gateway bodies under native bounds.

The local API was switched after an idle check, preserving prior state. Actual judge completion, final delivery and user business-quality judgment are recorded separately; test success and completed scoring are not an acceptance pass. Full role-by-role scope is unchanged; see the [acceptance procedure](LEAD_ROLE_ACCEPTANCE_2026-10-29.md).

## Actual recovery outcome

The corrected judge call returned a completed response with a targeted-research decision. The review-stage metric records one reused secondary response, so no additional secondary model call was made. All six score results remain retained. The judge identified a material independence/relationship evidence gap for one candidate; an unconfirmed owner-scoped customer entry does not settle it, and public-search absence is not proof of no business relationship. Owner clarification was requested. Final delivery and the first role's quality acceptance remain open; no successful score, secondary review or judge response is scheduled for replay.
