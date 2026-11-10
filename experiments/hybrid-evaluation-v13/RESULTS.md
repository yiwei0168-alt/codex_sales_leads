# V13 closed — not qualified

18 tasks submitted, 17 answered and one partial. Six frozen blind review calls graded every answer: 16/18 passed. The frozen combined mechanical gate passed 10/18 (55.56%); retain this raw outcome. No remaining 36 repetitions were submitted.

Investigation separates product defects from an evaluation defect:

- P07-C read company summary fitScore instead of the available dated formal assessments. The company_search output uses `companies[].id`; the assessment input calls that same ID `companyExternalId`, without documenting the mapping or the output shape. Two handoffs and an unnecessary receipt-formatting program followed. Correct scores alone do not satisfy the requested historical assessment date and citations.
- P20-B ended partial after an incomplete main-model response without a charge receipt. P20-C also spent extra programs probing unknown output shapes, projected an oversized result, and attempted to reuse a partial comparison receipt that the interpreter intentionally rejects. Preserve the uncertainty/permission guards; provide usable output contracts instead.
- Seven source-coverage failures include a checker defect: V3 retrieval legitimately returns `/api/knowledge/assets/{boundAssetId}`, but the checker insists on historical `fixture://` URLs. Full original bodies and document IDs are present. V13 scores remain unchanged. A prospective checker must validate exact frozen document, asset and full-content hash; metadata-only links or arbitrary URL matches must still fail. This defect does not excuse P07-C or the partial P20-B response, so qualification fails even independently of those seven mechanical failures.

Known task cost $0.628619769; review cost $0.6781535. Four task charges unknown: three Jev timeouts and one incomplete main-model response. C/A cost reduction is therefore undefined. Reported paired latency reduction 43.71% uses only three quality-passing pairs under this flawed checker and is not a valid overall improvement claim. Historical 45 unknown charges remain separate. No retries or production changes.

Next: versioned explicit output contracts and sales-ID mapping, real assessment citation links, source-audit tests against registered originals before paid runs, then new prospective qualification. Router availability, complete billing, full-24/live-external/challenge cases and browser timing remain open.

Evidence: [raw grades](../hybrid-evaluation-quality-v13/results/smoke-review.json), [frozen gate](../hybrid-evaluation-quality-v13/results/smoke-gate.json), [all submissions](results/progress.json).
