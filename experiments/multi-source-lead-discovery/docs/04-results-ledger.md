# Step-result ledger

No measured result exists yet. This ledger must be updated in the same commit as each published normalized artifact.

| Step ID | Stage | System | Channel | Normalized artifact | Raw SHA-256 | Record count | Validation | Notes |
|---|---|---|---|---|---|---:|---|---|

## Required artifact stages

- environment and connectivity preflight;
- frozen input manifest;
- one discovery output per system and channel;
- Gemini Full final output;
- entity normalization and cross-system deduplication;
- independent evidence verification;
- raw model scoring;
- blind-audit sample manifest without provider identity;
- aggregate human-audit results;
- calibration decision and calibrated scores;
- category leaderboards, resource metrics and final conclusions.

Committed normalized artifacts may contain public company names, official company URLs, non-personal business evidence, classification results and scores. They must not contain personal contacts, API secrets, request headers, reviewer identities or blind salts.
