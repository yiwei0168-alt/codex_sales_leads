# Committed experiment artifacts

This directory stores reproducible, sanitized, machine-readable benchmark artifacts.

Planned layout:

- `inputs/` — frozen prompt, query packs, provider settings and hashes;
- `normalized/` — one content-faithful normalized result per measured step;
- `evidence/` — deduplicated company records, provider-neutral shared evidence dossiers, direct-fetch/fallback results and hashes;
- `scoring/` — raw scores, aggregate blind-audit results, calibration decisions and calibrated scores;
- `manifests/` — run and artifact manifests with SHA-256 hashes.

Provider-native payloads stay in `../runs/raw/` and are referenced by hash. Secrets, request headers, cookies, personal contacts, blind salts and reviewer identity are forbidden here.
