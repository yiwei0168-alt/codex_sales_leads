# Architecture

## Demo strategy

The implementation is moving from a snapshot-driven demo to a single-user production pilot. The active Mexico workspace is persisted in PostgreSQL and populated from Tavily live-search runs; the historical snapshot remains test/reference data and is not seeded into the active workspace.

```text
Tavily live search → quality filters and deduplication → PostgreSQL workspace → review UI
        ↓                              ↘ evidence IDs ↗
public web search + extraction → contacts/email candidates
                                   ↓
                              verification agent
                              (DeepSeek evidence assessment
                               + deterministic decisions)
```

## Layers

| Layer | Current implementation | Production extension |
|---|---|---|
| Search/import | Tavily live-search and enrichment jobs | SerpAPI adapter and scheduled refresh jobs |
| Evidence | PostgreSQL search runs, URLs and captured excerpts | Source refresh and change detection |
| Domain | Typed Company, ChannelNode context, scoring inputs, relationships and plans | Repository-backed services and audit log |
| AI pipeline | Deterministic role-aware development-plan rule | `AiProvider` with structured output, timeout and retry |
| Application | Next.js App Router client workspace | Authenticated server actions/API routes |

## RAG knowledge architecture

```text
User upload (industry / Cudy company / Cudy product)
  → authority and source metadata
  → heading-aware chunks + SHA-256 idempotency
  → Qwen text-embedding-v4 (1536 dimensions)
  → PostgreSQL pgvector HNSW + FTS GIN
  → reciprocal-rank fusion
  → Responses API with store=false
  → answer + verified [KB:chunk-uuid] citations
```

The three collections start empty. The existing 36-company channel-discovery snapshot is intentionally not copied into the company knowledge base: that collection is reserved for Cudy Technology's own company information. Raw user knowledge files are ignored by Git.

Provider boundaries are defined in `src/providers/contracts.ts`; neither pages nor domain rules depend on a particular search, LLM, or database vendor.

## Key domain decisions

- `CompanyRecord` contains objective company identity plus a market-task channel context for this demo. The reference SQL separates `company` and `channel_node` for production.
- KA is an `AccountTier`; it can never be a `ChannelRole`.
- ISP is a downstream `ChannelRole`; it is not a third channel layer.
- `fitScore` and `evidenceConfidence` are stored and rendered separately.
- Manual edits set `manuallyEdited` and remain visible across the results table, company drawer, map selection and development plan in the current session.
- Unverified supply links use relationship status `Hypothesis` and dashed map edges.

## State and synchronization

The server loads the active workspace and live-search companies from PostgreSQL. The client keeps a normalized working array, and company edits are persisted through authenticated API routes with audit events.

## Failure behavior

Search and enrichment jobs fail explicitly when a provider is unavailable. Tavily requests use limited retries for transient network failures, and contact replacement happens per company only after the new evidence is ready. Mock companies are never substituted into live results.

## Security and privacy

- No secrets are shipped to the browser or repository.
- Users have independent database sessions and owner-scoped workspaces, knowledge documents, RAG retrieval, contacts and mailbox records.
- Alibaba Mail uses per-user read-only IMAP credentials encrypted with AES-256-GCM; mailbox tables enforce composite user ownership across connections, cursors, messages and derived candidates.
- Mail-derived policies, customer signals and templates require human review before promotion; no mailbox content is shared across users.
- Only public business-page/profile contacts are collected; private or login-gated data is not scraped.
- Public, verified and pattern-guessed emails have distinct statuses. Pattern guesses require a public name and a public same-domain personalized pattern.
- External links open public business sources only.
- No outbound communication is executed.

## Contact verification direction

The Contact Verification Agent core consumes crawler findings and retained source evidence. DeepSeek performs structured evidence assessment in shadow mode, while deterministic rules assign `Official`, `HighConfidence`, or `NeedsReview`; invalid addresses use a separate lifecycle state. Accuracy, role relevance, reachability, and delivery state remain separate dimensions. Company size affects the reachability of general official channels but never reduces their source authenticity. Proactive LinkedIn crawling is excluded from the first release. See [CONTACT_VERIFICATION_AGENT.md](./CONTACT_VERIFICATION_AGENT.md).

Outbound delivery verification is a separate, disabled-by-default future boundary and requires explicit approval before implementation and activation.
