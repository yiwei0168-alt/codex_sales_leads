# Network Channel Copilot 当前产品架构

> 飞书发布版 · 基于当前 `main` 分支与 PRD v1.0

| 文档项 | 内容 |
|---|---|
| 文档状态 | Current Architecture Baseline |
| 更新日期 | 2026-08-22 |
| 产品版本 | v1.0 |
| 当前部署基线 | Next.js 应用 + 阿里云 RDS PostgreSQL + inline 工作流 |
| 目标读者 | 产品、研发、测试、运维、销售运营 |
| 关联文档 | PRD v1.0、LangGraph 工作流、RAG 知识库指南、联系人验证设计 |

---

## 1. 架构摘要

Network Channel Copilot 是一个证据驱动的海外渠道销售线索产品。系统不会直接把搜索结果当作销售线索，而是先通过产品、Cudy 公司和行业三个知识域形成市场判断，再搜索真实公司、采集官网和独立来源证据，最后交给独立评分 Agent 进行资格判断。只有通过全部资格门且服务端重算分数达到阈值的公司，才会作为正式候选写入销售工作区。

当前架构的核心特征：

- 使用持久化自然语言对话作为统一入口；
- 使用 Assistant StateGraph 和 Lead StateGraph 两层 LangGraph 编排；
- 外部搜索前强制经过产品、公司、行业三域 RAG；
- 产品知识使用向量、全文和结构化事实三路混合检索；
- Tavily 负责候选发现和公开证据搜索，但搜索排名不进入最终评分；
- DeepSeek Flash 负责常规资格评估，冲突或低置信结果升级到 Pro；
- 最终分数、资格门和发布条件由应用服务端确定性控制；
- PostgreSQL 同时承担业务数据、RAG、任务状态、审计和 LangGraph checkpoint；
- 用户私有知识、对话、邮箱和业务数据使用数据库 RLS 隔离；
- 联系方式查询位于公司资格判断之后，通过独立 Provider API 扩展。
- 开发策略位于候选资格判断之后：Kimi-k3 结合候选证据、开发策略专库、脱敏长模板和个人已批准邮箱风格生成策略与初稿；Claude 负责人工反馈后的重写和私人记忆筛选。审核、反馈记忆、批准与邮件发送彼此分离。

---

## 2. 总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│                         用户与界面层                          │
│ Conversation Home / Sales Leads / Company Detail / RAG / Mail │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                    Next.js 应用与 API 层                      │
│ Auth / Assistant / Workspace / Knowledge / Contact / Mailbox  │
└──────────────────────┬───────────────────────┬───────────────┘
                       │                       │
┌──────────────────────▼────────────┐  ┌───────▼───────────────┐
│ Assistant StateGraph              │  │ 业务与数据服务         │
│ 请求解释、知识问答、搜索确认边界   │  │ Repository / RLS / Audit│
└──────────────────────┬────────────┘  └───────┬───────────────┘
                       │                       │
                       ▼                       │
┌──────────────────────────────────────────────┴───────────────┐
│ Lead StateGraph                                              │
│ RAG Gate → Playbook → Discovery → Evidence → Score → Persist │
└──────────────┬──────────────────┬──────────────────┬─────────┘
               │                  │                  │
       ┌───────▼───────┐  ┌──────▼──────┐  ┌────────▼─────────┐
       │ 模型服务       │  │ 搜索服务     │  │ 阿里云 RDS        │
       │ Lingyu/DeepSeek│  │ Tavily       │  │ PostgreSQL/pgvector│
       └───────────────┘  └─────────────┘  └──────────────────┘
```

### 2.1 分层职责

| 层 | 当前实现 | 主要职责 |
|---|---|---|
| 体验层 | Next.js App Router、React 工作区 | 对话、确认、任务状态、结果筛选、证据查看、人工修改 |
| API 层 | Next.js Route Handlers | 会话、授权、知识、RAG、工作流、联系方式和邮箱接口 |
| 编排层 | LangChain + LangGraph | 请求路由、节点状态、条件分支、失败恢复和 checkpoint |
| 领域层 | TypeScript 类型与服务 | 公司身份、渠道角色、资格门、评分、关系、机会和人工判断 |
| Provider 层 | Lingyu、DeepSeek、Tavily、Qwen、Contact Provider | 模型、搜索、Embedding 和后置联系方式查询 |
| 数据层 | 阿里云 RDS PostgreSQL + pgvector | 业务记录、三域知识、结构化事实、RLS、审计、job 和 checkpoint |

Provider 边界集中定义，页面和核心领域规则不依赖具体搜索、模型或联系方式厂商。

---

## 3. 两层 LangGraph 编排

### 3.1 Assistant StateGraph

```text
用户消息
  → plan_request（Kimi-k3，最近 8 轮上下文）
  → resolve_request
      ├─ general / clarification → 普通回复或追问
      ├─ knowledge-question      → 租户感知混合 RAG → 带引用回答
      ├─ hybrid-research         → 内部 RAG ∥ Gemini Search → OpenAI/Lingyu 整合
      └─ lead-search             → proposed action → 用户明确确认
