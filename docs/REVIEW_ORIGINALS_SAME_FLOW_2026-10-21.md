# Review originals and incomplete source collection

Existing G10/G13 scope; no new product permission or user-confirmed rule. Independent original capture previously passed with two synthetic files (`6b7089c9`); the separate draft/revision fixture (`21ade59d`) could not preview its originals. These records have different source completeness and must not be treated as one acceptance result.

## Finding

A private generated text attachment was bound before the original task/request and freeze. Run 40626 failed an old attachment-free question expectation; the exact expected question now comes from that fixture's initial message. Run 49972 then exposed the actual preview blocker: the plan has five cases, but only replay has been collected. Four source-reference sets are absent. The all-case source selector correctly refuses capture; permitting that partial set would weaken the existing guard.

The initial positive-capture assumption for this partial bundle is therefore withdrawn. Its failures are preserved. Partial review remains useful, but its original capture must stay blocked. A complete, separately referenced group must retain its positive capture regression.

## Product correction

After account/bundle admission, a source-completeness classifier distinguishes absent references for uncollected cases from malformed run references, mismatched historical arms and missing references for observed cases. Only the former produces `original-sources-pending` with an owner-scoped missing-case count. GET and POST still return 409. The existing UI error panel now explains that collection must finish before saving originals, instead of incorrectly saying permissions or the freeze changed.

Client preview/capture failures also clear the previous preview, so withdrawn or unconfirmed originals do not leave an old save action visible. A complete-group browser regression will withdraw a shared source, check that stale preview disappears, restore access and read the same two captured originals again.

The shared all-case run selector is unchanged. No source is skipped for capture, no byte access happens while incomplete, and complete sets still pass the unchanged retained source/permission/byte/capture checks. The new classification does not grant quality, production eligibility or activation.

## Verification

Sixteen focused tests, full typecheck and twelve-file lint passed. They retain complete historical/prospective/safety references, reject malformed/mismatched references, and keep authentication/caller-selector/origin protections. Both earlier actual failures remain recorded with their source snapshots.

Actual verification is pending new fixed packages:

- A five-case partial review must show four pending samples, refuse direct capture with zero snapshots, and still complete the existing seven all-false draft/revision/revocation checks.
- The separate complete source-group fixture must still preview and explicitly save its two originals through actual HTTPS/Chrome/HTTP/database paths.

Only generated fixtures are used. The host corpus is not mounted. Temporary originals are removed and the parent drops its exact owned clone database. No independent human judgment is created by the test routes. Real business citations, extraction quality, production/provider identity and genuine positive activation remain unverified; G14-G20 and deployment stay deferred.

[Evidence](evidence/ma24-g10-review-originals-same-flow-2026-10-21.json).

The pending-source fixture restores its single generated attachment into the isolated Web container before browser checks. This ensures capture is refused for incomplete coverage rather than an absent upload. Full typecheck and the modified fixture lint passed before freezing this follow-up.

Fixed source `08a093e9` built all three images; all five package checks passed. Browser session 92866 passed the partial-source warning, zero-snapshot refusal and seven review revisions. The outer invocation failed later at an inherited legacy revocation-message assertion, before complete-group capture. The follow-up checks the persisted revocation, released/uncontrolled bound lease, unchanged lease after refusal and zero additional requests, with the exact current lease-admission error. Product guards are unchanged. The failed invocation is retained and not accepted as a full pass.
