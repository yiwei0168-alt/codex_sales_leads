# Network Channel Copilot PRD v1.0

> 面向 Networking 品牌海外销售团队的 AI 渠道开发与销售线索工作台

| 文档项 | 内容 |
|---|---|
| 版本 / 状态 | v1.0 · Current Product Baseline |
| 更新日期 | 2026-08-22 |
| 基线来源 | `Network_Channel_Copilot_PRD_v0.3.md`、当前 `main` 分支、RDS 实际数据与生产预检结果 |
| 主要用户 | 海外 Sales Manager、BD Manager、Channel Manager、区域销售与销售运营团队 |
| 产品阶段 | 已从真实数据 Demo 进入可持续迭代的产品基线；当前采用 RDS + inline 执行，可扩展长期 worker |
| 核心闭环 | 自然语言任务 → 三域 RAG → Market Playbook → 真实公司发现 → 官网证据 → 独立评分 → 合格线索入库 → 人工推进 |
| 数据原则 | 真实公开公司、证据可追溯、事实与推断分离、无充分证据不发布 |
| 非目标 | 不自动发送邮件或社交消息，不替代销售谈判，不把联系人数据作为公司匹配评分前提 |

---

# 0. v1.0 版本摘要

## 0.1 从 v0.3 到 v1.0 的主要变化

| 领域 | v0.3 基线 | v1.0 最新定义 |
|---|---|---|
| 产品入口 | 多页面 Demo 工作台 | 持久化自然语言对话作为统一入口，保留结果、关系、机会和知识库工作区 |
| 市场范围 | 首个真实市场与稳定快照优先 | 支持用户指定任意国家，并在同一 `global-sales` workspace 中按国家分区 |
| 客户类型 | 一级分销商与下级渠道 | 完整覆盖 11 类渠道角色；非渠道型战略客户预留独立 lead type，不混入渠道评分 |
| 搜索前知识 | Market Playbook 概念要求 | 产品、Cudy 公司、行业三域 RAG 成为外部搜索前硬门 |
| 产品知识 | 文本 RAG + 产品目录 | pgvector、全文、结构化产品事实三路融合，产品结论必须有结构化交叉印证 |
| 工作流 | Pipeline / Provider 建议 | Assistant StateGraph + Lead StateGraph，RDS PostgreSQL checkpoint 持久化 |
| 候选评估 | 角色化评分框架 | 独立 DeepSeek 评分 Agent；搜索排名不进入评分；服务端确定性重算总分 |
| 结果发布 | 真实候选进入结果页 | 六个资格门全部通过且匹配分 `>= 50` 才保存为正式候选 |
| 任务可靠性 | 显式错误与重试建议 | 数据库 job、租约、最多 20 次尝试、失败 checkpoint 重试、worker 预留 |
| 联系人 | 联系人查找属于开发准备 | 完全后置于公司资格判断；Snov.io 等平台使用独立接口，默认关闭 |
| 数据隔离 | Owner-scoped workspace | PostgreSQL 强制 RLS、用户私有对话/邮箱/RAG、共享与私有知识双通道 |
| 模型可用性 | Provider 契约和 Eval 样例 | Lingyu Planner、DeepSeek Flash→Pro 真实预检，严格 JSON Schema，失败不发布 |

## 0.2 当前已验证产品基线

截至 2026-08-22，当前产品基线已通过以下真实验证：

- 产品目录 293 个型号；
- 产品结构化事实 3,054 条，当前导入状态均为 `verified`；
- 产品知识 272 个文档、1,727 个向量化 chunks；
- 公司知识 2 个文档、65 个向量化 chunks；
- 行业知识 6 个文档、110 个向量化 chunks；
- LangGraph checkpoint 已在阿里云 RDS 完成写入、读取和删除 round-trip；
- Lingyu Market Playbook 与 DeepSeek Flash→Pro 资格评估链路已通过真实 schema 预检；
- TypeScript、ESLint、90 项自动化测试和 Next.js production build 已通过。

以上数字是本版本发布时的运行快照，不是产品容量上限，也不应作为未来知识规模的固定要求。

---

# 1. 产品定义

## 1.1 一句话定位

Network Channel Copilot 是一套面向 Networking 品牌海外团队的证据驱动型销售线索产品：它先理解品牌产品、公司能力和目标行业，再从真实公开信息中发现、验证并排序有开发价值的渠道公司，帮助销售团队以有限人力并行推进供货节点和需求节点。

## 1.2 产品北极星

让销售人员把时间投入关键判断、关系建立和商务谈判，把大规模市场研究、候选发现、证据采集、角色识别、初步评估和开发准备交给可审计的 AI 工作流。

## 1.3 核心产品原则

