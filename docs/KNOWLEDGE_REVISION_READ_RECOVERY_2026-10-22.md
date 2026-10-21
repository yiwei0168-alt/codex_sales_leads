# Historical revision read recovery

## Existing MA24-16 F10 scope

A real React/Chrome component reproduction on the unchanged 02be6338 baseline received valid JSON with `items:[null]`. The browser threw `Cannot read properties of null (reading title)` and emptied the component root instead of presenting a read failure. The original diagnostic retains the exact quoted browser error. No real sources or model calls were used.

The client now validates every history row and the existing ten-row page contract before rendering. Malformed rows, duplicate IDs and wrong field types are read failures. Read failures and new reads clear old rows and paging availability; failed reads do not claim an empty history. Each request has a ten-second deadline; abort and document-key cleanup retain selection ownership. Existing owner-only history API, order/offset, reconstructed and truncation disclosures, document deletion semantics and database retention are unchanged.

## Verification

Independent worktree actual-component Chrome session **24392 exited 0** at 1366/390/320 widths. Null rows, wrong content types and incomplete rows refuse without a React crash; successful retry, 10-offset paging, one-shot read failure, retained retry page, reconstructed warning and long-content wrapping pass. Desktop additionally uses an actual held request to verify the ten-second deadline and recovery. TypeScript/four-file lint/diff check **79967 exited 0**.

The existing native library/HTTPS/API/database fixture now includes the owner eleven-revision history selector, injected malformed row, failed read and same-page recovery in desktop/mobile. New fixed Web build/native acceptance remains pending. These are generated fixtures, not real document quality, natural model answers, human quality approval or deployment. G14-G20 and deployment remain deferred.
