# Task status read recovery and control freshness

## Existing workflow defect and implementation

MA24-16 / F09 requires usable task recovery and preserved instruction drafts. Previously a failed task-status request left old controls/approvals enabled, and saved-event fetching blocked the next status poll. State errors also crossed scopes or masked later failures. This stage separates status polling from bounded event pagination. Both reads have a 10-second browser deadline (an implementation timeout, not a new user-approved business rule). Existing 2.5-second status polling, event page limits and exact string event cursors remain.

A failed or unconfirmed status retains the last task as explicitly historical and locks control, approval and preference-undo buttons. The instruction field remains editable. A successful status read restores actions and clears only the obsolete read-required error. Event read failure retains saved history and does not invalidate a successfully read task status. All concurrent event-page outcomes are observed before another event poll begins.

Successful control/undo acknowledgements show saved-request notices and require a new status read before more actions. A read epoch rejects a pre-write GET that completes later. API failures retain the instruction draft; text changed during an accepted instruction submission is preserved. Late control acknowledgements from another conversation cannot refresh or overwrite the current notice/error. API/Worker permissions and execution behavior are unchanged; this adds no mutation auto-retry/idempotency contract.

## Current verification

Five preview/event-parser tests, the prior approval submission component regression, full TypeScript and six-file lint passed. Real React/hook/browser checks passed at 1366/390/320 widths, including actual read timeouts, independent status/event recovery, exact large cursor, disabled stale actions, preserved drafts, a pre-write late GET, successful-write/failed-read notice, empty conversation and old-conversation late responses. Screenshots visually inspected. An initial component failure exposed the stale read-required error masking the recovered event error and remains retained.

A dedicated fixed-Web fixture is ready: generated account and paused task only, two unsent pending mail-approval payloads, real resume/pause and two instruction commits, held real event/old status responses, failed readback, editable newer draft, actual DB checks and peer/anonymous isolation. It starts no Worker or mail connection. New packages/actual fixed-Web execution are pending; a prepared fixture is not acceptance.

No real business quality, model/provider, human approval, activation or deployment claim. G14-G20 remain deferred.
