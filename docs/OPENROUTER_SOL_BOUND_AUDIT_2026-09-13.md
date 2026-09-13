# OpenRouter Sol 费用上界证据核验

阶段56最终回归826测试/181文件通过。首次全量运行新测试触及默认5秒超时，实际SDK内部等待造成；单独验证已通过后将仅该测试超时设15秒，重跑全量通过。仍只捕获1次传输，产品重试行为未改；生产build沿用阶段52（本阶段只增测试/文档）。

阶段56补证：`playbook-wire.test.ts`使用实际LangChain ChatOpenAI与实际buildLeadMarketPlaybook，固定合成输入，在fetch边界抛BudgetDeniedError，不接触网络。精确顶层字段为max_completion_tokens/messages/model/provider/response_format/stream/temperature；模型openai/gpt-5.6-sol、输出4096、2个纯文本消息、strict JSON Schema、provider仅require_parameters/data_collection。无工具/插件/多结果/特殊服务层/显式缓存配置，单次捕获后预算错误透出。仅此构建入口的合成请求获得证明，不代表所有SDK入口或真实大请求均满足上界。

只读GET /api/v1/key返回200及is_management_key=false；未输出key标签、账户标识或用量。官方OpenAPI中GET /byok要求管理key并按工作区列配置，当前普通key信息无法证明未配置BYOK。已向用户询问当前工作区BYOK状态，无需提供密钥；等待确认期间继续独立验证，未修改账号/费率。初次内联诊断因require与top-level await混用在本地失败，改为ES module后只读成功。

阶段55，只读公开元数据，无密钥、账号读取或推理调用。脚本 `capture-openrouter-sol-pricing.ts --write` 保存[端点快照](OPENROUTER_SOL_ENDPOINT_EVIDENCE_2026-09-13.json)，包括抓取时间、官方响应SHA256、精确模型与7个端点的价格/上下文/参数。typecheck通过。本产物不是启用费率。

当前模型openai/gpt-5.6-sol、canonical openai/gpt-5.6-sol-20260709。目录给出的最低价不能代表所有路由，实际有OpenAI三层、Bedrock、Azure三个端点。[官方端点API](https://openrouter.ai/api/v1/models/openai/gpt-5.6-sol-20260709/endpoints)。

新的确定性结论：当前配置仅require_parameters=true/data_collection=deny，无service_tier、tier slug或模型variant；[服务层文档](https://openrouter.ai/docs/guides/features/service-tiers)明确未请求特殊层时不路由flex/priority。因此openai/flex、openai/fast不应直接算作当前请求必需覆盖范围；未来若请求启用这些层，必须重新校验契约。

标准端点仍有不同价格及>=272000输入token覆盖价。Azure/us、Azure/eu该档输入USD11/M、输出49.5/M、缓存读1.1/M、缓存写13.75/M；其独立max_prompt_tokens为null，公开context_length为1050000。OpenAI端点还带discount=0.5，不能把未给截止时间的折扣当永久标准价。官方[供应商折扣说明](https://openrouter.ai/docs/guides/community/for-providers)指出折扣覆盖各收费项及条件覆盖价。[缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching)明确GPT-5.6起自动缓存写入收费。

仅作计算情景（**不是核准上界或实际费用**）：以Azure/us或eu全1050000输入、playbook输出4096为例，若各输入计费互斥并以最贵缓存写入覆盖，得USD14.640252；若尚未证实互斥而把输入/读/写全部相加，得USD27.345252。两者巨大差异说明不能以一个看似保守的参考数放行；后者亦超过当前USD17.675596剩余额度。未计入未验证的账号/BYOK等条件，不据此判断整个业务的实际成本。

后续收敛顺序：捕获实际SDK请求契约，明确纯文本/输出限制/无服务端工具与插件；核验输入与缓存计费组成、折扣语义及请求时标准层端点范围；核验账号计费模式；按已确认完整证据计算可用预留。若需收紧供应商或请求策略，应先形成具体兼容性与成本结果，不暗中换模型或降低评分标准。当前missing-tariff继续保留。
