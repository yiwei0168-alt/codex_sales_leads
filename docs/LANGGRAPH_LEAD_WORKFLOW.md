# LangChain / LangGraph 销售线索工作流

2026-09-13阶段77 / A05费用状态：预算API/UI补齐3个人民币模型核验期限、ECB参考日期/取得时间/72h截止；复用实际费率期限/外币校验逻辑，缺失/读取故障保留unknown且不影响预算读取，不触发外部刷新/不延长期限。生产Chrome两视口54组与真实API对账通过，849测试/187files、build含类型检查、局部lint/生成check通过。fixture清理，0付费/发信，页面读取不计采用；无费率/路由/schema变更。过期/故障为确定性测试，未人为改生产数据；模型搜索费率刷新/确认、真实业务仍缺，S01待确认，goal active。3017新build session68580。

2026-09-13阶段76 / A05：inline的Kimi中国文本/北京Embedding报价接入现有共享ECB刷新，避免仅worker才刷新；每日/失败退避、有效缓存回退、72h/5%不变。845测试、build含类型检查、局部lint/生成check及两类真实默认报价SQL验证通过，本次公共HTTP/新增刷新观测均0，模型/付费/发信0。详见[Inline汇率刷新](INLINE_FX_REFRESH_2026-09-13.md)。不改费率/路由/schema，模型搜索费率刷新和变更确认仍缺；S01待确认，goal active。3017新build session44971，Chrome52组沿用阶段73。

2026-09-13阶段75 / A06、A12：修复保存已提交而completed状态写入失败时，保存节点新时间戳导致指纹误冲突。新记录result-input-v2仅排除本保存节点起止时间，业务/费用/其他观测仍严格比较，原保存事件不重复；旧版本维持原契约。840测试、build含类型检查、局部lint、两国真实SQL并发及时间变化重试通过，23微美元合成预留保留，fixture清理，0真实付费/发信。详见[恢复身份报告](PERSISTENCE_RETRY_IDENTITY_2026-09-13.md)。旧终结缺项完整恢复、失败尝试完整遥测仍缺；S01待确认，goal active。3017已重启新build，session62806；Chrome52组沿用阶段73。

2026-09-13阶段74 / A12恢复费用门禁：实际确认入队→按本验收action认领→产品执行器，reserved、unknown、unknown重复恢复三次均拒绝paid-request-already-recorded；检查点ID/全部values/next与原费用行保持一致，job/action失败状态及租约释放正确。1笔7微美元合成预留保持占用，task预算等于已占用、无新增余额；0供应商调用/发信/采用事件，fixture清理。首次设置预算0被不低于占用规则正确拒绝，修正验收预算7后通过；无产品代码变更。typecheck/局部lint通过，52组Chrome与838测试/build沿用阶段73/71；仍缺恢复后真实模型执行及其他完整故障链。S01待确认，goal active。

2026-09-13阶段73 / A21可控暂停：Chrome两视口52组通过，实际页面POST pause→产品executeClaimedLeadWorkflow下一节点阶段门禁→failJob写cancelled/paused_at→页面恢复按钮；待校正/待评分1/1与13合成额度保留。隔离inline任务预建运行态/一天租约，额外task预算0；未启动worker或确认恢复，没有模型/API/token/真实费用/发信，fixture清理。仅验收脚本变化，typecheck/局部lint/生成check通过；838测试/build沿用阶段71。此项不验证在途付费调用中断或恢复后模型执行，S01仍待确认，goal active。

2026-09-13阶段72 / A11费用证据：OpenAI新核查页面明确输入/缓存读/写按类别而非相加。形成[S01市场计划仅OpenAI标准路由方案](SOL_ROUTING_PROPOSAL_2026-09-13.md)，公开端点实抓复算上界10.622880，待用户确认路由变化；现行27.345252上界/路由未改，不视为实施。只读预算12.324404/30、余17.675596，整次运行上界仍unknown；0推理/token/付费/job认领。优化机会是经确认缩小路由与精确契约，不把单次可容纳当真实闭环通过；goal active。

2026-09-13阶段71 / A21费率期限：预算API/页面公开8条静态上界的有效截止与核验窗口，和quoteRequest共用七天/促销期限判断；动态模型/FX与预算/暂停另验，期限内不代表可付费。Chrome两视口50组通过当前接口/页面/刷新对账，过期边界以确定性测试验证，未修改时钟或真实费率。838测试/build/typecheck/局部lint/生成check通过，fixture清理；0模型/API/token/真实费用/发信，页面读取不计采用。自动刷新及变更确认仍缺，无新规则，goal active；3017服务session46393。

