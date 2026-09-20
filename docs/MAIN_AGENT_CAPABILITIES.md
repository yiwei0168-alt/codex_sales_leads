# Main Agent capability migration inventory

Baseline: `a65bc74` on `delivery/deep-intelligence-ui`, equal to local origin/main. Existing untracked experiment artifacts are excluded. Inventory covers all 53 API routes; assignment does not claim callable implementation.

| Domain | Existing services | Migration / implicit dependency | External side effect |
|---|---|---|---|
| Knowledge | knowledge/graph, rag, assets/uploads/reviews | Reuse v3; independent retrieval/facts/originals/uploads/review/index/publish; admin shared changes | Model disclosure, publication |
| Companies/markets | workspaces/current, channel-relationships | Independent query/state/classification/relationships/cooperation paths; public evidence separate from private state | Recoverable writes |
| Search | leads/workflow, search providers | Independent playbook/single-channel/hybrid/candidate processing; remove three-knowledge-corpus prerequisite | Paid searches |
| Evidence | collector/correction, snapshots | Existing evidence/targeted collection/extract/save/version compare without full discovery restart | Web calls, persistence |
| Roles/scoring | qualification/review agents, policy | Independent role/correction/score/review/disagreement tools; preserve evidence and formal scoring version | Model calls, formal publication |
| Contacts | contacts/lookup-service, verification | Independent discovery/enrichment/verification/ownership/persistence | External queries |
| Outreach/mail | outreach/graph, mailbox | Independent strategy/draft/revision/follow-up/query/sync/send/reconcile; central exact approval | SMTP sends |
| Memory/policy | outreach memory-management/knowledge-repository | Unified account interface, version/source/disable/delete; new mandatory policies | Global publication |
| Skills/connections | mailbox connections; no current Skill/MCP service | Add scope/version/dependency/sandbox; credentials stay in connection layer | Permissions, sandbox/browser writes |
| Tasks/admin | assistant actions/tasks, billing | Generic runs/events/control/scheduling/usage/admin config | Later scheduled business |
| Infrastructure | auth/migrations/host operations | Authentication UI remains; migrations/host admin/credential reads excluded from business tools | Not exposed |

## API coverage

Current independently registered adapters and schema validation are generated in [MAIN_AGENT_TOOL_CATALOG.md](MAIN_AGENT_TOOL_CATALOG.md). There are 62 adapters after the company-detail read stage. The assignments below remain a migration inventory, not a declaration that all routes have been implemented as tools. New research artifacts compose through owned server call IDs, independently of legacy workflow positions. Formal publication, uploaded-material scoring, other knowledge administration, contact verification, other company write paths, private/non-GitHub Skill repositories and external-connection operations remain outstanding.

