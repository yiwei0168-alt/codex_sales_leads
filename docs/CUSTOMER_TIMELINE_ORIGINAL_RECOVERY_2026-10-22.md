# Customer timeline original read recovery

## Existing MAILCRM-03 / MA24-16 F05/F06/G13 scope

On unchanged 77cd8658, the actual React/Chrome reproduction opens source-company mail, changes to a target company, reads the target original and then releases the source response. The source original replaces the target dialog (lateSourceShown=true, exit 1). Initial restricted run 28297 could not access its local test server (ERR_NETWORK_ACCESS_DENIED); the permitted loopback retry reproduced the product defect. These failures are retained separately.

Original reads now belong to each selected timeline event. Opening immediately shows a loading dialog; closing or unmounting invalidates the old read even if transport abort is ignored. Exact mail ID/string body validation, an independent ten-second deadline and explicit local retry cover unavailable/server/malformed reads. Reopening issues a fresh read. Reading an original no longer runs the customer mutation wrapper or refreshes list/timeline metadata. Existing customer mutation APIs, revision checks, company inference/summary behavior and mail permissions are unchanged.

## Verification status

Three-width component 88938 passed company-crossing late responses, no metadata refresh, 503/404 recovery, mismatched identity/non-string refusal and no horizontal overflow/mutations/page errors. Desktop additionally observes a real ten-second deadline and late-response rejection after retry. Existing customer loading and four-width merge browser regressions pass; TypeScript/five-file lint/diff session 15842 passed.

A native fixed-Web fixture seeds two generated customers linked to existing encrypted disposable mails, verifies owned timeline and peer/anonymous refusal, and exercises actual mailbox-to-customer navigation, local original retries, held old-company response, reopen, Escape/focus return and short-window scroll. Fixed packages and native acceptance are pending. No real customer/mail/summary/identity quality, provider/model calls, production qualification/activation or deployment accepted. G14-G20/deployment remain deferred.
