# Browser approval and local action execution

## Remaining requirement

G13 previously exercised actual non-mail approval parameters and denial, using a UI-only `skill_delete` fixture. That did not prove approval followed by execution. This stage uses the registered `knowledge_private_delete` tool on generated private documents, through the fixed Web and main runtime images from `08a093e9`.

## Verification implementation

The fixture seeds a last-turn pending graph checkpoint. The actual compiled Worker must request exact approval and leave the synthetic document/chunk untouched. Actual Chrome then approves, denies, or approves and revokes. A fourth case changes the document hash after approval. Anonymous, peer-account and wrong-parameter-hash decisions must reject. Browser decisions only queue work; only a subsequent actual compiled Worker may execute the approved local action. Successful deletion must remove exactly the generated document and chunk; denial, revocation and stale document versions must preserve them. A later empty Worker and duplicate decision must not replay the effect or change its receipt.

The next model node stops at the existing model-step limit, so terminal tasks are partial. This is a deliberate generated checkpoint fixture, not a natural model answer, real human quality judgment or an external destructive action. It does not approve real document deletion or mail sending. No production code is changed, no new model/provider calls are made, and target deployment stays deferred.

## Status

Static checks and actual isolated execution remain pending. The initial TS7022 fixture inference errors are retained in the evidence. Existing package checks are reused at their precise immutable image/source scope; no rebuild or new whole-runtime composition is claimed.

[Evidence](evidence/ma24-g13-approved-local-action-2026-10-21.json).

Full typecheck (7777) and three-file lint (60991) exited 0. Product source, runtime entry/build scripts and dependency inputs remain unchanged from fixed image source 08a093e9. The new actual browser/Worker verification is pending; no real approval or quality acceptance is inferred.
