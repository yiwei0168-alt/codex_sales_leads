# Runtime live-read sources during acceptance and subsequent use

Existing MA24-06, current execution scope G01-G13. No new product rule or activation authorization.

## Implementation

The retained runtime-material reader now revalidates captured live-read tasks after authenticating and locking the owned task/spec/journal rows. Saved historical and safety tasks retain their existing handling.

For each `registered-live-read-v1` task, the reader:

1. Reconstructs its original/candidate source snapshot and compares the result with the server-bound task snapshot hash.
2. Rebuilds paired tool messages from that task's journal only, using the task's knowledge scope and selected virtual candidate ID.
3. Revalidates current Skill, knowledge, memory and private read sources locally; it does not dispatch tools or call providers.
4. Rechecks the existing outbound evidence delta boundary, including current public-asset disclosure flags for new knowledge.
5. Revalidates referenced knowledge original bytes and binds the resulting manifest into the runtime task ledger hash.

Both acceptance preparation and `captureSkillAcceptanceLedger` call this retained reader. The latter is already invoked before and after business-source validation by `skillActivationCurrent`; therefore these checks also run during subsequent use. A changed source can reject even if every saved task and tool row remains unchanged. The existing binding schema and production qualification gate are unchanged.

The full-combination fixture now requires one live task to reach this ledger check and reports that assertion separately. Its new fresh-database composition is running as session 78222 on committed source 7dbab64c in the separate worktree and is not accepted yet. Earlier live-read combination 14339 exited 0 on source before this lifecycle change and cannot validate it.

## Evidence and limitations

114 tests across six files passed, including source withdrawal, disclosure permission failure, original snapshot mismatch, changed-byte ledger fingerprint, scope/task isolation, legacy handling and propagation through the retained runtime reader. These new source mutation cases use mocks. The first test launch failed before executing tests because sandbox temporary-cache rename was denied; workspace TEMP/TMP resolved it. A subsequent typecheck identified the empty-reference return missing newly exposed counters; that branch was corrected and the final typecheck is recorded separately in the receipt.

Five-file lint passed. No actual model/provider calls, real business data, production package build, deployment, quality judgment or final activation occurred. This closes a concrete local revalidation wiring gap; it does not establish production execution equivalence, independent quality or through-commit immutability of external files.

[Stage receipt](evidence/ma24-g09-runtime-live-source-lifecycle-2026-10-21.json).

## Native composition terminal result

Session 78222 exited 0 on frozen source 7dbab64c. All five recorded source/fixture inputs remained unchanged. The fresh-170 composition passed five cases/eight tasks, a prospective customer offset query absent from original receipts, the retained live-source/disclosure reader, material reconstruction and missing-human policy blocking. The disposable cluster was removed. This exercises live customer sources; the new knowledge/memory mutation tests above remain mocked. No immutable runtime registration, actual provider/data, quality or activation is qualified, and this result does not cover later shared graph-limit changes. Current fixed-package composition 60396 remains separate and running.
