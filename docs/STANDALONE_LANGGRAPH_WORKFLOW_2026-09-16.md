# 独立 LangGraph 编排服务

## KQ01 知识优化待实施交接（2026-09-17）

当前注册图仍为下文的三个，助手仍通过轻量意图后调用既有RAG；本节没有宣称任何新节点已经上线。用户要求以通用知识问题为范围审查并给后续Sol/Terra代码实施者交接，详见[通用知识优化计划](KNOWLEDGE_RETRIEVAL_OPTIMIZATION_PLAN_2026-09-17.md)。

P0现已增加只读语料审计与默认离线的200条评测基线，但未改变任何LangGraph节点或注册图。当前图拓扑仍以LG04验收结果为准；知识子图从P5开始实施。[P0证据](KNOWLEDGE_RETRIEVAL_P0_BASELINE_2026-09-17.md)。

计划 P5 将资料定位、实体/版本解析、已验证事实查询、混合检索、证据校验、引用和按需生成拆为可展开知识子图，挂载于 `assistant_workflow`；建议新增 `knowledge_workflow` 根图供现有直接知识问答API调用同一实现。线索图只复用检索证据层，不增加用户意图/回答生成调用。默认保留C14的一次轻量意图识别，明确文件/事实在其后本地完成；全本地优先意图属于未确认可选项。既有图ID、租户边界、费用观察、错误恢复及LG05 trace正文隐藏保持，新增图/DTO仅在相应阶段实现并通过兼容验收后记录为已完成。

## 已确认边界

`LG01` 将 LangGraph 作为独立本地 Agent Server 运行，默认监听 `127.0.0.1:2024`；现有 Next.js 产品继续监听 `127.0.0.1:3000`。本阶段不把独立服务暴露到局域网或公网，不新增云部署，也不改变 API、DTO、数据库、权限、预算门禁、供应商合同或工作流业务语义。

`LG02` 将产品执行边界迁移到独立服务：助手消息与已认领线索任务通过官方 SDK 调用 `assistant_workflow` / `lead_workflow`，产品进程不再直接运行这两个生产 runner。SDK 禁止自动重试编排 POST；独立服务不可用、超时或响应缺少结果时明确失败，不回退到产品进程。图实现、单元测试和离线验证仍可直接构建内部图，不属于生产入口。

`LG04` 将最初的单节点适配器深化为组合业务图。独立服务的根图承担输入合同和结果合同，真实生产业务图作为可展开 subgraph 注册；Studio 请求 `xray=true` 时必须返回全部现有助手与线索业务节点和条件边。兼容 runner 仅保留给既有测试／工具，服务注册入口直接绑定业务图执行函数和对应 subgraph 拓扑。

独立服务导出三个图：

- `runtime_health`：零模型、零搜索、零邮件、零数据库写入的运行时健康图。
- `assistant_workflow`：输入校验 → `assistant_business_flow` → 结果合同。业务子图公开意图规划、五类确定性响应、内部知识检索、并行内部／外部混合检索与证据综合。
- `lead_workflow`：输入校验 → `lead_business_flow` → 结果合同。业务子图公开知识、计划、发现、证据、校正、角色路由、评分、恢复、复核、交接和持久化的完整条件图。

组合图不复制业务节点；Studio 拓扑和实际执行复用同一图构建器。线索的可视拓扑实例不带 checkpointer，只用于 subgraph 发现；运行实例由相同构建器绑定 PostgreSQL `langgraph` schema checkpointer，避免 Agent Server 用开发期内存 checkpointer 覆盖业务恢复语义。独立 API 的调用方仍必须提供产品已有的用户、动作和图线程 UUID；不存在或不匹配的身份由原业务与数据库边界拒绝。开发服务只允许产品的两个本地 Origin 和精确的 Studio Origin 进行浏览器 CORS 访问；这不是生产身份认证，因此不得把当前开发命令改成 `0.0.0.0` 或直接公网部署。

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

Studio 使用 `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024` 从浏览器直连本机 Agent Server。服务的 CORS 白名单仅在原产品来源之外新增 `https://smith.langchain.com`，监听地址仍为 `127.0.0.1`；允许请求头由精确获准的来源预检动态反射，并公开 Studio 分页所需的两个响应头。当前官方 JavaScript Studio 流程要求在 Git 忽略的 `.env.local` 提供 `LANGSMITH_API_KEY`；用户已完成本地写入，密钥值从未进入输出或版本库。LG04 更新服务后，在 Studio 重新连接或刷新图，选择 `assistant_workflow`／`lead_workflow` 并展开 `assistant_business_flow`／`lead_business_flow` 即可查看完整节点；本地 API 的 `graph?xray=true` 是相同拓扑的自动化验收入口。Studio 是代码定义图的可视化、调试和运行界面，不是任意拖拽后自动改写仓库代码的低代码编辑器。

### LG05 脱敏云 trace

用户已明确允许 LangGraph trace。本地运行配置启用 `LANGSMITH_TRACING=true`，并把轨迹归入 `network-channel-copilot-local`；同时按官方敏感数据保护配置设置 `LANGSMITH_HIDE_INPUTS=true` 和 `LANGSMITH_HIDE_OUTPUTS=true`。因此 LangSmith 可接收节点层级、父子关系、分支、耗时、状态和错误等调试信号，但不接收工作流输入／输出正文。预加载器在环境变量完全缺失时仍保持 fail-safe 的 tracing 关闭默认值；只有显式配置的环境才上传。开启 trace 不改变模型、搜索、邮件或业务工作流执行，也不授权把 Agent Server 暴露到非回环网络。

首次沙箱内批量上传因 LangSmith 443 网络权限被阻止，目标项目未建立；该结果被保留为失败证据。用户随后在明确理解“即使隐藏输入／输出，节点名、时间、状态和错误等元数据仍会外发”后授权网络访问。服务仍只监听 `127.0.0.1:2024`，在获准环境重启并只执行一次零模型／零搜索健康图。LangSmith 项目回查得到 `LangGraph`、`__start__`、`report_ready` 三个 span，全部 inputs／outputs 为空对象，已知健康探针正文也未出现在 metadata；因此云上传和当前脱敏边界验收通过。

### LG04 完整图验收补充

本地 Agent Server 的 `xray=true` 返回 `assistant_workflow` 15 个节点／23 条边、`lead_workflow` 17 个节点／23 条边；定向测试检查了每个产品编排节点名称和 subgraph 注册。零外部业务调用路由探测完成 3 个请求（1 个健康结果、2 个预期 schema 拒绝），耗时 1,801.72 ms。全量 216 个测试文件／1,090 项测试、TypeScript、生产构建、lint（0 错误、11 条既有 warning）及浏览器 22 项通过，2 项按设计跳过。模型、搜索、SMTP、真实业务写入、token、API credits 和现金费用均为 0；用户在 Studio 刷新后对完整图的采用仍未知。
