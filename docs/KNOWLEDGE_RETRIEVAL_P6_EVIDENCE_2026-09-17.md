# KQ01 P6 — 混合检索与证据窗口验收

日期：2026-09-17。状态：实现完成并通过离线/SQL 合同回归；未发起真实供应商调用。

## 变更

- ACL、collection、market、company、product 和 authority 继续在 `eligible` 集合先行过滤；去掉全局 `embedding is not null`，仅向量 CTE 要求有效 query/chunk vector，因此 keyword-only、structured-only 和 null-vector 片段可进入候选。
- 关键词或结构化精确通道分别获得 0.42/0.50 的排序下限，可越过默认 0.35 检索阈值；新增 `rankingScore` 明确其为排序分而非事实置信度。
- 属性注册表生成受控中英别名 OR 查询，并保留通用型号 token 的 AND 约束；无属性命中时保留原查询。没有型号特判或 LLM 改写循环。
- 命中短块补同文档、同标题路径的相邻块，最大 6,000 字符；线索与 outreach 使用问题相关窗口，命中尾部时不再固定截取前 1,800/1,200 字符。
- 本地资料/事实路径已在 P5 跳过 query embedding；复杂解释、线索和 outreach 原有语义路径仍按原边界使用一次 embedding。外发前的公开来源与脱敏过滤保持不变。

## 验证与效率

- RAG、知识、线索上下文与 outreach 针对性回归：21 文件、70 项通过，3.17 秒。
- TypeScript 检查通过；200 条冻结语料离线评测仍为 200/200 顶层知识路由，四类事实反例均未复发，短标题由 v2 修复。
- SQL 合同测试确认 owner/shared ACL 在 eligible 内、null-vector 参数不排除全文/结构化通道、非向量排序下限和相邻窗口存在。
- 输入 270 项离线断言/评测（70 测试 + 200 语料），有效及下游门禁使用 270；真实业务输出、用户采用未知。模型、embedding、search、SMTP、provider token/API credit、现金和付费重试均为 0。

未以离线 SQL 合同声称生产 Recall@8 或 P95 已达标；这些在 P8 的隔离真实数据库/端到端验收中单列。
