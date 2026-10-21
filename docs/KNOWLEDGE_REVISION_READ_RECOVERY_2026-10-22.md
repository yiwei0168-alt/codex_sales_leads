# Historical revision read recovery

## Existing MA24-16 F10 scope

A real React/Chrome component reproduction on the unchanged 02be6338 baseline received valid JSON with `items:[null]`. The browser threw `Cannot read properties of null (reading title)` and emptied the component root instead of presenting a read failure. The original diagnostic retains the exact quoted browser error. No real sources or model calls were used.

The client now validates every history row and the existing ten-row page contract before rendering. Malformed rows, duplicate IDs and wrong field types are read failures. Read failures and new reads clear old rows and paging availability; failed reads do not claim an empty history. Each request has a ten-second deadline; abort and document-key cleanup retain selection ownership. Existing owner-only history API, order/offset, reconstructed and truncation disclosures, document deletion semantics and database retention are unchanged.

## Verification

Independent worktree actual-component Chrome session **24392 exited 0** at 1366/390/320 widths. Null rows, wrong content types and incomplete rows refuse without a React crash; successful retry, 10-offset paging, one-shot read failure, retained retry page, reconstructed warning and long-content wrapping pass. Desktop additionally uses an actual held request to verify the ten-second deadline and recovery. TypeScript/four-file lint/diff check **79967 exited 0**.

The existing native library/HTTPS/API/database fixture now includes the owner eleven-revision history selector, injected malformed row, failed read and same-page recovery in desktop/mobile. New fixed Web build/native acceptance remains pending. These are generated fixtures, not real document quality, natural model answers, human quality approval or deployment. G14-G20 and deployment remain deferred.

## Final fixed-version acceptance

2026-10-22 / Final MA24-16 F10 history recovery acceptance: fixed product/fixtures **ce2e8cbb**, actual Chrome/HTTPS/API/fresh-database **82101 exited 0**. Desktop/mobile eleven-owner-revision 10+1 paging, injected null row without React crash, 503 old-page clearing, same-offset retry and reconstructed-history disclosure pass; existing library/source/RLS/delete recovery checks also pass. Three-width component **24392** additionally verifies wrong row types, incomplete rows, long content and a real ten-second deadline; TypeScript/four-file lint **79967**, all three builds/five package checks pass. Four frozen files match, both native and two representative component screenshots inspected. Main/collector entry artifacts, Node and dependency bytes exactly match 02be6338; source/deployment manifests differ, so full backend-composition evidence remains at 02be6338. No new composition, real quality/provider/human approval/qualification/activation/deployment is claimed. Temporary resources removed; original three services remain. G14-G20 deferred. [Scope](KNOWLEDGE_REVISION_READ_RECOVERY_2026-10-22.md); [evidence](evidence/ma24-g13-knowledge-revision-read-recovery-2026-10-22.json).
