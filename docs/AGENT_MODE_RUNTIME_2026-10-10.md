# 三模式运行接入（2026-10-10）

## 后续部署与真实网关合成验收

2026-10-10 09:27（北京时间）：此前 Docker、数据库、产品和 LangGraph 均未运行。启动原 Docker Desktop/数据卷及 PostgreSQL（healthy），部署现有 `1342380` 生产构建到 `127.0.0.1:3018`，LangGraph 在 `127.0.0.1:2024/ok` 返回 200；已有 Neo4j/Ollama 随 Docker 恢复。未启用或修改 TUN。

正常消费 worker 启动前，真实 Chrome 登录隔离账号，验证三次任务入队的配置为 standard/deep/quick，配置含模型顺序、Prompt 版本和超时；切换界面选择不会改写已保存任务。知识范围保留，付费调用为零，临时账号与三项队列任务清理。随后只读确认 queued/running 均为零，启动主 Agent、邮箱及线索 worker；历史 partial 任务未重放。LangGraph 实际 HTTP 路由四请求验证通过，不含付费模型调用。

MODESEL-14 授权的真实网关合成测试：8 模型 × 2 轮 = 16 次，全部 HTTP 200 并通过 `describe_tool(knowledge_search)` → 模拟只读结果 → `FIXTURE_OK`。每次最多 1024 输出 token，无重试、无真实工具、无私有资料。使用生产 `requestModeModel` 流解析/超时/身份校验，验收传输适配器仅降低 token 上限；使用合成提示，不宣称是完整业务任务验收。Luna none、Haiku/Flash/Sonnet/Kimi low、Sol/Opus/GLM high；Sol 标准 low 槽位未重复测试。

本次实际提供方：OpenAI（Luna/Sol）、Claude Platform on AWS（Haiku/Sonnet/Opus）、Google（Flash）、Wafer（Kimi/GLM）。这是本次路由观察，不固定后续提供方。原始 generation ID/usage 收据见 [记录](evidence/mode-multiturn-2026-10-10.json)，未生成成本账本或费用分析。授权已消耗，脚本检测既有记录并拒绝重放。新增脚本 ESLint、类型检查通过。

以下为部署前实现记录；其中“尚未重载/未新增模型调用”仅描述首轮代码验证阶段。本阶段已部署且完成合成多轮测试，真实邮箱/公司任务、跨模型思考记录互换、供应商真实故障下的备用仍未覆盖。

## 已实现

- 对话输入区选择快速问答、标准工作（默认）、深入研究。创建任务时将模式、Prompt 版本、三路模型、思考参数和等待阈值固定在 `agent_run.model_config.profile`；恢复沿用原配置，界面选择只影响新任务。旧任务的历史路由不变。知识问答入口使用快速模式，并继续限制所选知识范围。
- `agent-modes-v1` 使用此前八个候选的九个槽位：快速 Luna / Haiku / Flash；标准 Sonnet / Sol / Kimi；深入 Sol / Opus / GLM。精确 ID 见 `mode-config.ts`。深入 high，快速 Luna none，其余 low；这些思考参数的真实多轮兼容性尚未验收。
- 所有新主 Agent 尝试通过 OpenRouter，关闭网关自动 fallback、要求参数支持与禁止数据收集；记录实际 provider、generation ID、usage 及安全失败码。不新增供应商直连。
- 首有效输出/总时限分别为 15/60、30/120、60/300 秒。部署可用 `AGENT_MODE_TIMEOUTS_JSON` 覆盖，例如 `{"quick":[15000,60000]}`，校验后写入任务快照。心跳和仅 role 不算有效输出；正文、思考、工具片段算。总时限不重置。
- 完整接收 SSE、合法结束标记与工具参数后才交给图执行。截断、服务端流中错误、身份不符或不完整工具输出不执行工具；迟到结果不能成为图输出。
- 同一轮主选→备用 1→备用 2，每路最多一次；429、500/502/503/504、明确连接失败及本地超时可备用。401/权限/格式错误不绕过。失败收据先保存再备用；收据保存失败或恢复遇到未知已开始调用时停止。账务未知仍记录未知，不声称上游取消或免费。
- 快速显式只读工具列表；工具发现、描述、执行及嵌套执行都检查模式。标准排除研究/评分与脚本/任意调度入口，深入仍受原账号、角色、批准和工具限制。
- MODESEL-13：标准模式暂不新增搜索次数、问题数量上限。保留既有工具 Schema 和任务运行保护；用途约束继续写入 Prompt。不能保证从自由文本机械识别所有变相批量调查。

## 验证

- TypeScript 类型检查、聚焦 ESLint、Prompt 生成器一致性检查及 Next.js 生产构建均通过。
- 模式、Prompt、知识范围、图恢复、既有同步模型、付费收据及 API 入口测试：8 文件、106 项通过。`vitest run` 文件为 `mode-runtime.test.ts`、`mode-prompts.test.ts`、`knowledge-scope.test.ts`、`graph.test.ts`、`model-sync.test.ts`、`contracts.test.ts`（均在 main 目录）、`billing/paid-fetch.test.ts` 及 `app/api/assistant/messages/route.test.ts`。
- Playwright `assistant-flow.spec.ts`：桌面 1366×900 与手机 390×844 共 4 项，通过默认/切换/请求参数、已有任务保留、无横向溢出检查；本地截图人工查看。
- 全部为本地模拟响应，未产生新增付费模型调用、真实发信或业务写入。环境仅核对网关/代理已配置及既有 MA05 状态，未输出或提交凭据。

## 后续验收与范围

真实多轮工具回传、高思考流、上游故障和完整业务任务还需小范围运行验收；此前八模型连通性不能替代这些测试。所有专用模型迁往 OpenRouter、按模式进一步压缩记忆上下文属于后续工作，本阶段仍保留已授权账号政策上下文。没有完成长期记忆/RAG 全计划，也没有切换 RAG 主路。

回滚：回退本阶段代码提交；保留所有任务与调用收据。恢复任务必须保留原模式配置和调用记录，不用删除记录强制重试。运行中的旧 worker 需要在任务安全边界完成部署后才能执行新版本，代码验证不等于服务已重载。