2026-09-13阶段70 / A21批准采用观测：草稿行锁内相同批准不增版本/事件，改正文后明确再批准记录新版本，仅保存正文撤回批准；页面编辑后可再批准。实际Chrome两视口48组验证页面→PATCH→SQL、并发幂等和国家版本归属，2合成草稿/4批准版本事件，0真实费用/发信，发送仍unknown。836测试/build/局部lint通过，fixture清理；无新规则/迁移。边界及服务重启失败记录见[DRAFT_APPROVAL_OBSERVATION](DRAFT_APPROVAL_OBSERVATION_2026-09-13.md)，其他采用链和真实业务仍待，goal active。

2026-09-13阶段69 / B25、A21恢复身份：runLeadWorkflow在用户/action检查后比对原计划完整JSON身份，再决定恢复或复用结果；缺失或变化拒绝，原检查点不改写。两进程Postgres验证国家/目标变化拒绝且0节点执行，原计划恢复仅评分1次、校正重放0、100证据/13合成额度保留；业务保存仍合成适配器。836测试/局部lint通过，0真实调用/费用，用户采用与真实延迟未知。无新规则，历史终结缺项合并恢复仍缺，不能从此项推断O01完成。

2026-09-13阶段68 / A21策略复用验收：实际persistDevelopmentDraft/updateDevelopmentDraft→鉴权GET→Chrome，桌面/手机累计46组通过。人工正文与approved/revision2保留，重开不生成，记忆变化提示changed、旧版本缺失legacy-unknown、MX不返回GB草稿。2合成草稿/2人工修改，模型/API/token/真实费用/发信0，复用不计新生成或用户采用；fixture清理。仅验收脚本变更，typecheck/局部lint/生成check通过，产品build及835测试沿用阶段67；3017当前服务session21323。真实生成和全链路仍待，无新规则，goal active。

2026-09-13阶段67 / A21跟进上下文验收：修复对象地址字符串误匹配，递归祖先增加工作区边界。实际加密正文→应用SQL验证收件人、用户/国家/工作区隔离、风格作用域与往来筛选、重复读不变；835测试/build/局部lint通过。7合成发送记录/2导入/4记忆，首个上下文使用各1条祖先/来信/记忆；0真实API/token/费用/发信，用户采用和模型延迟未知。fixture清理失败修正后已全部清理，详见[FOLLOW_UP_CONTEXT_ACCEPTANCE](FOLLOW_UP_CONTEXT_ACCEPTANCE_2026-09-13.md)。无新规则，策略UI复用及真实跟进生成仍待，goal active。

2026-09-13阶段66：persist_results在原run行锁内比对完整JSON输入SHA256身份，首次事务保存身份；同输入返回原计数，冲突或历史无身份在任何写入前拒绝。对象键序规范化，数组顺序保留；不重新调用上游或改写历史。实际SQL两国并发及冲突/旧记录验证通过；历史缺项恢复仍待。

2026-09-13阶段65：TaskRunControls将既有readWorkflowCheckpointProgress的pendingCorrection/pendingScoring公开为候选项计数；按阶段展示，不推导唯一公司总量。任务刷新重新挂载读取控制，失败清除旧数、成功撤销错误，缺失unknown。真实Postgres检查点与Chrome两视口44组验证通过，无图节点运行；真实业务生成链路仍待。

2026-09-13阶段64：任务页缺口按已记录保存数计算，不再仅completed可见；未知不推断0，失败/处理未完成不因此开启续搜。九类合成持久结果经实际生产Chrome两视口验证目标、阶段数量、停止原因与刷新，原页面回归共42组通过；832测试/build通过。当前页面仍未投影检查点待校正/待评分数量，真实业务生成到页面另验。

2026-09-13阶段63：persist_results实际应用SQL链路首次以完整合成评估/当前证据验证，修复freshness_days参数在整数列/文本interval间类型冲突。现显式integer乘day interval；两国并发幂等、公司国家记录、证据、成本分摊和事件完成验证。未调用模型或搜索，原文来源及费用未知状态保留，整条真实业务仍待验收。

2026-09-13阶段62：persist_results的版本化事件记录saved及delivery-selected，明确系统交付；页面查看/用户采用未知，不再自动发displayed/selected事件。当前有效校正按完成契约计数。v2观测在结果事务内唯一关联，重复复用、冲突拒绝，国家与用户归属保留；迁移054扩展约束已验证应用，旧事件不重写。实际SQL与832测试通过，UI采用链路仍需单独验收。

