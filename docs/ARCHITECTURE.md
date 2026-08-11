# Architecture

## Demo strategy

The implementation is a snapshot-driven validation prototype. It runs as a statically rendered Next.js application and keeps the first demo deterministic, fast, and credential-free. The UI never labels snapshot replay as a live web search.

```text
Public sources → curated snapshot → domain rules → application state → workspace UI
                                      ↘ evidence IDs ↗
```

## Layers

| Layer | Current implementation | Production extension |
|---|---|---|
| Search/import | Curated TypeScript snapshot | `SearchProvider` plus compliant import jobs |
| Evidence | Evidence records embedded with each company | Postgres evidence and source snapshot metadata |
| Domain | Typed Company, ChannelNode context, scoring inputs, relationships and plans | Repository-backed services and audit log |
| AI pipeline | Deterministic role-aware development-plan rule | `AiProvider` with structured output, timeout and retry |
| Application | Next.js App Router client workspace | Authenticated server actions/API routes |

Provider boundaries are defined in `src/providers/contracts.ts`; neither pages nor domain rules depend on a particular search, LLM, or database vendor.

## Key domain decisions

- `CompanyRecord` contains objective company identity plus a market-task channel context for this demo. The reference SQL separates `company` and `channel_node` for production.
- KA is an `AccountTier`; it can never be a `ChannelRole`.
- ISP is a downstream `ChannelRole`; it is not a third channel layer.
- `fitScore` and `evidenceConfidence` are stored and rendered separately.
- Manual edits set `manuallyEdited` and remain visible across the results table, company drawer, map selection and development plan in the current session.
- Unverified supply links use relationship status `Hypothesis` and dashed map edges.

## State and synchronization

The demo keeps normalized company records in the top-level `CopilotDemo` component. All views read the same record array. Editing Account Tier, Supply Model, Brand Involvement, priority or stage updates that shared state, so the list, drawer, opportunity workspace and generated plan stay consistent without duplicating data.

## Failure behavior

The current demo uses a bundled snapshot, so it has no external runtime dependency. The provider contract defines `ProviderUnavailableError` for a future integration; the UI must show a degraded state and must never substitute mock companies into real results.

## Security and privacy

- No secrets are shipped to the browser or repository.
- No private contacts or guessed email addresses are stored.
- External links open public business sources only.
- No outbound communication is executed.
