# Readable private-memory audit differences

## Existing F12 scope

The approved disclosure audit lists memory-history status/range snapshots as needing a readable before/after layer. The existing audit trigger stores only kind, status, usage scope, countries, roles and body character count; it never copies historical title/body, arbitrary context or vectors. This stage changes only client rendering and verification fixtures. The database/API/storage/permission and retention contract remains the same.

Known recorded fields are shown in a semantic before/after table. Insert/delete absence differs from an explicitly empty unrestricted range, missing keys and explicit null. Invalid values are identified rather than invented as defaults. Equal character counts do not conceal a declared content change: the row retains both recorded counts and explicitly explains that the body changed without historical text. Title changes similarly state that the historical title is not retained. Raw stored snapshots remain collapsed, expandable and copied exactly; the readable projection only selects existing allowed fields.

## Verification status

Four projection tests, full TypeScript and five-file lint passed. Actual component/HTTP browser checks at 1366/390/320 widths passed creation/deletion, authorization/status changes, same-length body edits, missing/null/malformed values, long unbroken role wrapping, exact raw JSON clipboard copy, paging and failed-read/retry clearing. Representative narrow-screen snapshots were visually inspected. No model/account/write operation occurs in that synthetic component harness.

The actual fixed-Web personal-memory fixture preserves its existing CRUD/concurrency/privacy/recovery/pagination gates and adds an equal-length real body revision, actual insert/delete/body-count table cells, exact raw snapshot copy, real external-use revocation and desktop/mobile audit screenshots. New fixed images and actual execution are pending; writing the fixture is not acceptance.

No historical values are restored, no business-source quality/model/provider qualification is granted, and no deployment or G14-G20 work is undertaken. Existing MA24-16/F12 implementation status is updated without inventing a new user confirmation.
