# Company correspondence list and original recovery

## Existing MAILCRM-03 / MA24-16 F05/F06/G13 scope

The unchanged 112a2691 actual React/Chrome component reproduction failed: after a valid linked-mail list and original read, a 503 refresh leaves **20 old association rows and one original body** visible. This misrepresents the current company-read result. The reproduction uses generated HTTP responses and makes no provider request or mutation.

The component now binds its reader to the company ID, clears old rows/opened originals when refreshing/paging and distinguishes loading, valid empty and failure. It validates metadata pages, refuses mismatched original IDs/non-text bodies, and allows an explicit original retry without reloading the list. Independent ten-second list/body deadlines permit recovery. Abort/current-request fences reject late responses even when transport cancellation is ignored. Existing authenticated APIs, physical-company grouping, encrypted storage and manual/domain-match labels remain unchanged; no mailbox synchronization, inference or write is added.

## Verification status

Three-width actual-component checks pass at 1366/390/320: 503/malformed list clearing without false empty, original identity refusal/local retry, 20+1 synthetic paging, company switch clearing and late-response rejection. Desktop additionally waits for actual ten-second body/list deadlines, then verifies fresh results remain after both old responses complete and browser rendering occurs. Component mutations/model calls are zero. TypeScript/four-file lint/diff checks are recorded separately.

The native fixture extends the already generated owned mailbox/company flow with 21 additional encrypted messages linked to that company, yielding 22 associations (20+2) including its existing generated original. It is prepared to inspect metadata-only projections, other-company/peer exclusions under the existing empty-list contract, owner/peer/anonymous body boundaries, actual company-detail navigation, explicit original 503 retry, list/second-page failure clearing and same-page recovery in desktop/mobile/short windows. New fixed packages/native acceptance remain pending. Generated association labels do not establish genuine domain matching or customer identity/summary quality. Real business/provider/production quality and target deployment remain unverified; G14-G20 deferred.

Native attempt **99575 exited 1** before the correspondence browser checks: the fixture assumed another owned company already existed, but no distinct candidate was available. The host fixture now explicitly creates its own generated unlinked comparison company through the authenticated API. Product source/image 0d032585 is unchanged; failed receipt retained and corrected native acceptance pending.
