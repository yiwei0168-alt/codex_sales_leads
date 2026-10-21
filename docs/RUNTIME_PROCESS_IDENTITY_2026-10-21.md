# Local runtime process identity in transport signatures

Existing MA24-06, G01-G13 only. No new product confirmation, model-call permission, deployment or activation.

## Implemented

The configured original-task and candidate transport signers can now add an optional `local-runtime-process-v1` claim to successful and signed failure receipts. The claim is covered by the existing signature. Legacy receipts without the field retain their existing signature representation and do not acquire a process claim.

The producer authenticates the deployment hash against its signing registry before loading the process identity helper. Canonical entries are the collector child `/app/runner.mjs --execute`, or `/app/start.mjs worker [--once]` / `server` with their corresponding bundled artifact. The helper checks actual kernel command-line arguments against the current invocation, the executable, canonical file paths, manifest hash, Node/entry/artifact bytes and the complete package inventory. The integrity module is hashed against the enrolled manifest before it is imported.

Package dependencies are measured once per process and retained under the non-root, no-capability, no-new-privileges, read-only root/package boundary. The command line, boundary, manifest, Node and entry/artifact bytes are rechecked before transport and before signature creation. The trusted host is outside this local process check; this is not remote or hardware attestation.

Scratch/source-module entry points receive no process claim. A canonical entry with invalid invocation, bytes or runtime boundary fails instead of silently downgrading. `NODE_PATH` injection is also rejected by both signers. The ordinary HTTPS origin, key enrollment, owner/freeze/journal binding and paid-call scope remain required.

Receipt verification authenticates the optional claim and checks its role/deployment binding. It returns `runtimeProcessClaim`, not a production qualification verdict. Caller-supplied assertions are not accepted by the signer API.

## Verification

- 8 suites / 135 tests passed, including legacy receipt compatibility, optional-claim signature binding, role/deployment mismatch, pre/post transport boundary changes and no repeated completed transport.
- Full typecheck and 13-file lint passed.
- Linux component 52498 passed nine cases: canonical collector/worker/server entries; scratch entry unclaimed; kernel argv spoof, writable root, Node options, wrong deployment and inventory tamper rejected.
- The Linux test uses newly built **synthetic unregistered packages** on an immutable local Node image. It has no database credentials or network access and makes zero model calls. It proves the process helper, not a registered production provider execution.
- Initial unit/lint failures were a Windows-specific Linux-file-URL parsing issue and a reserved variable name. They were fixed without weakening Linux admission; failed logs are retained separately.

## Still unfinished

The locked runtime-package reader must independently match these signed claims to enrolled package entry/artifact/Node hashes and aggregate complete original/candidate/fallback coverage. That evidence must then feed the production execution qualification producer. No complete production equivalence verdict or activation is implemented by this stage.

The new identity code is not yet in fixed product images. The accepted `6fd7142a` packages, Linux composition 2592 and TLS 4843 remain previous-version evidence. Real provider identity/quality, real task samples and independent human review remain separate requirements.

[Evidence](evidence/ma24-g09-runtime-process-identity-2026-10-21.json).
