# S01 公开端点参数清单与实际请求差异（阶段175）

S01 已获用户批准且产品中的市场计划专用路由和 USD10.622880 单次保守合同已实现；本报告只检查该路由的公开兼容性证据，不修改路由、费用合同或付费门禁。`scripts/preview-minimal-production-acceptance.ts` 捕获现行 LangChain/SDK 合成请求：`openai/gpt-5.6-sol`、`provider.only=["openai"]`、`allow_fallbacks=false`、`require_parameters=true`、`max_completion_tokens=4096`、严格 JSON、`temperature=0`，共4213字节。预算只读占用仍 USD12.324404/30，整次上界仍 `null`，供应商调用0。

9月14日06:12 UTC 的[官方模型与端点只读复核](https://openrouter.ai/api/v1/models/openai/gpt-5.6-sol-20260709/endpoints)与仓库公开证据的合同投影一致；本次目录响应 SHA-256 `03d5020256000013be81b7214bebaf80d24d383558944efb2e8388c759815fa5`，Sol 端点响应 SHA-256 `d051111e3d2ff7b17f9d1f7bc3f2e2149c0214e17cb5c6df9aa63f61a26c6df5`。OpenAI 标准端点的 `supported_parameters` 列出 `response_format`、`max_tokens` 和 `reasoning`，却未列出本轮实际请求的 `max_completion_tokens` 与 `temperature`。预检脚本现在明确输出 `notListedInEndpointMetadata`，同时保持 `providerAcceptanceChecked=false`；缺席不是端点拒绝的实测结论。

[OpenRouter Chat API](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)接受 `max_completion_tokens`，并将 `max_tokens` 标为旧字段；[路由文档](https://openrouter.ai/docs/guides/routing/provider-selection)说明 `require_parameters=true` 只选择支持请求参数的端点。**推断：** 公开参数清单与网关通用 API 的差异可能影响 S01 固定端点路由，也可能只是端点元数据未列出网关映射参数。没有真实请求或供应商确认前，不能判定哪一种。直接把 S01 改成 `max_tokens`、删除 `temperature`、开放 Azure/Bedrock 回退或引入新的低价复核合同都超出当前确认范围；本阶段不这样做。

可重复的无付费验证：`node --use-env-proxy scripts/run-tsx.cjs scripts/audit-openrouter-sol-judge.ts` 核对官方模型/端点投影，`node scripts/run-tsx.cjs scripts/preview-minimal-production-acceptance.ts` 捕获真实合成请求并输出缺席字段；TypeScript 与脚本 lint 通过。输入4份公开响应（Sol和Terra各目录/端点2份）及1个合成请求，有效审计4/4、Sol字段比较1/1，供准入诊断使用1，真实业务下游使用0、用户采用未知。官方匿名GET4次，真实模型/搜索/SMTP、token/付费API credits/现金/付费重试均0；公开核对约2秒、本地预检约8秒，实际供应商延迟未知。优化机会是先澄清该端点参数映射，再在完整整次费用及 USD30 门禁通过后验证真实最小闭环，避免为了单次低价悄悄放松结构输出或改路由。整体验收仍未完成。
