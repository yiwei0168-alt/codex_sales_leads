# OpenRouter Terra 二次复核费用候选合同（阶段95）

2026-09-14 当前补充：S01 市场计划专用路由后来已获确认并实施（[独立验收](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)）；本页 Terra **仍是未获确认的候选合同**，不受 S01 授权覆盖。阶段132用当前 `LeadAssessmentReviewAgent` 捕获到 `reasoning.effort=medium`、严格 JSON、8,192 总输出及原 provider 参数的实际合成请求，现行产品仍在预留前 `missing-tariff`；请求形态见[实际传输预检](OPENROUTER_REVIEW_ACTUAL_WIRE_PREFLIGHT_2026-09-14.md)。即使此项获准，USD11.019202 与 S01 单次上界相加已超过最近余额，整次业务仍不能凭两个单次报价启动。以下原文中“S01 待确认”是报告写成时的状态。

本文件只记录公开元数据的只读复核和费用上界候选，**不批准费率、不修改实际路由或费用门禁**。当前账号按用户 A20 确认仅使用 OpenRouter credits、未配置 BYOK；历史累计 USD30 验收占用最后记录 USD12.324404，付费前仍须重新核验。A11 要求计费合同或模型路由变化经用户确认，S01 单一 OpenAI 标准路由也仍是待确认提案。

## 本次核验

2026-09-14 上海时间对应的只读运行时间为 `2026-09-13T17:16:59.301Z`。`node scripts/run-tsx.cjs scripts/audit-openrouter-terra-review.ts` 仅对官方公开接口发起两个匿名 GET：

| 来源 | 本次 SHA-256 |
|---|---|
| [模型目录](https://openrouter.ai/api/v1/models) | `7f38b394bca3af9166e20aa9b56775c27510a1d0a8ec367637718cfb670ec8fd` |
| [Terra 端点详情](https://openrouter.ai/api/v1/models/openai/gpt-5.6-terra-20260709/endpoints) | `e1693b8a02f0bbd210cf61cf633b1e3f2aeee4109ab55cabe99a6cbf29da7c8f` |

与[阶段90冻结的公开快照](OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json)比较，模型 ID、canonical slug、上下文、目录价格、端点身份、各端点价格/阶梯、限制和支持参数均相同。原始响应哈希供复核；判定依据是相关字段投影，而非要求无关元数据逐字不变。本次结果 `unchanged-proposal-only`、`tariffAdmitted=false`、付费调用 0。

## 候选上界和请求边界

现有 `lead-assessment-review` OpenRouter 兼容请求为文本 system/user 消息、严格 JSON schema 响应、`reasoning.effort=medium`、`temperature=0`、`max_completion_tokens=8192`，不带工具或 web search，并设置 `provider.require_parameters=true`、`data_collection=deny`。公开端点中 Azure 系标准端点支持所需参数；`openai/flex` 和 `openai/fast` 不纳入标准路由候选。OpenRouter 的[路由参数说明](https://openrouter.ai/docs/guides/routing/provider-selection)、[结构化输出说明](https://openrouter.ai/docs/guides/features/structured-outputs)及[reasoning token 计费说明](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)是请求契约和输出计费参考。

只读计算对五个标准端点逐项取输入、cache read、cache write 和 completion 的最大公开价格，覆盖超过 272,000 prompt token 的价格阶梯及任何折扣复原；保守地把 1,050,000 上下文 token **分别**计入三项输入价格，再加 8,192 输出 token，向上取整至 micro-USD，得到 **USD11.019202/单次候选复核**。这种相加故意高估互斥的输入/cache SKU，不能当实际账单。公开的 web search 价格不计入这个文本、无工具请求；若实际请求或路由出现该能力，必须另行核准上界。

即使未来该合同获准，费用门禁仍须在每次请求前检查有效期、完整实际请求、可用端点、共享预算和现有未知费用；服务商报告与账单需追加式核销，未知不能归零。只读审计在价格、端点或能力变化时返回 `review-required`，缺失价格或限制时失败；不会自动写入 `config/billing/request-bounds-v1.6.0.json`。

## 仍未满足的验收

阶段91的离线情景中，S01 规划单次 USD10.622880 加本候选复核 USD11.019202 为 **USD21.642082**，高于最后已知剩余额度 USD17.675596；这并不证明完整业务运行可容纳。正式放行仍缺 A11 对新计费合同/路由的确认、实际传输请求与端点契约联测、其他可能调用的完整费用上界、实时累计预算预检及首次真实服务商报告对账。Gemini 服务端搜索次数仍无硬费用上界，维持阻止。原冻结测评未重跑，不能从此审计推断候选填充率或真实节省。
