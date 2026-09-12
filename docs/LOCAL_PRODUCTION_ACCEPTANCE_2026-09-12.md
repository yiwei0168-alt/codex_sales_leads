# Local production acceptance — 2026-09-12


## 2026-09-13 P02 实施阶段 5：成本页缓存观测

本阶段全量回归：619 tests / 149 files 与 typecheck 通过。

现有用户预算/任务预算折叠区增加模型用量观测，无新页面或模型调用。服务端按 owner、可选任务及 stage/provider/requestedModel/reportedModel/promptVersion/gateway/endpoint 分组，只返回白名单字段的已报告合计与覆盖尝试数。未知为 null，显式零保留；未把输入与缓存字段机械相加，未把观测量推成现金折价，也未把 HTTP 响应等同下游采用。UI 只传序列化类型，不引入数据库或服务端凭据模块。后续优化：版本/路由组长期增多时增加分页或预聚合，不在页面加载触发付费计算。

8 项针对性测试、类型检查及生产构建通过。localhost:3100 的生产模式真实登录/UI/数据库检查 16 组通过（1366/390px、GB/MX、预算观测空值、停用用户拒绝），手机观测截图已复核。首次失败为 Playwright 独立 HTTP 客户端在本地 HTTP 下未按浏览器 Secure Cookie 行为发送会话；验收脚本改为真实浏览器 fetch 后通过，产品安全 Cookie 未降低。仅合成测试用户，完成后清理，真实模型/搜索/SMTP 调用 0。此阶段只验证空观测 SQL 与合成字段渲染；非空真实服务商账单/缓存率、全部 provider 归因、评分版本与核销仍待验收。


## 2026-09-13 P05 实施阶段 4：公共角色缓存依赖收紧

验证：615 tests / 147 files 与 typecheck 通过；新增完整请求依赖/未知契约/输入变化测试。本阶段未执行真实 SQL 缓存验收或付费调用。

主角色快照读取/写入要求完整主模型请求契约：DeepSeek 实际序列化体、模型、端点、Schema、提示版本、生成参数、全部批成员/顺序及 evidenceIds 的 SHA-256。依赖 v2 另含公司身份、官方 URL、输入角色/类别、缺失证据、国家/目标和证据顺序/标题/内容哈希/来源。旧缺失契约记录保留但不命中；无可靠契约的 provider 不启用此缓存。只记录完整、候选 ID 一一对应且未切换模型/备用 provider 的常规批次结果；升级/修复/合并生成的新对象保守不写，避免归因冒充。

此版本为了安全保留原始 ID 参与请求哈希，因此跨运行 ID 变化会 miss；既有引用重绑定工具保留，但不据此假定完整请求等价。缓存命中可能暂时降低，未测真实节省率。复用仍在现有公共证据库，未引入私有评分/路径跨用户共享。已有 cacheHits/cacheMisses、逐调用用量/字节/耗时/重试及下游未知口径沿用；本地哈希不调用模型，费用 0。后续待验收：证据 ID 可证明等价替换、评分/路径租户国家隔离持久缓存、跨进程幂等和未知费用恢复。阶段 4 不等于 P05 全部完成。


## 2026-09-13 P06 实施阶段 3：完整请求字节预检

验证：全量 611 tests / 146 files、typecheck、生产构建通过。新增 5 项边界测试覆盖 UTF-8、完整 Schema、输入转义、两种 DeepSeek 实际载荷一致性、两类 provider 超限零传输。真实业务/数据库恢复与浏览器仍不包含在此结论内。

补证/评分拆批现使用与 DeepSeek 实际发送相同的序列化器，包含 system、完整 Schema、evidenceIds、转义及 UTF-8 字节。上限补证 36,864、仅评分 57,344、评分含路径 61,440；保留最多 5 家及更小调用者限制、既有字符软限制、原顺序和并发。所有常规批次先完成本地预检；超大单家公司明确抛出不可重试暂停错误，不截断或生成低分。DeepSeek 和 compatible 最终发送前再次校验，备用请求独立检查实际序列化体积。没有改输出 token/thinking，没有自动搜索或模型压缩。

