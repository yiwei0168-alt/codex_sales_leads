# Database TLS reference identity

Existing G01/G09 engineering scope; no new product rule, paid-call authorization or deployment.

## Finding and correction

The first whole-composition TLS attempt (56686, fixture `ccec4a6d`) exited 1 at its wrong-hostname rejection probe, before complete acceptance. The installed pg connection code supplies automatic SNI only for DNS hosts. An IP connection therefore cannot rely on that setting to bind the configured IP reference. Node's TLS source also uses a localhost fallback when a socket connection supplies no host/servername. The failed probe and its source snapshot remain in the evidence.

The product's `databaseSslConfiguration` now binds certificate identity to the configured URL host independently of the driver-supplied name. DNS names retain Node's identity checker. IPs use `X509Certificate.checkIP` on the actual peer DER certificate, including IPv6; a missing, malformed or mismatching certificate returns `ERR_TLS_CERT_ALTNAME_INVALID`. Certificate-chain validation stays `rejectUnauthorized=true`; the identity callback does not accept an untrusted chain.

The fixture's DNS-negative case sets an explicit wrong reference name. A separate actual database probe uses the product connection-string and TLS configuration helpers with an IP absent from the certificate. The complete summary requires that rejection as well as the application/migration TLS probes. No rejection gate was removed.

## Evidence and remaining work

Five tests passed using a generated public DER certificate with DNS/IPv4/IPv6 SANs, plus typecheck and five-file lint. The test private key stayed inside a removed, network-disabled container. Tests verify matching and mismatching IP/DNS references and preservation of strict CA and URL override behavior. Initial native-IPv6 fixture and Error.code typing failures remain separately recorded.

This change affects runtime source. Current e2a584b3 main/collector/Web packages and five package checks passed. Separate collector TLS 5366 and API/Worker recovery 42562 passed. Full TLS composition 97322 remains running; its live TLS probes passed at component scope only. Previous `3b88c56d` image results remain valid only for that source. Whole production-entrypoint/provider/real quality/positive activation remain unverified; G14-G20 and deployment stay deferred.

[Evidence](evidence/ma24-g01-g09-fixed-composition-database-tls-2026-10-21.json).


2026-10-21 / TLS reference-identity fix packaged at **e2a584b3**: main/collector/Web builds and all five package checks exited 0 (1047 source inputs, same Node binary, complete dependency bytes/ESM, collector isolation/tamper and Web private-root exclusion). Full verified-TLS composition **97322**, separate canonical collector TLS **5366** and actual API/Worker saved-receipt recovery **42562** are running, not accepted. Earlier 56686 remains failed; previous 3b88c56d evidence is version-scoped. No actual provider call, quality approval or activation. [Current stage](DATABASE_TLS_REFERENCE_IDENTITY_2026-10-21.md); [receipt](evidence/ma24-g01-g09-fixed-composition-database-tls-2026-10-21.json).


2026-10-21 / Current e2a584b3 acceptance: collector TLS/database-trust **5366 exited 0** and actual fixed API/Worker synthetic saved-receipt recovery **42562 exited 0**, two result records each inspected. Collector issuance/retry, disablement commit wait and CA/deployment/key/purpose/revocation rejection passed; API model/Skill completed/unknown receipt recovery did not call a model or reactivate a Skill. Complete composition **97322 is still running**. Its live stdout separately passed application/migration encrypted-session, plaintext/missing-CA/wrong-DNS rejection and the actual configured adapter wrong-IP rejection; these are component results, not final composition acceptance. All six recorded source hashes match. Earlier 56686 remains failed, and real provider/quality/activation remain unaccepted. [Receipt](evidence/ma24-g01-g09-fixed-composition-database-tls-2026-10-21.json).


2026-10-21 / Current e2a584b3 fixed Web HTTP **63888 exited 0** on fresh schema 170 and its verified-TLS application database. Synthetic member login/cookie checks, manual company creation/read and peer denial passed through the actual Next standalone image. This resolves the Web-specific runtime risk from the changed database identity adapter; it is not HTTPS-browser, complete frontend, real-mail/document/task quality or deployment acceptance. All six source hashes remain matched. Full Linux TLS composition 97322 is still running; collector 5366 and API/Worker 42562 remain separately passed. [Evidence](evidence/ma24-g01-g09-fixed-composition-database-tls-2026-10-21.json).
