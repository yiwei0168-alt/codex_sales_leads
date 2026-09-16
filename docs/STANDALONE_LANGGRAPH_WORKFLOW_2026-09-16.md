# 独立 LangGraph 编排服务

## 已确认边界

`LG01` 将 LangGraph 作为独立本地 Agent Server 运行，默认监听 `127.0.0.1:2024`；现有 Next.js 产品继续监听 `127.0.0.1:3000`。本阶段不把独立服务暴露到局域网或公网，不新增云部署，也不改变 API、DTO、数据库、权限、预算门禁、供应商合同或工作流业务语义。

`LG02` 将产品执行边界迁移到独立服务：助手消息与已认领线索任务通过官方 SDK 调用 `assistant_workflow` / `lead_workflow`，产品进程不再直接运行这两个生产 runner。SDK 禁止自动重试编排 POST；独立服务不可用、超时或响应缺少结果时明确失败，不回退到产品进程。图实现、单元测试和离线验证仍可直接构建内部图，不属于生产入口。

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

服务间认证、非本机生产部署、队列扩缩容和故障切换仍不在本阶段范围，需另行设计和确认。

### LG02 产品路由验收补充

产品助手入口与已认领线索任务入口已经只调用官方 LangGraph SDK，不再直接导入两个内部 runner，也没有服务失败时的进程内回退。基于已整合 A33/A34 的最新基线，最终零成本路由探测以 3 个 HTTP 请求获得 1 个有效健康结果和 2 个预期输入拒绝，耗时 2,081.40 ms；隔离式生产构建验收在桌面与移动端完成 68/68 项检查，其中两次暂停任务均真实经过独立服务并保留原 `cancelled`、checkpoint 与费用状态。全量 216 个测试文件、1,089 项测试、TypeScript、lint、生产构建、22 项浏览器测试和依赖审计通过；2 项浏览器用例按设计在桌面项目跳过。验证期间模型、搜索、SMTP、付费调用与真实邮件均为 0，临时合成数据已清理，实际用户采用仍未知。

### LG03 Studio 本地连接

Studio 使用 `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024` 从浏览器直连本机 Agent Server。服务的 CORS 白名单仅在原产品来源之外新增 `https://smith.langchain.com`，监听地址仍为 `127.0.0.1`。启动预加载层在没有显式配置时将 `LANGSMITH_TRACING` 设为 `false`，因此查看本地图不会自动开启云 trace；LangSmith 登录、组织权限和浏览器策略仍由官方 Studio 管理。