本阶段是 P06 部分实现：单家公司压缩/分阶段恢复、批内成功结果持久恢复及备用模型自动重新拆批尚未完成。常规批次预检避免本阶段先付费后发现超限，但既有补证搜索及之前阶段的 checkpoint 不等于批内完整幂等。新流程字节统计不等于可信 token/美元计费上界，空费率门禁不变。遥测沿用逐尝试输入/输出字节、用量、耗时、重试及未知下游采用；新增步骤仅本地序列化，无模型/API 费用。后续优化记录：备用载荷与批次持久恢复仍需完善，不能声称成本节省率或完整验收通过。

## 2026-09-13 stage 2b: attribution, local-only

Verification: 606 tests / 145 files passed; after correcting a test-only task literal, typecheck and both attribution tests passed again. Production build/browser and real paid acceptance have not been rerun in this stage.

DeepSeek/compatible transports now attach isolated invocation/attempt and prompt/model routing metadata to reservations. Requested and response-reported models remain distinct; no arbitrary response metadata or URL parameters are retained. Synthetic tests cover context isolation and actual retry wrapper linkage. No live calls or budget reset. Score-version attribution, other providers, aggregation/UI, P05/P06 and billing gates remain outstanding.

## 2026-09-13 stage 2a: partial P02, not final acceptance

Per-attempt cache/reasoning numeric source fields now persist in existing reservation JSON metrics. Twelve targeted tests and typecheck pass, including failed/successful attempts, null versus zero, malformed fields and no raw private payload retention. No real provider/search/SMTP calls or tariff changes. Pending P02 attribution/aggregation/UI, P05, P06 and all unresolved billing/production gates remain open; cumulative acceptance budget is not reset.

## 2026-09-13 implementation stage 1, local checks only

Production build also passed (16 static pages generated); no new authenticated browser run or real model quality check is claimed. This preserves the local-only deployment scope.

P06 now confirmed; all six proposals are authorized for implementation. P01 stable-prefix ordering and P03 deterministic model-policy projection implemented; P04 output Schema retained. 596 tests / 142 files and typecheck pass, no paid model/search/SMTP calls. This is not a new provider tariff, cache-hit proof or business quality pass. P02/P05/P06, ledger reconciliation and the remaining acceptance gate table below still require completion; its earlier pending-confirmation statements are historical.

## 2026-09-13 acceptance-led completion plan

User directs completion of P03–P06 alongside remaining acceptance work, then acceptance as the primary workstream. Existing item-by-item confirmation remains: P01/P02 approved but not implemented; P03–P06 must be confirmed before unified product edits. Do not extend scope to new optional optimizations. The table is a current gap index, not fresh execution evidence; historical failures below are retained.

| Gate | Current state | Completion evidence required |
|---|---|---|
| Provider connectivity / SMTP | All five provider probes have passed at least once; SMTP send and user-reported inbox receipt passed. | Keep original failure/probe receipts; no repeat merely to recreate passing evidence. This does not certify business-agent quality. |
| Paid request bounds | Not passed: global policy remains empty; frozen local token counts are observations, not universal hosted billing bounds. | Approved versioned endpoint/model/rate bounds, full-body enforcement including single-company overflow, allowed/denied boundary tests and scoped real validation; no missing-rate bypass. |
| Ledger / reconciliation | Partial infrastructure; newly approved accounting rules not fully implemented/verified. | Separate reservation/estimate/provider report/invoice; per-attempt ownership, unknown-cost retention, correct release/append-only corrections, FX freshness and budget concurrency tests. No double counting. |
| Real product workflow | Not fully accepted; transport probes and synthetic UI tests do not cover it. | Minimal bounded user-input-to-persisted-result run using real agents after tariff approval, verify country/role/evidence/score and failure/resume reuse. Keep cumulative USD 30 cap and old reservations; no expanded search experiment. |
| Final downstream adoption telemetry | Incomplete; some values remain unknown. | Define generated/valid/saved/downstream-used boundaries, owner/country attribution, retry/discard/latency/cost fields; exercise relevant UI actions and prove no duplicate or invented adoption. |
| Dependency audit / GitHub CI | Latest retrieval previously blocked by external TLS/EOF; not a current pass. | Fresh successful audit and applicable CI evidence, or explicit separately reviewed unresolved findings. |
| Local production final regression | Prior checks passed, but future implementation changes require rerun. | Relevant unit/type/build checks and local authenticated UI/business acceptance; update this report with exact versions, results, costs, remaining exceptions. Cloud deployment remains out of scope. |

