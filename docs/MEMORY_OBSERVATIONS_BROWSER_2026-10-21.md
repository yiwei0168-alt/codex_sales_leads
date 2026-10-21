# Memory observation browser workflows

## Existing gap and correction

MA24-04 and G13 require sourced corrections, time/history, conflicts, notices and undo with recoverable interactions. Earlier actual HTTP checks covered timeline and undo; correction editor checks used component responses. A successful correction followed by a failed read left old cards/actions visible and offered no direct retry.

The real component now clears old records and pagination on refresh/read failure, keeps the confirmed-save notice, and offers an explicit read retry. Page changes also clear the old page. A rejected correction keeps its unsaved editor fields; no storage, correction API, business-time or authorization rule changes.

## Verification

The existing real-component Chrome harness passed desktop, mobile and narrow viewports with synthetic HTTP responses: cancel does not post, invalid intervals do not post, 409 preserves the draft, successful save followed by a 503 read clears old actions, and explicit retry recovers. Full typecheck/four-file lint passed. This is not actual product HTTP/database acceptance.

A new isolated fixed-Web browser fixture is pending. It creates only generated observations using the real observation writer in a fresh database. It must verify all four views, pagination, real page correction and undo, unknown validity, explicit device-timezone dates, historical knownAt/current reads, same-source conflict correction, concurrent 409 drafts, owner isolation, idempotent undo and one notice/outbox per observation. Only the post-commit read failure is an injected HTTP error; successful writes and reads use the actual product routes/database. No model/extraction or graph worker is run.

This does not provide naturally occurring business samples, model extraction quality, sustained local Worker/graph operation, production qualification or deployment. G14-G20 stay deferred.

[Evidence](evidence/ma24-g03-g13-memory-observations-browser-2026-10-21.json).


Follow-up: first actual invocation 98310 did not produce a terminal receipt. The disposable database contained 23 generated observations through undo and no active lock wait; the exact verified test child was stopped after prolonged waiting, and its parent exited 1 and cleaned every temporary container. Its log/source/package receipts are retained, not accepted as a pass. The fixture now consumes direct HTTP response bodies, bounds fetches, writes per-step progress and bounds cleanup; the original wait point is not proven. Separate source review found that clicking the already-selected partition cleared its list without changing effect dependencies. Partition selection now increments its read revision; all three component viewports, full typecheck and four-file lint pass. New fixed packages and actual verification remain required.

Bounded attempt 91568 also exited 1 at its watchdog; the observed completed stage was known-at-passed. No final receipt or cleanup success is inferred from intermediate assertions; the parent did remove all disposable containers. Fixed ae1431ff builds and all five package checks passed and are retained separately. The host-only follow-up adds per-request/view/page stage history, bounds return-to-first-page traversal and captures failures before teardown. Typecheck and fixture lint passed; the same fixed ae1431ff Web is reused because product source is unchanged.

Fine-grained attempt 90837 exited 1 at its watchdog in the browser undo observation step, after actual conflict resolution and peer/stale undo rejection. Its full stage history is retained. The UI uses response.ok and refreshes without reading JSON; the host-only follow-up observes the actual browser action via its 200 response and one persisted owner/target/user-undo invalidation, then requires the repeated real HTTP route to return exactly that stored ID. This retains UI, database, idempotency, isolation and current-state assertions; it avoids depending on a DevTools JSON-body read the UI does not perform. Typecheck/fixture lint passed; same immutable ae1431ff product, actual acceptance still pending.
