# Instruction submission acknowledgement recovery

## Existing recovery scope

MA24-16/F09 task recovery previously had no submission identity: controlRun appended a fresh UUID for every instruction POST. This stage binds an optional UUID requestKey to the stored instruction ID, normalized text and owner/task row lock. The official UI always supplies it. Identical replay returns the saved acknowledgement without another instruction, event, queue update or lease mutation; a different body with the same identity is rejected. Exact saved replay is read-only even after completion/cancellation. Evaluation tasks remain excluded before reconciliation, and new terminal work is still refused. Legacy unkeyed API/tool callers retain their old behavior; this does not deduplicate arbitrary pause/resume requests or Agent tool invocations.

The tab retains only a SHA-256 content digest and random UUID in sessionStorage. Unknown submissions keep separate identities by task/content. Retry after reload reuses the original identity when the same content is entered; acknowledged identical content uses a new identity for a new explicit submission. No instruction body is written to browser storage. Blocked storage degrades to volatile recovery; insecure contexts without WebCrypto use volatile memory only. No raw draft restoration is promised.

A private authenticated no-store GET reads an instruction receipt by owner/task/key. It reports recorded content or distinguishes active absence from definitive terminal absence; hidden evaluation/foreign tasks stay unavailable. The existing task card offers a read-only check for unknown submissions, including after the task ends, without automatically replaying a write. It clears only confirmed receipts or terminal absence, and preserves active/unknown identities. A response received after card unmount does not discard its unresolved identity.

No schema migration, new paid call, provider/human qualification, deployment or G14-G20 work is introduced. This records an implementation of the existing recovery requirement, not a new user confirmation.

## Verification status

Forty-three unit tests across instruction/schema/route, browser identity storage, evaluation/control restrictions and graph behavior passed. TypeScript, eleven-file lint and the prior three-width task-status/timeout/late-response component regression passed. The new actual fixed-Web fixture covers committed-but-dropped responses and reload retry, an explicit identical second submission, active absence/retry, multiple unknown receipts, terminal read-only reconciliation and replay, actor/task/hash-body boundaries, concurrent same/different content and a temporary fresh-DB event-failure trigger proving transaction rollback before same-key retry. It starts no Worker/provider/mail connection; prepared assertions are not yet acceptance.

New fixed packages and actual browser/database execution are pending. Repository control code changes may alter runtime executables; compare package artifacts and revalidate the affected fixed runtime/TLS composition before acceptance. Genuine business answers, natural model/provider evidence and production activation remain separate unfinished gates.
