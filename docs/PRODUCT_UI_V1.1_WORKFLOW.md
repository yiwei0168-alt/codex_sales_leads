# Product UI v1.1 implementation workflow

Authoritative scope: `Network_Channel_Copilot_PRD_v1.1.md`. Product functionality is explicitly authorized; experiment mechanism migrations are not included.

## Stage 1a: country routing

Authenticated user -> current owner-scoped workspace + user's search-action countries -> country selector -> `/markets/{country}/{leads|channel-map}` -> freshly loaded saved workspace -> selected-country list/map. Names are normalized across supported locales. All-country maps show a selection prompt. Conversation result buttons pass the task country. Switching countries does not invoke acquisition, scoring or generation.

Verification: country normalization unit tests and TypeScript. This stage does not claim completion of the table redesign, polling/incremental persistence, map relationship editing or other PRD functionality.

## Remaining stages

Stage 2a: user-channel relationships replace the legacy map. Stored edges are owner/country scoped and require two workspace members in the requested country. Pending, user-confirmed and user-rejected changes persist with audit history and a relationship-scoped private-memory record; users cannot label their own submission evidence-supported. Same-direction/type saves update the existing edge. All current-market company nodes are reachable by scroll/search, with no fixed 5+8 cap. Manual company creation deduplicates owned domains across countries and names within a country; website is optional, and new records remain unassessed. Existing shared records are not overwritten; user-specific display/classification lives in workspace overrides. Relationship decisions now enter development strategy context, including rejected states. No automatic search, scoring or email sending occurs.

Validation: migration 037 applied; three schema/domain tests passed; typecheck and targeted lint passed. Database smoke verified insert, owner read and other-user invisibility under the application role, rolling back all test writes. Browser automation exposes no browser surfaces in this session, so visual and authenticated interaction QA remain unverified. Cross-country duplicate domains currently require opening the original country; the legacy one-workspace-company membership cannot represent the same company in multiple countries independently. Relationship edit of type/endpoints creates another edge; users should reject the old edge when replacing it. Group collapse/zoom, relation freshness, automatic analysis and complete detail UI remain pending.

Stage 1c: six business columns now show company, primary role, account tier, current score, selected cooperation path and stage; evidence confidence lives in detail. Missing paths display unanalysed. Empty results are explicit. Evidence older than one calendar year is flagged using the latest dated Verified/Corroborated source, excluding inference and future/invalid timestamps. One freshness test, typecheck and targeted lint passed. Fine-grained status filters, timestamps from persisted qualification and UI integration verification remain open.

Stage 1b implemented: role/account/path editing saves owner-scoped JSON overrides on workspace_company, with audit history and company-scoped private memory in one transaction. A role change invalidates score applicability and repairs incompatible account tiers. API returns persisted company state; UI does not optimistically claim a failed save. Development context merges overrides and current workspace fields, and excludes stale assessment/handoff. Company-classification memory is excluded from broad preference RAG; it is applied directly only to its company. Migration 036 applied successfully. Five domain/navigation tests, TypeScript and targeted lint passed. Array-generated map links were removed. Relationship CRUD, compact list redesign and all later stages remain pending.

1. Finish compact lead list, task linkage, role/score/path detail and manual persistence.
2. Implement relationship storage/maintenance and manual company creation.
3. Single-user opportunities, outbound email, historical messages and follow-up Agent.
4. Unified task center, memory management, mailbox learning and final integration.

All stages must update the PRD status and efficiency ledger, inspect diffs, run appropriate checks and push verified commits. No customer email is sent during implementation testing.
