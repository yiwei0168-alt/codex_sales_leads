# S02 候选：保持 S01 路由，修正市场计划请求参数

**当前状态：用户已明确批准 S02 及继续最小真实验收；v2 请求合同与无付费回归见[阶段237](S02_PLAYBOOK_PARAMETER_ACCEPTANCE_STAGE237_2026-09-14.md)。以下提案写成时的待确认描述保留为历史；S02 真实供应商结果仍待验证。**

阶段232 的隔离本地真实验收先以两轮 Kimi 对话生成并修正计划：哥伦比亚、Distributor、目标 1，第二轮把首次误判的查询语言 `en` 改为 `es`。之后知识检索通过费用门禁；市场计划仍按已批准 S01 路由发送 `openai/gpt-5.6-sol` 至 OpenRouter credits，仅允许 OpenAI 标准端点且禁用供应商回退。该端点返回 HTTP 404：`No endpoints found that can handle the requested parameters`。任务停在市场计划，未搜索、补证、校正、评分或保存新公司。此 404 证明当前完整请求不能被该路由处理，不能单凭响应确定某一个字段为唯一原因。此前 [阶段175 公共参数差异](S01_PUBLIC_ENDPOINT_PARAMETER_GAP_2026-09-14.md)已指出实际请求的 `max_completion_tokens=4096` 与 `temperature=0` 不在 OpenAI 标准端点的公开支持清单里；清单包含 `max_tokens` 与 `response_format`。[OpenRouter 路由说明](https://openrouter.ai/docs/guides/routing/provider-selection)规定 `require_parameters=true` 只选支持请求全部参数的端点，[Chat API](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)展示 `max_tokens` 请求。这些官方来源加上实测 404 支持提出修订，但仍不能保证新请求一定得到合格模型响应。

建议仅对 `buildLeadMarketPlaybook` 的 S01 Sol 请求：由 LangChain `maxTokens:4096` 生成 `max_tokens=4096`，省略 `temperature`，保留严格 JSON Schema、非流式、`provider.only=["openai"]`、`allow_fallbacks=false`、`require_parameters=true`、`data_collection=deny`。模型、OpenRouter credits、61,440 请求字节、4,096 总输出 token、无工具/插件/特殊层/显式缓存、OpenAI 标准端点和单次保守上界 **USD10.622880** 均不变；不得自动切到 Azure、Bedrock、OpenAI flex/fast 或其他模型。S02 需新的请求合同和缓存身份版本，原 S01 历史合同与已记账请求保留。一个无网络 LangChain/SDK 合成捕获已验证这组候选字段确实序列化为 `max_tokens=4096`、无 `max_completion_tokens` 或 `temperature`，保留 JSON Schema 和 OpenAI-only 路由；合成请求 604 字节，仅证字段形态，不代表实际市场提示或端点接受。

批准后先实现并完成无付费严格合同、实际市场请求线形、缓存失效、预算/重复防护回归，再在 USD50 隔离账号内做**一项新的、明确编号的最小真实验收尝试**。原失败动作 `537155d0-8c04-4ca8-9754-54d658b12027` 不自动重放；其 S01 404 没有可核验服务商账单，USD10.622880 保守占用继续保留。当前总占用 USD23.520920/50、剩余 USD26.479080，其中本轮两次意图 USD0.567224、知识检索 USD0.006412、S01 失败预留 USD10.622880，均为**预留而非已核实现金支出**；六笔原有未知账单不动，四笔本轮缺可信费用报告的记录独立保留。新 S02 单次上界可放入余额，但后续条件 Sol 裁决 USD27.736500 已无法在当前余额单独准入；真实路线可能再次部分完成。SearchAPI 账号配额/合同和 Gemini 内部搜索硬上界仍是独立条件阻塞，S02 不会暗中放行。

若不批准 S02，按 S01 既有约定保持该阶段暂停；无付费测试、文档与其他已授权修复可继续。无论批准与否，冻结哥伦比亚数量测评及其盲审结果不重跑、不改写。