| 原则 ID | 原则 | 产品约束 |
|---|---|---|
| PR-01 | 先知识、后搜索 | 未获得产品、公司、行业三域知识时，不启动外部候选搜索 |
| PR-02 | 全渠道角色 P0 | 所有符合潜客画像且有开发价值的渠道角色都可以被召回，不设置固定类别配额 |
| PR-03 | 真实公司与官网 | 候选必须有可用公司身份、目标市场存在和官网 URL，不以目录页代替公司实体 |
| PR-04 | 事实与推断分离 | 事实必须关联 Evidence；假设、建议、风险和 Unknown 必须显式标识 |
| PR-05 | 搜索与评分解耦 | Tavily score、查询顺序和搜索排名不得输入资格评分 Agent |
| PR-06 | 失败关闭 | RAG、模型 schema、证据门或持久化失败时不发布候选，不用模拟公司补位 |
| PR-07 | 人工判断优先 | 用户人工修改不得被后台重新评分静默覆盖 |
| PR-08 | 联系方式后置 | 公司是否值得开发与联系人是否已找到是两个独立问题 |
| PR-09 | 租户隔离 | 用户私有对话、知识、邮箱、任务和联系人必须由数据库 RLS 隔离 |
| PR-10 | Provider 可替换 | 搜索、模型、联系方式平台和数据存储通过明确接口解耦 |

---

# 2. 业务背景与目标

## 2.1 业务问题

Networking 同时覆盖 Consumer、SMB、Enterprise、工业网络和运营商场景，目标渠道既包括承担进口、库存和账期的分销节点，也包括更接近项目或终端需求的零售、转售、集成、安装、托管服务和 ISP 节点。

传统销售流程存在四个结构性问题：

1. 搜索、核验和分类高度依赖人工，难以持续覆盖大量市场节点；
2. 团队往往优先开发少量一级分销商，无法并行创造下级需求；
3. 产品资料、行业认知与公司背景没有在搜索前形成统一的市场假设；
4. 搜索结果排名容易被误当成销售匹配度，缺少独立证据评估和审计记录。

## 2.2 业务目标

- G-01：缩短从目标市场提出到形成可审计候选清单的时间；
- G-02：支持同一团队并行覆盖分销、转售、零售、服务和运营商节点；
- G-03：在已有分销商市场主动发现未覆盖的下级需求节点；
- G-04：利用产品、公司和行业知识提高搜索方向与候选评估的一致性；
- G-05：把来源、模型、Prompt、评分、人工修改和失败状态沉淀为可恢复资产；
- G-06：为未来联系方式平台与销售执行系统提供清晰、低耦合的扩展接口。

## 2.3 v1.0 成功指标

| 指标 ID | 指标 | v1.0 目标 / 口径 |
|---|---|---|
| M-01 | 真实身份覆盖 | 100% 入库候选有规范域名、官网 URL 和至少一条身份/业务证据 |
| M-02 | RAG 前置率 | 100% 正式线索任务在搜索前完成产品、公司、行业三域检索 |
| M-03 | 产品事实交叉印证 | 用于 Market Playbook 的产品上下文必须同时包含 structured 信号和至少一个其他检索信号 |
| M-04 | 资格评估覆盖 | 100% 候选产生可审计 assessment，包含六个 gate、五维分数、风险和 Evidence IDs |
| M-05 | 错误发布率 | Provider、schema 或证据门失败时发布候选数为 0 |
| M-06 | 评分一致性 | 最终总分由服务端根据受限维度重算，不采用模型自由给出的总分 |
| M-07 | 任务可恢复性 | RDS checkpoint round-trip 通过；失败 action 可使用同一 thread 重试 |
| M-08 | 多角色支持 | 一家公司允许多角色；KA 不进入 Channel Role；ISP 保持 Downstream Channel |
| M-09 | 用户隔离 | 自动化测试和数据库策略均阻止跨租户读取私有知识与业务记录 |
| M-10 | 工程质量 | TypeScript、Lint、单元测试、生产构建和关键外部服务预检通过后方可发布 |

---

# 3. 用户、角色与核心场景

## 3.1 主要用户

| 用户 | 目标 | 典型任务 |
|---|---|---|
| 新市场 Sales / BD Manager | 同时建立供货能力和市场需求 | 分析国家、寻找多类渠道、建立优先候选清单 |
| 已有市场 Channel Manager | 突破既有分销网络增长停滞 | 发现下级渠道空白、形成 Distributor Supply 机会 |
| 区域销售负责人 | 聚焦高价值候选并控制风险 | 查看证据与评分、修改 Account Tier、分配下一步 |
| 销售运营 / 管理员 | 维护知识、数据质量与任务运行 | 导入知识、查看任务状态、处理失败、审计模型结果 |

## 3.2 P0 场景

### S-01 新市场多节点并行开发

用户输入国家、目标数量、产品或业务目标。系统形成搜索计划，经用户确认后动态发现分销、转售、零售、服务与 ISP 节点。最终结果按匹配程度全局排序，不为任何角色强行凑数。

### S-02 已有分销商市场增长

系统在保留现有供货路径的前提下，优先发现未覆盖的 VAR、Dealer、Reseller、Retailer、E-tailer、SI、Installer、MSP 和 ISP，并把 `Distributor Supply` 作为常规建议；大型项目可建议 `Co-sell/Co-supply` 或 `Brand Direct`。

### S-03 产品与市场知识问答