```

Assistant Graph 的主要职责：

1. 使用 Kimi-k3 识别用户是在提问知识、补充条件还是发起线索搜索，并生成结构化 plan；
2. 把国家、目标数量、业务模式和目标渠道角色规范化；
3. 在线索搜索前创建可检查的 proposed action；
4. 在用户确认前禁止调用 Tavily；
5. 持久化 conversation、message 和 action，保证页面刷新后仍可继续多轮纠正和反馈；
6. 低置信度时发起针对性追问，用户修订线索计划时仅替换同一对话内尚未确认的旧计划；
7. 混合研究只把公共问题交给 Gemini，并要求实际 Google Search 信号和 URL 引用，再由 OpenAI 经 Lingyu 合成内外证据。

用户确认是显式外部搜索边界。只有已认证用户确认属于自己的 action 后，系统才会原子 claim 工作流 job。

### 3.2 Lead StateGraph

```text
retrieve_knowledge
  → build_playbook
  → discover_candidates
  → collect_evidence
  → score_candidates
  → persist_results
```

### 3.3 Development Strategy StateGraph

```text
selected qualified company
  → load_candidate_context
  → dedicated outreach RAG（公司档案 / 分销政策 / 市场背书 / 反馈记忆）
  → strategy + long-form draft（Kimi-k3，单次调用）
  → reviewed revision + private feedback memory（Claude）
  → evidence-ID allowlist validation
  → persist outreach_draft
  → human review
      ├─ confirm / approve（不会发送）
      └─ feedback → revise + screen reusable memory → new review revision
```

该图按用户选择的公司按需运行，不在每次线索搜索后批量消耗模型调用，也不检索详细产品规格。`Cudy Profile Company` 与 `Cudy Distribution Policy` 在专库中具有最高基础权重，匹配市场的证明与反馈记忆获得额外权重。私人风格只读取当前用户已批准的 `email-template` 提取物，不把原始邮箱正文或其他用户数据发送给模型。每次调用记录耗时和 Token；未来邮箱发送必须增加独立确认 Action、幂等键、频率限制和投递审计。

| 节点 | 核心职责 | 输出 | 失败策略 |
|---|---|---|---|
| retrieve_knowledge | 检索产品、Cudy 公司和行业知识 | 三域上下文、引用、检索信号 | 任一知识域缺失则 fail closed，不搜索 |
| build_playbook | 把知识与用户目标转为市场搜索假设 | 产品角度、角色优先级、排除项、动态查询 | 模型失败时允许受控确定性降级并记录 warning |
| discover_candidates | 按 Playbook 调用 Tavily 并规范化实体 | Search run、查询、去重候选池 | 保留失败状态，不生成模拟公司补位 |
| collect_evidence | 搜索和抓取官网及独立公开来源 | Evidence 列表、来源类型、摘要、时间 | 证据不足交给资格门拒绝 |
| score_candidates | 独立评估公司存在性、市场存在、渠道相关性和匹配度 | 完整 assessment | Flash 冲突/低置信升级 Pro；均失败则不发布 |
| persist_results | 服务端重算并保存合格 Top N | 正式公司、工作区上下文、审计数据 | 单事务失败则任务失败并保留 checkpoint |

### 3.4 状态与恢复

- 每个 Lead Graph 节点使用 RDS `langgraph` schema 保存 checkpoint；
- `lead_workflow_job` 保存 thread、mode、status、phase、attempt、lease、result 和 error；
- 失败 action 保留原 thread，可以从 checkpoint 重新执行；
- running job 使用两小时租约，租约过期后可以被重新 claim；
- 默认最多尝试 20 次，达到上限后停止自动 claim；
- 候选评估审计与正式发布分开保存，未入选候选仍可被追踪。

---

## 4. 三域 RAG 与产品事实架构

### 4.1 三个知识域

| 知识域 | 内容 | 在线索工作流中的作用 |
|---|---|---|
| Product | 型号、Datasheet、规格、协议、认证、限制和培训资料 | 确定产品卖点、场景和渠道邻近度 |
| Company | Cudy 公司能力、品牌、制造、OEM/ODM 和渠道支持 | 确定合作价值主张和执行边界 |
| Industry | 渠道结构、市场实践、合规、竞品和行业研究 | 形成国家市场假设、角色组合和排除规则 |

Lead Graph 在外部搜索前必须同时获得三个知识域。行业检索可以优先使用目标国家资料；没有国家专属文档时可以退回通用行业资料，但结果需要保留 warning。

### 4.2 产品三路混合检索

```text
用户查询
  ├─ Vector lane     → Qwen text-embedding-v4 → pgvector HNSW
  ├─ Keyword lane    → PostgreSQL tsvector    → GIN 全文检索
  └─ Structured lane → product_catalog + product_fact
                         ↓
               加权融合、去重与交叉印证
                         ↓
          grounded chunks + structured facts + citations
