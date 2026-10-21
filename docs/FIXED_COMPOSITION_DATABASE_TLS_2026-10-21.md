# Fixed composition database TLS

Existing MA24 G01/G09 scope; G14-G20 and deployment remain deferred. This changes only the disposable verification harness. It creates no new user rule, provider request, real business sample or activation permission.

## Remaining gate addressed

Accepted fixed composition 50394 used the unchanged `3b88c56d` runtime packages and passed five cases/eight tasks and prospective crash recovery. Its complete database connection path was plaintext loopback. Separate collector TLS 31251 and actual API/Worker TLS 93489 passed independently; they did not prove TLS for that complete composition.

The harness now starts the disposable PostgreSQL server with its own certificate, then installs a first-match rule rejecting unencrypted TCP after host-side bootstrap/migration. It mounts that certificate read-only in the Linux fixture and supplies `verify-full`, the `localhost` certificate identity and CA to raw pg connections, application/collector adapters and child workers. Before the composition starts, both application and migration logins must demonstrate encrypted sessions through `pg_stat_ssl`, plaintext rejection, rejection without the CA, and hostname mismatch rejection. The final summary requires all eight assertions and does not infer production-entrypoint identity from TLS.

The server rule is confined to a running `ma24-pilot-fresh-*` container whose immutable ID was checked; the helper also checks the expected PostgreSQL data directory. Original services are untouched. Existing immutable runtime packages can be reused because only fixture scripts changed; runtime source/config bytes are still compared with the image before execution.

## Verification status

JavaScript syntax, full typecheck and final three-file lint passed. Actual TLS probes and the complete current fixture are pending. No TLS gate is marked passed until its actual result is inspected. The previous accepted plaintext run remains preserved with `databaseTlsVerified=false`.

Actual attempt 56686 exited 1 at the wrong-hostname probe. Subsequent installed-code review led to an explicit product database reference-identity fix and a corrected, separate DNS/IP probe contract. Runtime source now changed; the earlier statement about reusing `3b88c56d` packages applies only to the initial fixture-only change. New fixed packages and actual full acceptance are required. See [reference identity correction](DATABASE_TLS_REFERENCE_IDENTITY_2026-10-21.md).

[Evidence](evidence/ma24-g01-g09-fixed-composition-database-tls-2026-10-21.json).


2026-10-21 / Current e2a584b3 acceptance: collector TLS/database-trust **5366 exited 0** and actual fixed API/Worker synthetic saved-receipt recovery **42562 exited 0**, two result records each inspected. Collector issuance/retry, disablement commit wait and CA/deployment/key/purpose/revocation rejection passed; API model/Skill completed/unknown receipt recovery did not call a model or reactivate a Skill. Complete composition **97322 is still running**. Its live stdout separately passed application/migration encrypted-session, plaintext/missing-CA/wrong-DNS rejection and the actual configured adapter wrong-IP rejection; these are component results, not final composition acceptance. All six recorded source hashes match. Earlier 56686 remains failed, and real provider/quality/activation remain unaccepted. [Receipt](evidence/ma24-g01-g09-fixed-composition-database-tls-2026-10-21.json).
