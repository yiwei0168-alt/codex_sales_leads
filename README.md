# Network Channel Copilot Demo

面向 Networking 品牌海外销售团队的 B2B 渠道开发工作台。Demo 根据 PRD v0.3 实现墨西哥 SMB Networking 市场的两条 P0 主流程：

- 新市场同时发现和开发一级分销商与下级渠道；
- 已有一级分销商时，由品牌主动发现新的下级增长节点。

Demo 内置 36 家真实公开企业的稳定数据快照，覆盖 Distributor/VAD、Retail/E-tail、SI/MSP 和 ISP。所有公司身份均保留公开来源、采集日期、证据状态和置信度；角色、评分和供货关系假设与事实分开显示。

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
2. 点击“运行节点检索”，重放稳定公开数据快照。
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

当前快照 Demo 无需密钥即可运行。未来接入真实搜索或 LLM 时，复制 `.env.example` 为 `.env.local` 并填入对应 Provider 凭证。任何密钥不得提交。

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

## 文档

- [架构与关键决策](docs/ARCHITECTURE.md)
- [公开数据快照说明](docs/DATA_SNAPSHOT.md)
- [RAG 知识库指南](docs/RAG_KNOWLEDGE_BASE.md)
- [Postgres 参考 Schema](docs/schema.sql)
- [PRD 验收报告](docs/PRD_ACCEPTANCE.md)

## 已知限制

- 当前“检索”重放 2026-08-11 采集的稳定快照，不执行实时全网搜索。
- 关系图中的虚线是演示用的角色适配假设，不代表真实供货关系。
- 修改保存在当前浏览器会话内；尚未接入登录、Postgres 或跨会话持久化。
- 开发草稿由确定性规则生成，用于演示证据引用与节点差异化，不调用真实 LLM。
- RAG 仅支持可读取为 UTF-8 文本的 Markdown、TXT、CSV 和 JSON；PDF/DOCX 解析尚未接入。
- 不实现真实邮件、LinkedIn、WhatsApp 或电话发送。
