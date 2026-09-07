# Colombia search E2E evaluation v2.0.4

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

If a completed zero-output Product artifact is explicitly diagnosed as a provider outage or model-routing defect, v2.0.4 permits same-run cache recovery without repeating valid Gemini, search or evidence work. OpenRouter DeepSeek requests explicitly disable reasoning; schema repair is limited to one same-tier single-candidate retry, while infrastructure failures cannot trigger Pro escalation:

```powershell
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=provider-check
node scripts\run-tsx.cjs experiments\search-e2e-evaluation\co-v2\scripts\run-formal-experiment.ts --phase=cell --cell=CO-retail --resume-product
```

Raw checkpoints are local under `runs/raw/`. Sanitized artifacts and the final report are under `artifacts/runs/2026-09-08-co-search-e2e-v2/`.
