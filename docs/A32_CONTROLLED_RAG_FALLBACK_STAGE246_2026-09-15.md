# A32 RAG 单次受控备用合同（阶段 246，2026-09-15）

## 用户确认与范围

在看到“OpenAI 主线路 + 同一 Sol 模型的 Amazon Bedrock 单次应用层备用、输出降至 4,096、保留公开来源与脱敏边界、分别记账且保存脱敏状态”的完整建议后，用户明确回复“同意”。本规则登记为 A32，范围仅为 AI 销售助理 `rag-grounded-answer`；不改变 embedding、混合网页检索、市场计划、评分复核、邮件或其他模型合同。A31 的原始 OpenAI-only 8,192 输出合同及失败事实保留为历史，不改写成已经成功的供应商验收。

## 精确合同与失败边界

现行 `request-bounds-v1.13.0` 使用两个互斥合同：

- 主线路 `openrouter-sol-rag-answer-primary-credits` / `openrouter-sol-rag-answer-primary-v2`：`openai/gpt-5.6-sol`，`provider.only=["openai"]`，单次 USD0.778240；
- 备用线路 `openrouter-sol-rag-answer-bedrock-fallback-credits` / `openrouter-sol-rag-answer-bedrock-v1`：同一模型，固定 `provider.only=["amazon-bedrock/us-east-1"]`，单次 USD0.378471；
- 两者均为最多 61,440 请求 bytes、65,536 计费输入 token 保守边界、4,096 `max_tokens`、两条纯文本消息、非流式自由文本；`require_parameters=true`、`data_collection=deny`、`allow_fallbacks=false`，无工具、插件、推理控制、特殊服务层、显式缓存或响应 Schema；
- 一次主线路加一次备用线路的合计最坏预留为 USD1.156711。每条线路独立预留、核销及防重放；SDK 重试为 0，备用失败后没有第三次调用。

只有安全路由元数据证明请求已经到达上游，且主线路返回 401、403、429 或 5xx，才允许备用线路。没有上游尝试证据的网关认证/额度/allowlist 拒绝，以及 400、402、408、413、422 等请求或账户错误，不启动备用。Azure 当前只列 `max_completion_tokens`，不进入这份 `max_tokens` 合同。

A30 继续完整适用：只外发明确公开来源且已做敏感模式过滤的知识副本；内部培训、邮箱、内部维护和无公开来源标记内容保持本地。

## 可观测性与验收

RAG 请求启用 `X-OpenRouter-Metadata: enabled`。账本只允许保存 HTTP 状态、数字/安全标识错误码、路由尝试序号、受限供应商标识及请求 ID 的 SHA-256；提示词、知识正文、错误消息、原始请求 ID 和密钥均不保存。

- 公开端点审计确认健康 OpenAI 标准端点和 `amazon-bedrock/us-east-1` 均支持 `max_tokens`；当前上界分别为 USD0.778240 与 USD0.378471，公开审计没有加载密钥或执行推理。
- 生产 SDK 无网络传输测试验证：有上游证据的 403 只触发一次 Bedrock；无上游证据的 401 与有上游证据的 400 都不回退；两次请求均固定单一供应商、4,096 输出且无隐藏重试。
- 真实 PostgreSQL 合成验证写入并清理两条独立预留，合计 USD1.156711；非法线形在传输前拒绝，两条相同请求各自被防重放阻止。合成 transport 2 次，真实供应商调用 0。
- 64 项聚焦断言、全量 1,077 项／213 文件、TypeScript、lint（0 error，11 个既有 warning）、生成工作流一致性、生产构建及生产依赖审计（0 漏洞）通过。

真实 Sol 回答语义、OpenAI→Bedrock 实际回退和完整账单尚未验收，不能把本阶段称为真实供应商闭环完成。A31 已发生且费用未知的 USD0.901120 继续保留，不能因新合同生效自动释放。

## 效率记录

本阶段输入为一次用户确认、一次公开端点快照、两类生产 SDK 合成失败场景和一次真实 PostgreSQL 双合同合成运行；有效验证输出全部用于合同与失败门禁验收。真实用户回答、下游采用、模型 token、付费 API credits 和现金均为 0/未知，外部推理为 0。合成主/备用输出各一份，失败反例按规则丢弃；公开审计约 3.7 秒，SQL 验证约 2.0 秒。优化机会是先用脱敏路由元数据定位失败层，再进行最多一次有界备用，持续测量实际 RAG 输出长度以判断能否进一步降低 4,096 上限。