```

每个产品检索结果保留：

- `vectorRank`、`keywordRank`、`structuredRank`；
- `retrievalSignals` 和综合 score；
- 命中的结构化产品事实；
- 是否达到 `corroborated`；
- 真实 `[KB:chunk-uuid]` 引用。

产品结论要进入充分 grounded 状态，必须包含 structured 信号，并至少得到 vector 或 keyword 中的一路印证。只有语义相似但没有结构化交叉印证的规格会降级显示，不能作为确定性 Market Playbook 产品事实。

### 4.3 结构化产品事实

`product_fact` 保存型号、事实组、事实键、规范值、可选数值与单位、来源文件、权威等级、证据摘录、抽取版本、校验状态和事实哈希。

| 状态 | 使用规则 |
|---|---|
| verified | 可以作为强交叉印证事实 |
| provisional | 只用于召回或待验证提示 |
| conflicting | 降低结构化权重，阻止自动确定性结论 |

### 4.4 知识可见性

```text
shared documents ─────────────────────┐
                                     ├─ eligible CTE → vector / FTS / structured → answer
当前用户 private documents ───────────┘

其他用户 private documents → 在初始 SQL eligible CTE 中排除
```

私有文档必须在排名前完成租户过滤，避免“先召回、后过滤”带来的数据泄露风险。邮箱原始数据保存在独立 `mailbox_*` 表中，只有经过模型提取并由用户批准的内容才会进入 private RAG。

---

## 5. 候选发现、证据与独立评分

### 5.1 候选发现

Market Playbook 根据目标国家、产品知识、公司能力和行业结构动态生成查询。Tavily 返回结果经过：

1. 规范化公司名称、域名和官网 URL；
2. 排除目录页、聚合页、不可识别实体和明显非目标实体；
3. 按规范域名去重；
4. 为后续证据采集保留 search run、query、URL、摘要和 credits。

支持的渠道角色包括 Distributor、VAD、VAR、Dealer、Reseller、Retailer、E-tailer、SI、Installer、MSP 和 ISP。同一公司可以拥有多个角色；不按角色强行分配固定名额。

### 5.2 证据采集

证据优先使用公司官网，并可补充独立公开商业来源。Evidence 至少包含来源 URL、来源类型、摘录、抓取时间和候选关联。公司身份、目标国家存在和渠道活动必须能追溯到具体证据。

### 5.3 六个资格门

| Gate | 判断内容 |
|---|---|
| submittedIdentityUsable | 公司名称、域名和官网能否识别实体 |
| companyExists | 是否有证据支持公司真实存在并经营 |
| targetCountryPresence | 是否在目标国家存在、运营或提供服务 |
| relevantChannel | 是否存在至少一种允许的渠道活动 |
| sufficientEvidence | 身份、国家和渠道判断的证据是否充分 |
| independentProspect | 是否为可独立开发对象，而非 Cudy 自身或内部重复实体 |

任一 Gate 失败时，系统强制 `eligible=false`、`totalScore=0`，并禁止发布。

### 5.4 五维评分

| 维度 | 最大分 |
|---|---:|
| Channel Role & Customer Access | 30 |
| Product & Use-case Fit | 25 |
| Target Market Coverage | 20 |
| Partnership Execution Capability | 15 |
| Strategic Complementarity | 10 |
| 总计 | 100 |

模型只返回各维度评分与证据解释。应用服务端对维度值进行 clamp 并重新求和，不信任模型自由生成的总分。只有六个 Gate 全部通过且重算分数不低于 50 的候选，才能进入正式结果；最终按总分与置信度全局排序后取 Top N。

### 5.5 模型策略

| 阶段 | 当前模型 | 可靠性控制 |
|---|---|---|
| Market Playbook | LangChain ChatOpenAI through Lingyu | temperature 0、Zod structured output、90 秒超时、有限重试 |
| 常规资格评分 | DeepSeek v4 Flash | 严格 JSON Schema、75 秒预算、batch 5、并发 2 |
| 冲突升级 | DeepSeek v4 Pro | 低置信、证据 warning、冲突或 schema 失败时触发 |
| 最终分数 | Application Server | 资格门校验、维度 clamp、确定性重算 |

Tavily score、查询顺序和搜索排名不得进入评分 Agent 输入。模型返回但不属于候选输入的 Evidence ID 会被删除并记录 warning。

---

## 6. 数据与持久化架构

### 6.1 核心实体

| 实体组 | 主要表 / schema | 用途 |
|---|---|---|
| 用户与空间 | `app_user`、`market_workspace` | 用户身份和 owner-scoped `global-sales` 工作区 |
| 对话 | `assistant_conversation`、`assistant_message`、`assistant_action` | 对话、消息、确认边界与状态 |
| 知识 | `knowledge_collection`、`knowledge_document`、`knowledge_chunk` | 三域 RAG、向量、全文和可见性 |
| 产品事实 | `product_catalog`、`product_fact` | 产品型号与可审计结构化事实 |
| 搜索 | `lead_search_run`、`lead_search_query`、`lead_search_result` | Provider 查询、原始结果和 credits 审计 |
| 工作流 | `lead_workflow_job`、`langgraph.*` | job、租约、重试和 checkpoint |
| 评估 | `lead_candidate_assessment` | Gates、维度、角色、Evidence、模型和入选排名 |
| 公司业务 | `sales_company`、`workspace_company` | 规范公司身份与用户/市场业务上下文 |
| 联系方式 | contact enrichment / verification tables | 后置查询、验证决策和历史 |
| 邮箱 | `mailbox_*` | 连接、同步、消息、候选知识和审批 |

### 6.2 公司数据分层

- `sales_company` 保存可共享的客观公司身份；
- `workspace_company` 保存某用户、某市场下的 Account Tier、Supply Model、Opportunity Stage 和人工修改；
- 人工修改以 `manuallyEdited` 标记，后台重新评分不能静默覆盖；
- 未入选 assessment 与已发布公司分开保存，便于审计和后续阈值校准。

### 6.3 RLS 与数据库账号

- `DATABASE_URL` 使用受限应用登录；
- `DATABASE_MIGRATION_URL` 仅供 owner/migrator 使用；
- 应用事务设置当前用户 ID 与应用角色；
- 私有业务表启用并强制 RLS；
- LangGraph schema 只向受控应用登录授予必要权限；
- 远程 RDS 使用 TLS，应用账号不得拥有 SUPERUSER 或 BYPASSRLS。

---

## 7. 主要 API 与外部边界

| API / 边界 | 作用 | 关键约束 |
|---|---|---|
| Assistant APIs | 会话、消息、action 和确认 | 必须认证并校验 owner；确认前不搜索 |
| Knowledge APIs | 状态、导入和 RAG 查询 | shared/private 可见性；回答必须校验引用 |
| Workspace APIs | 读取和编辑公司业务上下文 | 人工修改保护和审计 |
| Contact Lookup API | 按 `externalId` 或官网 URL 查询联系人 | 公司资格评估之后；默认关闭；不影响 fitScore |
| Mailbox APIs | 连接、同步、筛选、学习和批准 | IMAP 只读、凭据加密、用户私有 |

联系方式统一入口：

```http
POST /api/contact-enrichment/lookup
Content-Type: application/json

