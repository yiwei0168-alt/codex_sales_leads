# V12 first repeat closed — qualification not passed

All 18 submissions answered; no transport failures or unknown charges. Task cost $0.561328561; six one-shot review calls cost $0.511321. Frozen review passed 15/18; frozen mechanical checks plus review passed 14/18 (77.78%). Quality gate failed, so the other 36 repetitions were not submitted. Raw C/A submitted cost increased 14.12%; quality-matched median backend latency improved only 6.04%. These are diagnostic first-repeat observations, not a successful performance claim.

Failures and investigation:

- P08-A omitted source citations (80/100). B/C provided bare receipt IDs, which the reviewer also penalized but still scored 85. `company_list` exposes no user-readable source link; this needs a real authenticated read endpoint, not a fabricated link to a write-only route.
- P19-B passed model review but failed the predeclared mechanical checker. Its `knowledge_revision_list` receipts actually contain both full quotation bodies (`truncated:false`, `reconstructed:false`); the checker only recognized search/compare/originals. Preserve this conservative raw failure. A next-version checker must recognize bound complete revision bodies by document ID and content hash, never metadata-only or truncated revisions. No retrospective score replacement.
- P20-A and P24-A failed to give requested facts/citations after original lookup denial. The synthetic text fixtures have 10 documents but **zero registered assets, verified facts or active V3 pointers**, despite labels such as “current approved”. The product's formal-fact guard therefore has no verified records to return. This is a fixture-validity limitation, not grounds to relax permission or verification rules. Some model grades accepted conditional textual conclusions; that does not establish a completed approved-source workflow.
- Comparing with Chinese field names also exposes a contract gap: the tool promises field-name input, but exact fact queries currently require registry keys. Version-qualified entity resolution also needs explicit treatment without silently selecting a different version.

Next: repair source citations, bind actual synthetic originals/approved fact snapshots in the isolated database, verify owner/version/attribute boundaries, and register a new run. Do not modify or continue V12 after these changes. Keep historical 45 unknown charge records separate; this run adds none. Five challenge cases were drafted separately and have not run. Full-24/live-external/browser timing remain outstanding. Production remains unchanged.

Evidence: [quality gate](../hybrid-evaluation-quality-v12/results/smoke-gate.json), [original grades](../hybrid-evaluation-quality-v12/results/smoke-review.json), [all submissions](results/progress.json).