用户可以询问产品规格、产品组合、Cudy 公司能力、行业与邮箱中已批准的知识。回答必须基于当前用户可见知识、提供 chunk 引用，并展示 grounded 与 warning 状态。

### S-04 失败恢复与继续执行

长任务失败时，系统记录失败节点、错误、候选审计和 LangGraph checkpoint。用户可以从同一 action 重试；系统不得生成替代公司掩盖失败。

## 3.3 后置场景

### S-05 联系方式查询

公司通过资格评估后，用户可以选择按 `externalId` 或官网 URL 调用独立的 Contact Lookup Provider。联系方式不会反向影响公司适配分；平台未配置时必须返回明确的 disabled 状态。

### S-06 私有邮箱知识学习

用户通过只读阿里邮箱 IMAP 导入私有邮件。凭据加密保存；邮件经过本地筛选和 Kimi 提取后，仅由用户明确批准的知识进入私有 RAG，不与其他用户共享。

---

# 4. 术语与分类规则

## 4.1 渠道层级与角色

| 维度 | 允许值 | 规则 |
|---|---|---|
| Channel Layer | `Tier-1 Distributor`、`Downstream Channel` | 只描述渠道层级；ISP 属于 Downstream |
| Distribution Roles | `Distributor`、`VAD` | 进口、库存、账期、渠道供货、技术支持等能力 |
| Resale Roles | `VAR`、`Dealer`、`Reseller` | 转售、区域覆盖、客户触达和采购影响 |
| Retail Roles | `Retailer`、`E-tailer` | 门店或线上流量、品类运营和消费者/SMB 触达 |
| Service Roles | `SI`、`Installer`、`MSP` | 方案、项目、安装、交付和持续托管服务 |
| Operator Role | `ISP` | 网络运营或连接服务；仍属于 Downstream Channel |

同一公司可以同时具有多个角色。角色是市场任务语境中的判断，不等同于企业永久属性。

## 4.2 独立业务维度

| 维度 | 允许值 |
|---|---|
| Account Tier | `KA`、`Priority`、`Standard`、`Long-tail` |
| Supply Model | `Distributor Supply`、`Brand Direct`、`Co-sell/Co-supply`、`TBD` |
| Brand Involvement | `Light`、`Standard`、`Deep` |
| Opportunity Stage | `Discovered`、`Qualified`、`Priority`、`Contact Prepared`、`Engaged`、`Excluded` |
| Lead Type | 当前正式图使用 `Channel`；`Strategic Customer` 为独立未来图 |

### 建模禁则

- `KA` 不得存入 Channel Role；
- `ISP` 不得成为第三种 Channel Layer；
- 非渠道型战略终端客户不得使用渠道评分规则强行分类；
- 公司客观身份与某用户/市场下的 Account Tier、Supply Model、Opportunity 必须分离；
- 搜索 Provider 分数不得被保存为最终 fitScore。

---

# 5. v1.0 产品范围

## 5.1 P0 功能

| 需求 ID | 模块 | v1.0 Must-have 行为 | 当前状态 |
|---|---|---|---|
| FR-01 | Conversation Home | 保存用户对话，识别知识问题、澄清问题和线索搜索意图 | 已实现 |
| FR-02 | Lead Plan | 解析国家、目标数量、业务模式和完整渠道角色；外部搜索前展示确认 action | 已实现 |
| FR-03 | Three-domain RAG Gate | 产品、公司、行业任一缺失即终止线索图 | 已实现 |
| FR-04 | Structured Product RAG | 融合 vector、keyword、structured；保留事实来源与冲突状态 | 已实现 |
| FR-05 | Market Playbook | 基于 RAG 生成市场假设、产品角度、角色优先级、排除项和搜索查询 | 已实现 |
| FR-06 | Dynamic Discovery | 使用 Tavily 按 playbook 动态查询，输出真实公司官网 URL | 已实现 |
| FR-07 | Entity Deduplication | 按规范域名去重，排除目录页、无目标市场存在和不可识别实体 | 已实现 |
| FR-08 | Evidence Collection | 为候选抓取官网和独立公开证据，保存 URL、摘要、来源类型和时间 | 已实现 |
| FR-09 | Independent Qualification | 独立 Agent 评估六个资格门、角色、五维分数、风险和 Unknown | 已实现 |
| FR-10 | Deterministic Publication | 服务端重算总分，仅保存 eligible 且 score `>= 50` 的全局 Top N | 已实现 |
| FR-11 | Result Workspace | 按国家查看、筛选和编辑候选，保留人工 Account Tier 等修改 | 已实现 |
| FR-12 | Workflow Persistence | 保存 job、phase、attempt、result、error、candidate assessment 和 checkpoint | 已实现 |
| FR-13 | Failure Retry | 失败任务可复用 thread 重试；运行中任务使用租约避免重复 claim | 已实现 |
| FR-14 | Tenant Security | 对话、action、知识、邮箱、任务、assessment 和联系方式按用户隔离 | 已实现 |
| FR-15 | Contact Provider Boundary | 公司通过评估后可按官网 URL 调用通用 Contact Lookup API | 接口已实现，默认关闭 |
| FR-16 | Knowledge Management | 支持行业、公司、产品知识导入、统计、引用与共享/私有可见性 | 已实现 |
| FR-17 | Private Mailbox Learning | 只读同步、加密、筛选、AI 提取和人工批准后进入私有知识 | 已实现 |

