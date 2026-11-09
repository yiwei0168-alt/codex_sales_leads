# Candidate v5 rejected, 2026-11-10

24/24 requests completed; 22/24 routes correct. Fixed recall .875, interpreter precision .8889, interpreter recall 1.00, macro-F1 .9165, P95 1292.486 ms. One wrong-fast: C5-18 omitted the mail-date timezone but was sent to interpreter. C5-06 warranty evidence was conservatively sent dynamic. Original gates fail; candidate is not activated. Known cost USD .002095926, unknown charges zero.

The account-wide positive cases all routed interpreter, but the missing-timezone counterexample must remain a failure. Do not lower thresholds, remove it or count development retests as new holdout. Original review flag and pre-Jev admission audit remain preserved. Subsequent context-question work uses version v6 and new runtime identities.