{ "externalId": "company-id" }
```

也可以直接提交产品输出的官网 URL。接口先校验公司属于当前用户的 workspace，再调用 Snov.io 或其他 `ContactLookupProvider`。Provider 未启用时返回明确的 503，不生成模拟联系人。

---

## 8. 部署与运行模式

### 8.1 当前模式：RDS + inline

当前部署环境只有长期运行的阿里云 RDS，没有独立长期计算服务，因此默认使用：

```text
Next.js confirmation request
  → claim database job
  → inline execute Lead StateGraph
  → persist checkpoints and results in RDS
  → return final action state
```

优势是无需新增基础设施；限制是长任务可能受到 Web 请求或网关超时影响。checkpoint、job 和失败重试已经把未来切换 worker 所需的状态能力提前建立。

### 8.2 下一阶段：长期 worker

部署 ECS 或其他长期 Node 容器后：

```text
Next.js → create/confirm job → RDS queue
                                ↓
                         long-running worker
                                ↓
                 Lead StateGraph + checkpoint
                                ↓
                     UI 每四秒轮询状态
```

代码已提供 `npm run leads:worker`。切换到 worker 后，Web 请求只负责创建任务和返回状态，耗时模型与搜索调用由长期计算服务执行。

---

## 9. 安全、隐私与失败原则

### 9.1 安全与隐私

- API Key 和数据库凭据只存在服务端环境，不进入浏览器、日志或 Git；
- 对话、知识、任务、公司上下文、联系方式和邮箱数据均按用户授权；
- 私有 RAG 在 SQL 检索初始阶段完成租户过滤；
- 阿里邮箱使用用户级只读 IMAP 凭据，并以 AES-256-GCM 加密保存；
- 邮箱内容默认不进入共享知识库，只有用户批准的提取结果进入 private RAG；
- 只采集公开商业页面和公开职业信息，不抓取私人或登录后个人数据；
- 当前产品不执行自动外联、邮件发送或 LinkedIn 主动爬取。

### 9.2 Fail-closed 原则

以下情况均不得发布正式候选：

- 产品、公司或行业任一知识域缺失；
- 产品事实没有达到结构化交叉印证要求；
- 搜索 Provider 失败且没有真实结果；
- 公司身份、目标市场或渠道证据不足；
- 资格模型 schema 失败且升级模型仍失败；
- 服务端资格门或分数阈值未通过；
- 最终持久化事务失败。

系统不会用模拟公司、猜测联系人或伪造证据来填满目标数量。

---

## 10. 可观测性与工程发布门

系统保存：

- Search run、query、credits、URL 和 Provider 原始结果；
- RAG query、chunk IDs、检索信号、引用、模型和 latency；
- Candidate Evidence、assessment、Gates、维度分、warnings 和模型版本；
- 工作流 thread、phase、attempt、lease、checkpoint、result 和 error；
- 人工修改、联系方式验证当前决策和 superseded 历史。

正式发布前执行：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run products:verify
npm run leads:verify-workflow
npm run leads:verify-models
```

