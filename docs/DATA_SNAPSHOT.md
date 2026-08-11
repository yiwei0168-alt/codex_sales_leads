# Mexico Public Data Snapshot

## Scope

- Market: Mexico
- Product context: anonymized SMB Networking brand profile
- Capture date: 2026-08-11
- Companies: 36
- Coverage: Distributor/VAD, reseller and retail, SI/MSP, ISP
- Runtime source: `src/data/mexico-snapshot.ts`

The snapshot uses real company names. Each company has at least one identity or business source. Priority-stage nodes have at least two evidence records. Automated tests enforce these minimums.

## Source hierarchy

1. Company websites and company service pages
2. Mexican telecom regulator reporting
3. Official directories
4. Industry publications used only as corroboration

The snapshot stores source URL, title, source type, capture date, claim, summary, status, and confidence. It does not store full copied webpages.

## Fact versus inference

- `Verified`: directly supported by a company, regulator, or other authoritative page.
- `Corroborated`: supported by an additional public source.
- `Inferred`: role, relationship, or recommendation inferred from public facts; it is never written into a fact field.
- `Unknown`: insufficient public evidence.
- `Conflicting`: incompatible sources; the UI must pause an automatic conclusion.

Company identity and quoted business capabilities are facts. Fit scores, Account Tier recommendations, Supply Model, Brand Involvement, risks, unknowns, and dashed relationships are Demo assessments that require human validation.

## Refresh workflow

1. Re-open every source and check the organization identity and current business statement.
2. Record a new capture date; do not overwrite the historical snapshot in a production system.
3. Extract claims into new Evidence records.
4. Flag conflicts instead of selecting the more convenient source.
5. Re-run entity normalization and deterministic taxonomy tests.
6. Publish the snapshot only after human review.

## Compliance boundaries

- Use only public business information for reasonable B2B research.
- Respect access terms, robots directives, and rate limits.
- Do not collect private contact details or sensitive personal data.
- Remove stale or disputed data when requested.
- A source link is not proof of a commercial supply relationship; such links remain hypotheses until directly verified.
