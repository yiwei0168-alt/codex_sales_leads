# Local production acceptance — 2026-09-12

## Scope and verdict

Local production build only; no cloud deployment. Code/build and bounded authenticated UI checks pass. **Overall live-service acceptance is partial, not a release certification.** DeepSeek returned HTTP 402; SMTP connection verification failed. Existing broad product tariff policy remains fail-closed with no approved rules. Synthetic provider probes do not certify complete RAG, scoring, search or email-generation business workflows.

User authorized a cumulative USD 30 ceiling, official provider rates with OpenAI reference pricing if unavailable, and one marked SMTP test using the connected mailbox and designated recipient. No recipient, credential, real mailbox content or private endpoint is stored in this report.

## Verified results

- 586 unit/domain tests across 139 files; TypeScript and production build pass.
- 18 isolated browser tests and 14 authenticated desktop/mobile check groups pass against the local production server. The latter include real login, GB/MX detail/map, task budgets, and disabled-user session rejection. Synthetic UI fixtures were removed; customer records were not modified by these checks.
- Application-role database/UI contracts pass, including transactional tenant-isolation checks rolled back after verification.
- ESLint: zero errors, 11 pre-existing warnings. Fresh npm vulnerability audit and GitHub CI retrieval failed due to external TLS/EOF errors; prior audit results are not represented as a current successful audit.
- Authentication fixes: reject malformed login bodies before account lookup; require active account status for every session resolution.
- Kimi K3 calls use `max_completion_tokens` and omit fixed temperature. Billing refuses K3 requests containing only obsolete `max_tokens`. K2.6 retains its supported output field. Official source: [Kimi K3 guide](https://platform.kimi.com/docs/guide/kimi-k3-quickstart).

## Live model contracts and costs

One fixed synthetic text/embedding request per stage, zero automatic retries, no searches/tools/media/customer data. Successful output is checked as JSON or a finite embedding vector of the configured dimension. These are transport/schema checks, not business-quality evaluations.

| Stage | Result | Input/output tokens | Rate-derived estimate | Provider-reported USD |
|---|---|---:|---:|---:|
| OpenRouter `openai/gpt-5.6-sol` | HTTP 200; valid; 2.576 s | 25 / 10 | $0.0004675, conservative provider-table rates | $0.00015 |
| DeepSeek `deepseek-v4-pro` | HTTP 402; 1.724 s | Unknown | Unknown | Unknown |
| Kimi `kimi-k2.6` | HTTP 200; valid; 9.597 s | 26 / 114 | $0.00596, OpenAI reference only | Unknown |
| Kimi `kimi-k3` | HTTP 200; valid; 6.693 s | 104 / 83 | $0.00519, OpenAI reference only | Unknown |
| Aliyun `text-embedding-v4` | HTTP 200; valid; 1.883 s | 5 / 0 | CNY 0.0000025 | Unknown |

Actual invoice total is **unknown**. Do not add conservative rate estimates to reported cost as if both were charges. Kimi reference subtotal is $0.01115; embedding stays in CNY without an invented exchange rate. HTTP 402 is a billing/access failure, not proof of zero charge or of model quality.

Rate sources reviewed on 2026-09-12:

- [OpenRouter Sol](https://openrouter.ai/openai/gpt-5.6-sol): provider-specific prices vary; the probe estimate uses the reviewed upper displayed input/output rates of $5.5/$33 per million, not the promotional headline price. Returned `usage.cost` is separately retained, not called an audited invoice.
- [DeepSeek official rates](https://api-docs.deepseek.com/quick_start/pricing/): V4 Pro peak cache-miss input/output $1.32/$3.96 per million. No estimate possible for the failed response.
- [Kimi pricing](https://platform.kimi.com/docs/pricing/chat): actual numeric table could not be recovered from the fetched page. Following user authorization, use [OpenAI standard reference](https://developers.openai.com/api/docs/pricing), $10/$50 per million, explicitly **not Kimi actual rates**.
- [Aliyun embedding](https://help.aliyun.com/zh/model-studio/text-embedding-v4): Beijing real-time CNY 0.5 per million input tokens.

Budget implementation: a disabled, passwordless synthetic audit identity stores the USD 30 cumulative ceiling separately from the real user's budget. Every attempt reserves $2 before network I/O; five attempts occupy **$10**, leaving **$20**. This intentionally large reservation applies only to fixed small single-text probes (at most 8192 request bytes/4096 output tokens, no tools); it is not a general provider tariff. Policies expire on September 19. Server-only scoped policies do not change global product rules. Failed/unknown attempts retain reservations; rerunning skips all previous attempts including failures. A database advisory lock prevents concurrent copies. No automatic budget increase or release.

`scripts/verify-live-model-budget.ts` previews without `--run`; `--run` executes only missing stages. Resuming now makes no paid calls and still exits nonzero for the failed DeepSeek stage. Do not delete its reservations to retry. A new explicitly bounded retry stage must retain historical occupancy.

## SMTP

Connected mailbox count: one. Two connection-verification attempts failed with ESOCKET and ETIMEDOUT (including an escalated network attempt). No outbound receipt exists for the dedicated synthetic test company; sending was not reached. Inbox delivery is unverified. Do not mark SMTP as passed or retry blindly.

The clearly marked synthetic company node is retained for audit. The script uses a deterministic send idempotency key and no customer node. `scripts/verify-live-smtp.ts --status` is read-only; `--send` requires the authorized recipient in local environment. It logs phase/error class only, never SMTP raw errors or addresses.

## Remaining release gates / resume

1. Restore DeepSeek billing access; investigate SMTP host/port/TLS connectivity and account SMTP availability. Do not rotate credentials or change provider silently.
2. Complete broad per-endpoint request bounds (including tool/search costs), production workflow acceptance and invoice reconciliation. Global empty policy intentionally still blocks paid product calls; the isolated successful probes do not unlock them.
3. Complete final-user adoption telemetry where still unknown; do not label an HTTP success as downstream business adoption. Probe adoption here means only validator consumption.
4. Retry dependency audit / GitHub CI checks when external connectivity permits. Future ECS deployment additionally needs HTTPS/reverse-proxy trust, secrets, workers, backup/restore and operational monitoring acceptance; not in this local deployment scope.

No expanded search experiment, evidence refresh, real customer outreach or cloud deployment was performed.
