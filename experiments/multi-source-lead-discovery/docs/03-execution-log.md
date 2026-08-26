# Execution journal

This file is append-only after the protocol is frozen. All timestamps use ISO 8601 with the Asia/Shanghai offset. Failed and interrupted attempts remain recorded; they are not deleted when a retry succeeds.

| Timestamp | Stage | Run/step ID | System | Input hash | Status | Requests / usage | Output artifact | Commit | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-08-26T15:25:02+08:00 | protocol-design | protocol-design-001 | n/a | pending | succeeded | n/a | docs and config | same commit | Documentation framework created; scoring and input freeze still require user confirmation. |
| 2026-08-26T16:08:00+08:00 | protocol-freeze | protocol-freeze-001 | all | recorded in input manifest | succeeded | 55 planned discovery calls; evaluator calls reported at run time | config/inputs.json and protocol docs | same commit | User confirmed the final scheme; role is a gate and scoring is 45/35/20. No paid call was made before this freeze. |

Permitted status values: `planned`, `in_progress`, `succeeded`, `failed`, `interrupted`, `excluded`, `superseded`.