## 5.2 P1 / 后续功能

| 需求 ID | 功能 | 说明 |
|---|---|---|
| FR-101 | Strategic Customer Graph | 为非渠道型重点终端客户建立独立 eligibility、维度和发布阈值 |
| FR-102 | Worker Production Deployment | 在 ECS 或长期 Node 容器运行 `npm run leads:worker`，把 inline 切换为 worker |
| FR-103 | Relationship Confirmation | 将 Channel Map 中关系确认、拒绝和证据更新完整持久化 |
| FR-104 | Scheduled Refresh | 定期刷新来源、检测官网变化和事实过期 |
| FR-105 | Contact Platform Activation | 在法务、预算和凭据到位后启用 Snov.io 或替代平台 |
| FR-106 | Browser E2E / CI | 覆盖登录、RAG 问答、搜索确认、任务轮询、失败重试和结果编辑 |
| FR-107 | Model Telemetry | 汇总模型延迟、token、升级率、schema 失败率、Provider 错误与成本 |
| FR-108 | Mobile Optimization | 在保留高信息密度的前提下完善手机端体验 |

## 5.3 非目标

- NG-01：不自动发送邮件、LinkedIn、WhatsApp、短信或拨打电话；
- NG-02：不实现完整 CRM、报价、合同、订单、回款和售后；
- NG-03：不承诺搜索结果达到用户请求数量，证据质量优先于凑数；
- NG-04：不承诺联系方式 100% 准确，不把 pattern guess 标记为 verified；
- NG-05：不使用私有、登录后或来源条款禁止自动化访问的数据；
- NG-06：不让 LLM 独立决定最终数值总分或覆盖资格门；
- NG-07：不让主产品依赖评测模型的原生搜索能力；正式搜索统一通过受控 Provider；
- NG-08：不以当前 293 个产品或现有国家结果作为固定产品边界。

---

# 6. 端到端工作流

## 6.1 Assistant StateGraph

```text
User message
  → interpret_request
  → resolve_request
      ├─ general / clarification → assistant reply
      ├─ knowledge-question → tenant-aware hybrid RAG → cited answer
      └─ lead-search → proposed action → explicit confirmation boundary
```

对话数据库是 Assistant Graph 的权威持久状态。解释请求时不得调用 Tavily；只有已认证用户确认 `lead-search` action 后才可创建并 claim 工作流 job。

## 6.2 Lead StateGraph

```text
retrieve_knowledge
  → build_playbook
  → discover_candidates
  → collect_evidence
  → score_candidates
  → persist_results
```

| 节点 | 输入 | 输出 | 失败行为 |
|---|---|---|---|
| retrieve_knowledge | 用户、国家、角色、目标 | 三域 citations 与检索信号 | 缺少任一知识域或产品结构化交叉印证则停止 |
| build_playbook | 搜索计划、RAG context | 市场假设、产品角度、角色优先级、动态查询 | 模型失败可降级确定性 playbook，但记录 warning |
| discover_candidates | Playbook | run、去重候选池、Tavily credits | 保留 run 状态，不生成模拟候选 |
| collect_evidence | 候选域名与官网 | 官网/独立来源 Evidence | 证据不足由评分 gate 拒绝 |
| score_candidates | 候选 Evidence、Playbook | 完整 assessment | Flash 失败/冲突升级 Pro；两者失败不发布 |
| persist_results | assessments、targetCount | 全局排序的合格公司与审计数据 | 事务失败则任务失败并保留 checkpoint |

## 6.3 执行模式

- `inline`：当前默认。适合只有阿里云 RDS、没有 ECS/容器的部署；确认请求会等待图执行完成。
- `worker`：代码已提供数据库队列和 worker。部署长期计算服务后启用；前端每四秒轮询 action 状态。
- 租约：两小时；租约过期的 running job 可被重新 claim。
- 重试上限：20 次；达到上限后保留失败状态，不继续自动 claim。

---

# 7. RAG 与知识架构

## 7.1 三个知识域

| 知识域 | 内容 | 线索图作用 |
|---|---|---|
| Product | 产品目录、Datasheet、规格、功能、认证、限制、培训材料 | 决定产品角度、渠道邻近度和场景匹配 |
| Company | Cudy 公司简介、品牌、制造、OEM/ODM、渠道支持与执行能力 | 决定合作价值主张和品牌能力边界 |
| Industry | 渠道结构、市场实践、合规、竞品和行业研究 | 决定市场假设、角色组合和排除规则 |

行业知识可以按国家过滤；若目标国家没有专属文档，系统可退回无国家过滤的通用行业知识，但必须保留 warning 语义。

## 7.2 产品三路混合检索

1. **Vector lane**：Qwen `text-embedding-v4`，1536 维，PostgreSQL pgvector HNSW；
2. **Keyword lane**：PostgreSQL `tsvector` + GIN 全文检索；
3. **Structured lane**：`product_catalog` 与 `product_fact` 的型号、类别、能力、协议、接口和管理特性。

