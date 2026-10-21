# Ordinary task attachment current-source admission

## Existing MA24-02 / MA24-16 F08 scope

The current selector lists only registered originals with a ready current tree, but direct message submission previously checked registration and account access alone. It admitted an archived document, an unindexed binary or an older asset. The old selector verification also created only registered assets, so its positive records did not represent the processed-file contract.

New ordinary task admission checks the complete selected UUID set in one tenant transaction query: active accessible document, ready tree belonging to that document, exact current asset ID, matching tree/asset source SHA and registered asset. A missing or unavailable member refuses the request; normal transaction rollback removes any provisional conversation and writes no user message/task/event. PostgreSQL UUID case aliases are counted once for lookup, preserving the submitted input and request digest. Recorded initial-source cardinality uses the same UUID identity without rewriting messages.

Existing exact-key acknowledgement returns its original task before new admission checks, without another write or implicit execution, including after withdrawal. A new key requires current validation. The server-only reviewed-mail path retains its existing accessible registered-file admission and prior pinned byte validation; it does not require a RAG index. Ordinary callers cannot select that path through the strict message schema. No new mail approval, external effect or model-call permission is added.

This is a current metadata admission snapshot, not a source freeze or an extraction/file-integrity judgment. Later source changes remain subject to existing use-time guards. Registration/tree metadata fixtures do not prove genuine processing quality or original file bytes.

## Verification status

Old immutable Web **504dc63f**, disposable run **50098 exited 1** at the new invariant: direct registered-but-unindexed attachment returned **202**, expected **409**. No worker/model ran, and temporary resources were cleaned. The failure is retained as the regression reproduction; it is not an accepted result.

Twenty existing/extended tests across task queue, reviewed mail and recorded initial source passed, including legitimate UUID aliases. Typecheck and focused lint passed before final fixture adjustments. Updated positive selector fixtures carry ready current versions and generated evidence nodes. New native checks cover refused sets/rollback, current shared access, exact-key acknowledgement, caller contract spoofing and actual desktop/mobile selection/paging/task persistence. New fixed packages and corrected native acceptance remain pending. G14-G20 and deployment remain deferred.
