# Approval submission state and fixed-Web acceptance

## Existing scope

MA24-16 / F12 already calls for preventing repeated approval clicks. The existing server accepts decisions only for the exact owner, approval ID, parameter hash and permitted status. Client buttons previously stayed enabled during the request and remained pending until the next run poll. This stage changes only the UI and disposable verification fixtures, not API/approval/worker permissions.

A synchronous gate and rendered busy state prevent overlapping individual/batch decisions within one approval group. Only an actual successful response records a local decision receipt keyed by approval ID and parameter hash. It survives stale pending polls, leaves approved items revocable and requires a new confirmation for changed parameters. Deny/revoke disappear after successful acknowledgement; terminal server states are not revived. A batch captures exactly its submitted mail list, and late/changed items stay pending. Notices state that decisions were saved, not that an action or email executed. Network/conflict failures give no saved receipt and ask the user to refresh and verify.

## Current evidence

Two existing preview tests passed. The real React component with synthetic HTTP receipts passed at 1366/390/320 widths, including held single/batch responses, disabled decision controls, repeated clicks, stale props, immediate revoke/deny, changed hashes, exact batch snapshot, concurrent added/changed items, network/409 failures and terminal server states. Full TypeScript and three-file lint passed. Initial sandbox browser network refusal, overly broad button assertion (raw JSON copy should remain available) and fixture typecheck corrections are retained; they do not grant product acceptance.

The actual fixed-Web fixture now holds real API responses after their database commit, verifies the busy controls and successful receipt, preserves all four existing Worker approve/deny/revoke/changed-hash cases, and adds an exact two-mail batch on a task paused before approval creation. This batch has no mail connection, tool call or send Worker. Fixed packages and actual execution are still pending.

No actual human approval, genuine model/quality, production qualification, activation or deployment is claimed. G14-G20 remain deferred.

Actual run 88565 exited 1 at the new batch stage. An outstanding waitForResponse rejected while the page was closing after another assertion, masking the primary failure and interrupting outer cleanup. The exact leftover runtime container/image/network was inspected and removed; only original services remain. Host waits now immediately handle rejection, preserve stage/error/progress and failure screenshot, release held responses and bound browser/proxy cleanup. Gates wait until response readiness. Exact two-item batch comparison treats order as immaterial (the run projection does not declare approval order). Product remains 6640ef30 and failed evidence is retained; complete acceptance requires a new pass.