融合结果为每个 chunk 记录：

- `vectorRank`、`keywordRank`、`structuredRank`；
- `retrievalSignals`；
- `structuredFacts`；
- `corroborated`；
- 综合 `score`。

产品结论要进入 fully grounded 状态，必须包含 `structured` 信号并至少得到另一条检索通道印证。仅有语义相似的产品规格必须显示为低置信，不能进入确定性 Market Playbook 产品事实。

## 7.3 结构化产品事实

`product_fact` 至少保存：

- model、fact group、fact key；
- 原始值、规范值、可选数值与单位；
- source file、authority、evidence excerpt；
- extraction method、verification status、fact hash；
- created / updated time。

允许的事实状态：

| 状态 | 行为 |
|---|---|
| `verified` | 可作为交叉印证事实 |
| `provisional` | 可用于召回和待验证提示，不作为强事实 |
| `conflicting` | 降低结构化权重，阻止自动确定性结论 |

## 7.4 知识可见性

- `shared`：由管理员发布的通用公司、行业和产品知识；
- `private`：仅 owner 可见的上传资料和已批准邮箱知识；
- 私有文档必须在 SQL eligible CTE 中先完成租户过滤，再参与向量或全文排序；
- RAG 输出必须引用真实 `[KB:chunk-uuid]`，不存在或伪造的引用不得作为 grounded。

---

# 8. 候选资格与评分规范

## 8.1 六个资格门

| Gate | 通过条件 |
|---|---|
| submittedIdentityUsable | 公司名称、域名和官网可用于实体识别 |
| companyExists | 证据支持该公司真实存在并处于可识别经营状态 |
| targetCountryPresence | 证据支持公司在目标国家存在、运营或提供服务 |
| relevantChannel | 证据支持至少一种允许的渠道角色或等价渠道活动 |
| sufficientEvidence | 身份、国家与渠道判断均有可审计证据 |
| independentProspect | 不是 Cudy 自身、重复内部实体或其他不可独立开发对象 |

任一 Gate 失败时：`eligible=false`、`totalScore=0`、不得发布。

## 8.2 五维匹配评分

| 维度 | 最大分 | 说明 |
|---|---:|---|
| Channel Role & Customer Access | 30 | 角色可信度、客户触达、渠道位置和采购影响 |
| Product & Use-case Fit | 25 | 与产品组合、技术场景和目标客户需求的适配 |
| Target Market Coverage | 20 | 目标国家、区域、行业或客户覆盖 |
| Partnership Execution Capability | 15 | 采购、销售、项目、交付、服务和持续经营能力 |
| Strategic Complementarity | 10 | 与 Cudy 当前渠道、产品与市场空白的互补程度 |
| **总计** | **100** | 服务端从各维度受限值重新求和 |

## 8.3 发布与排序

- 合格阈值：`50`；
- 高匹配参考阈值：`80`；
- 最终选择：所有 eligible 候选按 totalScore、confidence 全局降序，取用户请求的 Top N；
- 不按角色设置硬配额；某角色无合格候选时允许返回 0；
- `reseller`、`retailer`、`SI` 等角色不命中不是整次任务失败，只会影响角色覆盖与最终匹配；
- Provider score 只用于搜索阶段内部候选池管理，不进入 Agent 输入或最终分数。

## 8.4 模型策略

| 用途 | 模型 / Provider | 策略 |
|---|---|---|
| Market Playbook | LangChain `ChatOpenAI` through Lingyu | temperature 0、严格 Zod structured output、90 秒超时、最多两次重试 |
| Routine Qualification | DeepSeek v4 Flash | JSON Schema、75 秒调用预算、batch 最多 5、并发最多 2 |
| Conflict Escalation | DeepSeek v4 Pro | 低 confidence、模型主动升级、证据 warning 或 routine schema 失败时调用 |
| Final Score | Application server | clamp 维度并重算；模型总分不可信任 |

模型必须返回 Evidence IDs；不存在于候选输入中的 Evidence ID 会被删除并写入 warning。

---

# 9. 数据模型与持久化

## 9.1 核心实体

| 实体 | 用途 | 关键约束 |
|---|---|---|
| `app_user` | 登录用户 | 用户状态与角色 |
| `market_workspace` | 用户全局销售空间 | `global-sales`，owner-scoped |
| `assistant_conversation/message/action` | 对话和确认边界 | 强制 user RLS |
| `knowledge_collection/document/chunk` | 三域 RAG | shared/private 可见性、owner、embedding |
| `product_catalog` | 产品型号目录 | model 主键、类别、描述、生命周期 |
| `product_fact` | 可审计结构化事实 | 唯一事实键、来源、校验状态、强制 RLS 管理写入 |
| `lead_search_run/query/result` | 外部搜索审计 | 国家、查询、原始结果、credits、accepted |
| `lead_workflow_job` | 可恢复任务 | thread、mode、status、phase、attempt、lease、error |
| `lead_candidate_assessment` | 候选评分审计 | gates、dimensions、roles、Evidence、model、selected rank |
| `sales_company` | 规范公司实体 | 域名去重、官网与客观身份 |
| `workspace_company` | 用户/市场业务语境 | Account Tier、Supply Model、stage、人工修改 |
| `langgraph.*` | Graph checkpoint | thread 级状态和 pending writes |
| `mailbox_*` | 私有邮箱同步与学习 | 加密、复合 owner、审批与审计 |

