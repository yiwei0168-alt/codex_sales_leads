# Company identity and country business state v1

Status: production code cutover implemented, migrations 047/048 applied after rollback validation. Application-role workspace/task reads and owner/country isolation probes passed. This is not an authenticated end-to-end or live SMTP acceptance claim.

## Confirmed boundary

One normalized domain retains its existing `sales_company.id` and existing contact/evidence foreign keys. A workspace has one business snapshot per `(company_id,country_code)`. Scoring, primary role, account tier, cooperation paths, user overrides and development state belong to that snapshot, not to the shared company. Public evidence remains reusable through the public evidence library; no private classification or user memory is published there.

`candidate_id` is an opaque workspace-resolved key, distinct from global company identity. The backfilled market retains the old external ID so existing links can be preserved; new markets receive distinct deterministic IDs. IDs are not authorization. Every reader/writer must resolve the candidate inside the authenticated workspace; database owner RLS is mandatory.

## Migration and reassessment

047 only snapshots the one known legacy membership and retains every legacy row/FK. It never invents other past markets. A conflicting country or assessment-run association marks the legacy snapshot as needing review. Raw legacy data is retained for audit, not represented as a newly verified assessment. Materialization forces the stored country/candidate keys after applying private overrides.

Assessment persistence locks the stable membership, then writes only the target country. It retains that country's user decisions, candidate ID and development progress. A role mismatch with the user's confirmed role keeps the assessment stale and the compatible prior tier; a subsequent matching-role assessment clears only the derived refresh flag, not the user role. Manual additions no longer pin placeholder zero scores/evidence as user decisions. Legacy user-added placeholder score fields are excluded from the migrated override layer but their original rows remain intact. A new country is an addition even if its company identity was seen elsewhere; model role changes do not count as replacements of a user-confirmed primary role. No model, embedding, search or mail request is needed for these operations.

## Active data flow

Search persistence/manual addition -> per-country snapshot -> country list/edit/assessment -> relationship graph, strategy, outbound/follow-up. Contacts remain identity-level within the owner workspace, projected under each country's candidate ID without a new lookup. Website-only contact requests with multiple candidate markets require selection rather than silently choosing one. Imported correspondence remains company-level and is not proof of a specific market's development activity.

Strategy snapshots and new outbound receipts save country explicitly. Legacy draft country is backfilled only from its stored search-run association and an existing matching market. Legacy outbound country is not inferred. Unassigned old messages appear labeled in the company's history for review, are excluded from each country's sent totals, and cannot be used for follow-up until the user explicitly confirms their country. Confirmation is row-locked, owner/company-scoped and audited, with no SMTP or model replay. Ambiguous drafts remain available in the task center as country-unconfirmed history. Actual-sent stage changes affect only the receipt's country. No country business state is written back into the global company record.

## Verification and cost

Pure/mocked tests cover keys, country forcing, same-market updates, manual additions, progress protection, membership rejection and mail assignment. Ten isolated desktop/mobile browser cases include explicit legacy-mail country confirmation (all network calls intercepted). `scripts/verify-company-market-migration.ts` defaults to rolling back both schema and probe writes; it verifies actual reassessment/overrides, unchanged shared identity, owner visibility, cross-owner read/update denial and the security-invoker projection. `--apply` installs only 047/048 after those checks and rolls back test fixtures. Legacy rows are retained.

Search persistence uses existing workflow metrics and country-relative addition/update/role-change counts; manual addition, company edits and legacy-mail country confirmation use local audit aggregates including input/valid/used counts, zero token/search cost, latency and retry/discard reasons. No second model stage is introduced. Optimization opportunity: reuse identity/public evidence across countries while keeping scoring-context caches country-specific; do not conflate this with a measured reduction in tokens.
