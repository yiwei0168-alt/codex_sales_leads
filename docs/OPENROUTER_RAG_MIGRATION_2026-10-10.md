# RAG Kimi 回答网关迁移

## 实现

MODESEL-05/06 第二批：`generateGroundedAnswer` 使用现有 OpenRouter 配置、网关密钥和 `moonshotai/` 模型 ID；`KIMI_RAG_MODEL` 优先于 `KIMI_MODEL`，默认 K3。缺少网关密钥的诊断改为 OPENROUTER_API_KEY，不使用 Moonshot 直连密钥兜底。调用收据 provider 标记 openrouter。

请求要求参数支持、禁止数据收集并关闭网关自动 fallback，拒绝重定向；保留 4096 输出上限、JSON 回答结构和逐条引用指令。HTTP 失败仅返回状态码，不回显上游错误正文，不自动重试；截断或不完整输出不成为答案。

外发仍由 `prepareRagExternalDisclosure` 限制为明确公开来源，内部资料和私有邮件不得因为网关迁移而外发。未修改检索、原文回读、ACL、向量配置或 RAG 主路开关。

## 验收

- 5 文件 54 项本地测试通过：RAG 网关请求、调用上下文、私有来源阻断、缺少网关密钥/不可信地址阻断、嵌入配置保留、HTTP 失败、无效 JSON 与截断输出；连同披露、RAG 服务和付费收据边界回归。
- TypeScript、聚焦 ESLint 通过；测试均使用模拟传输，没有新增模型费用或私有资料外发。
- 历史 `preflight-holdout-paid-evaluation-local.ts` / `run-holdout-paid-evaluation-local.ts` 固定旧 Moonshot 地址与模型用于旧授权范围校验，原样保留。新配置会被这些脚本拒绝；不得为通过脚本而改写旧冻结条件或重用已消耗授权。新的对照评测需要独立配置版本及授权记录。

## 部署记录

Next.js 生产构建通过；三类任务队列 queued/running 均为空后重载产品、LangGraph 和三个 worker。LangGraph 首次探测时尚未监听，启动完成后再次检查产品 3018 与 LangGraph 2024/ok 均为 HTTP 200，五项错误日志为空。未启用 TUN、未自动重放历史任务，服务健康检查不替代真实模型质量验收。

## 待完成范围

旧意图分类仍含 Kimi 与 DeepSeek 等价备用，需要连同旧任务恢复约定迁移。DeepSeek 专用路径、Google grounding、远程向量入口亦未完成。本阶段不宣称全量网关统一、真实答案质量已验收或 RAG 主路已切换。

回滚回退本提交并在任务空闲时重载；不删除旧资料、向量、任务、冻结配置或调用收据。
