# Frozen input specification

Status: **frozen for measurement — 2026-08-26**

No secret is part of the frozen input. API endpoints and credential environment-variable names may be recorded; credential values may not.

## Canonical machine-readable input

[`../config/inputs.json`](../config/inputs.json) is the canonical source for every exact non-secret input: Cudy brief, compact role rules, provider queries, Gemini Full prompt, evaluator prompts and evaluator settings. This document explains how those strings are applied; it does not paraphrase or override them.

## Selected channel query packs

Only the following semantic lanes are frozen:

1. Tier-1 distribution — Distributor and VAD.
2. B2B resale — Reseller, VAR/DVAR and Dealer.
3. Project services — SI and Installer.

Each lane has two German queries and one English query. Search-only APIs receive only those short queries plus their required market wrapper. Gemini Full receives the one frozen concise end-to-end prompt. Gemini Discovery receives the same three lane queries as every other discovery-only provider.

## Fixed limits and evaluator

- maximum discovery results per query: 10;
- queries per channel: 3;
- selected channels: 3;
- Gemini Full requests: 1;
- discovery-only requests per provider: 9;
- common evaluator: `claude-sonnet-4-6`, temperature 0, maximum 12,000 output tokens;
- evaluator input consists only of the frozen rules and the measured system's own discovery payload for that channel.

## Generated input manifest

The committed input manifest must record:

- exact prompt and query text;
- protocol and prompt version;
- country, language and locale parameters;
- provider and model identifiers;
- maximum results, pagination, timeout, retry and search-depth settings;
- date policy and actual run date;
- SHA-256 hash for every input file;
- confirmation that no unresolved placeholders remain.

Any post-freeze input change creates a new protocol version; it cannot silently modify an in-progress measured run. The manifest is committed before paid measurement and checked again by the runner.
