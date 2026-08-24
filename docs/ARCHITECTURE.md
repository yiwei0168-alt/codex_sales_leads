# Architecture

## Product strategy

The product uses one owner-scoped global workspace with country-partitioned search results. A persistent conversational home routes knowledge questions to private/shared RAG and lead-discovery requests to an explicit confirmation boundary. Historical Mexico assets remain test/reference data and do not constrain runtime markets.

```text
Natural-language request → Assistant StateGraph
  → Kimi-k3 intent + plan Agent (recent conversation context)
  ├─ internal question → tenant-aware hybrid RAG → cited answer
  ├─ internal + public question → internal RAG ∥ Gemini Google Search → OpenAI/Lingyu synthesis
  ├─ uncertain request → targeted clarification → next conversation turn
  └─ lead search → proposed/revisable action → explicit user confirmation
                                      ↓
       Lead StateGraph + PostgreSQL checkpoints
       RAG gate → Market Playbook → Tavily → evidence → independent score agent → qualified records
                                      ↓ selected company
       Development Strategy StateGraph
       context → Cudy RAG + approved style templates → Kimi strategy → Kimi draft → validate → persist
```

## Layers

| Layer | Current implementation | Production extension |
|---|---|---|
| Search/import | Tavily live-search and enrichment jobs | SerpAPI adapter and scheduled refresh jobs |
| Evidence | PostgreSQL search runs, URLs and captured excerpts | Source refresh and change detection |
| Domain | Typed Company, ChannelNode context, scoring inputs, relationships and plans | Repository-backed services and audit log |
| AI pipeline | Lingyu planner + DeepSeek Flash/Pro independent qualification | Separate strategic-customer graph |
| Application | Next.js App Router, persistent conversations, inline graph and durable DB jobs | Deploy worker on ECS/long-running Node compute |

## RAG knowledge architecture

```text
User upload (industry / Cudy company / Cudy product)
  → authority and source metadata
  → heading-aware chunks + SHA-256 idempotency
  → Qwen text-embedding-v4 (1536 dimensions)
  → PostgreSQL pgvector HNSW + FTS GIN + structured product facts
  → three-lane weighted fusion and corroboration flag
  → LangChain ChatOpenAI through configured compatible gateway
  → answer + verified [KB:chunk-uuid] citations
```

Retrieval has two explicit visibility lanes inside the same PostgreSQL/pgvector store:

```text
shared documents (visibility=shared)
                    ├─ eligible chunks ─ vector + FTS + structured fusion ─ grounded answer
current user's private documents
(visibility=private AND owner_id=session.userId)
```

Private documents belonging to any other user are excluded inside the initial SQL `eligible` CTE, before vector or keyword ranking. Mailbox rows remain in separate `mailbox_*` tables; only human-approved Kimi-derived artifacts are embedded into the private RAG lane.

The three collections start empty. The existing 36-company channel-discovery snapshot is intentionally not copied into the company knowledge base: that collection is reserved for Cudy Technology's own company information. Raw user knowledge files are ignored by Git.

Product documents have a second, deterministic truth lane in `product_catalog` and `product_fact`. A structured fact stores the canonical value and its source excerpt rather than an LLM-generated interpretation. Product specifications require at least two retrieval signals to remain fully grounded; semantic-only or conflicting facts are explicitly downgraded.

Provider boundaries are defined in `src/providers/contracts.ts`; neither pages nor domain rules depend on a particular search, LLM, or database vendor.

## Key domain decisions

- `CompanyRecord` contains objective company identity plus a market-task channel context for this demo. The reference SQL separates `company` and `channel_node` for production.
- KA is an `AccountTier`; it can never be a `ChannelRole`.
- ISP is a downstream `ChannelRole`; it is not a third channel layer.
- `fitScore` and `evidenceConfidence` are stored and rendered separately.
- Manual edits set `manuallyEdited` and remain visible across the results table, company drawer, map selection and development plan in the current session.
- Unverified supply links use relationship status `Hypothesis` and dashed map edges.

