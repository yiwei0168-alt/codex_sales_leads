# Stage 215: 10:50 UTC scheduled ECB FX recheck

The prior retry was due at 2026-09-14T10:49:51.727Z. One credential-free `refresh-billing-fx-reference-once.ts` run after that time made one official ECB reference GET. Its parsed reference remained dated 2026-09-11, beyond the confirmed 72-hour validity window. The result was `status=unavailable`, `failureClass=staleOfficialReference`, `httpCalls=1`, and the next stored retry is 2026-09-14T11:50:06.101Z. The retained snapshot is `expired-or-invalid`, with effective expiry 2026-09-14T00:00:00Z. Do not retry before the stored due time.

The following read-only budget check still showed USD30 limit, USD12.324404 occupied, USD17.675596 remaining, zero unsettled calls, six unknown historical bills, and zero new provider calls. No customer job was claimed, no paid request was made, and no real A11 closed loop was run. A fresh FX value alone would not resolve the missing whole-run A11 bound.

Efficiency: one free official input, zero valid fresh outputs, zero downstream-used outputs, one `staleOfficialReference` discard and 0% useful refresh yield. Paid tokens, API credits, cash, retries and business-output discards were zero. Real user adoption and paid provider latency remain unknown. Keep the shared retry and conservative paid hold until the official date advances.
