# Product UI v1.1 implementation workflow

Authoritative scope: `Network_Channel_Copilot_PRD_v1.1.md`. Product functionality is explicitly authorized; experiment mechanism migrations are not included.

## Stage 1a: country routing

Authenticated user -> current owner-scoped workspace + user's search-action countries -> country selector -> `/markets/{country}/{leads|channel-map}` -> freshly loaded saved workspace -> selected-country list/map. Names are normalized across supported locales. All-country maps show a selection prompt. Conversation result buttons pass the task country. Switching countries does not invoke acquisition, scoring or generation.

Verification: country normalization unit tests and TypeScript. This stage does not claim completion of the table redesign, polling/incremental persistence, map relationship editing or other PRD functionality.

## Remaining stages

Stage 1b implemented: role/account/path editing saves owner-scoped JSON overrides on workspace_company, with audit history and company-scoped private memory in one transaction. A role change invalidates score applicability and repairs incompatible account tiers. API returns persisted company state; UI does not optimistically claim a failed save. Development context merges overrides and current workspace fields, and excludes stale assessment/handoff. Company-classification memory is excluded from broad preference RAG; it is applied directly only to its company. Migration 036 applied successfully. Five domain/navigation tests, TypeScript and targeted lint passed. Array-generated map links were removed. Relationship CRUD, compact list redesign and all later stages remain pending.

1. Finish compact lead list, task linkage, role/score/path detail and manual persistence.
2. Implement relationship storage/maintenance and manual company creation.
3. Single-user opportunities, outbound email, historical messages and follow-up Agent.
4. Unified task center, memory management, mailbox learning and final integration.

All stages must update the PRD status and efficiency ledger, inspect diffs, run appropriate checks and push verified commits. No customer email is sent during implementation testing.