2026-09-13阶段61：字段表请求预检后，校正完成的图检查点可在新进程恢复到评分；实际PostgresSaver保存100原文和准备metadata，owner/action隔离、国家/证据改变请求身份通过。先前13合成额度未重置，校正重放0次。仅验证脚本新增，生产代码c56be92不变；真实模型和公司持久化继续单独验收。

2026-09-13阶段60：校正/评分请求构造在重复文本字典不足时尝试证据/事实字段表，保留所有值并测量完整主/备用发送体，按更小表示生成精确缓存身份。仍超限在评分前保存阶段进度并暂停；合成内存图已验不重搜/补证。成功模型调用的准备方式、前后字节及条数进入阶段metadata，不计为用户采用或真实token节省。见[P06验证范围](P06_STRUCTURED_SINGLETON_2026-09-13.md)。

2026-09-13阶段59：市场计划实际Sol两消息纯文本strict schema请求由静态v1.6.0严格校验，4096总输出、61440字节及标准层限定；全上下文输入/缓存各项相加上界USD27.345252。只读预检区分“费率已核验”和“单次预留能否容纳”，当前余额17.675596不足，避免在已知后续必被预算阻止时启动前置付费。未改变模型/路由/搜索策略，828测试与build通过，真实流程尚未验收。

2026-09-13阶段58：A20当前OpenRouter账号/工作区无BYOK、仅credits已再次确认，不再等待该前提。现有产品全量826测试与build/生成check通过，依赖审计双范围0漏洞、lint0错误。市场计划缺完整费率仍阻止真实闭环，继续收敛请求与价格边界，不换模型或路由。

2026-09-13阶段57 / A21采用遥测：续搜创建记录1个有效新提案，重复复用记录0新输出，不再每次点击累计下游使用；两者执行计数0、userAdoptedItems=null，保留输入/耗时/重复原因/费用0。5项相关测试、typecheck、生成check及真实SQL通过：两次调用仅1新提案，无执行job，父结果不变且RLS通过。verify-search-continuation.ts改为临时隔离账号，全部schema/fixture事务回滚，无付费。历史终态缺项恢复仍待完成，BYOK确认尚未收到，goal active。

2026-09-13阶段56：实际LangChain市场计划请求离线捕获，7个顶层字段、2纯文本消息、strict JSON Schema、4096输出和既有provider参数，无工具/插件/特殊层；模拟门禁后仅1次传输捕获，0真实推理。typecheck通过。只读key元数据证实非管理key，不能据此推定未配置BYOK，已询问用户工作区状态；不索取密钥。详见[费用核验补证](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)。产品未改，无新增规则，goal active。

2026-09-13阶段55：市场计划Sol费用上界新增[公开端点及路由核验](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)。当前默认层不包含flex/priority；标准端点差价、长上下文与缓存、账号计费仍须完整收敛，缺失时继续门禁，未启动真实工作流。

2026-09-13阶段54：新增最小闭环只读预检脚本，当前目标1首池2，预算仍12.324404/30；市场计划实际openai/gpt-5.6-sol缺完整费率，未启动已知会中断的前置付费。仅验证5个入口费率可用性，不是整次费用上界；无调用/账号修改/任务认领，typecheck通过。详见[预检结果与下一必要工作](MINIMAL_PRODUCTION_PREFLIGHT_2026-09-13.md)。无新产品规则，goal active。

2026-09-13阶段53：搜索传输边界到SQL账本防重放已实际验证，未知与已成功搜索的重复调用不进入传输层，operation隔离通过。此证据不包括整个发现图跨进程恢复；真实最小闭环仍待验收。

2026-09-13阶段52：发现阶段轮内检查点之外补齐同步搜索付费身份；响应或检查点丢失后，同用户/任务/阶段的相同请求由既有账本拒绝未知或已成功付费重放。已核验五类搜索生效，模型指纹和未核验入口门禁保持现有契约。825测试/build通过；真实SQL搜索恢复尚未据此完成。

2026-09-13阶段48验收：证据列表和弹窗对两年前合成来源显示提醒且继续允许查看，不触发搜索/评分。私有开发知识查询使用固定合成向量对真实SQL过滤与RLS验证通过；没有生成embedding或修改流程。通用RAG/邮件知识和真实业务仍继续验收，范围详见生产页面报告。

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
