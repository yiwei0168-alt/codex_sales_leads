# Database TLS reference identity

Existing G01/G09 engineering scope; no new product rule, paid-call authorization or deployment.

## Finding and correction

The first whole-composition TLS attempt (56686, fixture `ccec4a6d`) exited 1 at its wrong-hostname rejection probe, before complete acceptance. The installed pg connection code supplies automatic SNI only for DNS hosts. An IP connection therefore cannot rely on that setting to bind the configured IP reference. Node's TLS source also uses a localhost fallback when a socket connection supplies no host/servername. The failed probe and its source snapshot remain in the evidence.

The product's `databaseSslConfiguration` now binds certificate identity to the configured URL host independently of the driver-supplied name. DNS names retain Node's identity checker. IPs use `X509Certificate.checkIP` on the actual peer DER certificate, including IPv6; a missing, malformed or mismatching certificate returns `ERR_TLS_CERT_ALTNAME_INVALID`. Certificate-chain validation stays `rejectUnauthorized=true`; the identity callback does not accept an untrusted chain.

The fixture's DNS-negative case sets an explicit wrong reference name. A separate actual database probe uses the product connection-string and TLS configuration helpers with an IP absent from the certificate. The complete summary requires that rejection as well as the application/migration TLS probes. No rejection gate was removed.

## Evidence and remaining work

Five tests passed using a generated public DER certificate with DNS/IPv4/IPv6 SANs, plus typecheck and five-file lint. The test private key stayed inside a removed, network-disabled container. Tests verify matching and mismatching IP/DNS references and preservation of strict CA and URL override behavior. Initial native-IPv6 fixture and Error.code typing failures remain separately recorded.

This change affects runtime source. New main/collector/Web packages and actual full TLS composition are pending. Previous `3b88c56d` image results remain valid only for that source. Whole production-entrypoint/provider/real quality/positive activation remain unverified; G14-G20 and deployment stay deferred.

[Evidence](evidence/ma24-g01-g09-fixed-composition-database-tls-2026-10-21.json).