## 9.2 人工修改保护

- workspace 维度字段以人工修改为最高优先级；
- 后续搜索可以新增 Evidence 和 assessment，但不得静默覆盖 `manuallyEdited=true` 的业务判断；
- 全局公司客观身份与用户业务上下文必须分别持久化；
- 每次 assessment 保留模型、Prompt、Evidence 和 warning，不能只保存最终 CompanyRecord。

## 9.3 RLS 与数据库账号

- 生产 `DATABASE_URL` 使用受限登录账号；
- `DATABASE_MIGRATION_URL` 仅用于 owner/migrator 操作，并必须指向同一数据库；
- 应用事务设置 `app.current_user_id` 与用户角色；
- 私有业务表启用并强制 RLS；
- LangGraph schema 只向受控应用登录和应用 role 授予所需表权限；
- 生产远程 RDS 必须使用 TLS，应用原始登录不得拥有 SUPERUSER / BYPASSRLS。

---

# 10. 页面与交互

## 10.1 主要界面

| 页面 / 工作区 | 核心任务 |
|---|---|
| Conversation Home | 提问知识、描述市场任务、查看搜索计划和工作流状态 |
| Sales Leads | 按国家、角色、Account Tier、关键词和匹配分查看候选 |
| Company Detail | 查看官网、证据、角色、评分、风险、Unknown 和人工修改 |
| Channel Map | 查看已有关系与 Hypothesis 关系，不把推断展示为事实 |
| Opportunity Workspace | 管理阶段、优先级、owner、供货路径和下一步 |
| Development Assistant | 从开发策略专库检索公司背书、分销政策、市场证明和反馈记忆，单次生成策略与长邮件；支持审核、反馈改写和确认 |
| Knowledge & RAG | 查看三域统计、导入知识、执行带引用问答 |
| Mailbox Integration | 配置私有邮箱、同步、筛选、AI 学习和人工审批 |

## 10.2 搜索 action 交互

1. 用户用自然语言描述目标；
2. UI 展示国家、目标数量、模式和角色；
3. 用户明确确认后启动 Tavily；
4. inline 模式显示运行状态并等待结果；worker 模式每四秒轮询；
5. completed 显示发现、评估、合格、保存和 credits；
6. failed 显示错误和“从 checkpoint 重试”；
7. 不允许把 failed 状态伪装成空成功结果。

## 10.3 Evidence 交互

- 从回答、评分理由、风险或草稿可以反向打开来源；
- UI 同时显示 fitScore 与 evidenceConfidence；
- `Verified`、`Corroborated`、`Inferred`、`Unknown`、`Conflicting` 使用文字与视觉双重编码；
- 外部 URL 使用新窗口打开，并只展示公开商业来源；
- 产品问答 grounded=false 时显示明确复核提示。

## 10.4 开发策略审核与反馈

- 开发邮件不检索详细产品规格，只使用候选公司 Evidence 和独立开发策略库；
- 专库优先召回 `Cudy Profile Company`、`Cudy Distribution Policy`、目标市场证明和当前用户的高价值反馈记忆；
- 初次生成将策略与完整邮件合并为一次 Kimi-k3 调用；人工反馈后的重写和记忆筛选使用 Claude，并记录各阶段耗时、调用次数和 Token；
- 默认长度参考脱敏真实模板，目标为 5–7 个段落并包含 4–6 个紧凑利益点；
- 每次生成或反馈改写后状态均为待审核，用户可以人工编辑、提交反馈或确认批准；
- Claude 反馈 Agent 只记忆用户明确授权且可跨公司复用的市场事实、渠道策略、发件人身份、定位经验或稳定风格偏好，不记忆联系人、单家公司措辞、秘密或未获支持的断言；
- 批准不会自动发送邮件。

---

# 11. 联系方式与邮箱边界

## 11.1 Contact Lookup API

```http
POST /api/contact-enrichment/lookup
Content-Type: application/json

{ "externalId": "company-id" }
```

或：

```json
{ "websiteUrl": "https://company.example/" }
```

接口必须：

1. 验证公司属于当前用户的 `global-sales` workspace；
2. 从已保存规范域名调用 Provider；
3. 使用 90 秒总超时与 Provider 内部有界请求；
4. 返回 provider、contacts、credits/request ID 和 warnings；
5. 未启用时返回 503 与所需配置，不返回模拟联系人。

## 11.2 联系方式状态

- `Verified`：外部平台或确定性规则确认；
- `Unknown`：存在候选，但未验证；
- `Invalid`：明确无效；
- Public、Pattern-guessed 等来源语义不得与验证状态混淆；
- 联系方式不影响本版本公司 fitScore。

