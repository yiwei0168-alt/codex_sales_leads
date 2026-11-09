# Fresh routing validation after context review

Execute only the 24 fresh-holdout v5 inputs after the separate context/policy review admits them. The four opened historical regression items are excluded from new accuracy. Freeze current source/config/thresholds and review input identity first. No tuning or prompt changes from these held-out outputs.

Use the real initialTaskMessages, deterministic recipe eligibility, context guard and Jev request/threshold contract. Rule/guard cases are separate from actual provider requests. All Jev calls use one persistent process/normal configured proxy; no warm-up outside measured routing calls, no concurrency, no retry, maximum 24 new requests. Unlike the original v4 stop-on-unknown protocol, prospectively retain every unknown/error and continue only to the next distinct registered input. Resuming only reuses saved observations/receipts, never reissues a claimed request. Drift/schema/persistence failures stop execution.

Gates unchanged: macro-F1 >=.90; fixed/interpreter precision >=.95 and recall >=.85; wrong fast routes zero; availability >=.95; successful P95 <=2500ms. Account for fallback in accuracy and all provider failures in availability; unknown charges are not zero. Model-reviewed small synthetic holdout is not independent human Gold or business quality acceptance. No production switch or new model/budget configuration.
