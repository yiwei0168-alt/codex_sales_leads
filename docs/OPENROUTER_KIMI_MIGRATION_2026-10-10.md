# Kimi 邮件与外联统一网关

## 范围与行为

落实 MODESEL-05/06：邮件学习、开发策略、开发邮件和跟进生成通过 OpenRouter chat/completions，使用 OPENROUTER_API_KEY。KIMI_MODEL / KIMI_OUTREACH_MODEL 保留模型选择，补全 moonshotai/ 前缀；这两条路径不再使用 KIMI_API_KEY / KIMI_BASE_URL，不回退 Moonshot 直连。

要求参数支持、data_collection=deny、关闭网关自动 fallback，拒绝 HTTP 重定向。参数含义参考 [OpenRouter 官方路由文档](https://openrouter.ai/docs/guides/routing/provider-selection)；data_collection=deny 不等于零留存保证。邮箱授权提示明确经由网关发送，脱敏、逐封授权和审计继续生效。批量授权 API 仍可接受超过五封，内部模型批次上限与用户选择数量无关。

K3 带网关前缀时继续使用 max_completion_tokens，保留 8000 邮件学习、12000 默认策略、1800 跟进上限。学习请求增加 180 秒超时；外联保留既有超时、最多两次瞬态请求尝试及内容校验/模板降级，不套用主 Agent 的三模型备用。失败 HTTP 仅报告状态码，避免回显上游携带的邮件文本；429/5xx 按状态判定瞬态失败。调用上下文 provider 改为 openrouter，原付费收据和准入检查继续执行。

## 验证

- Vitest：6 文件 52 项通过，涵盖邮件解析、外联引用与策略交接、K3 参数、网关就绪、错误净化、付费请求边界和批量授权 API。
- 仅网关密钥即可将八封已授权邮件入队；未授权返回 400，不可信网关返回 503；缺少网关密钥时旧密钥不触发调用。
- TypeScript、聚焦 ESLint、Next.js 生产构建通过。
- 全部模型响应为模拟，无新增付费调用或真实邮件外发。此前 16 次合成调用授权已用完，本次不重用该授权。

## 本机部署

2026-10-10 重载前只读确认 agent_run、mailbox_work_job、lead_workflow_job 的 queued/running 数量均为零。重载 Next、LangGraph 及主 Agent/邮箱/线索 worker；产品 `127.0.0.1:3018` 与 LangGraph `127.0.0.1:2024/ok` 均返回 HTTP 200，五个服务错误日志均为空。没有启用 TUN，没有自动恢复历史失败任务。这是服务可用性检查，不是业务模型实测。

## 后续迁移

RAG Kimi 回答、旧意图分类、DeepSeek 专用路径、Google grounding 与远程向量入口需分别迁移及核验能力兼容。BGE/Qwen 本地处理不迁云。本阶段不声称真实业务 JSON 输出已通过网关实测，不切换 RAG 主路，不代表长期记忆/RAG 全计划完成。

回滚通过回退本阶段代码并安全重载服务，保留历史任务、授权和调用收据；不删除记录或自动重放不确定调用。