## 11.3 邮箱安全

- IMAP 只读；
- 凭据使用 AES-256-GCM 加密；
- 原始消息、同步 cursor、学习 candidate 和 outbound audit 均按用户隔离；
- 邮件内容默认不得进入 shared RAG；
- 只有用户明确批准的提取结果可进入 private RAG；
- 本产品不执行真实 outbound delivery verification 或消息发送。

---

# 12. 非功能需求

## 12.1 可靠性

- NFR-R01：所有外部 Provider 使用显式 timeout 和有限 retry；
- NFR-R02：长任务保存 phase、attempt、lease、error 和 checkpoint；
- NFR-R03：候选审计与最终发布使用事务，避免部分发布；
- NFR-R04：模型解析失败必须进入升级或 failed assessment，不能猜测修补关键字段；
- NFR-R05：产品目录和结构化事实导入必须幂等，可安全重复运行。

## 12.2 性能与容量

- NFR-P01：产品向量查询使用 HNSW；全文和结构化查询使用 GIN/索引；
- NFR-P02：单次线索任务候选池最多 100，证据采集并发默认 4；
- NFR-P03：评分 batch 最多 5，默认并发 2；
- NFR-P04：UI 普通读取不应等待外部模型；长任务显示可观测状态；
- NFR-P05：只有部署长期计算服务后才允许把生产模式切换为 worker。
- NFR-P06：开发策略首次生成默认只调用一次 Kimi，并将专库上下文限制为 4 个知识分块、1 个最匹配团队长模板，以及至多 1 个已批准私人风格样本。

## 12.3 安全与合规

- NFR-S01：密钥只存在服务端环境，不进入浏览器、日志或 Git；
- NFR-S02：使用公开商业信息，并遵守来源条款、robots、频率和禁止自动化要求；
- NFR-S03：不采集私人联系方式或登录后个人数据；
- NFR-S04：错误响应不得泄露数据库凭据、API Key 或完整内部 Prompt；
- NFR-S05：知识、邮箱、对话、任务和联系方式查询执行租户授权校验；
- NFR-S06：联系人平台启用前必须完成法务、预算、访问条款和数据保留评审。

## 12.4 可观测与审计

- 保存 run、query、credits、候选、Evidence、assessment、model、Prompt version 和 warning；
- 保存 RAG query、retrieved chunk IDs、模型和 latency；
- 保存 contact verification 当前决策与 superseded 历史；
- 失败日志必须足够支持定向重试，但不得记录明文密钥或私有邮箱凭据。

---

# 13. v1.0 验收标准

## 13.1 端到端验收

| 验收 ID | Given | When | Then |
|---|---|---|---|
| AC-01 | 用户提出包含国家和数量的线索任务 | 系统解释请求 | 返回 proposed action，不调用 Tavily |
| AC-02 | 用户确认 proposed action | Lead Graph 执行 | RAG 节点严格先于发现、证据、评分与持久化 |
| AC-03 | 任一知识域缺失 | 图进入 RAG gate | 任务失败且 Tavily 调用数为 0 |
| AC-04 | 产品 chunk 只有 vector 信号 | 系统构建 Playbook | 不把该规格作为 fully grounded 产品事实 |
| AC-05 | 公司无目标国家或渠道证据 | Agent 评估 | 相应 gate=false、score=0、不入库 |
| AC-06 | 候选 score=49 | Persist 节点执行 | assessment 保留，但公司不进入正式结果 |
| AC-07 | 多个角色都有合格公司 | 最终排序 | 按全局匹配分取 Top N，不套固定角色配额 |
| AC-08 | 某角色无合格候选 | 任务完成 | 结果仍有效，并明确数量不足，不降低证据标准 |
| AC-09 | Routine 输出低置信或冲突 | 评分节点执行 | 自动调用 Pro；Pro 失败则不发布该候选 |
| AC-10 | 工作流中途失败 | 用户点击重试 | 保留原 thread 与审计，重新进入可执行状态 |
| AC-11 | 联系方式 Provider 关闭 | 用户提交已保存公司 URL | 返回明确 503，不返回模拟联系人 |
| AC-12 | 用户查询私有邮箱知识 | RAG 检索 | 只能读取当前用户批准的 private chunks |

## 13.2 分类与评分验收

- AC-A01：允许的 Channel Role 精确覆盖 11 类；
- AC-A02：一家公司可以有多个角色和一个 primaryRole；
- AC-A03：KA 只存在 Account Tier；
- AC-A04：ISP 的 Channel Layer 必须是 Downstream；
- AC-A05：六个 Gate 全通过才允许计算非零总分；
- AC-A06：五维 clamp 后最大总分为 100；
- AC-A07：不存在于输入的 Evidence ID 被删除并生成 warning；
- AC-A08：Tavily providerScore 不出现在资格 Agent 输入；
- AC-A09：人工修改的 workspace 字段不被重新搜索静默覆盖。

## 13.3 数据与安全验收

