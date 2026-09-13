# Gemini 发现请求输出边界（阶段92）

官方 [Interactions API](https://ai.google.dev/api/interactions-api-v1) 支持 `generation_config.max_output_tokens`；[Google 思考文档](https://ai.google.dev/gemini-api/docs/thought-signatures)说明该硬上限包含思考 token，命中时结果可标记 `incomplete`，已消耗 token 仍可能计费。现有 Gemini Full/Product 发现请求统一显式设置 12,000，与产品外部搜索的既有上限一致。同步响应若明确报告非 `completed` 状态，不再从部分 `steps` 提取公司；任务保留技术未完成与既有费用，由恢复和替代搜索路径处理。没有增加模型调用、查询或自动重放。

这只补齐**生成输出**边界。Google Search 工具在一次 Interactions 请求内可能执行的查询次数仍缺可核验的服务端硬上限，因此 Gemini 费用合同仍不完整，产品费用门禁仍阻止此入口。12,000 token 不代表搜索费用已封顶，也不保证模型不截断。无获准费率、路由或搜索策略变化。

验证：两个发现模式的实际发送 JSON、明确 `incomplete` 且带部分网址的结果拒绝、无自动重试；892 测试/195 文件、类型检查、改动文件 lint、生产构建通过。合成传输 0 真实供应商调用、0 token/API-credit/现金，用户采用和真实节省未知。此项优化机会是避免将已付费截断响应计为有效发现；真实延迟与服务端查询数量仍待观测。整体验收未完成。
