# Personal memory CRUD conflict and recovery acceptance

## Implementation

The original personal-memory entry now sends its observed updatedAt on lifecycle PATCH. A rejected concurrent version returns HTTP 409 rather than the former false 200. The database already rejects before mutation/audit; older API clients may still omit this optional timestamp. The UI clears stale actions and asks for an explicit refresh before a new confirmation. An edit conflict retains the draft. Within this entry, editing/confirmation locks replacement edits and pagination; this does not implement a global navigation draft guard.

Successful saves have a separate notice. Failed list/history reads clear old rows and actions; explicit refresh reloads current state. Manual memory saving is database-only, so editor copy no longer claims an embedding/model call. Existing source-managed company facts, ownership, explicit confirmation, external-use scope and body-free audit rules are unchanged.

## Verification

Seventeen focused route/storage tests passed, including stale-version HTTP status, session identity, forged ownership refusal, unchanged conflict writes/audit, and existing save/vector/scope behavior. Full TypeScript and eight-file ESLint passed. A dedicated fresh fixed-Web Chrome/HTTPS/database fixture now covers generated create/edit/cancel, confirmation reset, concurrent edits and lifecycle changes, archive/activate/delete, post-commit read failure, audit privacy/recovery, pagination and mobile overflow. Actual fixed-package execution is pending; writing the fixture is not acceptance.

No new product confirmation, paid/model call, genuine business quality, production qualification or deployment is claimed. G14-G20 remain deferred.
