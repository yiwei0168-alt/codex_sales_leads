# Local HTTPS gateway for company trials

The gateway forwards HTTPS to the existing Web service at `127.0.0.1:3001`. It leaves business workers, database listeners and application authentication unchanged. It binds only the private IPv4 address configured locally on port 3443. Requests with an unexpected Host or Origin are rejected; responses are streamed and Secure cookies are preserved.

Prepare these **ignored local files**, never in Git:

- `.local-runtime/lan-gateway.json`: JSON with `address` set to this machine's assigned company LAN IPv4 and `port` set to `3443`.
- `.local-runtime/lan-key.pem`: private TLS key.
- `.local-runtime/lan-cert.pem`: matching certificate whose IP SAN contains that address.
- `.local-runtime/config.json`: the existing verified local product runtime configuration, including the Node executable.

Generate the key/certificate locally or obtain a certificate from company IT. Share only the public certificate and its separately verified fingerprint. Clients must trust that specific certificate or its company issuer; do not disable certificate verification. Monitor certificate expiry. Address changes require updating configuration, certificate SAN, firewall rule and user access instructions.

From the workspace, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-lan-test-gateway.ps1 -Action Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-lan-test-gateway.ps1 -Action Status
```

Repeated Start adopts a matching listener and refuses a conflicting process. After explicit approval, `-Action Install` registers a current-user Limited login task; `-Action Uninstall` removes that future trigger without stopping the existing process. This is a startup helper, not an always-on system service or crash supervisor.

Firewall changes require a separately reviewed local address, port, company source subnet or colleague IP, network interface and profile scope. Never disable the firewall, expose the business API/database, or open router forwarding for this workflow. Administrator approval may be needed. Test from the colleague's actual computer; a successful host-local login does not prove wireless/VLAN routing works.

Use an independent ordinary application account. A login email does not connect its mailbox. Do not clone another account's private data. Current spending policy remains a deployment setting; avoid introducing a silent financial bypass during account creation. Keep credentials and customer-specific trial evidence out of a public repository.
