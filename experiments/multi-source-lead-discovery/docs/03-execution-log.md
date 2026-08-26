# Execution journal

This file is append-only after the protocol is frozen. All timestamps use ISO 8601 with the Asia/Shanghai offset. Failed and interrupted attempts remain recorded; they are not deleted when a retry succeeds.

| Timestamp | Stage | Run/step ID | System | Input hash | Status | Requests / usage | Output artifact | Commit | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-08-26T15:25:02+08:00 | protocol-design | protocol-design-001 | n/a | pending | succeeded | n/a | docs and config | same commit | Documentation framework created; scoring and input freeze still require user confirmation. |
| 2026-08-26T16:08:00+08:00 | protocol-freeze | protocol-freeze-001 | all | recorded in input manifest | succeeded | 55 planned discovery calls; evaluator calls reported at run time | config/inputs.json and protocol docs | same commit | User confirmed the final scheme; role is a gate and scoring is 45/35/20. No paid call was made before this freeze. |
| 2026-08-26T16:25:00+08:00 | execution-freeze | execution-freeze-001 | all | regenerated input manifest | succeeded | no external calls | runner, evaluator, blind-audit preparation and tests | same commit | Added exact fixed-list evaluation prompt and resumable audit-safe execution harness before measurement. This technical freeze supersedes the prior manifest; the substantive protocol is unchanged. |
| 2026-08-26T16:27:07+08:00 | connectivity-preflight | preflight-001 | six discovery providers | 1efe77befdb982651531102278218c866252c41ec38173a32847f76b70a58e65 | succeeded | 6 requests; all succeeded on first attempt | artifacts/runs/2026-08-26-de-v1/preflight/provider-connectivity.json | same commit | Raw SHA-256 values are preserved per provider. Sanitized artifact SHA-256: 9f769ef59f050fa672cca34ce253513f8a5112737c040a2cdb548912a08eb127. No measured discovery query was run in this stage. |

Permitted status values: `planned`, `in_progress`, `succeeded`, `failed`, `interrupted`, `excluded`, `superseded`.
