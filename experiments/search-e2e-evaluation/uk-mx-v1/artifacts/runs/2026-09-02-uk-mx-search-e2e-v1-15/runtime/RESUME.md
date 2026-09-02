# Resume node: search-e2e-v1.0.15-after-MX-retail

The v1.0.15 run is safely paused with no active process after completing both MX–Retail arms. Do not rerun this cell.

- Branch: `experiment/search-e2e-uk-mx-v1`
- Frozen tag: `search-e2e-eval-v1.0.15-frozen`
- Completed cells: `MX-retail` (1/8)
- Results: Gemini 30 final companies; product 6 final in-role companies and 24 protocol-defined zero-utility missing slots
- Cumulative experiment budget: USD 1.7460204110519397
- Completion forecast: USD 17.303791147407672, range USD 14.580483486593362–20.027098808221982
- Budget checkpoints crossed: none
- Next cell: `GB-distribution`

On resume, read `resume-checkpoint.json`, `run-summary.json`, and `../cost/after-MX-retail.json`; verify the branch is synchronized with GitHub, then run:

```text
npm.cmd run experiment:search-e2e:cell -- --cell=GB-distribution
```

The local `SEARCH_E2E_USER_ID` environment value remains required but must not be committed. Continue automatically through the frozen order and checkpoint each cell. Preserve the MX–Retail slot underfill, evidence-correction volume anomaly, and recovered Kimi JSON failure for the final quality/cost optimization analysis. Only pause for user input if the completion forecast may exceed the USD 100 hard limit.

Blind review remains `codex-in-session`, without Web search or Codex API. After all cells and shared evaluation, blind packets must be committed and pushed before they are read; direct review decisions must be committed and pushed before deblinding.
