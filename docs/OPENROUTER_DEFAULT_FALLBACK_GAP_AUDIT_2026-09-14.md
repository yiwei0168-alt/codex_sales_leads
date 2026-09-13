# OpenRouter 默认备用路由费用缺口（阶段103）

2026-09-14 对四个代码默认备用模型做无凭据、只读公开目录核查。脚本 `scripts/audit-openrouter-default-fallbacks.ts` 读取已冻结的[阶段90快照](OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json)，再 GET [OpenRouter 模型目录](https://openrouter.ai/api/v1/models)和四个模型的端点接口；不调用推理、搜索或账户接口，不修改路由、费率、预算或测评数据。当前目录响应 SHA256 为 `9dedc4c633874cb7ccfa630dd260d1bda491271e445d4d42c5fe3be0ece9cba2`。端点详情请求 URL、响应哈希及逐端点缺失字段由脚本输出，复核时应重新抓取，不把此观察当成仍然有效的费率。

| 默认备用模型 | 公开端点 / 可接当前8,192输出与参数的端点 | 与阶段90快照 | 可兼容端点的明确缺项 |
|---|---:|---|---|
| `openai/gpt-4o-mini` | 3 / 2 | 模型与端点投影一致 | 两个 Azure 端点均缺 `input_cache_write`；OpenAI 端点不列当前使用的 `max_completion_tokens` |
| `openai/gpt-4o` | 2 / 1 | 投影一致 | Azure 端点缺 `input_cache_read`、`input_cache_write`；OpenAI 端点不列 `max_completion_tokens` |
| `deepseek/deepseek-v4-flash` | 17 / 12 | 模型目录价格、`streamlake/fp8` 和 `baidu/fp8` 端点价格已变 | 12个可兼容端点均缺 `input_cache_write`；其中 `mancer/fp8` 还缺 `input_cache_read` |
| `deepseek/deepseek-v4-pro` | 16 / 9 | `streamlake/fp8` 端点价格已变；现有一组重复 `baseten/fp4` tag | 9个可兼容端点均缺 `input_cache_write` |

“可兼容”只表示公开 `supported_parameters` 包含实际兼容客户端需要的输出字段、温度、JSON schema、结构化输出，以及 DeepSeek 的 `reasoning`，并且端点声明的最大输出不少于8,192；它**不是**实发 SDK 请求验证或费用上界。客户端对这四个默认备用模型仍通过 `require_parameters:true`、`data_collection:deny` 发请求。接口公开参数清单可能变化，也不证明任何端点会被当前账号实际选中。DeepSeek V4 端点价格已经变化，因此不能沿用阶段90快照计算当前上界。

[OpenRouter 缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching)写明 OpenAI 自动缓存写入无额外费用，DeepSeek 自动缓存写入按普通输入价；[模型价格字段文档](https://openrouter.ai/docs/guides/overview/models)说明价格字段以每单位 USD 表示、明确的 `"0"` 表示免费。这里的端点字段缺失并非明确 `"0"`，第三方端点如何适用模型层缓存说明仍需核验。GPT-4o Azure 缺读价、DeepSeek 价格漂移、端点参数和重复 tag 也须纳入唯一的实际请求合同。现阶段不把缺项填零，不依据最低目录价放行，不产生候选预留额度。

当前产品四条默认备用入口继续 `missing-tariff` 拒绝。A11 的新路由与费率变更仍须用户确认；S01 市场计划提案状态不变。下一步是对最终要准入的具体请求捕获传输合同，逐端点核对适用价格及缓存规则、最长输入/输出和费用项，建立整次运行的保守预留，再进行隔离账号真实业务验收。生产冻结的哥伦比亚39槽位/38唯一公司不变。

本阶段效率记录：真实工作流输入、有效输出、下游使用均为0；模型 token、搜索 API-credit、真实费用均为0；仅公共目录 GET 及本地静态分析，失败时不重试付费工作。真实延迟、用户采用和可能节省金额未知。优化机会是先清理动态端点漂移与缺价，再按完整合同比较备用路由，避免因缓存字段空值或中间报价低估预留。
