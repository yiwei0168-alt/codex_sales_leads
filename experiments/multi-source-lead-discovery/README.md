# Multi-source professional lead-discovery benchmark

This experiment is isolated from the production lead workflow. It compares discovery coverage across Gemini Grounding, Tavily, Google Places, Exa, Brave Search and SearchAPI.io before any provider is added to production.

Current frozen-evidence result: [`reports/v1.6-unified-rescoring-report.md`](reports/v1.6-unified-rescoring-report.md). It uniformly rescored all corrected candidates and supersedes the provisional v1.5 ranking. It remains a deterministic replay rather than a live multi-agent run; the accompanying [`scoring governance and downstream handoff design`](reports/v1.6-scoring-governance-and-downstream-handoff-design.md) defines the safeguards required for production scoring.

## Environment stage

No provider SDK is required. The adapters use Node's native `fetch`, which keeps request payloads auditable and avoids six extra dependency trees.

1. Copy the missing provider variables from `.env.example` to `.env.local` and add real keys locally.
2. Run `npm run benchmark:discovery:env`. This does not call external APIs.
3. After separately approving paid probes, run `npm run benchmark:discovery:preflight -- <provider>` for one provider at a time.

Supported provider names:

- `gemini`
- `tavily`
- `google-places`
- `exa`
- `brave`
- `searchapi`

After the frozen input manifest is committed, the reproducible measured workflow is:

1. `npm run benchmark:discovery:run -- --phase=preflight`
2. `npm run benchmark:discovery:run -- --phase=discovery`
3. commit and push the sanitized discovery artifacts;
4. `npm run benchmark:discovery:prepare-codex-review`
5. review every blind packet with the frozen rubric and save one decision per batch;
6. `npm run benchmark:discovery:verify-codex-review -- --require-complete`
7. commit the still-blinded decisions, then run `npm run benchmark:discovery:aggregate-codex-review`;
8. `npm run benchmark:discovery:prepare-audit`

The discovery runner is resumable. A successful raw result is reused, while failed attempts remain locally recorded. The OpenAI-compatible API evaluator is diagnostic only: its partial results never enter the ranking. Primary scores come from the uniformly completed Codex blind review and remain provisional until the human blind audit is accepted.

Raw benchmark artifacts are stored under `runs/raw` and are ignored by Git. API keys, provider-native payloads, the blind identity map and local human-review decisions must never be committed.

## Intended provider roles

- Gemini: broad, adaptive Google-grounded discovery.
- Tavily: agent-oriented search and evidence extraction.
- Google Places: small and local downstream businesses.
- Exa: semantic company and professional-scenario discovery.
- Brave: independent-index and long-tail web discovery.
- SearchAPI.io: explicit Google SERP/local controls and pagination.

The next stage freezes the three selected professional-scenario query packs and a provider-neutral evaluation protocol. Production integration remains out of scope until that comparison is complete.

## Reproducible experiment record

The benchmark is documented as a reproducible experiment rather than only as a final leaderboard. The documentation index is in [`docs/README.md`](docs/README.md). Every meaningful stage must commit and push:

- the versioned protocol and all confirmed decisions;
- the exact non-secret inputs, prompts, query packs, locale settings and limits;
- an append-only execution journal with timestamps, run IDs and artifact hashes;
- one sanitized normalized result artifact per measured step;
- the deduplicated evidence ledger, raw and calibrated scoring summaries, and blinded-human-audit aggregate results;
- a detailed final report that links conclusions to the recorded evidence.

Provider-native transport payloads remain under `runs/raw` for local audit. They are never committed verbatim because they can contain credentials, request metadata, opaque tracking parameters or personal data. A content-faithful normalized result is committed instead, together with the raw artifact hash so omissions are detectable. Candidate company names, public company URLs and non-personal public business evidence may be included in the committed normalized artifacts. Personal contacts remain outside this benchmark.