Scope and proposals: [P03–P06 review](FIXED_PROMPT_CACHE_REVIEW_2026-09-13.md), [confirmed rules](CONFIRMED_PRODUCT_RULES.md). Confirmed optimizations must be mapped to the gates they support; no optimization percentage substitutes for an acceptance pass.

## Latest user-confirmed policy checkpoint

User confirmed receipt of the previously authorized SMTP test; inbox receipt is now user-confirmed, not independently inspected. Preserve the earlier SMTP failures and send record as historical evidence; no additional send was made.

See [confirmed rules A01–B10](CONFIRMED_PRODUCT_RULES.md) for the complete newly approved ledger, FX, release, retry, and request-bound policies. Offline reconstruction of 207 frozen German candidates measured maximum request bodies of 33,496 / 50,567 / 54,383 bytes for correction / score-only / score-and-paths. The user approved initial bounds of 36 / 56 / 60 KiB. Qualification used a standard playbook without original RAG/private memory; this is not historical token replay or a production maximum proof. Zero provider calls or fees. The existing oversized-singleton guard gap remains unimplemented; policy confirmation is not an acceptance pass. Global product tariffs are still empty; USD 12 historical probe reservations under the USD 30 ceiling are unchanged, invoice total remains unknown.

## Update: user-confirmed single SMTP send passed; inbox pending

The user explicitly confirmed one marked test email to the designated recipient. The product's real `sendOutbound` workflow returned `sent`, `reused:false`; receipt persistence, sent timestamp and encrypted-payload readback checks all passed. No model calls or automatic resend. The dedicated synthetic company and receipt remain for audit; no real customer was marked contacted. Recipient inbox delivery is **not yet confirmed** and must not be inferred from SMTP acceptance. No recipient address, sender identity or message content is committed here. Earlier send-pending statements below are historical.

## Update: SMTP connection fix and authentication passed

System `dns.lookup` returned four working server addresses; `dns.resolve4` returned a different unreachable address. Nodemailer preferred the latter and timed out at CONN. All four system-resolved addresses passed unauthenticated TCP/TLS/SMTP checks; no mailbox credential was used during that diagnosis.

After user approval, the product now establishes TLS using system resolution and passes the secured socket to Nodemailer. DNS is bounded to 5 seconds; at most four distinct addresses, 5 seconds each. Only transient transport errors allow address switching before handoff. Original SMTP hostname remains the TLS servername and certificate verification stays mandatory; no IP is hardcoded. No address switch/replay occurs after handoff, authentication or uncertain delivery.

Real authentication using saved credentials and the new product connector **passed in 504 ms**. No mail sent, no database writes, no model calls. Typecheck, production build, 16 targeted mail tests and the full 591-test / 140-file regression passed. Real email send/receipt/delivery acceptance is still pending user confirmation; successful authentication is not delivery. Prior SMTP failures below are historical.

## Update: DeepSeek post-recharge recheck passed

After the user confirmed recharge, one explicitly selected DeepSeek-only probe returned HTTP 200 and valid JSON in 1719 ms: 102 input / 27 output tokens. The conservative peak/cache-miss estimate is USD 0.00024156; provider-reported invoice cost remains unknown. Official rates were rechecked at https://api-docs.deepseek.com/quick_start/pricing/. This Saturday is off-peak (half peak rates); without cache detail the off-peak cache-miss estimate is USD 0.00012078, not an invoice.

Five of five provider contracts now have a successful probe, while the original HTTP 402 receipt remains retained. Cumulative reservation is USD 12 / 30, USD 18 remaining. No other provider was called. `--deepseek-recharge-recheck --run` uses the fixed stage `deepseek-text-recharge-recheck-1`; repeat execution reuses the recorded result and sends nothing. Original default run still reports its historical failed stage; use this update for the latest acceptance verdict. SMTP, broad production tariff coverage and business E2E gates below are unchanged and await item-by-item user discussion.

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
