# Committed experiment artifacts

This directory stores reproducible, sanitized, machine-readable benchmark artifacts. No measured artifact exists yet.

Planned layout:

- `inputs/` — frozen prompt, query packs, provider settings and hashes;
- `normalized/` — one content-faithful normalized result per measured step;
- `evidence/` — deduplicated company evidence records and source URLs;
- `scoring/` — raw scores, aggregate blind-audit results, calibration decisions and calibrated scores;
- `manifests/` — run and artifact manifests with SHA-256 hashes.

Provider-native payloads stay in `../runs/raw/` and are referenced by hash. Secrets, request headers, cookies, personal contacts, blind salts and reviewer identity are forbidden here.
