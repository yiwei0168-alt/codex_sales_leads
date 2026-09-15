# A34 Kimi 知识库回答模型（阶段 248，2026-09-15）

## 确认与范围

在确认 OpenRouter 对 `openai/gpt-5.6-sol` 返回地域不可用后，用户明确要求：“把这一步使用的底层模型换成Kimi”。范围仅为知识库检索完成后的引用回答生成。Qwen embedding、本地混合检索、Gemini 外部网页检索、混合答案综合、线索评分/复核、开发策略和邮箱流程不变。A31/A32 保留为历史事实，不改写为成功验收。

## 实现合同

- 受信任端点：`KIMI_BASE_URL`，仅允许 `api.moonshot.cn` 或 `api.moonshot.ai` HTTPS；模型 `KIMI_RAG_MODEL`，默认 `kimi-k3`。
- 单次非流式 Chat Completions 请求；K3 使用 `max_completion_tokens=4096` 和 `response_format=json_object`，输出结构为 `{answer}`。
- 不经过 OpenRouter，不再尝试 OpenAI 或 Bedrock；无 SDK 自动重试、应用层重试或第二模型。
- 仅发送 A30 已允许的公开/公开来源且经过敏感模式过滤的知识副本。模型必须只按提供来源回答、逐句使用 `[KB:uuid]` 引用、区分事实与推断并明确不足。
- A33 当前用户观察模式在调用前记录未知上界和 USD0 预留标记，调用后保存可得 token、延迟、结果与费用；无现金报告时继续标记未知。

## 验收与效率

34 项聚焦测试、1,078 项全量测试、TypeScript、lint（0 错误、11 个既有警告）、生产构建、生成工作流一致性检查和生产依赖审计（0 漏洞）通过。一次真实付费公开合成调用使用一个问题及一个公开产品事实，HTTP 200，返回 247 字符且包含精确 KB 引用；服务商报告 387 prompt、340 completion（其中 253 reasoning）、727 total tokens，延迟 11,152 ms、0 重试、1 有效输出、1 个验收下游使用。未报告现金/API credits，因此费用未知而非零。该结果验证 Kimi 密钥、地域、请求格式、JSON 和引用链，不代表真实用户问题的语义质量或累计现金审查完成。
