# Network Channel Copilot

面向 Networking 品牌海外销售团队的全球 B2B 渠道开发工作台。首页以持久化自然语言对话为入口：

- 产品、公司和已审核邮箱知识通过私有 RAG 回答并附引用；
- 用户可指定任意国家、渠道角色、数量以及新市场/增长目标；
- 系统先用 LangGraph 调用产品、公司、行业 RAG 并生成搜索计划，只有用户明确确认后才调用 Tavily；
- 产品知识由向量、全文和结构化事实三路融合，低置信或冲突规格不会被当成确定事实；
- 真实搜索结果经官网取证、域名去重和独立评分 Agent 复核后，仅保存匹配分达到 50 的公司。

早期墨西哥验证数据和脚本保留为回归资料，但不再限制产品运行市场。搜索候选在完成网页证据复核前统一标记为 `Inferred`。

## 启动

需要 Node.js 22 或更高版本（LangChain OpenAI 适配器要求 Node 22+）。当前验证环境为 Node.js 24。

```powershell
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。生产模式：

```powershell
npm run build
npm start
```

## 验证

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## 产品操作路径

1. 在首页直接询问产品、公司、认证或已审核邮箱知识。
2. 用自然语言描述目标国家和线索，例如“搜索阿联酋 20 家分销商和系统集成商”。
3. 检查系统生成的国家、角色、目标数量和开发模式，明确确认后才执行搜索；角色覆盖 Distributor、VAD、VAR、Dealer、Reseller、Retailer、E-tailer、SI、Installer、MSP 和 ISP，不设固定角色配额。
4. 在“销售线索”中按国家分区查看已保存候选，并按角色、Account Tier 或关键字筛选。
5. 打开公司详情查看 Evidence，修改 Account Tier、Supply Model、参与深度或机会状态。
6. 在关系图、机会工作区和开发助手中继续推进；系统不会真实发送外联。

## 项目结构

```text
src/app/                 Next.js App Router 入口与视觉系统
src/components/          Demo 工作台与交互组件
src/data/                历史市场快照、关系和 AI Eval 样例
src/lib/                 领域类型、分类禁则与确定性计划规则
src/providers/           搜索、AI、存储 Provider 契约
docs/                    架构、数据、Schema 与 PRD 验收说明
```

## 环境变量

复制 `.env.example` 为 `.env.local`，配置 RDS、Tavily、Embedding 和生成模型。运行时 `DATABASE_URL` 必须使用受限账号；`DATABASE_MIGRATION_URL` 单独使用 owner/migrator 账号。任何密钥不得提交。

生成单用户密码哈希（PowerShell）：

```powershell
$env:APP_PASSWORD_SETUP='use-a-long-unique-password'
npm run auth:hash-password
Remove-Item Env:APP_PASSWORD_SETUP
```

把输出写入 `.env.local` 的 `APP_PASSWORD_HASH`。开发环境未配置时允许本地绕过；生产环境不会允许绕过。

## Tavily 实时线索发现

日常使用从首页对话生成并确认搜索计划。以下命令是保留的墨西哥批处理/联系人回归流程，不会由页面自动执行：

```powershell
npm run db:migrate
npm run leads:discover -- --target=100 --replace --user-email=your-login@company.com
npm run leads:verify -- --user-email=your-login@company.com
npm run contacts:enrich -- --limit=100 --concurrency=4 --replace --user-email=your-login@company.com
npm run contacts:verify -- --user-email=your-login@company.com
npm run contacts:classify -- --company-limit=100 --candidate-limit=1000 --user-email=your-login@company.com
npm run contacts:classify:report
npm run contacts:classify:eval
```

The contact pilot enriches ten live-search companies from public webpages only. Publicly displayed emails are stored
as `Public`; deterministic guesses require both a public named contact and a public same-domain personalized email
pattern, and are always stored as `Pattern-guessed`. Nothing in this workflow sends email.

Contact enrichment uses four bounded workers by default. Each company is committed independently, failures are
collected for targeted retry, and run-level credit counters use atomic increments.

Contact classification now runs in `automatic` mode by default: DeepSeek assesses retained evidence, deterministic
rules own the three-category decision, and the current decision is published with a complete audit trail. Only
`Official` and `HighConfidence` become verified; `NeedsReview` and deterministic invalidation enter the review queue.
Each candidate receives at most one routine call and one conflict-escalation call. Outbound delivery verification
remains disabled. Use `npm run contacts:classify:shadow` for a no-publication evaluation run.

`--replace` 只替换当前工作区中的上一批 Tavily 活动候选；历史查询、原始结果和质量筛选记录保留用于审计。
`--user-email` 明确指定结果所属的登录用户，避免把线索写入初始化或已停用账号的工作区；只有一个启用账号时可省略。

## 建立 RAG 知识库

RAG 使用 PostgreSQL + pgvector、Qwen `text-embedding-v4` 和兼容 Responses API 的生成模型。Embedding 与生成服务使用独立的 API Key 和 Base URL。三个知识库初始为空，内容完全由用户上传：

- 行业知识库：行业知识、渠道结构、主要品牌、市场研究；
- 公司知识库：Cudy Technology 公司简介、产品线、当前业务、战略与经营资料；
- 产品知识库：Cudy Technology 产品信息、技术规格、兼容性、认证和使用限制。

首次配置：

```powershell
Copy-Item .env.example .env.local
# 在 .env.local 中填写 OPENAI_API_KEY，并修改生产环境管理 Token
docker compose up -d
npm run db:migrate
npm run dev
```

打开左侧“知识库 & RAG”，可上传 UTF-8 Markdown、TXT、CSV 或 JSON 文件。公司类资料会固定归属 `Cudy Technology`。也可以使用命令行导入：

```powershell
npm run kb:ingest -- --type=industry --file=knowledge/industry/research.md --source-url=https://example.com/source
npm run kb:ingest -- --type=company --file=knowledge/company/cudy-profile.md --external-id=cudy-profile-2026
npm run kb:ingest -- --type=product --file=knowledge/product/wr3000.md --external-id=cudy-wr3000
```

用户原始知识文件不会被 Git 跟踪。详细操作和治理规则见 [RAG 知识库指南](docs/RAG_KNOWLEDGE_BASE.md)。

### 产品数据库

数据库同时包含三个知识域：行业知识、Cudy Technology 公司知识和 Cudy Technology 产品知识。产品域额外包含结构化 `product_catalog` 与 `product_fact`。后者把产品目录确定性转换为带来源、权威等级、验证状态和证据摘录的型号事实；Datasheet 则进入产品 RAG 集合并保留型号、版本、文件名和页码结构。检索会融合 pgvector、全文和结构化事实三条通道，并向回答层暴露交叉印证状态。

将 `Cudy products list.xlsx` 与 Datasheet 放入 `knowledge/product` 后执行：

```powershell
python -m pip install -r requirements-product.txt
npm run products:extract
npm run db:migrate
npm run products:ingest
```

当前抽取器会读取 Excel 全产品清单，并优先把 `knowledge/product/Wi-Fi Router` 下的 PDF Datasheet 转成逐页证据文档。原始文件和生成的中间知识文件都不会被 Git 跟踪。

## 文档

- [最新产品需求文档 v1.0](Network_Channel_Copilot_PRD_v1.0.md)
- [历史产品需求文档 v0.3](Network_Channel_Copilot_PRD_v0.3.md)
- [架构与关键决策](docs/ARCHITECTURE.md)
- [公开数据快照说明](docs/DATA_SNAPSHOT.md)
- [RAG 知识库指南](docs/RAG_KNOWLEDGE_BASE.md)
- [LangChain / LangGraph 销售线索工作流](docs/LANGGRAPH_LEAD_WORKFLOW.md)
- [Postgres 参考 Schema](docs/schema.sql)
- [PRD 验收报告](docs/PRD_ACCEPTANCE.md)

## 已知限制

- 当前只有 RDS，默认在确认请求内执行；数据库队列、checkpoint、租约、失败重试和 worker 已实现，切换异步模式仍需部署 ECS 或长期 Node 容器。
- 公司资格由独立 Agent 自动评估并留存审计证据，但高价值商务决策仍建议由销售负责人复核。
- 实时线索尚未建立公司间供货关系，关系图在证据分析前保持为空。
- 战略终端客户尚未接入当前渠道图，后续应使用独立 lead type 和评分图，避免污染渠道匹配分。
- RAG 仅支持可读取为 UTF-8 文本的 Markdown、TXT、CSV 和 JSON；PDF/DOCX 解析尚未接入。
- 不实现真实邮件、LinkedIn、WhatsApp 或电话发送。
