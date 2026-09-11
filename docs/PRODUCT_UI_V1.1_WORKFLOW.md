# Product UI v1.1 implementation workflow

Authoritative scope: `Network_Channel_Copilot_PRD_v1.1.md`. Product functionality is explicitly authorized; experiment mechanism migrations are not included.

## Stage 1a: country routing

Authenticated user -> current owner-scoped workspace + user's search-action countries -> country selector -> `/markets/{country}/{leads|channel-map}` -> freshly loaded saved workspace -> selected-country list/map. Names are normalized across supported locales. All-country maps show a selection prompt. Conversation result buttons pass the task country. Switching countries does not invoke acquisition, scoring or generation.

Verification: country normalization unit tests and TypeScript. This stage does not claim completion of the table redesign, polling/incremental persistence, map relationship editing or other PRD functionality.

## Remaining stages

### Stage 4e: multi-type task feed

Task center now reads one owner-scoped projection of assistant searches, contact enrichment batches, outreach drafts and outbound SMTP records. Type/country/status filtering happens before pagination across history; 50 rows plus one sentinel. Existing search detail links remain unchanged. Draft approval is explicitly not proof of sending; SMTP acceptance is not delivery/read. Unknown SMTP status asks for verification, never auto-retry. Contact batches without reliable country snapshots remain unknown/mixed; draft/send countries reflect current canonical company country rather than an immutable task snapshot.

Metadata-only list excludes email bodies/addresses, strategies, evidence and full model responses. Visible active pages poll at five seconds with per-effect in-flight deduplication; terminal pages use manual refresh. Existing latest-contact detail is lazily expanded and explicitly independent of feed filters. This is four-source history integration, not a fully unified execution engine: relationship analysis, standalone scoring, running/failed draft-generation attempts and follow-up generation audits are not yet integrated. Full typed detail/recovery and per-step budget accounting remain pending.

Validation: three API/status tests, TypeScript, targeted lint and real DB read-only execution for all four branches under the application role, with unknown-owner results empty. No paid calls or data writes in feed verification. Authenticated visual QA remains outstanding.

### Stage 4d: transactional memory change audit

Migration 039 adds owner-RLS `user_memory_audit` and an AFTER INSERT/UPDATE/DELETE trigger on private memories. Every source writer, including Agent upserts and workspace-less manual saves, now produces audit in the same transaction; timestamp-only changes are suppressed. Owner UI lazily opens paginated history, including deleted memory IDs. Snapshots contain status, kind, scope and content length, plus changed field names, but no title, body, embedding or arbitrary context. This is change auditing, not full-text version recovery; historical text rollback remains unsupported and pre-migration changes are not reconstructed.

Migration applied. Real-database rollback smoke passed for create/archive/delete, no-op suppression, no private text duplication and other-user RLS invisibility. API tests cover auth, pagination and private caching; TypeScript and targeted lint pass. No paid API call or real user deletion occurred. Browser interaction QA remains outstanding.

### Stage 4c: manual style/claim authoring

Private memory editor -> explicit scope/content confirmation -> owner-locked, version-checked save -> existing Embedding provider for changed content only -> atomic content/vector write. Stable create IDs block duplicate records/calls on retry; conflicts are surfaced, not overwritten. Title/scope-only edits reuse vectors. Archived records stay archived when edited. Marketing claims require explicit external-use approval and remain excluded from objective scoring. Company-specific facts and structured path choices continue through their authoritative editors; arbitrary text cannot rewrite structured path history.

Private outreach RAG now filters country and role scope before ranking, rather than merely rewarding matches. Manual content caps at 1,200 characters to avoid truncating new preferences in downstream packets. No embedding failover is introduced. Eleven mocked memory tests, TypeScript and targeted lint pass; no paid embedding call or live-browser save was performed. Remaining: complete revision/provenance audit, company-specific memory authoring, price normalization and durable failure telemetry; manual scope fields currently require canonical role names and two-letter country codes.

### Stage 4b: private-memory lifecycle

Knowledge page -> session-owner memory list (50 per page) -> explicit confirmation -> archive/activate/delete transaction. Only reusable preferences/approved claims have lifecycle controls; company-classification mirrors are maintained through company/relationship source editors. Existing mail, current classifications, relationship facts and audit history are not deleted. Private RAG already requires active status. Path learning now also requires a matching active `path-edit:{id}` memory instead of unconditionally replaying modification history. Deleted or archived path preferences cannot re-enter through that history reader. Legacy edits without a matching memory are conservatively excluded. In-flight contexts and already generated drafts are not retroactively rewritten.

No new schema, embedding or generation calls. Deletion removes the memory record, not source material, after an explicit irreversible-action warning. Source reprocessing may create new memory and is not a permanent forget/blocklist. Create/edit, provenance links, full lifecycle auditing for workspace-less records and downstream consumption telemetry remain pending. Five focused tests, TypeScript and targeted lint validate this stage; authenticated UI/real-database interaction QA remains outstanding.