| Current API | Methods | Migration assignment | Source |
|---|---|---|---|
| `/api/assistant/actions/[id]/confirm` | POST | protocol/compatibility entry | `src/app/api/assistant/actions/[id]/confirm/route.ts` |
| `/api/assistant/actions/[id]/continue` | POST | protocol/compatibility entry | `src/app/api/assistant/actions/[id]/continue/route.ts` |
| `/api/assistant/actions/[id]/progress` | GET,POST | protocol/compatibility entry | `src/app/api/assistant/actions/[id]/progress/route.ts` |
| `/api/assistant/actions/[id]/recover` | POST | protocol/compatibility entry | `src/app/api/assistant/actions/[id]/recover/route.ts` |
| `/api/assistant/actions/[id]` | GET | protocol/compatibility entry | `src/app/api/assistant/actions/[id]/route.ts` |
| `/api/assistant/actions` | GET | protocol/compatibility entry | `src/app/api/assistant/actions/route.ts` |
| `/api/assistant/conversations/[id]` | GET,PATCH,DELETE | protocol/compatibility entry | `src/app/api/assistant/conversations/[id]/route.ts` |
| `/api/assistant/conversations` | GET,POST | protocol/compatibility entry | `src/app/api/assistant/conversations/route.ts` |
| `/api/assistant/messages` | POST | protocol/compatibility entry | `src/app/api/assistant/messages/route.ts` |
| `/api/auth/login` | POST | excluded: authentication UI | `src/app/api/auth/login/route.ts` |
| `/api/auth/logout` | POST | excluded: authentication UI | `src/app/api/auth/logout/route.ts` |
| `/api/auth/session` | GET | excluded: authentication UI | `src/app/api/auth/session/route.ts` |
| `/api/budget` | GET,PUT | budget business adapter pending | `src/app/api/budget/route.ts` |
| `/api/channel-relationships/analyze` | POST | channel-relationships business adapter pending | `src/app/api/channel-relationships/analyze/route.ts` |
| `/api/channel-relationships` | GET,POST | channel-relationships business adapter pending | `src/app/api/channel-relationships/route.ts` |
| `/api/contact-enrichment/lookup` | POST | contact-enrichment business adapter pending | `src/app/api/contact-enrichment/lookup/route.ts` |
| `/api/contact-enrichment/runs/latest` | GET | contact-enrichment business adapter pending | `src/app/api/contact-enrichment/runs/latest/route.ts` |
| `/api/development-strategies/[id]/feedback` | POST | development-strategies business adapter pending | `src/app/api/development-strategies/[id]/feedback/route.ts` |
| `/api/development-strategies/[id]` | PATCH | development-strategies business adapter pending | `src/app/api/development-strategies/[id]/route.ts` |
| `/api/development-strategies` | GET,POST | development-strategies business adapter pending | `src/app/api/development-strategies/route.ts` |
| `/api/knowledge/assets/[assetId]` | GET | knowledge business adapter pending | `src/app/api/knowledge/assets/[assetId]/route.ts` |
| `/api/knowledge/documents` | POST | knowledge business adapter pending | `src/app/api/knowledge/documents/route.ts` |
| `/api/knowledge/evaluation-reviews` | GET,PATCH | knowledge business adapter pending | `src/app/api/knowledge/evaluation-reviews/route.ts` |
| `/api/knowledge/library/history` | GET | knowledge business adapter pending | `src/app/api/knowledge/library/history/route.ts` |
| `/api/knowledge/library` | GET,DELETE | knowledge business adapter pending | `src/app/api/knowledge/library/route.ts` |
| `/api/knowledge/mailbox` | GET | knowledge business adapter pending | `src/app/api/knowledge/mailbox/route.ts` |
| `/api/knowledge/memories/history` | GET | Historical audit remains in the existing page; Agent history search exposes active guidance but not the complete audit timeline | `src/app/api/knowledge/memories/history/route.ts` |
| `/api/knowledge/memories` | POST,GET,PATCH | Historical reads: `memory_history_search`; `legacy_memory_set_active` and exact-approved `legacy_memory_delete` share the page service, while historical manual create/edit remains page-only | `src/app/api/knowledge/memories/route.ts` |
| `/api/knowledge/reviews` | GET,PATCH | `knowledge_fact_review_list` / `knowledge_fact_review_decide`; shared input validation and repository, admin-only, exact approval for a decision | `src/app/api/knowledge/reviews/route.ts` |
| `/api/knowledge/status` | GET | knowledge business adapter pending | `src/app/api/knowledge/status/route.ts` |
| `/api/knowledge/uploads` | GET,POST | knowledge business adapter pending | `src/app/api/knowledge/uploads/route.ts` |
| `/api/mailbox/candidates/[id]` | PATCH | mailbox business adapter pending | `src/app/api/mailbox/candidates/[id]/route.ts` |
| `/api/mailbox/candidates` | GET | mailbox business adapter pending | `src/app/api/mailbox/candidates/route.ts` |
| `/api/mailbox/connections/[id]` | PATCH,DELETE | mailbox business adapter pending | `src/app/api/mailbox/connections/[id]/route.ts` |
| `/api/mailbox/connections` | GET,POST | mailbox business adapter pending | `src/app/api/mailbox/connections/route.ts` |
| `/api/mailbox/messages/[id]/learning` | POST | mailbox business adapter pending | `src/app/api/mailbox/messages/[id]/learning/route.ts` |
| `/api/mailbox/messages/[id]` | GET,PATCH,DELETE | mailbox business adapter pending | `src/app/api/mailbox/messages/[id]/route.ts` |
| `/api/mailbox/outbound/follow-up` | GET,POST | mailbox business adapter pending | `src/app/api/mailbox/outbound/follow-up/route.ts` |
| `/api/mailbox/outbound` | PATCH,GET,POST | mailbox business adapter pending | `src/app/api/mailbox/outbound/route.ts` |
| `/api/mailbox/screening` | POST | mailbox business adapter pending | `src/app/api/mailbox/screening/route.ts` |
| `/api/mailbox/status` | GET | mailbox business adapter pending | `src/app/api/mailbox/status/route.ts` |
| `/api/mailbox/sync` | POST | mailbox business adapter pending | `src/app/api/mailbox/sync/route.ts` |
| `/api/rag/query` | POST | rag business adapter pending | `src/app/api/rag/query/route.ts` |
| `/api/tasks/[id]/reconcile` | POST | tasks business adapter pending | `src/app/api/tasks/[id]/reconcile/route.ts` |
| `/api/tasks/[id]` | GET | tasks business adapter pending | `src/app/api/tasks/[id]/route.ts` |
| `/api/tasks/markets` | GET | tasks business adapter pending | `src/app/api/tasks/markets/route.ts` |
| `/api/tasks` | GET | tasks business adapter pending | `src/app/api/tasks/route.ts` |
| `/api/tasks/usage` | GET | tasks business adapter pending | `src/app/api/tasks/usage/route.ts` |
| `/api/workspaces/current/companies/[externalId]/assessment` | GET | `company_assessment_read` shares the owned saved-score service and policy-version projection | `src/app/api/workspaces/current/companies/[externalId]/assessment/route.ts` |
| `/api/workspaces/current/companies/[externalId]/correspondence` | GET | `company_correspondence_list` shares the owned linked-mail metadata service | `src/app/api/workspaces/current/companies/[externalId]/correspondence/route.ts` |
| `/api/workspaces/current/companies/[externalId]` | PATCH | `company_state_update` and the page share validation, repository and required current revision; stale writes return 409 | `src/app/api/workspaces/current/companies/[externalId]/route.ts` |
| `/api/workspaces/current/companies` | POST | workspaces business adapter pending | `src/app/api/workspaces/current/companies/route.ts` |
| `/api/workspaces/current` | GET,PATCH | workspaces business adapter pending | `src/app/api/workspaces/current/route.ts` |

## Baseline quality and runtime

Main assistant currently calls planAssistantRequest then fixed intent branches; HTTP waits on SDK runs.wait(null, ...), without persistent main Thread. Lead tasks already have PostgreSQL checkpoints and leased workers. A33 financial observation applies to one configured owner; lower layers still contain strict gates. SMTP requires company linkage. Generic Skills/MCP/sandbox/scheduling are absent.

Pre-change tests: 1191 passed, 2 failed (239 files; 28.82 seconds). Both failures are product-boundaries tariff expectations (expired-tariff instead of missing-tariff), recorded independently from new implementation. Real main-Agent task completion, clarification error, tokens, bills and latency are unknown. Provider outage, unfinished task and business disqualification must be separate outcomes.
