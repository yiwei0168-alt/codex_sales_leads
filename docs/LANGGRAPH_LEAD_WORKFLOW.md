# LangChain / LangGraph 销售线索工作流

2026-09-13阶段47：手工添加不进入付费发现/评分；响应record.country使用规范country code，与重新读取国家记录一致，marketCode把名称映射产生的UK也归一GB。真实表单保存后图立即更新，重复输入复用已有国家候选，仍待核实。22组浏览器与812测试/build通过；无schema迁移，回滚代码不改变已存记录。

2026-09-13阶段46：公司详情账户等级选择接入已有updateCompanyState→国家user_overrides→company-classification个人记忆，不增加模型路径。Distributor/VAD层展示分销商等级，其他层展示KA/Priority/Standard/Long-tail，与后端兼容校验一致。真实UI/API/SQL验证角色/等级/路径和国家隔离，812测试及生产build通过。无schema变化，回滚仅移除新增选择器；用户已保存修改继续保留。

2026-09-13阶段45：任务预算公司费用已通过真实Chrome桌面/手机、API与SQL接线检查，五口径及覆盖率、当前任务域名/国家关联、刷新不重复显示通过。只使用合成预留，不执行图或供应商调用；真实图结果保存仍需验收。[范围和复现](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段44：discoverLeadCandidates首轮空输出与后续轮一致返回DiscoveryResult（run、credits、callMetrics、session和processedCompanyKeys），不再在轮汇总后抛“无可用候选”通用异常。graph继续用新鲜成功调用/故障和连续无新增计数判断停止，空集合走正常结果持久化及任务费用完成。BudgetDeniedError等真实异常继续抛出并保留失败run。812测试/build/生成check通过；无schema、阈值或搜索范围变化，无付费。

2026-09-13阶段43：任务预算读取公司当前成本投影；每条paid_call_reservation只参与一次，reservation/occupied/estimate/provider-report/invoice分别累计已知值及覆盖率。共享分摊读取完成集合，未完成/旧归属缺失独立保留；因此完成前已有观测可当前展示，不改历史。域名/国家只关联当前用户任务搜索结果。GET无写入，无schema迁移；新增兼容字段companyCosts，回滚可忽略。808测试、真实SQL守恒/重复读取/隔离验证及生产构建通过，真实浏览器/业务仍未验收。

2026-09-13阶段42：新工作流初始化processedCompanyKeys=[]；发现返回门禁通过与拒绝公司按国家生成的键，图跨轮去重累计，缓存结果也计入实际处理。旧检查点或适配器缺失集合时沿途保持undefined，不能以零或最后一批替代。公共调用默认task-shared，直接公司调用覆盖归属；persist_results在同一结果事务调用completeTaskCostAllocation，保存task-cost-completion-v1与独立预留分摊，失败随事务回滚，重试幂等。后到费用观测读取存储集合；原观测不重写、金额不变。无schema迁移，回滚代码可忽略新增metadata/可选字段，不删除历史记录。805测试、生产build及真实SQL合成验证通过；当前成本投影/UI与真实闭环继续验收。

2026-09-13阶段41状态整理：流程实现与验收出口统一由[当前矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)逐项维护；阶段25–40原始状态另存历史。本文下方历史待办不覆盖当前O01–O05实现证据。本阶段没有流程代码变更，真实业务闭环、完整恢复及遥测仍按矩阵继续；Gemini缺完整费用上界保持发送前拒绝。

2026-09-13阶段40：SearchAPI仅Google/Bing第一页GET按USD0.008保守预留；Google固定num=10、Bing最多20，禁止隐式付费分页与其他引擎。输入范围不扩大，发现会话契约v4-searchapi-google-limit使旧任务停止静默恢复。802测试/build通过，无真实调用；预留不等于账单，Gemini/OpenRouter等仍需独立完整上界。

2026-09-13阶段39：Places Text Search现有字段触发Enterprise，预留USD0.035；budgetedFetch将实际Headers传入费用契约，限制FieldMask为当前7字段子集，其他能力、分页和通配符阻止。请求内容及搜索策略不变。800测试/build通过，头部仅内存校验、不持久化密钥；真实账单未核销，不新增业务调用。

2026-09-13阶段38：Exa auto/company/text请求按最多20结果保守预留USD0.027；官方不支持company的excludeDomains，因此从发送体移除，保持原查询和本地候选排除。完整请求白名单禁止深度、摘要、子页与合成输出。发现契约升级v3-exa-company-contract，旧会话不匹配则停止，不重置费用。798测试/build通过，无付费；costDollars仍是估算，不能冒充核验账单。

2026-09-13阶段37：发现使用的Brave普通GET Web Search及补证/校正使用的Tavily POST Search获得窄范围保守预留规则；完整方法、端点、字段及有效期检查在发送前执行。Brave预留USD0.005，Tavily basic/advanced均预留USD0.016，Tavily显式关闭auto_parameters。缺失账单仍未知，其他搜索/模型入口不得复用这两项规则。796测试、typecheck/build通过；[官方依据及限制](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。

2026-09-13阶段36（B26/P06）：请求生成后、批次/缓存计算前，超限单公司可将相同的长标题/摘录转为exact-duplicate-text-v1字典引用。模型指令要求还原精确文本；每项证据ID、URL、来源和原事实引用独立保留，相同文本不构成独立佐证或同一公司证明。只采用更小请求，原始证据不变；非单项和未超限请求保持原形式。主/备用字节检查继续执行，压缩后仍超限保持暂停。795测试及生产构建通过，无模型调用；独有事实过大的分阶段处理仍待完成。

2026-09-13阶段35（B26/P06）：批次规划接受AiProvider.requestBytes；DeepSeek及兼容适配器复用各自发送序列化器，Resilient路由按请求数据权限、routine/escalation模型映射取所有获准路由的最大真实字节数，提前拆开多公司请求。临时熔断不影响拆批和缓存契约。实际发送前仍检查完整请求上限；最多5项不变；单家公司仍超限时暂停，不输出业务拒绝。792测试和生产构建通过，未做付费请求。后续需完成单项结构化压缩/分阶段处理及跨进程完整接线验收。

2026-09-13阶段34（D13/O05）：评分请求按校正后的具体主角色选择已有政策评分卡，并附13种角色专属可观察证据示例。SI设计/选型影响力、MSP持续运维、Reseller转售履约等分别判断，不借用其他子类型的采购权，也不增加资格门槛。family与subtype混用、校正失败及主角色未定在付费前保留未完成结果；有效项正常评分，缓存契约按同一有效批次生成。提示升级为five-paths v7 / score-only v10，原权重、确定性证据上限与标准保持。791测试及生产构建通过；374条冻结校正记录仅做契约回放，无新搜索或语义评审。

## 目标与边界

主产品已由 LangChain 模型适配层和 LangGraph `StateGraph` 编排。线索目标是识别有开发价值、与 Cudy 产品和渠道策略匹配的公司，不把联系人或联系方式作为候选资格条件。

渠道角色覆盖原始 PRD 的完整集合：`Distributor`、`VAD`、`VAR`、`Dealer`、`Reseller`、`Retailer`、`E-tailer`、`SI`、`Installer`、`MSP`、`ISP`。同一公司可以拥有多个角色；`KA` 只属于 Account Tier。最终数量按全局匹配分排序，不设置角色固定配额。非渠道型战略终端客户不混入这套评分，未来使用独立 lead type 和评分图。

## 两层图编排

```text
Assistant StateGraph
  interpret_request → resolve_request
      ├─ knowledge question → tenant RAG → cited answer
      └─ lead request → proposed action → explicit confirmation
                                           ↓
Lead StateGraph (PostgreSQL checkpoint)
  retrieve_knowledge
    → build_playbook
    → discover_candidates
    → collect_evidence
    → correct_candidates
    → score_candidates
    → review_assessment_anomalies
    → assemble_handoff_briefs
    → persist_results

Outreach StateGraph
  load_candidate_context
    → build_development_strategy
    → draft_email_from_restricted_handoff
    → validate_and_persist
```

对话、消息和 action 是助手层的持久状态；长耗时线索图使用 `langgraph` PostgreSQL schema 的 checkpoint。失败时 checkpoint、候选评估审计和错误消息均保留，界面允许从同一 thread 重试。

## 搜索前 RAG 硬门

外部搜索前必须同时获得产品、Cudy 公司和行业三个知识域。任何一个缺失，图都会 fail closed，不调用 Tavily。产品上下文还必须得到至少两类独立检索信号的交叉印证。

产品 RAG 使用三路融合：

1. pgvector HNSW 语义相似度；
2. PostgreSQL GIN 全文检索；
3. `product_catalog` + `product_fact` 结构化事实检索。

`product_fact` 保存型号、事实组、事实键、规范值、数值/单位、原始来源、证据摘录、权威等级、抽取版本、校验状态和 SHA-256。当前 3,054 条事实由产品清单确定性抽取，状态为 `verified`；未来人工或多来源导入可使用 `provisional` / `conflicting`。冲突事实不允许自动作为确定结论。

融合结果为每个文本块记录 `vector`、`keyword`、`structured` 信号、结构化命中和 `corroborated`。产品答案如只被单路语义检索命中，会降级为未充分 grounded 并显示警告。Market Playbook 只能把经过交叉印证的产品事实用作产品卖点。

## 模型与工具

| 阶段 | 默认实现 | 限制 |
|---|---|---|
| Market Playbook | LangChain `ChatOpenAI`，OpenRouter 网关 | 固定 `openai/*` 模型、temperature 0、严格 Zod structured output、90 秒超时、确定性安全降级 |
| 候选发现/官网证据 | Tavily | 只在确认后调用；域名去重；候选必须输出官网 URL |
| 补证与纠错 | DeepSeek Flash/Pro + Tavily 定向补证 | 输出原子 `finding → evidenceIds` 事实账本；缺证为 unknown；不负责评分 |
| 例行资格评分 | DeepSeek v4 Flash | 不接收 Tavily score/排序；严格 JSON Schema；失败不发布 |
| 主评冲突升级 | DeepSeek v4 Pro | 低置信、冲突、规范化后异常或 schema 问题才升级 |
| 盲独立复评 | GPT-5.6 Terra（可配置） | 只处理异常/边界样本；读取同一冻结事实账本但看不到主评分 |
| 分歧裁决 | GPT-5.6 Sol（可配置） | 只在 gate 或分数出现实质分歧时调用；可要求定向补证，不允许创造事实 |
| Handoff Assembler | 确定性 TypeScript | 分离外部事实与内部推断，校验引用并限制在 4 KB 内 |
| 开发策略 | Kimi | 读取完整 handoff、Cudy 知识和内部推断，只输出内部策略 |
| 开发邮件 | Kimi | 只读取获准对外事实、`doNotClaim`、批准策略和 Cudy 知识；使用 fact-level 引用 |

五个维度总计 100 分：产品与使用场景 44、合作路径与采购影响力 32、证据与实体置信度 20、角色识别 3、通道分类 1。只有纠正身份可用、公司存在、目标国家经营、active networking 相关和独立候选五个 gate 均为 `supported` 才具备资格；`unknown`、`not-supported` 和 `conflicting` 均不会被伪装成通过。模型总分不被信任，服务端从受限维度值重算。

异常路由包括硬门槛非 supported、40–60 分、入榜边界、低置信度、身份或路由变化、证据冲突、高分但证据稀疏以及 5% 确定性随机审计。没有触发条件的样本不会增加复评成本。

## 执行模式

- 当前只有阿里云 RDS，因此默认 `LEAD_WORKFLOW_EXECUTION_MODE=inline`，无需额外计算服务。
- 代码已提供数据库 job、租约、重试和 `npm run leads:worker`。部署 ECS 或其他长期 Node 容器后可切换为 `worker`；页面每四秒轮询状态。
- worker 租约为两小时，过期 job 可被安全重新 claim；最多尝试 20 次。

## 联系方式平台接口

联系方式查询位于资格评估之后，与公司匹配评分完全分离。统一接口为：

```text
POST /api/contact-enrichment/lookup
{ "externalId": "..." }
# 或直接使用产品输出的公司 URL：
{ "websiteUrl": "https://example.com/" }
```

接口会先验证公司属于当前用户 workspace，再调用 `ContactLookupProvider`。默认 `CONTACT_LOOKUP_ENABLED=false`；配置 Snov.io 后使用公司官网域名查询。未启用时返回明确的 503，不伪造联系人。

## 运维与验收

```powershell
npm run db:migrate
npm run products:ingest
npm run products:verify
npm run leads:verify-workflow
npm run leads:verify-models
npm run outreach:verify
npm run typecheck
npm run lint
npm test
npm run build
```

`products:verify` 会验证产品/事实数量、四个检索索引和真实三路融合结果；`leads:verify-workflow` 在 RDS 上验证 checkpoint、评分治理列和强制 RLS；`leads:verify-models` 发送不持久化的最小请求，覆盖 OpenRouter 上的 OpenAI planner/reviewer、DeepSeek 主评；`outreach:verify` 验证 Kimi 策略/初始邮件与 OpenRouter Claude 修订、引用和持久化。OpenRouter 请求强制使用 `https://openrouter.ai/api/v1`、`provider.require_parameters=true` 与 `data_collection=deny`，并记录网关返回的 token 和现金成本。2026-08-28 的实测中，拆分后的 Kimi 两次调用约耗时 214 秒，因此生产上应异步执行；在代表性评测证明不降质前不为了延迟重新合并两个权限不同的节点。
