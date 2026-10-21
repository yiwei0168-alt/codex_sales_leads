# Private document approval target display

## Existing requirement and finding

MA15-05 requires approval cards to show the final business action and deletion object, with technical parameters in secondary details. The actual screenshot from approved-local-action session 1400 showed only an internal document UUID. The local approval/execution path passed, but the object was difficult for a person to identify.

## Implementation

Both authenticated task-list and approval-list reads now derive display metadata from the same actor's currently owned private document. One batched lookup handles task-list approvals. The strict registered tool parameters must contain only documentId and expectedHash; malformed IDs/hashes or added caller-supplied titles cannot supply a trusted display name. Missing, foreign or non-private targets return unavailable without a title. Current owned targets show their stored title and destructive scope; a changed hash explains that the original approval cannot delete the new version. Exact UUID/hash parameters remain in collapsed technical details.

This metadata is read-only and does not modify the stored approval payload, parameter hash, decision route, tool execution or source/version checks. Names are escaped as React text. Failed lookup returns an error rather than replaying old target metadata.

## Verification status

Thirteen focused helper/route/render tests passed, with full typecheck and ten-file lint. An initial sandbox temporary-cache rename error happened before tests were imported; redirecting the test temporary directory to the writable F: workspace passed the same tests. New immutable packages and actual Chrome/Web/API/Worker verification are pending. The extended generated fixture requires equal target metadata from both read APIs, hidden foreign titles, changed-version feedback and unchanged approval execution guards.

The underlying generated checkpoint still stops at the existing next-model step bound. No natural model answer, real human judgment, real business quality, production qualification or deployment is claimed. G14-G20 remain deferred.

[Evidence](evidence/ma24-g13-approval-target-preview-2026-10-21.json), [previous approval execution scope](APPROVED_LOCAL_ACTION_2026-10-21.md).
