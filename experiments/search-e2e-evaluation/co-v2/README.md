# Colombia search E2E evaluation v2.0.8

This directory is the immutable, cold-start Colombia follow-up to the UK/Mexico formal evaluation. It compares the current product workflow with one un-tuned Gemini Full + Google Search interaction per category.

Scope: Colombia; Distributor/VAD, Reseller/VAR, Retailer/E-tailer and SI/MSP; 50 requested candidates per arm per category; 400 requested slots total.

Budget: USD 50 hard cap. Mandatory reviews occur at cumulative USD 10, 20 and 30. The runner also pauses before a required call or stage when the expected or conservative completion forecast may exceed USD 50.

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

Raw checkpoints are local under `runs/raw/`. Sanitized artifacts and the final report are under `artifacts/runs/2026-09-08-co-search-e2e-v2/`.
