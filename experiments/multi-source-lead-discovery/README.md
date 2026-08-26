# Multi-source professional lead-discovery benchmark

This experiment is isolated from the production lead workflow. It compares discovery coverage across Gemini Grounding, Tavily, Google Places, Exa, Brave Search and SearchAPI.io before any provider is added to production.

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

Raw benchmark artifacts will be stored under `runs/raw` and are ignored by Git. API keys, raw company results and local evaluation decisions must never be committed.

## Intended provider roles

- Gemini: broad, adaptive Google-grounded discovery.
- Tavily: agent-oriented search and evidence extraction.
- Google Places: small and local downstream businesses.
- Exa: semantic company and professional-scenario discovery.
- Brave: independent-index and long-tail web discovery.
- SearchAPI.io: explicit Google SERP/local controls and pagination.

The next stage will freeze professional-scenario query packs and a provider-neutral evaluation protocol. Production integration remains out of scope until that comparison is complete.