### Stage 4a: search task visibility

Task center -> owner-scoped assistant actions (50 per page) -> page-local country/status filters -> `/tasks/{id}` -> owner-checked search detail. Conversation cards link to the same detail component. Counts distinguish missing from measured zero, qualified from persisted and completed-shortfall from target met. Country-library links explicitly include other tasks' results. List projects only result counters; original request appears on detail. No search/retry/model action is triggered. Active pages poll every five seconds, pause when hidden and refresh on visibility return; terminal lists use manual refresh. Contact enrichment mounts only when expanded.

This stage does not yet unify strategy, relationships, sending and all contact history into one task model. Per-stage live logs, task-specific company lists, budget/cost breakdown and safe stop/resume remain pending. Detail is explicitly a page-load snapshot. Validation: four mocked API/count tests, TypeScript and targeted lint; no live authenticated browser QA.

### Stage 3a: opportunities and explicit outbound mail

Owner workspace -> seven-stage board/list -> next action/date or manual Contacted -> canonical persisted company. No team owner. SMTP acceptance advances only early stages to Contacted and protects that state from search refresh; later stages are never downgraded. Sent summaries show first/latest acceptance and follow-up counts, distinct from manual contact.

Owner mailbox -> explicit SMTP verification -> reviewed single recipient/subject/body -> encrypted sending reservation -> one SMTP call -> sent/failed/unknown receipt. Owner/key and owner/content uniqueness prevent resubmission after refresh. Uncertain sends are locked, not retried; acceptance does not establish delivery/read. Owner-only history supports original-mail expansion and reuse for another contact with recipient cleared. Follow-up selects original sender/recipient and explicitly invokes existing Kimi with an 1,800-token output cap; no search or strategy regeneration. User edits and separately confirms sending with reply headers linked to the parent.

Migration 038 applied locally. Verification: 11 focused tests, TypeScript and targeted lint, without real SMTP delivery or paid inference. Remaining: authenticated visual/live-mailbox QA, unknown-receipt reconciliation, full conversation/private style-memory retrieval, durable draft usage linkage and complete failed-call model metering. History caps at 100 messages per company. This is not completion of the full PRD.

Stage 2a: user-channel relationships replace the legacy map. Stored edges are owner/country scoped and require two workspace members in the requested country. Pending, user-confirmed and user-rejected changes persist with audit history and a relationship-scoped private-memory record; users cannot label their own submission evidence-supported. Same-direction/type saves update the existing edge. All current-market company nodes are reachable by scroll/search, with no fixed 5+8 cap. Manual company creation deduplicates owned domains across countries and names within a country; website is optional, and new records remain unassessed. Existing shared records are not overwritten; user-specific display/classification lives in workspace overrides. Relationship decisions now enter development strategy context, including rejected states. No automatic search, scoring or email sending occurs.

Validation: migration 037 applied; three schema/domain tests passed; typecheck and targeted lint passed. Database smoke verified insert, owner read and other-user invisibility under the application role, rolling back all test writes. Browser automation exposes no browser surfaces in this session, so visual and authenticated interaction QA remain unverified. Cross-country duplicate domains currently require opening the original country; the legacy one-workspace-company membership cannot represent the same company in multiple countries independently. Relationship edit of type/endpoints creates another edge; users should reject the old edge when replacing it. Group collapse/zoom, relation freshness, automatic analysis and complete detail UI remain pending.

Stage 1c: six business columns now show company, primary role, account tier, current score, selected cooperation path and stage; evidence confidence lives in detail. Missing paths display unanalysed. Empty results are explicit. Evidence older than one calendar year is flagged using the latest dated Verified/Corroborated source, excluding inference and future/invalid timestamps. One freshness test, typecheck and targeted lint passed. Fine-grained status filters, timestamps from persisted qualification and UI integration verification remain open.

Stage 1b implemented: role/account/path editing saves owner-scoped JSON overrides on workspace_company, with audit history and company-scoped private memory in one transaction. A role change invalidates score applicability and repairs incompatible account tiers. API returns persisted company state; UI does not optimistically claim a failed save. Development context merges overrides and current workspace fields, and excludes stale assessment/handoff. Company-classification memory is excluded from broad preference RAG; it is applied directly only to its company. Migration 036 applied successfully. Five domain/navigation tests, TypeScript and targeted lint passed. Array-generated map links were removed. Relationship CRUD, compact list redesign and all later stages remain pending.

1. Finish compact lead list, task linkage, role/score/path detail and manual persistence.
2. Implement relationship storage/maintenance and manual company creation.
3. Single-user opportunities, outbound email, historical messages and follow-up Agent.
4. Unified task center, memory management, mailbox learning and final integration.

All stages must update the PRD status and efficiency ledger, inspect diffs, run appropriate checks and push verified commits. No customer email is sent during implementation testing.
## 2026-09-11 completion continuation: persisted UI and safe recovery

