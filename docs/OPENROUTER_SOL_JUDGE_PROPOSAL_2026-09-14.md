# OpenRouter Sol 分歧裁决费用候选上界（阶段99）

2026-09-14 当前补充：S01 后来已确认，但只作用于市场计划；本页 **12,000 输出的分歧裁决合同仍待独立确认**，不能套用 S01 的 USD10.622880。阶段132当前 Agent 合成请求已捕获严格 JSON、`reasoning.effort=high`、12,000 总输出和原 provider 参数，现行产品在预留前 `request-out-of-bounds`；见[实际传输预检](OPENROUTER_REVIEW_ACTUAL_WIRE_PREFLIGHT_2026-09-14.md)。候选上界 USD27.736500 大于最近余额 USD17.675596，即使获确认仍不得在此预算状态下外发。以下原文中“S01 待确认”保留为提案时状态。

本文件是无凭据、无付费的公开元数据审计，**不准入新费率，不改变模型或服务商路由**。当前账号按 A20 仅使用 OpenRouter credits，未配置 BYOK。A11 规定计费合同及路由变更须先经用户确认；S01 市场计划单一路由仍待确认。历史累计 USD30 验收占用最后记录 USD12.324404，付费前必须重新核验。

## 公开来源与复核

`node --use-env-proxy scripts/run-tsx.cjs scripts/audit-openrouter-sol-judge.ts` 在 `2026-09-13T17:50:23.404Z` 仅向 OpenRouter 发起两个匿名 GET：

| 来源 | 本次原始响应 SHA-256 |
|---|---|
| [模型目录](https://openrouter.ai/api/v1/models) | `9dedc4c633874cb7ccfa630dd260d1bda491271e445d4d42c5fe3be0ece9cba2` |
| [Sol 端点详情](https://openrouter.ai/api/v1/models/openai/gpt-5.6-sol-20260709/endpoints) | `76e4a0dc990cfdd94872d5c64b3acfb40f52b474702de006542f912e16b2f544` |

与[阶段90公开快照](OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json)相比，模型 ID、canonical slug、1,050,000 上下文、目录价格、端点身份、七个端点的价格/阶梯/输出限制/支持参数均未变化。计算器只排除 `openai/flex` 和 `openai/fast`：公开参数集没有本请求的 `max_completion_tokens`，且[OpenRouter 服务层](https://openrouter.ai/docs/guides/features/service-tiers)要求主动选择这些变体。其余五个标准端点取各计费项最贵值；其中 Azure 系列公开列出 `max_completion_tokens`、`reasoning`、`response_format` 和 `structured_outputs`。`require_parameters=true` 过滤不兼容端点；实际能否完成全量请求仍须联测。[OpenRouter 服务商路由文档](https://openrouter.ai/docs/guides/routing/provider-selection)说明未限定时会在可用服务商间路由及回退。

## 请求与候选计算

当前 `lead-review-judge` 由 Sol 执行条件触发的分歧裁决：文本 system/user、严格 JSON schema、`reasoning.effort=high`、`temperature=0`、`max_completion_tokens=12000`、`provider.require_parameters=true`、`data_collection=deny`，无工具、插件或 web search。[OpenAI Sol 模型说明](https://developers.openai.com/api/docs/models/gpt-5.6-sol)支持该推理档位、结构化输出和足够的输出长度；其直连价格不用于 OpenRouter 账单。[推理 token 说明](https://developers.openai.com/api/docs/guides/reasoning)显示推理 token 会计入输出用量。公开参数清单不能证明 `temperature=0` 在每个候选端点的实际传输行为，故仍需真实请求契约联测。

按五个标准端点的公开价格，把折扣还原，基础和超过 272,000 输入 token 的价格逐项取最高值。保守地将完整 1,050,000 上下文**分别**按普通输入 USD11/M、缓存读 USD1.1/M、缓存写 USD13.75/M 计入，再将 12,000 输出 token 按 USD49.5/M 计入，向上取至 micro-USD：候选上界 **USD27.736500/次**。这种相加故意高估互斥的输入类别，不是实际账单，也不预测裁决触发次数或输出质量。运行结果 `unchanged-proposal-only`、`tariffAdmitted=false`、`paidCalls=0`；测试验证价格/能力变化时不能静默沿用。

现行 Sol 合同仅覆盖 4,096 输出 token，最高 USD27.345252；裁决请求 12,000 token 被 `request-out-of-bounds` 拒绝。候选上界高于最后已知余额 USD17.675596，因此即便后续合同获确认，在当前已知余额下这一次裁决也不可预留。S01 单次市场计划与 Terra 二次复核两项候选上界合计 USD21.642082，同样超余额；完整业务运行可能还包含其他费用，不能以单项候选可用推断整次可执行。

费用准入仍缺 A11 用户确认、实际 SDK 请求字段/服务商功能联测、所有可能调用入口的完整上界、实时累计预算及可信服务商报告对账。若价格、能力、路由、请求负载或有效期变化，须重新核验；未知费用保持阻止，不自动启用新合同。冻结测评未重跑，本报告不证明候选填充率或节省金额。

验证：公开审计通过，定向 Vitest 4/4、TypeScript 检查通过。公开 GET 两次、失败重试0，新增模型 token/API credits/现金0，实际业务输入/有效/下游使用0，实际用户采用、节省和供应商延迟未知。
