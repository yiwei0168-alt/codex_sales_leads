# Personal memory CRUD conflict and recovery acceptance

## Implementation

The original personal-memory entry now sends its observed updatedAt on lifecycle PATCH. A rejected concurrent version returns HTTP 409 rather than the former false 200. The database already rejects before mutation/audit; older API clients may still omit this optional timestamp. The UI clears stale actions and asks for an explicit refresh before a new confirmation. An edit conflict retains the draft. Within this entry, editing/confirmation locks replacement edits and pagination; this does not implement a global navigation draft guard.

Successful saves have a separate notice. Failed list/history reads clear old rows and actions; explicit refresh reloads current state. Manual memory saving is database-only, so editor copy no longer claims an embedding/model call. Existing source-managed company facts, ownership, explicit confirmation, external-use scope and body-free audit rules are unchanged.

## Verification

Seventeen focused route/storage tests passed, including stale-version HTTP status, session identity, forged ownership refusal, unchanged conflict writes/audit, and existing save/vector/scope behavior. Full TypeScript and eight-file ESLint passed. A dedicated fresh fixed-Web Chrome/HTTPS/database fixture now covers generated create/edit/cancel, confirmation reset, concurrent edits and lifecycle changes, archive/activate/delete, post-commit read failure, audit privacy/recovery, pagination and mobile overflow. Actual fixed-package execution is pending; writing the fixture is not acceptance.

No new product confirmation, paid/model call, genuine business quality, production qualification or deployment is claimed. G14-G20 remain deferred.

First actual run 20436 exited 1 while selecting the prefilled edit textarea by its exact wrapping-label text. Create/cancel and stored scope/peer checks had passed; lifecycle/audit/pagination were not reached. The host fixture now selects the unique textarea inside the visible editor form, covering the same field without relying on the label text excluding its initial textarea content. Product image is unchanged; this failed run remains retained.

Retry 15821 exited 1 selecting the type dropdown by exact wrapping-label text (its option text is included). Create/edit, concurrent draft/lifecycle 409, archive/activate/delete and audit recovery had passed in this invocation, but the complete result remains unaccepted. The host fixture now selects the sole combobox in the editor; remaining scope and product are unchanged.

Run 44446 exited 1 because the next-page enabled assertion selected the nested audit pager instead of the memory pager (the actual click already targeted the memory pager). The host assertion now targets the same memory pager; full scope remains required. Prior CRUD/conflict/audit and generated external-use scope checks passed in that failed run; no complete acceptance is inferred.

Actual run 1619 exited 0: both JSON records inspected, full generated CRUD/scope/conflict/audit/pagination passed and temporary resources removed. Its mobile image captures the retained audit scroll position. The host fixture now also collapses audit, scrolls to the memory heading and checks the memory section internal scroll width before the mobile screenshot. This visual follow-up does not change the product or weaken any previous assertion.


2026-10-21 / G03/G13 personal memory accepted within declared scope: product bfb76237, final host 36636121; actual Chrome/HTTPS/compiled Web/fresh PostgreSQL runs **1619 and 59169 exited 0**, two result records each inspected. Generated create/edit/cancel, confirmation reset, private country/role scope, external-use opt-in without scoring-fact status, concurrent edit draft retention, observed lifecycle version and 409 without mutation/audit, archive/activate/delete, confirmed-write plus failed readback/explicit retry, body-free owner audit after deletion, audit failure/recovery, peer denial and actual pagination passed. Final 390px memory-list screenshot visually inspected; global and section scroll widths passed. Eight frozen source hashes checked, product sources match the fixed image commit; all three builds and five package checks passed. Temporary resources removed, original three services remain. Three failed fixture runs remain preserved. No actual model call, real business quality, natural memory extraction, sustained graph Worker, production qualification or deployment is claimed. This closes the generated original-memory CRUD interaction follow-up, not all G03/G13. G14-G20/deployment remain deferred. [Scope](PERSONAL_MEMORY_CRUD_2026-10-21.md); [evidence](evidence/ma24-g03-g13-personal-memory-crud-2026-10-21.json).
