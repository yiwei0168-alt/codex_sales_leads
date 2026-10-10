# 旧意图分类网关迁移

## MODESEL-05/06 第三批

旧 `planAssistantRequest` 的 Kimi 轻量/复杂规划和 DeepSeek 等价备用改用统一 OpenRouter 配置、凭据与隐私参数，关闭网关自动 fallback，拒绝重定向。不再引用原生 DeepSeekProvider；其他业务使用的该 provider 本轮未迁移。

默认 Kimi ID 为 moonshotai/kimi-k2.6 与 moonshotai/kimi-k3，备用 deepseek/deepseek-v4-flash；保留原环境模型选择并补全前缀。DeepSeek 模型 ID 对照 [OpenRouter 官方目录](https://openrouter.ai/deepseek/deepseek-v4-flash)，备用关闭 reasoning，未声称已完成真实兼容性调用。

备用使用相同的完整意图 Prompt，补齐原备用简化提示未包含的预算提案、已有公司/跟进操作、来源提示和限制。Prompt 版本为 assistant-intent-plan-v1.5-gateway。Kimi 保留 4000 输出上限；备用保留 DEEPSEEK_MAX_OUTPUT_TOKENS 的 1024～16384 范围及默认 8192。旧轻量判断后必要时复杂规划的行为仅限旧流程；新版手动模式配置未修改。

原旧流程最多三次 Kimi 瞬态尝试、一次无效结构重试、最多两次备用尝试仍有界。401/403 不切换模型，配置错误不外发；HTTP 错误正文不回显。主选和备用成功/失败均记录请求模型、返回模型、usage、重试与 openrouter 归属。截断 JSON 不采纳。付费准入错误直接抛出，不通过备用绕过。

## 验收

74 项本地测试覆盖预算与多轮约束、特殊角色排除、已有公司动作、旧图/新图回归、调用指标、付费请求边界、双路径失败、鉴权不备用、不可信网关与截断输出。类型检查及聚焦 ESLint 通过。没有新增付费模型调用；现有历史任务、检查点和收据不改写、不自动重放。

## 部署

生产构建通过；重载前主 Agent、邮箱、线索队列 queued/running 均为空。重载产品、LangGraph 和三个 worker 后，3018 与 2024/ok 均返回 200，五项错误日志为空。未启用 TUN，没有模型实测或历史任务重放。

## 后续迁移

DeepSeek 研究/评分等其他入口、Google grounding 和远程向量入口仍待迁移。此次模拟验收不代替真实模型质量验收，不代表全计划完成。回滚回退本提交并安全重载，保留任务数据和历史收据。