## State and synchronization

The server loads the owner-scoped `global-sales` workspace and its live-search companies from PostgreSQL. `assistant_conversation`, `assistant_message`, and `assistant_action` persist user interaction and proposed/confirmed search actions with tenant RLS. Search results retain both run and country identifiers; the client groups companies by country while preserving normalized company editing and audit events.

## Failure behavior

Search and enrichment jobs fail explicitly when a provider is unavailable. Tavily requests use limited retries for transient network failures, and contact replacement happens per company only after the new evidence is ready. Mock companies are never substituted into live results.

The lead graph checkpoints every node in the RDS `langgraph` schema. Failed actions retain their thread and can be retried. Only evidence-qualified assessments with all eligibility gates passing and a server-recomputed score of at least 50 are published.

The Assistant graph supplies the last eight conversation turns to the Kimi-k3 intent/plan Agent. Its JSON plan is schema-validated and normalized before routing. Low-confidence plans become clarification questions. A corrected lead request cancels only older `proposed` actions in the same conversation; confirmed or running work is never silently replaced. Hybrid research sends only the public subquestions to stable Gemini 3.6 Flash, requires an observed Google Search call and URL citations, then sends the bounded internal and external evidence to OpenAI through Lingyu for final synthesis. Gemini 3.6 is the reliability default because it completed all three v4 benchmark runs after 3.7 returned repeated high-demand failures.

The Development Strategy graph is invoked manually for a selected qualified company rather than for every lead-search result. It loads the persisted assessment and Market Playbook, retrieves product/company facts through hybrid RAG, syncs only human-approved `email-template` mailbox artifacts into the user's private style lane, and combines them with shared team templates. Kimi-k3 first produces a structured strategy and then a style-conditioned draft. Company and Cudy factual sentences carry internal evidence markers during generation; the server rejects unknown IDs and removes valid markers from the recipient-facing body before persisting `outreach_draft`. Manual approval is stored but cannot send email. A future delivery tool must remain a separate, explicitly confirmed action.

## Security and privacy

- No secrets are shipped to the browser or repository.
- Users have independent database sessions and owner-scoped workspaces, conversations, search actions, knowledge documents, RAG retrieval, contacts and mailbox records.
- Tavily is never called while interpreting a request; only the authenticated confirmation endpoint can atomically claim and execute a proposed search action.
- Alibaba Mail uses per-user read-only IMAP credentials encrypted with AES-256-GCM; mailbox tables enforce composite user ownership across connections, cursors, messages and derived candidates.
- Mail-derived policies, customer signals and templates require human review before promotion; no mailbox content is shared across users.
- Mailbox import and Kimi learning progress is persisted per user and polled by the UI once per second, allowing review while later messages are still being analyzed.
- Only public business-page/profile contacts are collected; private or login-gated data is not scraped.
- Public, verified and pattern-guessed emails have distinct statuses. Pattern guesses require a public name and a public same-domain personalized pattern.
- External links open public business sources only.
- No outbound communication is executed.

## Contact verification direction

The Contact Verification Agent consumes crawler findings and retained source evidence. DeepSeek performs structured evidence assessment, while deterministic rules authoritatively assign `Official`, `HighConfidence`, or `NeedsReview`; invalid addresses use a separate lifecycle state. Automatic mode publishes one current, supersedable decision per email candidate, retains the crawler's source status, creates review work for non-accepted outcomes, and writes a workspace audit event. Shadow mode remains available for evaluation. Accuracy, role relevance, reachability, and delivery state remain separate dimensions. Company size affects the reachability of general official channels but never reduces source authenticity. Proactive LinkedIn crawling and outbound verification remain disabled. See [CONTACT_VERIFICATION_AGENT.md](./CONTACT_VERIFICATION_AGENT.md).

Outbound delivery verification is a separate, disabled-by-default future boundary and requires explicit approval before implementation and activation.
