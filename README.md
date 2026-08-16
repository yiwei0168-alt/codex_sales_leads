# Network Channel Copilot

面向 Networking 品牌海外销售团队的 B2B 渠道开发工作台。当前产品化试点使用 Tavily 实时发现墨西哥全市场的渠道与战略客户线索：

- 新市场同时发现和开发一级分销商与下级渠道；
- 已有一级分销商时，由品牌主动发现新的下级增长节点。

首轮验证从 Tavily 实时结果中筛选 50 个唯一墨西哥域名，不把历史 36 家快照写入业务工作区。搜索候选在完成网页证据复核前统一标记为 `Inferred`。

## 启动

需要 Node.js 20.9 或更高版本。当前验证环境为 Node.js 24。

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

## Demo 操作路径

1. 在顶部切换“新市场并行开发”或“已有分销商增长”。
2. 点击“查看实时线索”，查看最近一次 Tavily 搜索写入 RDS 的候选。
3. 在“节点发现”按角色、Account Tier 或关键字筛选。
4. 打开公司详情，查看 Evidence，并修改 Account Tier、Supply Model、参与深度或机会状态。
5. 在“渠道关系图”区分已验证关系和虚线关系假设。
6. 在“机会工作区”推进节点状态。
7. 在“开发助手”查看证据关联的策略与英文草稿；系统不会真实发送外联。

## 项目结构

```text
src/app/                 Next.js App Router 入口与视觉系统
src/components/          Demo 工作台与交互组件
src/data/                墨西哥快照、关系和 AI Eval 样例
src/lib/                 领域类型、分类禁则与确定性计划规则
src/providers/           搜索、AI、存储 Provider 契约
docs/                    架构、数据、Schema 与 PRD 验收说明
```

## 环境变量

复制 `.env.example` 为 `.env.local`，配置 RDS、Tavily、Embedding、生成模型与单用户密码哈希。任何密钥不得提交。

生成单用户密码哈希（PowerShell）：

```powershell
$env:APP_PASSWORD_SETUP='use-a-long-unique-password'
npm run auth:hash-password
Remove-Item Env:APP_PASSWORD_SETUP
```

把输出写入 `.env.local` 的 `APP_PASSWORD_HASH`。开发环境未配置时允许本地绕过；生产环境不会允许绕过。

## Tavily 实时线索发现

```powershell
npm run db:migrate
npm run leads:discover -- --target=100 --replace
npm run leads:verify
npm run contacts:enrich -- --limit=100 --replace
npm run contacts:verify
npm run contacts:classify -- --company-limit=100 --candidate-limit=1000
npm run contacts:classify:report
npm run contacts:classify:eval
```

The contact pilot enriches ten live-search companies from public webpages only. Publicly displayed emails are stored
as `Public`; deterministic guesses require both a public named contact and a public same-domain personalized email
pattern, and are always stored as `Pattern-guessed`. Nothing in this workflow sends email.

Contact classification runs in shadow mode: DeepSeek assesses retained evidence, deterministic rules produce the
three-category recommendation, and the result is stored for evaluation without changing the active contact records.
Each candidate receives at most one routine call and one conflict-escalation call. The production-pilot batch covers
up to 100 companies and 1,000 resulting email candidates.

`--replace` 只替换当前工作区中的上一批 Tavily 活动候选；历史查询、原始结果和质量筛选记录保留用于审计。

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

数据库同时包含三个知识域：行业知识、Cudy Technology 公司知识和 Cudy Technology 产品知识。产品域额外包含结构化 `product_catalog` 主表，用于按型号和类别筛选；Datasheet 则进入产品 RAG 集合并保留型号、版本、文件名和页码结构。

将 `Cudy products list.xlsx` 与 Datasheet 放入 `knowledge/product` 后执行：

```powershell
python -m pip install -r requirements-product.txt
npm run products:extract
npm run db:migrate
npm run products:ingest
```

当前抽取器会读取 Excel 全产品清单，并优先把 `knowledge/product/Wi-Fi Router` 下的 PDF Datasheet 转成逐页证据文档。原始文件和生成的中间知识文件都不会被 Git 跟踪。

## 文档

- [架构与关键决策](docs/ARCHITECTURE.md)
- [公开数据快照说明](docs/DATA_SNAPSHOT.md)
- [RAG 知识库指南](docs/RAG_KNOWLEDGE_BASE.md)
- [Postgres 参考 Schema](docs/schema.sql)
- [PRD 验收报告](docs/PRD_ACCEPTANCE.md)

## 已知限制

- 当前首轮 Tavily 搜索通过结构化查询脚本执行，UI 内启动后台搜索任务将在下一阶段接入。
- Tavily 候选仅完成域名级基础筛选；企业身份、角色和适配度仍需网页证据抽取与人工确认。
- 实时线索尚未建立公司间供货关系，关系图在证据分析前保持为空。
- 开发草稿由确定性规则生成，用于演示证据引用与节点差异化，不调用真实 LLM。
- RAG 仅支持可读取为 UTF-8 文本的 Markdown、TXT、CSV 和 JSON；PDF/DOCX 解析尚未接入。
- 不实现真实邮件、LinkedIn、WhatsApp 或电话发送。
