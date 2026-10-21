# Conversation management acknowledgement recovery

## Existing G13 workflow

The previous history rename used a browser prompt followed by an uncaught fetch. Network failure lost the entered title without a usable recovery path. Confirmed deletion also touched optional session storage inside its failure handler, so unavailable browser storage could misreport a successful deletion as failed.

Rename now uses the existing product dialog with a retained draft, a synchronous submission lock, a ten-second request deadline and readable errors. Cancellation restores menu-trigger focus. A rejected name remains editable. An unknown acknowledgement disables another write and offers an explicit read-only check through the existing owner-scoped GET. Matching current state acknowledges the requested name; a different current title requires an explicit overwrite action. A newer draft remains open and intact even when the previous submitted name is confirmed. No automatic write retry or new server idempotency/concurrency contract is introduced. Closing or reloading the dialog discards its in-memory draft; readback proves current state, not authorship or complete write history.

Confirmed deletion removes the local row and records the saved outcome before readback. Optional session-storage removal is guarded, while the existing deletion API continues to block unfinished tasks and retain completed task/audit history. A manual history refresh can recover list-read failures. This does not add deletion undo or unknown-delete reconciliation.

## Verification

Actual React/local-HTTP synthetic cases passed at 1366/390/320 widths: cancellation/focus, blank-name rejection, held-response duplicate-submit lock, 400 draft retention, committed-but-dropped acknowledgement, failed readback, read-only reconciliation, preservation of newer input, explicit overwrite after another title, and confirmed deletion despite storage and list-read failure. Existing three-viewport deletion focus/409/retry regression also passed. Full TypeScript and five-file ESLint passed. Initial fixture selector and type/lint errors were corrected and retained in the run history; they were not product failures or accepted results.

A separate fresh-database fixed-Web fixture is prepared for actual Chrome/HTTPS/API/PostgreSQL confirmation, peer/anonymous isolation, committed-but-dropped responses and retained completed-task deletion. Fixed image build and native execution remain pending at this implementation stage. No real provider/model/business-data call, real-quality acceptance, production qualification or deployment is claimed. G14-G20 remain deferred.
