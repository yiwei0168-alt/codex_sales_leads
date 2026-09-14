# 阶段134：S01 市场计划 Sol 专用路由与费用合同

用户于 2026-09-14 多次明确批准同一项 S01。范围仅为 `buildLeadMarketPlaybook` 的 `openai/gpt-5.6-sol`、OpenRouter credits、OpenAI 标准端点；其他模型、复核/裁决等阶段以及评分标准不变。真实付费仍由累计 USD30 和整次保守预检控制，此确认不是启动真实业务的独立许可。

`request-bounds-v1.7.0` 新增专用 `openrouter-sol-openai-playbook-v1`：`provider.only=["openai"]`、`allow_fallbacks=false`、`require_parameters=true`、`data_collection=deny`，只接受非流式两条纯文本消息、严格 JSON Schema、无工具/插件/特殊服务层、最多 61,440 请求字节和 4,096 总输出 token。旧 `openrouter-sol-standard-json-v1` 与 USD27.345252 保留给其他 Sol 用途。产品付费传输只在模型调用任务为 `lead-playbook` 时选择新规则；请求体若缺路由限定或增加能力，在预留及外发前拒绝。公开费率漂移暂停状态同时约束新旧两项 Sol 规则。端点异常使市场计划阶段暂停，不能自动换 Azure/Bedrock 或退为确定性计划；计划缓存身份新增模型和路由，使旧合同下生成的缓存不可误用。

[OpenRouter 官方路由文档](https://openrouter.ai/docs/guides/routing/provider-selection)支持 `only` 和 `allow_fallbacks=false`。[官方端点数据](https://openrouter.ai/api/v1/models/openai/gpt-5.6-sol-20260709/endpoints)在本次只读复核保持专用 `tag=openai`、1,050,000 上下文及去折扣最大百万 token 单价：普通输入 USD8、缓存读 USD0.8、缓存写 USD10、输出 USD30。输入三类互斥，按最贵 USD10/M 覆盖全上下文，加输出 4,096×USD30/M，得 **USD10.622880 = 10,622,880 micro-USD**。计算不依赖实际 token 估算或缓存命中，也不把不同供应商的价格混合。证据快照和只读复算保留在 [原提案证据](SOL_OPENAI_ONLY_PROPOSAL_2026-09-13.json)。静态合同仍于 2026-09-20T00:00:00Z 到期，公开刷新不能自动延长期限；缺价证或漂移继续拒绝。

无付费验收：实际 LangChain 市场计划合成传输捕获 **4,213 字节**、`provider.only=["openai"]` 与 `allow_fallbacks=false`，输出 4,096、严格 Schema 且无额外付费能力；针对非 OpenAI 路由、开启 fallback、额外工具/服务层、过大字节/输出和到期合同的定向测试均在传输前拒绝。非市场计划请求继续按旧上界报价。模型/路由变化导致缓存键变化；固定端点错误不返回看似成功的备用计划。此验收没有模型、搜索、SMTP、真实 token/API credits、真实现金或付费重试；未生成新市场候选或用户采用数据。

验证记录：定向计费、传输、缓存和预算测试通过；全量 **981 项/203 文件**通过，`typecheck`、Next.js 生产构建、相关源码 lint 均通过；全库 lint 为 0 错误/11 条既有警告，生产依赖审计 0 漏洞。只读预算与最小路径预检前后占用一致，0 外发/任务认领。原 v1.6.0 版本文件与历史预留保留，新 v1.7.0 仅供后续请求使用。

本阶段不能证明整次最小业务可付费执行：本次只读数据库重核的 USD30 累计占用为 USD12.324404、余额 USD17.675596，历史未知账单六笔仍须保留。整次只读预检显示：Kimi 两类意图与北京 Embedding 的已审计静态合同已到期；Terra 条件复核缺合同，Sol 12,000 输出裁决超旧合同，SearchAPI/Gemini 缺严格费用上界。故 `checkedTariffsAvailable=false`、`actualRequestContractsChecked=false`、`totalRunBoundUsd=null`，没有启动真实调用。S01 与 Terra 条件复核候选上界之和 USD21.642082 也超过该余额；其他入口实际触发次数仍有缺口。不可由单次 USD10.622880 推断整次可容纳、真实节省、能填满目标或冻结盲审结果改善。当前阶段验收与整体验收分别记录。
