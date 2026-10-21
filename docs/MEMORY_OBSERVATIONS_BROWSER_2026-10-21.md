# Memory observation browser workflows

## Existing gap and correction

MA24-04 and G13 require sourced corrections, time/history, conflicts, notices and undo with recoverable interactions. Earlier actual HTTP checks covered timeline and undo; correction editor checks used component responses. A successful correction followed by a failed read left old cards/actions visible and offered no direct retry.

The real component now clears old records and pagination on refresh/read failure, keeps the confirmed-save notice, and offers an explicit read retry. Page changes also clear the old page. A rejected correction keeps its unsaved editor fields; no storage, correction API, business-time or authorization rule changes.

## Verification

The existing real-component Chrome harness passed desktop, mobile and narrow viewports with synthetic HTTP responses: cancel does not post, invalid intervals do not post, 409 preserves the draft, successful save followed by a 503 read clears old actions, and explicit retry recovers. Full typecheck/four-file lint passed. This is not actual product HTTP/database acceptance.

A new isolated fixed-Web browser fixture is pending. It creates only generated observations using the real observation writer in a fresh database. It must verify all four views, pagination, real page correction and undo, unknown validity, explicit device-timezone dates, historical knownAt/current reads, same-source conflict correction, concurrent 409 drafts, owner isolation, idempotent undo and one notice/outbox per observation. Only the post-commit read failure is an injected HTTP error; successful writes and reads use the actual product routes/database. No model/extraction or graph worker is run.

This does not provide naturally occurring business samples, model extraction quality, sustained local Worker/graph operation, production qualification or deployment. G14-G20 stay deferred.

[Evidence](evidence/ma24-g03-g13-memory-observations-browser-2026-10-21.json).