其中模型和数据库预检使用最小、非持久化 fixture，不把测试公司写入正式结果。

---

## 11. 当前数据基线

截至 2026-08-22，已验证运行快照：

| 数据 / 能力 | 当前状态 |
|---|---:|
| 产品目录 | 293 个型号 |
| 结构化产品事实 | 3,054 条 verified facts |
| 产品知识 | 272 个文档 / 1,727 个 chunks |
| Cudy 公司知识 | 2 个文档 / 65 个 chunks |
| 行业知识 | 6 个文档 / 110 个 chunks |
| LangGraph checkpoint | RDS 写入、读取、删除 round-trip 通过 |
| 模型链路 | Lingyu Planner、DeepSeek Flash→Pro 真实 schema 预检通过 |
| 工程检查 | TypeScript、ESLint、90 项测试、production build 通过 |

以上是当前快照，不是产品容量上限。

---

## 12. 架构演进路线

推荐按以下顺序演进：

1. 部署 ECS 或长期 Node worker，把生产工作流切换为异步执行；
2. 建立任务 SLA、模型延迟、token、升级率、Provider 成本和错误率面板；
3. 为非渠道型战略终端客户建立独立 Lead Graph 和评分模型；
4. 完成渠道关系确认/拒绝持久化和证据定期刷新；
5. 完成合规、预算和数据保留评审后启用联系方式 Provider；
6. 增加浏览器 E2E、RLS 回归测试和多市场真实业务试点。

---

## 13. 架构决策速查

| 决策 | 当前结论 |
|---|---|
| 为什么搜索前做 RAG | 先形成与产品、公司能力和行业结构一致的市场假设，降低无方向搜索和模型幻觉 |
| 为什么搜索与评分分离 | 搜索排名代表检索相关性，不代表销售开发价值 |
| 为什么使用独立评分 Agent | 防止同一模型同时提出候选并自证合理，保留交叉验证 |
| 为什么服务端重算分数 | 避免模型总分漂移，保证维度上限和发布阈值确定性 |
| 为什么当前使用 inline | 目前只有长期 RDS，没有 ECS/容器；inline 可以在不新增基础设施下运行完整图 |
| 为什么仍保存 job/checkpoint | 为失败恢复以及后续无缝切换长期 worker 提供状态基础 |
| 为什么联系人后置 | 联系人可得性与公司开发价值是两个不同问题，避免因没有联系人而漏掉高价值公司 |
| 为什么公司身份与 workspace 上下文分离 | 客观公司信息可以复用，而 Account Tier、供货模式和机会阶段属于具体用户与市场 |
| 为什么不设置角色固定配额 | 真实市场的合格公司分布不均，证据质量和匹配度优先于凑数 |
