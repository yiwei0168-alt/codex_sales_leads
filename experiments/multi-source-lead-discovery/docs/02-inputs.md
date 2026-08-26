# Frozen input specification

Status: **draft — do not run measured calls from this document yet**

No secret is part of the frozen input. API endpoints and credential environment-variable names may be recorded; credential values may not.

## Common benchmark brief

The final common brief will contain only the minimum Cudy facts, compact role definitions, target-market validity rules and output constraints confirmed by the user. Long role definitions remain in the shared taxonomy and are applied by the common downstream classifier rather than repeated inside every search query.

## Selected channel query packs

Only the following semantic lanes will be frozen:

1. Tier-1 distribution — Distributor and VAD.
2. B2B resale — Reseller, VAR/DVAR and Dealer.
3. Project services — SI and Installer.

Each lane will have German and English query variants. Search-only APIs receive short search queries, not the complete natural-language brief. Gemini Full receives the final concise end-to-end prompt. Gemini Discovery receives the same lane intent as the other discovery providers through its required provider wrapper.

## Input manifest required before measurement

The committed input manifest must record:

- exact prompt and query text;
- protocol and prompt version;
- country, language and locale parameters;
- provider and model identifiers;
- maximum results, pagination, timeout, retry and search-depth settings;
- date policy and actual run date;
- SHA-256 hash for every input file;
- confirmation that no unresolved placeholders remain.

Any post-freeze input change creates a new protocol version; it cannot silently modify an in-progress measured run.