Country opportunities now have independent URLs. Global overview uses actual company counts, not fabricated coverage percentages. Lead partitions/advanced score, path, stage and freshness filters reuse stored records. Bulk changes serialize owner-checked existing mutation calls; failed rows remain selected, and next-action forms stay open on failure. Company detail has overview, historical scoring policy/dimensions/evidence and development tabs. Saved strategy is loaded without generation; asynchronous generation responses cannot overwrite another selected company. Legacy placeholder overview/drawer and notification counts were removed. Relationship map adds role grouping visibility, zoom and evidence freshness.

Contact lookup now reserves a tenant/company/provider cache before a paid call, persists contact/email records and task status, and reuses completed results even when old. Explicit re-verification is required to spend again. Running calls cannot be duplicated; ambiguous failures are not automatically retried. Provider-reported emails are not represented as independently Agent-verified. Migration 040 is applied. A crashed running reservation still needs operational reconciliation; it is deliberately not silently retried.

Search tasks support requested pause at stage entry, not cancellation of in-flight provider work. Migration 041 is applied. Failed/paused execution resumes the existing LangGraph pending stage using null input instead of resetting arrays and credits. Completed checkpoints reuse the result if downstream receipt handling failed. Checkpoint owner/action identity is verified. A pause arriving during final persistence does not reclassify committed results as failed. User confirms possible subsequent cost before resume. Read-only progress displays checkpoint stage metrics/usage, not uncommitted in-flight cost.

Validation: all 461 tests across 103 files, TypeScript and production build passed; lint has zero errors and 11 pre-existing warnings. Migrations 040–041 applied. No paid provider/SMTP calls or authenticated visual QA claimed. Remaining checklist remains authoritative; this stage is not full PRD completion.
## 2026-09-11 continuation: mail management and task drilldown

Verification for this stage: all 469 tests in 106 files, TypeScript and production build pass. Lint remains zero errors with 11 existing warnings. Testing did not send mail, delete user mail, disconnect a real account or call a paid model. Live mailbox/provider acceptance and authenticated visual QA are not certified by these checks.

Outbound history is paginated at 50 records. User-confirmed reconciliation applies only to unknown/stale-sending records, labels its source and never calls SMTP. Follow-up retrieves at most eight same-sender/recipient ancestors and four active workspace/market/role-scoped style memories; original body and ancestor excerpts are bounded. This is sent-mail context, not fabricated recipient replies. Imported replies are not yet associated with company threads.

Mailbox disconnect clears credentials and retains local records; deleting local imported mail retains confirmed knowledge by default and preserves disabled mailbox identity for outbound receipt references. Neither operation deletes remote mail. Sync exposes inbox/sent scope and date range; explicit historical import skips known UIDs and does not advance incremental cursors. Individual message deletion and company association remain open.

Leads now use stored assessment eligibility for partitions, retain unknown legacy qualification as review-required, and offer record-created/workspace-updated sorting. Visible workspaces refresh stored results every 30 seconds, guarding against stale refresh overwriting in-flight edits. Task center opens all four task types in a common drawer; its separate URL reuses the same detail view. Search candidate diagnostics are bounded to 100 records with truncation disclosed. Score presentation reads saved policy weights; no current-policy substitution.
## 2026-09-11 continuation: local knowledge, relationship analysis and mailbox links

Knowledge management now has separately scoped private/shared/public-evidence lists; shared evidence remains read-only. Private-document deletion does not delete raw mail. Upload conflicts require confirmation before replacement; an optimistic hash check under a per-document lock rejects concurrent overwrite. New uploads preserve exact content revisions; legacy replaced content is reconstructed from saved chunks and explicitly labelled (not claimed a byte-identical original). History deletion follows document deletion. Migrations 042–044 are applied.

Imported mailbox messages store a domain-matched company only when exactly one owned candidate matches external party domains. Ambiguity remains unresolved; explicit assignment/unlink is preserved across re-import. Local-message deletion is separate from confirmed knowledge, blocks analyzing messages and does not touch remote mail. Message/company association is not by itself proof that a reply belongs to a particular outbound thread.

Explicit directed relationship analysis uses the configured routine DeepSeek/resilient provider, current saved Verified/Corroborated evidence, at most two suggestions and exact-quote validation. It does not add searches or assert actual cooperation automatically. Unchanged input versions reuse a tenant cache; failures/in-flight records are not automatically paid again. Rejections capture evidence fingerprints; unchanged evidence cannot regenerate rejected types. Historical rejections without fingerprints remain suppressed conservatively. Suggestions remain pending until user saves. Relationship task attempts/results/metrics are visible as a fifth task type. Focus filters show one company and its direct neighbours.

Verification: real application-role reads for workspace eligibility and available task kinds passed. Temporary contact-cache and analysis inserts were visible to the owner and invisible to another tenant, then rolled back. Real MemorySaver pause/resume test verifies no duplicate discovery or credit reset. Latest full regression: 474 tests / 108 files passed, lint zero errors and 11 existing warnings, production build passed before the final revision-storage addition; final checks follow. No paid inference or live mail delivery performed.
