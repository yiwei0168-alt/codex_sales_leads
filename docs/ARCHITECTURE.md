# Architecture

## Shared knowledge orchestration

The standalone LangGraph runtime registers `knowledge_workflow` alongside the assistant and lead graphs. Both the assistant internal-knowledge branch and the knowledge-page HTTP entry use its document, verified-fact, and generated-explanation branches. Document/fact branches enforce database ACL and provenance locally and do not require embedding or answer generation; only complex explanations enter the existing guarded RAG contract. The Next.js API is an SDK client, not a second knowledge runner.

Complex retrieval filters tenant/scope before three independent candidate lanes. Vector candidates require compatible vectors, while keyword and structured candidates may include null-vector chunks. A versioned attribute registry supplies bounded multilingual lexical expansion; ranking score is not exposed as answer confidence. Evidence assembly adds same-heading neighbors and question-relevant windows while rechecking the original eligible set.

Reusable query embeddings and evidence packets are cached only after success. Keys include user scope, filters, active corpus revision, alias version, embedding model and dimensions; cached evidence is authorized again on every hit. Generated prose, failures and empty evidence are not cached. Index generations remain separately validated/active and are switched only by an explicit transactional command with an append-only job record.

Binary knowledge ingestion is separate from the legacy JSON text path. Authenticated multipart uploads accept only signature-checked PDF/PPTX/XLSX files up to 25 MB, save the private original under a user-scoped knowledge root and append a `knowledge_upload_job`. The HTTP request never parses or embeds the file. `knowledge:process-uploads` claims pending jobs and reuses the local layout-v2 extractor to create a reviewable artifact with no provider call; extraction alone does not publish, index or activate the content.

P8 release verification keeps provider use opt-in. Product/company/industry verification defaults to lexical/structured SQL and requires `--live` for embeddings. The authenticated product harness exercises document and verified-fact paths through Next.js, the standalone `knowledge_workflow`, PostgreSQL and the rendered UI at desktop/mobile sizes. A 30-request hot-path sample measured P95 793.10 ms with zero embedding/generation calls; complex generated-answer performance remains unverified. After explicit disclosure/cost authorization, resumable construction produced all 10,871 v2 vectors; the frozen 200-case gate, 48 focused knowledge/RAG assertions and typecheck passed, and generation `3917a242-724e-4e36-a1da-04c496a9df2d` is now active. Provider cash cost and live complex-answer quality remain separately unverified.

## Product strategy

The product uses one owner-scoped global workspace with country-partitioned search results. A persistent conversational home routes knowledge questions to private/shared RAG and lead-discovery requests to an explicit confirmation boundary. Historical Mexico assets remain test/reference data and do not constrain runtime markets.

```text
Natural-language request → Assistant StateGraph
  → Kimi-k3 intent + plan Agent (recent conversation context)
  ├─ internal question → tenant-aware hybrid RAG → cited answer
  ├─ internal + public question → internal RAG ∥ Gemini Google Search → OpenAI via OpenRouter synthesis
  ├─ uncertain request → targeted clarification → next conversation turn
  └─ lead search → proposed/revisable action → explicit user confirmation
                                      ↓
       Lead StateGraph + PostgreSQL checkpoints
       RAG gate → Market Playbook → role-aware hybrid discovery + light gate → Tavily evidence → independent score agent → qualified records
                                      ↓ selected company
       Development Strategy StateGraph
       context → dedicated outreach RAG + approved long-form templates → one-call Kimi strategy + draft → Claude via OpenRouter review revision + feedback memory
```

## Layers

| Layer | Current implementation | Production extension |
|---|---|---|
| Search/import | Category-specific Gemini/SearchAPI/Places/Brave/Exa discovery; Tavily evidence-only | Scheduled gap search and measured route optimization |
| Evidence | PostgreSQL search runs, URLs and captured excerpts | Source refresh and change detection |
| Domain | Typed Company, ChannelNode context, scoring inputs, relationships and plans | Repository-backed services and audit log |
| AI pipeline | OpenAI via OpenRouter planner/reviewer + DeepSeek Flash/Pro qualification | Separate strategic-customer graph |
| Application | Next.js App Router, persistent conversations, inline graph and durable DB jobs | Deploy worker on ECS/long-running Node compute |

## RAG knowledge architecture

KQ04 v3 is being built as a shadow release and is not active yet. The currently active runtime still reads the legacy `knowledge_chunk` path; the v2 generation is retained as rollback evidence. The target production path is:

```text
registered knowledge_asset
  → local Docling standard pipeline / accurate tables / local RapidOCR
  → source revision + page/slide/sheet terminal status
  → canonical parent/child chunks + row-scoped entity bindings
  → deterministic facts and review queue
  → exact facts + PostgreSQL FTS + Qwen V4 1536 + local BGE-M3 1024
  → ACL/entity/version hard filters → RRF → evidence windows
  → LangGraph fact / comparison / explanation nodes
  → release-bound citations and original-file coordinates
```

Migration 083 now provides the inactive v3 storage contract: scoped releases and manifests, source/unit terminal states, parent chunks, row-scoped entities, separate 1,536/1,024-vector columns and partial HNSW indexes, typed facts, review queue, release pointers and a guarded activation function. Every v3 table has forced RLS. The isolated Docling 2.126.0 pilot uses accurate TableFormer, local RapidOCR Chinese/Latin checkpoints, a single-threaded Docling Parse PDF backend for Windows Unicode-profile compatibility, and a local 500-token HybridChunker. Its fixed 30-file pilot parsed 423 page/slide/sheet units into 577 chunks. Visual rendering proved that all 29 initial text-empty candidates contain meaningful page or slide content, so extractor v3.0.3 classifies this pattern as `review-required` instead of `blank`, runs a local-only high-resolution RapidOCR fallback and preserves XLSX sheet/row/cell coordinates. That fallback recovered 9,068 characters from 26/29 units as candidate evidence; the user allowed those exact source-hash/unit pairs into an inactive shadow release without verification and confirmed the remaining three decorative covers need no body text. The database-exported manifest covers 281 logical assets through 221 unique physical sources. Its one multiply registered physical source is the shared XLSX catalog; normalized exact model-cell matching creates one row chunk per registered entity and prevents a logical catalog category from binding unrelated rows. Each embedding is bound to a versioned profile, model revision, dimensions and chunk content hash. Activation requires complete per-scope manifests and occurs by a short pointer transaction; a private owner's incomplete corpus cannot block or contaminate another scope. RAGFlow is not a production dependency. No v3 release exists yet, so the diagram below still describes the live legacy service.

The implemented v3 runtime boundary resolves an active release pointer before retrieval. It fuses release-scoped deterministic facts, PostgreSQL full text, Qwen V4 dense and local BGE-M3 dense candidates after ACL/entity filtering. Qwen and BGE query embeddings have independent cache identities and failure states; either or both vector lanes may be unavailable while fact/full-text retrieval continues. Local BGE uses the pinned official revision `5617a9f61b028005a4858fdac845db406aefb181` through a loopback-only service. This is shadow-path implementation evidence, not proof that the inactive release is complete or eligible for activation.

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

Search and enrichment jobs fail explicitly when a provider is unavailable. Discovery providers and Tavily evidence requests use limited retries for transient failures; same-tier route alternatives may continue, but mock companies are never substituted into live results. The lightweight DeepSeek Flash discovery gate holds a batch when its model is unavailable and never upgrades to Pro.

The lead graph checkpoints every node in the RDS `langgraph` schema. Failed actions retain their thread and can be retried. Only evidence-qualified assessments with all eligibility gates passing and a server-recomputed score of at least 50 are published.

The Assistant graph supplies the last eight conversation turns to the Kimi-k3 intent/plan Agent. Its JSON plan is schema-validated and normalized before routing. Low-confidence plans become clarification questions. A corrected lead request cancels only older `proposed` actions in the same conversation; confirmed or running work is never silently replaced. Hybrid research sends only the public subquestions to stable Gemini 3.6 Flash, requires an observed Google Search call and URL citations, then sends the bounded internal and external evidence to an OpenAI model through OpenRouter for final synthesis. Gemini 3.6 is the reliability default because it completed all three v4 benchmark runs after 3.7 returned repeated high-demand failures.

The Development Strategy graph is invoked manually for a selected qualified company rather than for every lead-search result. It loads the persisted assessment and Market Playbook, but does not query the detailed product-specification RAG. A dedicated `outreach_knowledge_item` hybrid index contains only the high-priority Cudy company profile, distribution policy, market-specific proof and Agent-screened private feedback memories. Role-matched sanitized long-form templates and approved private email styles provide structure and target length. Kimi-k3 produces the strategy and complete initial draft in one call; Claude through OpenRouter applies explicit human feedback and screens private reusable memory. Latency, token usage and the gateway-reported request cost are persisted when available. Company and Cudy factual sentences carry internal evidence markers during generation and revision, and the server rejects unknown IDs before removing valid markers from the recipient-facing body. Every generated or revised version returns to `generated` status and requires human approval. Feedback creates a new revision; only explicitly approved reusable market facts, sender identity, channel lessons or stable style preferences enter private memory. A future delivery tool must remain a separate, explicitly confirmed action.

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
