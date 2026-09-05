# MX Retail v1.1.0 invalidation

Status: invalidated after the first completed cell. The result is retained as a paid diagnostic and is not eligible for the final arm comparison.

## Reason

The treatment did not execute the preregistered routine-model policy. `DEEPSEEK_MODEL` in the runtime environment resolved to `deepseek-v4-pro`, and the discovery gate, role correction and score-only qualification inherited it. The agreed workflow requires a Flash-class routine model, with Pro used only after a material escalation trigger. All 15 DeepSeek calls therefore used Pro without an escalation event. Continuing the remaining seven cells would measure a different and more expensive treatment.

## Actual MX Retail diagnostic

| Funnel | Count | Conversion |
|---|---:|---:|
| Raw search results | 345 | — |
| Unique discovered companies | 62 | 18.0% of raw |
| Light-gate retained | 49 | 79.0% of unique |
| Evidence-corrected primary role in Retail/E-tail | 24 | 49.0% of gate-retained |
| Completed eligible final companies | 15 | 62.5% of in-role; 50.0% slot fill |
| Score >=65 / >=75 | 4 / 1 | 13.3% / 3.3% of requested slots |

The product improved the earlier frozen 6/30 result to 15/30, but reached the five-round limit with 15 missing slots. Total wall time was 1,091,386 ms (18m 11s). The invalidated cell cost USD 1.5705186596; all sunk cost remains in the experiment budget.

Discovery used 52 paid calls/credits: SearchAPI contributed 27 unique companies and 9 final companies from 24 credits; Brave 17 unique and 5 final from 15; Google Places 6 unique and 1 final from 5; Exa 12 unique and 0 final from 8. SearchAPI and Brave returned 282 duplicate company occurrences. The full cell used another 111 Tavily credits for fresh and correction evidence. Paid search and evidence were USD 1.304, 83.0% of cell cost.

## Product defects and next-version gates

1. Freeze explicit stage models in the experiment and add a zero-call preflight assertion; do not inherit a mutable global model setting.
2. Keep the production discovery gate on a Flash-class stage-specific model even when another workflow stage is configured differently.
3. Make adaptive planned-pool size change provider request breadth; v1.1.0 calculated pools of 45–88 while every request remained capped at 12.
4. Use a short local-commerce query for Google Places instead of the full Web-search exclusion prompt.
5. Pass bounded `-site:` exclusions to Brave and SearchAPI so later rounds retrieve beyond already-seen top domains.
6. Preserve Exa's zero-final contribution as evidence for later route pruning. One cell is insufficient to remove the mechanism globally, but repeated zero downstream contribution must suppress it in a later policy version.
7. Add phase-level recoverable checkpoints; cost events persisted continuously, but the public product result appeared only after the entire 18-minute arm completed.
