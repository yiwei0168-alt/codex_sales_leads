# Execution journal

This file is append-only after the protocol is frozen. All timestamps use ISO 8601 with the Asia/Shanghai offset. Failed and interrupted attempts remain recorded; they are not deleted when a retry succeeds.

| Timestamp | Stage | Run/step ID | System | Input hash | Status | Requests / usage | Output artifact | Commit | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-08-26T15:25:02+08:00 | protocol-design | protocol-design-001 | n/a | pending | succeeded | n/a | docs and config | same commit | Documentation framework created; scoring and input freeze still require user confirmation. |

Permitted status values: `planned`, `in_progress`, `succeeded`, `failed`, `interrupted`, `excluded`, `superseded`.
