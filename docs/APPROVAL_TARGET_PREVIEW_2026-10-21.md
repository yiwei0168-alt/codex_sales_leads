# Private document approval target display

## Existing requirement and finding

MA15-05 requires approval cards to show the final business action and deletion object, with technical parameters in secondary details. The actual screenshot from approved-local-action session 1400 showed only an internal document UUID. The local approval/execution path passed, but the object was difficult for a person to identify.

## Implementation

Both authenticated task-list and approval-list reads now derive display metadata from the same actor's currently owned private document. One batched lookup handles task-list approvals. The strict registered tool parameters must contain only documentId and expectedHash; malformed IDs/hashes or added caller-supplied titles cannot supply a trusted display name. Missing, foreign or non-private targets return unavailable without a title. Current owned targets show their stored title and destructive scope; a changed hash explains that the original approval cannot delete the new version. Exact UUID/hash parameters remain in collapsed technical details.

This metadata is read-only and does not modify the stored approval payload, parameter hash, decision route, tool execution or source/version checks. Names are escaped as React text. Failed lookup returns an error rather than replaying old target metadata.

## Verification status

Thirteen focused helper/route/render tests passed, with full typecheck and ten-file lint. An initial sandbox temporary-cache rename error happened before tests were imported; redirecting the test temporary directory to the writable F: workspace passed the same tests. New immutable packages and actual Chrome/Web/API/Worker verification passed as recorded below. The extended generated fixture requires equal target metadata from both read APIs, hidden foreign titles, changed-version feedback and unchanged approval execution guards.

The underlying generated checkpoint still stops at the existing next-model step bound. No natural model answer, real human judgment, real business quality, production qualification or deployment is claimed. G14-G20 remain deferred.

[Evidence](evidence/ma24-g13-approval-target-preview-2026-10-21.json), [previous approval execution scope](APPROVED_LOCAL_ACTION_2026-10-21.md).


2026-10-21 / MA15-05 G13 private-document target preview accepted within engineering scope: fixed product/fixture `9e0b23b7`, all three builds and five immutable package checks passed. Actual isolated **18847 exited 0** through Chrome/HTTPS/fixed Web/LangGraph API/compiled Worker/PostgreSQL. Both authenticated read APIs return identical current owned names without changing stored payload/hash; a peer private document yields unavailable without its title, and peer task/approval reads reject. Changed document hashes display a warning and preserve the document on attempted execution. Actual approval/denial/revocation, exactly one local delete receipt, stale/duplicate/anonymous/peer/wrong-hash rejection and no empty-Worker replay passed; screenshot visually inspected. All ten frozen source files match; temporary containers/database removed, original three services remain. Main/collector execution artifacts, Node and dependency manifest match the prior accepted version; no new full runtime composition is claimed. All data/checkpoints and browser decisions are synthetic; natural answers, real human quality, production qualification and deployment remain unverified. [Scope/evidence](APPROVAL_TARGET_PREVIEW_2026-10-21.md).
