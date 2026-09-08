# Colombia search E2E evaluation v2.0.19

This directory is the immutable, cold-start Colombia follow-up to the UK/Mexico formal evaluation. It compares the current product workflow with one un-tuned Gemini Full + Google Search interaction per category.

Scope: Colombia; Distributor/VAD, Reseller/VAR, Retailer/E-tailer and SI/MSP; 50 requested candidates per arm per category; 400 requested slots total.

Budget: USD 50 hard cap. Mandatory reviews occur at cumulative USD 10, 20 and 30. The runner also pauses before a required call or stage when the expected or conservative completion forecast may exceed USD 50.

After a documented forecast pause and explicit user confirmation, record a one-cell budget authorization before continuing. This does not weaken the hard cap and cannot authorize another CO Retail repair:

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=resume-budget
```

Run order:

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=verify
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=preflight
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-retail
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-distribution
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-si-msp
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-resale
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=evaluate
```

If a completed zero-output Product artifact is explicitly diagnosed as a provider outage or model-routing defect, v2.0.6 permits same-run cache recovery without repeating valid Gemini, search or evidence work. OpenRouter DeepSeek requests explicitly disable reasoning; correction packets are compacted and token-aware; recovery uses single-candidate calls with bounded concurrency; schema repair is limited to one same-tier retry; infrastructure failures cannot trigger Pro escalation; and semantic recovery cannot open another discovery/evidence round:

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=provider-check
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-retail --resume-product
```

After a documented search-localization defect, `--repair-search` may retain cached valid candidates, normalize same-family Hybrid roles, retry only incomplete cached assessments, exclude all cached domains, and open five corrected country-specific acquisition rounds:

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-retail --repair-search
```

If a completed Product artifact is proven invalid because candidate identity caused unrelated-country pages to be admitted as official or supplemental evidence, v2.0.7 requires a clean Product-only restart. The old raw/public Product artifact is archived, all sunk costs remain in the formal ledger, and the frozen Gemini control is reused:

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-retail --restart-product
```

This is a narrow invalidation path, not a tuning retry. v2.0.7 rejects public-suffix-only evidence targets, admits independent evidence only when it is affiliated with the candidate entity, binds target-country eligibility to the correction-stage country finding, sanitizes overlong light-gate output without dropping a whole batch, counts only domain-bearing companies as discovery yield, and prevents incomplete model rounds from advancing confirmed exhaustion. A 50-company cell may run at most ten fresh rounds, still stopping earlier after two genuinely completed zero-final rounds.

If a valid Product run contains deterministic correction fallbacks or retry-required scores, v2.0.8 performs an acquisition-closed incomplete-output recovery. Direct DeepSeek remains primary. Public packets then try the same DeepSeek tier through OpenRouter for at most 45 seconds and `openai/gpt-4o-mini` for at most 25 seconds; at most two fallbacks are attempted. Search, homepage reads, Tavily evidence and completed unaffected scores are cache hits and are not repeated:

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=provider-check
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-retail --repair-incomplete
```

If model output contradicts an already explicit deterministic policy, v2.0.9 repairs only that inconsistency without another model call. It removes Retail/E-tail roles from supported third-party-marketplace findings, caps unknown scale at a neutral 8/15 rather than zero or maximum, caps cooperation influence by evidenced levers, recomputes totals/tiers and rebuilds the cached ranking:

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-retail --repair-consistency
```

If SearchAPI is actually unavailable, v2.0.10 permits Gemini Full to replace only the affected SearchAPI-dependent Retail/E-tail or Reseller/VAR route. It remains a zero-call skip when SearchAPI is healthy and never uses Gemini Product or Tavily for discovery. For CO Retail, reuse the 12 valid cached outputs and extend only the missing search/evidence/role/score work:

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-retail --repair-search
```

v2.0.11 enforces that contract in code: before a search extension it preloads every domain from cached discovered, rejected, enriched and corrected records. Those entities are removed before the light semantic gate and cannot repeat Tavily, correction or scoring work. The first v2.0.10 extension cost remains visible, but its 25 repeated downstream inputs cannot recur after resumption.

v2.0.13 removes `temperature` from high-reasoning blind-review requests after OpenRouter rejected the GPT-5.6-sol parameter combination before inference. High reasoning, strict JSON Schema, provider independence and the no-Web blind packet remain unchanged. Completed shared-evaluation cells are reused, and the two rejected zero-token/zero-cost judge calls remain in the ledger before the blind audit resumes from its per-decision cache.

v2.0.14 deterministically clips blind-judge narrative strings and arrays to the already frozen JSON Schema limits before local validation. It does not change any score, role, state, citation-support label or evidence selection. This prevents a valid paid Claude response from being discarded solely because a reason exceeds 500 characters; genuinely missing, invalid or contradictory semantic fields still fail validation.

v2.0.15 applies the confirmed same-tier model redundancy to conditional arbitration. DeepSeek Pro remains the requested arbitrator; if its direct endpoint fails or returns no valid structured output, the same DeepSeek Pro tier is tried through OpenRouter before any in-conversation Codex fallback. The combined event records direct attempts, fallback model/provider, latency and OpenRouter account cost.

v2.0.16 adds one bounded schema-repair retry only when the same-tier gateway returns paid content that cannot be parsed as the frozen schema. The repair stays on the gateway's actual model, keeps the evidence packet and rubric unchanged, adds only a concise-complete-JSON instruction, and expands that single output budget from 4,096 to 8,192 tokens. The failed output and repair are separate cost events. Transport failures, semantic disagreement and valid decisions cannot trigger this retry.

v2.0.17 implements the preregistered `codex-in-session` fallback after both 8,192-token schema repairs also failed. A manual fallback output can be imported only for a frozen packet with both independent judge decisions and an actual arbitration trigger. The importer validates the unchanged schema and blindness flags, binds the cache to the packet plus both judge outputs, verifies consensus resolution, and records a separate zero-token/zero-API-cost event and public decision artifact. It cannot alter the packet, independent decisions, rubric or trigger rules.

v2.0.18 fixes repair-cache identity after a later DeepSeek schema repair succeeded. The cache identity must retain the frozen requested model `deepseek-v4-pro`, while `actualModel` records `deepseek/deepseek-v4-pro`; using the actual route as both fields made a valid cache fail resumption validation. Two successful cached repairs are deterministically metadata-corrected without another model call or any score/output change. A third failed repair is resolved through the v2.0.17 in-session importer.

v2.0.19 normalizes timeouts that occur while reading a provider response body, not only while awaiting response headers. The bounded request helper now retries that timeout once and returns a metered provider failure rather than crashing the runner. When provider usage is unavailable, token usage is conservatively estimated from the serialized blind input and maximum output budget and priced at the official rate; it is explicitly not labeled account-observed. The one timeout that exposed this defect is backfilled through the audited importer before its in-session arbitration is cached.

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\import-in-session-arbitration.ts --decision=<raw-output-json>
```

Raw checkpoints are local under `runs/raw/`. Sanitized artifacts and the final report are under `artifacts/runs/2026-09-08-co-search-e2e-v2/`.
