# 独立 LangGraph 编排服务

## 已确认边界

`LG01` 将 LangGraph 作为独立本地 Agent Server 运行，默认监听 `127.0.0.1:2024`；现有 Next.js 产品继续监听 `127.0.0.1:3000`。本阶段不把独立服务暴露到局域网或公网，不新增云部署，也不改变 API、DTO、数据库、权限、预算门禁、供应商合同或工作流业务语义。

独立服务导出三个图：

- `runtime_health`：零模型、零搜索、零邮件、零数据库写入的运行时健康图。
- `assistant_workflow`：校验输入后委托现有 `runAssistantWorkflow`，保留原成本上下文和回答合同。
- `lead_workflow`：校验输入后委托现有 `runLeadWorkflow`，保留租户作用域、动作身份、预算门禁、恢复规则及 PostgreSQL `langgraph` schema checkpoint。

适配图不复制业务节点。独立 API 的调用方仍必须提供产品已有的用户、动作和图线程 UUID；不存在或不匹配的身份由原业务与数据库边界拒绝。开发服务只允许产品的两个本地 Origin 进行浏览器 CORS 访问；这不是生产身份认证，因此不得把当前开发命令改成 `0.0.0.0` 或直接公网部署。

## 本地运行

根目录 `.env.local` 继续承载本地环境变量且被 Git 忽略。启动 PostgreSQL 后运行：

```powershell
npm run langgraph:dev
```

服务默认地址为 `http://127.0.0.1:2024`。Next.js 产品仍由 `npm run dev` 或 `npm start` 单独运行。启动器使用官方 `@langchain/langgraph-api` 运行包和标准 `langgraph.json` 图定义；没有保留带已知 `extract-zip` 高危审计链的 CLI 开发依赖。兼容预加载脚本仅在受限 Windows shell 无法读取本机用户名时提供稳定临时目录后缀，不读取或输出凭据。

## 验收与未完成项

本阶段验收已通过：配置检查加载 `runtime_health`、`assistant_workflow`、`lead_workflow` 三个导出；独立服务在 `127.0.0.1:2024` 启动；`POST /runs/wait` 调用健康图返回 `ready`，测得本机端到端延迟 875.40 ms；适配器 4 项定向测试通过。全量回归 214 文件、1,081 项测试通过，TypeScript、生产构建和 lint（0 错误、11 项既有 warning）通过；生产与全依赖 `npm audit` 均为 0 漏洞。整个验收未触发模型、搜索、SMTP 或真实业务工作流。

Next.js 改为通过独立 HTTP 服务调用、服务间认证、生产部署、队列扩缩容和故障切换均不在本阶段范围，需另行设计和确认。
