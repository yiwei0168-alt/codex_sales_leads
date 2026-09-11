# Company identity and country business state v1

Status: additive foundation, not yet a production cutover. Migration 047 was tested in a real database transaction and rolled back. Production currently still reads legacy membership; do not claim multi-country correctness is already fixed.

## Confirmed boundary

One normalized domain retains its existing `sales_company.id` and existing contact/evidence foreign keys. A workspace has one business snapshot per `(company_id,country_code)`. Scoring, primary role, account tier, cooperation paths, user overrides and development state belong to that snapshot, not to the shared company. Public evidence remains reusable through the public evidence library; no private classification or user memory is published there.

`candidate_id` is an opaque workspace-resolved key, distinct from global company identity. The backfilled market retains the old external ID so existing links can be preserved; new markets receive distinct deterministic IDs. IDs are not authorization. Every reader/writer must resolve the candidate inside the authenticated workspace; database owner RLS is mandatory.

## Migration and reassessment

047 only snapshots the one known legacy membership and retains every legacy row/FK. It never invents other past markets. A conflicting country or assessment-run association marks the legacy snapshot as needing review. Raw legacy data is retained for audit, not represented as a newly verified assessment. Materialization forces the stored country/candidate keys after applying private overrides.

Assessment persistence locks the stable membership, then writes only the target country. It retains that country's user overrides, candidate ID and development progress. A new country is an addition even if its company identity was seen elsewhere; model role changes do not count as replacements of a user-confirmed primary role. No model, embedding, search or mail request is needed for these operations.

## Cutover gate

Before enabling the new writer/readers together, adapt manual addition, company edits/assessment, assistant library lookup, contact aliases, relationship graph, strategies, outbound history and follow-up context. Existing mail/strategy records must receive a country only from adequate stored provenance; ambiguous history remains visibly unassigned, never copied to every country. Update actual-sent state only for the sending market. Test isolation and legacy links end to end. Do not dual-write country state back into global business fields.

## Verification and cost

Six pure/mocked tests cover keys, country forcing, same-market updates, new-market additions, progress protection and membership rejection. `scripts/verify-company-market-migration.ts` defaults to rolling back both schema and probe writes; it verifies owner visibility, cross-owner read/update denial and independent country changes. `--apply` is an explicit deployment action, not the default.

At cutover, persist aggregate input/valid/used counts, country additions/updates/role changes, latency, zero local-operation token/search cost and retry/discard reasons in the existing workflow audit. This foundation itself introduces no production stage or paid operation. Optimization opportunity: reuse identity/public evidence across countries while keeping scoring-context caches country-specific; do not conflate this with a measured reduction in tokens.
