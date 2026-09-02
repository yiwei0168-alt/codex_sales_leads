# UK–Mexico formal search evaluation v1

This directory contains the preregistered protocol, frozen configuration, prompts, schemas, runtime checkpoints and final reports for Cudy's first formal end-to-end search evaluation.

The evaluation compares:

- `gemini-native`: one un-tuned Gemini Full interaction with Google Search grounding; and
- `product-e2e`: the current category-aware hybrid discovery, light gate, fresh evidence, correction, role decision and role-aware scoring workflow.

Each arm must fill 30 ranked slots in each of eight country/category cells: United Kingdom and Mexico crossed with Distributor/VAD, Reseller/VAR, Retailer/E-tailer and SI/MSP. Each arm therefore has 240 requested output slots, 480 across both arms.

The experiment is cold-started for company data. It may use the frozen Cudy product knowledge and product policies, but it may not read historical candidate lists, historical evidence, cached pages, historical scores, user/company memories or the other arm's results.

No paid experiment calls may run before the preregistration commit is pushed. Connectivity and schema checks use synthetic or non-task data and are recorded separately under `preflight/`.

## Entry points

- [Protocol](PROTOCOL.md)
- [Frozen experiment configuration](config/experiment.v1.0.0.json)
- [Gemini control prompt](config/gemini-control-prompt.md)
- [Independent blind-judge rubric](config/blind-judge-rubric.md)
- [Official list-price rate card](config/official-rate-card.v1.json)

## Frozen runner commands

```text
npm run experiment:search-e2e:freeze
npm run experiment:search-e2e:verify
npm run experiment:search-e2e:preflight
npm run experiment:search-e2e:cell -- --cell=MX-retail
npm run experiment:search-e2e:evaluate
```

The runner refuses paid calls unless every manifest hash matches and `HEAD` carries the frozen preregistration tag. Raw provider responses are written only under ignored `runs/raw/`; Git artifacts contain structured company fields, short evidence excerpts, hashes, aggregate telemetry and cost checkpoints.

The Gemini adapter follows Google's current [Interactions API](https://ai.google.dev/api/interactions-api) usage fields and [structured-output contract](https://ai.google.dev/gemini-api/docs/structured-output): JSON format controls are top-level, and structured output may be combined with Google Search on Gemini 3 models.

Preflight checks, formal-arm stages, Gemini-only shared evaluation and every blind-judge decision are checkpointed as soon as their cost occurs. A retry skips completed preflight checks, cell arms, shared-evaluation cells and blind packets. If an incomplete stage must restart, repeated calls receive distinct ledger event IDs so retry spend is never hidden from the USD 100 cap. Eight frozen cells produce `cells-completed`; only unified evaluation, blind calibration, statistics and final reports produce `completed`.

## Version and Git policy

- Experiment version: `search-e2e-eval-v1.0.12`
- Working branch: `experiment/search-e2e-uk-mx-v1`
- A preregistration tag is created before experimental calls.
- Runtime checkpoints are committed after every completed country/category cell.
- The final verified report, workflow efficiency ledger and search-strategy analysis are merged to `origin/main` without secrets, private memory, personal contact data or full third-party page copies.
