# OpenRouter 剩余路由费用证据与校正输出上限（阶段90）

只读抓取[官方模型目录](https://openrouter.ai/api/v1/models)与每个模型的[官方端点接口](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints)，保存[六模型端点快照](OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json)和响应 SHA256。覆盖当前代码默认的复核 Terra/Sol、备用 OpenAI GPT-4o/mini 与 DeepSeek V4 Flash/Pro，共 52 条端点记录。快照不含账号、密钥、请求内容或客户数据；0推理、0付费。

代码核查发现 `lead-evidence-correction` 经 OpenAI 兼容备用路由时没有输出 token 上限。现为该任务设定默认 8,192 总输出 token 上限；OpenAI 模型使用 `max_completion_tokens`，非 OpenAI 模型使用 `max_tokens`，两者均由实际传输契约测试覆盖。截断或没有明确 `stop` 的响应保留未完成状态，不作为有效校正，也不因解析失败自动重放未知费用。环境覆盖值依然必须通过费率请求上界核验；本次没有新增费率放行。

当前静态费率只核准一类 Sol 标准 JSON 请求，最高 4,096 输出 token。Terra、GPT-4o/mini、DeepSeek 网关备用路由仍是 `missing-tariff`；Sol 复核/裁决所需的 12,000 token 不符合现有 4,096 上界，仍为 `request-out-of-bounds`。确定性测试直接核对这些拒绝状态。公开目录低价不是全部端点的上界，缓存/长上下文、推理输出、供应商路由、请求字段及可能的自动服务端费用都需要对应完整契约和有效期；不能凭此次抓价开启付费调用。S01仅市场计划的路由变更仍待用户确认，本阶段没有实施。

验证：定向 19 项、全量 891 项测试/195 文件、类型检查、生产构建和局部 lint 通过；`npm audit --omit=dev --audit-level=high` 为 0 个漏洞。官方公开端点 52 条的身份与哈希已核对。页面回归沿用阶段89两视口56组，本阶段未改页面或实际业务任务。本阶段没有新增业务输入或有效输出，`token/API-credit/cost=0`；用户采用、实际备用路由节省及真实延迟未知。优化机会是先为各实际请求建立唯一模型/输出/路由合同与足额预留，再比较可用的低成本路径；不通过提高额度或静默改路由绕过门禁。