- AC-D01：RDS migrations 020/021 幂等通过；
- AC-D02：`lead_workflow_job`、`lead_candidate_assessment` 和 `product_fact` 的 RLS/权限符合设计；
- AC-D03：LangGraph checkpoint 可写、可读、可删除；
- AC-D04：产品验证脚本确认目录、事实、四个索引和至少一个 structured corroborated 结果；
- AC-D05：跨租户知识测试通过；
- AC-D06：`.env.local`、密钥、临时 npm 缓存和依赖目录不进入 Git。

## 13.4 工程发布门

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run products:verify
npm run leads:verify-workflow
npm run leads:verify-models
```

代码门全部通过是必要条件；外部服务预检必须使用最小、非持久化 fixture，不能把测试公司写入正式结果。

---

# 14. 风险与控制

| 风险 | 影响 | 当前控制 | 后续措施 |
|---|---|---|---|
| 搜索服务超时或额度不足 | 任务无法完成 | 有界 timeout、credits 审计、明确失败 | worker 部署、预算告警、Provider fallback 评审 |
| RAG 文档过期或缺失 | Playbook 偏差 | 三域硬门、来源时间、Unknown | Scheduled refresh 和 freshness policy |
| 结构化事实抽取错误 | 产品判断错误 | 确定性规则、证据摘录、verification status | 多来源冲突检测和人工审批界面 |
| LLM schema 偏离 | 评分不可用 | JSON Schema、Zod、Flash→Pro、失败不发布 | Schema repair telemetry，不降低校验 |
| 官网证据营销化或不完整 | 高估候选 | 六个 Gate、独立来源类型、confidence | 增加官方目录/监管/行业来源 |
| inline 请求耗时 | 网关超时、体验不稳定 | checkpoint、数据库 job、失败重试 | 部署 ECS worker 后切换异步模式 |
| 联系方式数据合规 | 法务和隐私风险 | 默认关闭、workspace 授权、公开职业信息边界 | 启用前完成 DPA、保留期和删除流程 |
| 跨租户数据泄露 | 严重安全事件 | 强制 RLS、受限账号、private/shared 分离 | 定期渗透测试和 RLS regression suite |
| 关系图把假设当事实 | 错误销售路径 | Hypothesis 状态、Evidence IDs | 完整持久化确认/拒绝工作流 |

---

# 15. 产品路线图与明确边界

## 15.1 v1.0 当前交付

- 双层 LangGraph 编排；
- 三域 RAG 与产品三路融合；
- 完整渠道角色和动态搜索；
- 官网证据采集、独立 Agent 评分和确定性发布；
- RDS checkpoint、job、租约、失败重试；
- 全局 workspace、国家分区、用户人工修改；
- 私有邮箱学习和 Contact Provider 接口；
- 生产验证脚本与文档。

## 15.2 下一阶段推荐顺序

1. 部署 ECS/长期 Node worker，并把生产执行模式切换为 `worker`；
2. 建立任务 telemetry、Provider 成本与 SLA 面板；
3. 建立 Strategic Customer 独立图和评分模型；
4. 完成关系确认持久化与来源刷新；
5. 在合规和预算确认后启用 Snov.io 或其他联系方式 Provider；
6. 增加浏览器 E2E、移动端优化和多市场真实业务试点。

## 15.3 需要业务持续验证的假设

- 不同国家的最佳角色组合是否能稳定由 Market Playbook 推导；
- 50 分发布阈值与 80 分高匹配阈值是否对应真实转化；
- 产品结构化事实对候选质量和销售接受度的实际提升；
- 下级渠道主动开发是否能提高已有分销商市场的增长；
- 销售团队可接受的任务耗时、候选数量、复核工作量和 Provider 成本。

---

# 附录 A：主要配置

| 配置 | 默认 / 用途 |
|---|---|
| `LEAD_WORKFLOW_EXECUTION_MODE` | `inline`；部署 worker 后切换 |
| `LEAD_PLANNER_*` | Lingyu Market Playbook 模型与网关 |
| `TAVILY_API_KEY` | 候选发现与官网证据搜索 |
| `EMBEDDING_*` | Qwen text-embedding-v4 |
| `DEEPSEEK_MODEL` | routine Flash |
| `DEEPSEEK_ESCALATION_MODEL` | conflict Pro |
| `CONTACT_LOOKUP_ENABLED` | 默认 `false` |
| `CONTACT_LOOKUP_PROVIDER` | 默认 `snov`，仅在启用时生效 |
| `DATABASE_URL` | 受限应用登录 |
| `DATABASE_MIGRATION_URL` | RDS owner/migrator 登录 |

# 附录 B：关联文档

- 原始基线：`Network_Channel_Copilot_PRD_v0.3.md`
- 架构：`docs/ARCHITECTURE.md`
- LangGraph 工作流：`docs/LANGGRAPH_LEAD_WORKFLOW.md`
- RAG：`docs/RAG_KNOWLEDGE_BASE.md`
- 邮箱：`docs/MAILBOX_INTEGRATION.md`
- 联系方式验证：`docs/CONTACT_VERIFICATION_AGENT.md`
- v0.3 验收记录：`docs/PRD_ACCEPTANCE.md`
