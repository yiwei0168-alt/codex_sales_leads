# Experiment documentation index

This directory is the narrative audit trail for `multi-source-professional-discovery-v1`. Machine-readable, non-secret outputs are committed under `../artifacts/`; provider-native payloads remain local under `../runs/raw/`.

## Required record set

1. [`01-protocol.md`](01-protocol.md) — scope, systems, fairness rules, budgets and final frozen decisions.
2. [`02-inputs.md`](02-inputs.md) — exact common brief, channel query packs, locale parameters, result limits and input hashes.
3. [`03-execution-log.md`](03-execution-log.md) — append-only chronological journal of every environment check, measured call, normalization, evidence, scoring and audit step.
4. [`04-results-ledger.md`](04-results-ledger.md) — index of each step output and its committed artifact.
5. [`05-scoring-and-blind-audit.md`](05-scoring-and-blind-audit.md) — eligibility gates, category-specific scoring, system aggregation, blind sampling and calibration.
6. [`../reports/final-report.md`](../reports/final-report.md) — final evidence-linked experiment report.
7. [`06-corrective-rubric.md`](06-corrective-rubric.md) — post-audit rules confirmed for the required next full-pool rescoring, without rewriting the frozen run.
8. [`07-shared-evidence-enrichment.md`](07-shared-evidence-enrichment.md) — provider-neutral canonical dossiers, retrieval budgets, failure rules and the direct-fetch pilot.
9. [`08-google-places-local-control.md`](08-google-places-local-control.md) — localized Places control protocol, query/region design and content-handling boundary.
10. [`09-v1.3-full-rescoring-and-audit.md`](09-v1.3-full-rescoring-and-audit.md) — v1.3 collection results, all-candidate preliminary scores and the frozen 12-case calibration checkpoint.

## Stage publication rule

After each meaningful verified stage:

1. update the execution journal;
2. write the corresponding normalized artifact and SHA-256 hash;
3. update the results ledger;
4. inspect the Git diff and run the relevant checks;
5. commit and push the stage to the experiment branch.

The final report must be reproducible from the committed protocol, inputs, normalized results, evidence and scoring artifacts. A conclusion without a linked artifact or explicit limitation is not considered supported.

## Security and blind-integrity exclusions

Never commit API keys, authorization headers, cookies, environment files, private contacts, blind-review salts, reviewer identity, or unredacted transport payloads. Before publication, preserve the substantive result content in a normalized artifact and record the local raw artifact's hash. Blind mappings remain local until the audit is complete; only aggregate audit results and non-identifying disagreement reasons are published.
