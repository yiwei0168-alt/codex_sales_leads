# PRD v0.3 Acceptance Report

阶段129：P06共享短语编码的完整评分Agent在真实图/PostgreSQL两进程恢复后只执行一次模拟评分，101证据/105事实、原合成额度和请求准备metadata保留，国家/证据变更导致缓存身份变化；夹具最终合格0，模拟保存不等于产品SQL。970项测试、类型检查和生产构建通过，0真实付费；真实模型、账单及A11仍缺。[报告](P06_SHARED_PHRASE_CROSS_PROCESS_ACCEPTANCE_2026-09-14.md)。

阶段128：完整评分 Agent 对101证据/105事实的合成单公司请求使用无损共享短语字典，通过61,440字节发送体预检，逐项反解与缓存身份一致；151证据/155事实不可压缩时模型调用前暂停。970项测试/203文件、类型检查、构建、lint和依赖审计通过，0真实付费；真实模型结构遵从及跨进程业务结果保存仍待验收，P06及整体验收未完成。[报告](P06_SHARED_PHRASE_SINGLETON_ACCEPTANCE_2026-09-14.md)。

阶段127：会话表强制RLS只允许拥有者插入，令牌解析与撤销收进限权数据库函数；SQL越权、过期/停用/撤销拒绝及本地生产HTTP登录/登出5组、Chrome两视口66组通过。迁移001–065重复执行、969项测试/203文件、类型检查、构建、lint及依赖审计通过，0付费/发信。目录过滤口径无RLS表为0，仍不等于全私有路径验收；A11真实业务未通过。[报告](SESSION_TOKEN_BOUNDARY_ACCEPTANCE_2026-09-14.md)。

阶段126：工作区主表加拥有者RLS；产品读取、账号初始化及旧运维定位入口带租户上下文。双账号跨户隔离、真实随机账号初始化、969项测试/203文件、类型检查、构建、lint、迁移001–064重复执行、依赖审计和本地生产Chrome桌面/手机66组通过；0实际付费/发信。目录审计尚余会话表，A11真实业务闭环未验收。[报告](MARKET_WORKSPACE_TENANT_RLS_ACCEPTANCE_2026-09-14.md)。

阶段125：工作区公司关联加拥有者RLS；旧墨西哥发现、线索报告及联系人发布回滚脚本改为明确拥有者上下文。双账号手动添加与跨户读写/插入拒绝、969项测试/203文件、类型检查、构建、lint、依赖审计、迁移001–063重复执行和本地生产Chrome桌面/手机66组通过；0真实付费/发信。会话及工作区两张表与A11真实业务仍待验收。[报告](WORKSPACE_COMPANY_TENANT_RLS_ACCEPTANCE_2026-09-14.md)。

阶段124：工作区审计事件加拥有者及操作者RLS，模式修改改用租户事务。双用户真实SQL隔离、跨户插入/冒名拒绝、迁移001–062重复执行、969项测试/203文件、类型检查、构建、lint及依赖审计通过；隔离账号本地生产Chrome桌面/手机66组通过，0实际付费/发信。其余3张带拥有者字段表及A11真实业务闭环未验收。[报告](WORKSPACE_AUDIT_TENANT_RLS_ACCEPTANCE_2026-09-14.md)。

阶段123：联系人补全和核验的9张产物表已加拥有者RLS，产品CLI与最新运行API带租户上下文。两用户隔离合成SQL、缓存复用、联系人最新运行匿名/双账号生产HTTP三组、迁移001–061重复执行、969项测试/203文件、类型检查、构建和本地生产Chrome桌面/手机66组通过；实际付费/发信0。其余4张拥有者字段表及A11真实业务闭环未验收。[报告](CONTACT_ARTIFACT_TENANT_RLS_ACCEPTANCE_2026-09-14.md)。

阶段120：对话任务卡曾将零结果/部分结果一律标“已完成”；现与详情页一致，按最终保存数显示达标、未填满或历史数量未知。本地生产隔离账号 Chrome 两视口66组、968项测试、类型检查和构建通过；不等于真实业务任务达到目标。[报告](SEARCH_TASK_STATUS_LABEL_PRODUCTION_UI_2026-09-14.md)。

阶段119：实际产品 SQL 接收零候选/零合格的隔离合成运行，两次并发保存返回相同的0交付，目标缺口1由上游任务状态负责解释；5 micro-USD 合成共享预留无公司可分摊、继续占用且未核销。此为 A04/O03 的存储边界验证，不代表真实市场已耗尽或 A11 已通过。[证据](ZERO_QUALIFIED_RESULT_PERSISTENCE_2026-09-14.md)。

阶段118：P06完整评分 Agent 合成边界新增60条独有证据/事实可无损表化、100条仍超界停在模型前两例；967项测试/203文件通过。真实模型输出遵从和超大单公司分阶段方案仍未验收。[证据](P06_FULL_SCORING_AGENT_SINGLETON_BOUNDARY_2026-09-14.md)。

阶段117：SearchAPI当前账号只读用量接口未给出可唯一核定价格/速度档的合同信息；SearchAPI保持费用阻止，真实业务与账单验收未完成。[证据](SEARCHAPI_ACCOUNT_READONLY_CHECK_2026-09-14.md)。

阶段116：SearchAPI 公开参考费率不再让未核实账号合同的产品请求获准；合成产品传输在预留/外发前拒绝，965项测试/203文件及生产构建通过。账号条款证据和真实业务仍缺。[报告](SEARCHAPI_ACCOUNT_BOUND_HOLD_2026-09-14.md)。

阶段115：发现阶段对费率缺失和预算耗尽的合成拒绝回归通过，不将阻止误记为搜索耗尽或供应商故障；真实任务页面与账本完整链仍待验收。[证据](DISCOVERY_BUDGET_DENIAL_STATUS_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段114：Exa条件发现与Tavily官方/校正补证共3条生产提供方合成请求通过严格费用合同，160/292/259字节、静态USD0.027/0.016/0.016上界，0真实调用及预算变更。[报告](MINIMAL_ACCEPTANCE_EXA_TAVILY_WIRES_2026-09-14.md)。实际请求/返回与完整运行上界仍未知，A11未验收。

2026-09-14阶段113：最小路径核心Brave请求通过生产提供方合成传输与严格费用合同预检：GET查询127字节、count2、CO回退country=ALL、USD0.005/次，0真实外发/费用；实际市场查询、候选国家证据及完整路径未验收。[报告](MINIMAL_ACCEPTANCE_BRAVE_WIRE_2026-09-14.md)。

2026-09-14阶段112：最小真实闭环只读预检扩大为当前策略的8项模型阶段、4条发现路由及Tavily补证；当前核心Brave有静态上界，但SearchAPI/Gemini、条件Terra与Sol裁决仍缺可执行完整合同，现行Sol市场计划上界超余额。脚本运行、预算不变、typecheck/脚本lint通过，0付费/认领。[路径覆盖](MINIMAL_ACCEPTANCE_ROUTE_COVERAGE_2026-09-14.md)。S01待确认，`actualRequestContractsChecked=false`、整次上界未知，A11未验收。

2026-09-14阶段111：修正 Sol、DeepSeek 与四个同步搜索来源的公开费率刷新观测：待审页不计有效，旧暂停未人工解除时，即使新页价格一致也不计下游使用；保留 hold、历史数据和费用。962测试/202文件、typecheck、build、lint0错误通过，0真实供应商调用。[报告](PUBLIC_RATE_HOLD_USAGE_ACCOUNTING_2026-09-14.md)。Places 人工复核、其他费率合同及 A11 闭环仍缺。

2026-09-14阶段110：Exa/Google Places 两条公开价只读复核与迁移059接入，Exa validated、Places 因265字节官方短页保持 review-required/hold=true，其他费率及付费历史不变。962测试/202文件、build、lint0错误、真实SQL与本地生产桌面/手机64组通过，0真实付费/发信。[报告](EXA_PLACES_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。SearchAPI 完整上界、Places 人工复核、其他模型、A11闭环仍缺。

2026-09-14阶段109：评分成功响应已记账而缓存/图节点均未保存输出时，恢复会按原检查点时间与公司归属拦截新的付费评分。真实PostgreSQL两进程合成回归两次恢复均拦截，合成预留7/报告5 micro-USD、占用7保持，新增预留0、真实模型/搜索/邮件0；已有有效缓存可直接复用。956测试/202文件、typecheck、build、lint0错误。[报告](UNCHECKPOINTED_SCORE_RECOVERY_GUARD_2026-09-14.md)。这只解决重复付费风险，不能重建丢失评分；A06完整真实业务与A11仍待验收。

2026-09-14阶段108：Brave/Tavily现行Search上界接官方公开费率每日只读复核；迁移058在真实PostgreSQL重复应用、两个来源validated/hold=false、预算与付费历史不变。954测试/202文件、build、lint0错误/audit0高危、本地生产桌面/手机64组通过，fixture清理，0真实付费/发信。[报告](SEARCH_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。其他费率/变更确认、S01及A11仍缺。

2026-09-14阶段107：DeepSeek Flash/Pro共用官方价格页每日只读复核，迁移057追加快照及漂移粘性暂停经真实PostgreSQL验证；当前两条 `validated`，并发最多1 GET、缓存重复0，预算/付费历史不变。935测试/200文件、build、lint0错误/audit0高危和本地生产桌面/手机62组通过，fixture清理，0真实付费/发信。[报告](DEEPSEEK_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。其余来源/变更确认、S01及A11真实闭环仍缺。

2026-09-14阶段106：评分批次缓存保存失败或缺精确可复用合同后，后续未启动批次与同批缺项修复暂缓，已完成项/待恢复项进入图检查点；真实PostgreSQL三进程合成任务只补缺项、保留13合成额度。917测试/198文件、typecheck、build、lint0错误和生产依赖审计0高危通过，0真实付费/发信。[报告](ASSESSMENT_BATCH_PERSISTENCE_STOP_2026-09-14.md)。首批响应到持久检查点的窗口、供应商账单和A11真实闭环仍未完成。

2026-09-14阶段105：评分缓存读故障先停评分、可选写故障保留完整评分节点检查点，真实PostgreSQL四进程合成任务恢复不重评、原13合成额度保留。911测试/198文件、typecheck、生产构建和lint通过，0真实付费/发信。[证据](ASSESSMENT_CACHE_FAULT_RECOVERY_2026-09-14.md)。批内中断、真实供应商核销及A11闭环仍缺。

2026-09-14阶段104：现行 OpenRouter Sol 合同的七天公开只读复核、漂移暂停预留、追加快照及预算状态展示通过真实SQL、911测试/198文件、build和桌面/手机60组生产Chrome回归；0真实付费/发信。[报告](OPENROUTER_SOL_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。其他模型/搜索费率刷新、变更确认、S01和A11真实闭环仍缺。

阶段103费用验收状态：四个默认OpenRouter备用模型按当前8,192输出请求只读核查，公开可兼容端点数为2/1/12/9，DeepSeek价格已漂移，缓存价格字段不完整，仍由 `missing-tariff` 阻止；没有新费率准入、路由变更或付费调用。[端点缺口](OPENROUTER_DEFAULT_FALLBACK_GAP_AUDIT_2026-09-14.md)。阶段5完整费用合同、费率刷新及阶段8真实业务闭环仍未验收。

2026-09-14阶段102：最小闭环只读预检捕获合成市场计划实际SDK传输并核验合同；4,171字节/4,096输出符合现行规则，但单次上界USD27.345252超过最后余额USD17.675596，未启动真实业务。[报告](MINIMAL_ACCEPTANCE_PLAYBOOK_WIRE_PREFLIGHT_2026-09-14.md)。其余入口与整次预算仍缺。

2026-09-14阶段101：主角色缓存读取故障不再触发补证或模型重算，合成故障后可恢复处理同一候选；899测试/196文件、生产构建和局部lint通过，0真实付费。[报告](ROLE_CACHE_READ_FAILURE_GATE_2026-09-14.md)。实际任务恢复与A11业务闭环仍缺。

2026-09-14阶段100：修复市场计划可选缓存写失败造成已完成节点重跑的风险；真实PostgreSQL两进程检查点保留计划及原额度，恢复不重复生成。898测试/196文件、生产构建和生产依赖审计通过，0真实付费。[报告](PLAYBOOK_CACHE_WRITE_RECOVERY_2026-09-14.md)。A11真实业务闭环仍缺。

2026-09-14阶段99：Sol 分歧裁决公开端点只读审计验证12,000输出token对应 USD27.736500/次候选上界；现行合同仍仅4,096输出、费用门禁继续拦截，0付费。新合同确认、实际请求联测及完整真实业务闭环尚缺。[报告](OPENROUTER_SOL_JUDGE_PROPOSAL_2026-09-14.md)。

2026-09-14阶段98：隔离本地生产Chrome桌面/移动58组回归通过，新增用量API HTTP→数据库单条聚合与刷新幂等；0真实模型/搜索/发信，fixture清理。真实自然语言到结果入库闭环仍缺。[报告](WORKFLOW_USAGE_PRODUCTION_HTTP_2026-09-14.md)。

2026-09-14阶段97：用量API兼容扩展工作流阶段输入/有效/下游使用和模型token独立汇总，异常记录利用率未知、用户采用未知；隔离SQL合成聚合/跨用户隔离通过，fixture回滚，0付费。真实UI与真实业务记录仍待。[报告](WORKFLOW_USAGE_AGGREGATE_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段96：公开角色校正缓存 v3 防止同 URL/哈希/来源但标题不同的证据在跨轮次重绑时错用 ID；旧格式安全 miss，跨进程检查点无付费复验通过。真实模型与端到端入库仍待。[报告](ROLE_CORRECTION_CACHE_BINDING_V3_2026-09-14.md)。

2026-09-14阶段95：Terra 二次复核公开端点费用只读审计验证 USD11.019202 候选上界，相关字段与基线一致；不放行实际费率或路由，0付费。其他入口完整合同、实时预算与真实业务闭环仍待验收。[报告](OPENROUTER_TERRA_REVIEW_PROPOSAL_2026-09-14.md)。

2026-09-14阶段94：隔离真实SQL验收再评估合并：用户主角色/账户等级/开发阶段/行动优先，机器分数更新，冲突待重验，另一国家及用户隔离，私有记忆仍在；fixture已清理，0真实付费。真实模型与完整恢复仍待。[报告](USER_OVERRIDE_REASSESSMENT_SQL_2026-09-14.md)。

2026-09-14阶段93：助手混合问答拒绝 Gemini 明确未完成的部分引用答案，不重发已付费响应；893测试/195文件、类型检查、局部lint和生产构建通过，0真实调用。A13真实模型/UI全链仍缺。[报告](GEMINI_EXTERNAL_ANSWER_COMPLETION_2026-09-14.md)。

2026-09-14阶段92：Gemini发现实际请求显式限制12,000生成输出token，明确未完成响应不形成有效候选；服务端搜索次数费用上界仍缺，费用门禁保持拒绝。892测试/195文件及生产构建通过，0真实调用；A11仍待。[报告](GEMINI_DISCOVERY_OUTPUT_BOUND_2026-09-14.md)。

2026-09-14阶段91：离线复算条件复核预算上界；S01市场计划与Terra二次复核情景合计USD21.642082，高于最后核验剩余USD17.675596。当前无新增获准费率、模型路由或付费业务；A11仍需完整计划预检、S01确认及真实闭环。[预算情景](OPENROUTER_REVIEW_BUDGET_SCENARIO_2026-09-14.md)。

2026-09-14阶段90：OpenRouter六个默认复核/备用模型的52端点公开证据已冻结；备用角色校正补默认8192输出上限，截断状态不按成功处理。其余网关模型仍因无完整费率合同阻止，Sol裁决12000输出仍超现行4096合同。[费用审计](OPENROUTER_REMAINING_ROUTE_AUDIT_2026-09-14.md)。A11真实闭环与整体通过仍待。

2026-09-14阶段89：恢复中间检查点在生产执行器重新核验证据期限及公共文档版本；受影响公司撤销旧派生决策并回专用补证，已花费用保留。888测试/195文件、build、局部lint及隔离SQL恢复来源/预算通过，0真实付费。[阶段报告](RECOVERY_RESUME_DEPENDENCY_REVALIDATION_2026-09-14.md)。真实业务和其余依赖验收未完成。

2026-09-14阶段88：恢复链在任务详情展示已核实唯一保存、原目标、缺口、重复槽位及未完成任务；来源不一致显示无法核对。882测试/194文件、build、真实SQL及生产Chrome桌面/移动56组通过；合成记录清理，0付费/发信。[对账证据](RECOVERY_FAMILY_RECONCILIATION_2026-09-14.md)。长期恢复依赖与A11真实闭环继续验收，整体未完成。

2026-09-14阶段87 / 恢复页面：已开放鉴权提案入口，刷新复用数据库子任务；子任务展示原任务/结果/费用链接及共享预算，确认框明确原范围与费用。878测试/193文件、build、局部lint及桌面/移动56组Chrome回归通过，合成确认取消后无作业，fixture清理，0付费/发信。见[恢复页面验收](PROCESSING_RECOVERY_UI_2026-09-14.md)。恢复链唯一结果/长期依赖失效与真实业务仍需验收，goal active。

2026-09-14阶段86 / 恢复执行接线：生产执行器消费已确认恢复运行，在检查点保存限定候选与原证据来源，跳过公司发现，逐项补证并在无效输出时保留费用暂停，校正/评分按当前缓存契约检查。875测试/192文件、build、局部lint及实际SQL/生产零预算播种验证通过，0新增真实费用。见[执行接线](SAVED_RECOVERY_EXECUTION_GRAPH_2026-09-13.md)。页面入口、新旧结果展示及完整依赖失效/真实业务仍待验收，goal active。

2026-09-13阶段85 / 恢复运行初始化：已实现确认任务/领取线程/来源/计划核验及新运行幂等创建，实际SQL并发只生成一个新运行，原运行不变，0供应商调用。871测试/191文件、build和局部lint通过。见[运行初始化验收](PROCESSING_RECOVERY_RUN_INITIALIZATION_2026-09-13.md)。专用检查点与缺项节点仍未接入，普通搜索保护保留，整体验收未完成。

2026-09-13阶段84 / 恢复证据依赖：读取层核对实际保存证据、到期时间和当前评分规则，返回待补证原因，保留原公司与证据日期。871测试/191文件、build、局部lint和真实SQL恢复回归通过，0供应商调用。见[证据有效期检查](RECOVERY_EVIDENCE_READINESS_2026-09-13.md)。专用执行器尚须消费此信息，未开放页面，整体验收未完成。

2026-09-13阶段83 / O01–O02提案接线：恢复提案/关联/回执/审计已原子保存，并发请求复用同一子任务，来源变化拒绝自动替换。867测试/190文件、build、局部lint及真实SQL回滚/并发/生产执行器防误搜验证通过，fixture清理，0供应商调用。见[恢复提案验收](PROCESSING_RECOVERY_PROPOSAL_2026-09-13.md)。专用确认/缺项执行/页面入口仍未接通，临时拒绝普通搜索不代表恢复已完成；goal active。

2026-09-13阶段82 / O01–O02来源接线：已实现原任务、唯一已保存运行、终结检查点、实际已选身份及未知费用核验，输出版本化来源证明。867测试/190文件、build、局部lint和真实SQL/检查点验证通过，0供应商调用，fixture清理。见[来源核验](SAVED_RECOVERY_SOURCE_VERIFICATION_2026-09-13.md)。尚未暴露HTTP或创建可执行恢复任务；确认/执行/结果关联仍缺，整体验收未完成。

2026-09-13阶段81 / 阶段5、6交叉收尾：处理恢复关联共享预算已实现，祖先与子任务上限同时检查，未知祖先费用阻止新预留，API/UI区分共享占用和当前任务明细。全量860测试/189文件、build、局部lint及真实PostgreSQL并发/隔离/占用守恒通过，合成fixture已清理，0供应商调用。见[共享预算验收](PROCESSING_RECOVERY_SHARED_BUDGET_2026-09-13.md)。恢复提案创建/确认/执行仍待接通；S01待确认，整体验收未完成，goal active。

2026-09-13阶段80 / O01、O02准备：已保存部分结果的恢复范围计算器实现，按实际已选身份对账原缺口，仅保留未完成/冲突公司，按公司去重但保留全部冲突来源；原状态深拷贝、剩余任务限额精确扣原占用。5项测试/typecheck/局部lint通过，未接生产入口、无DB写入/付费/采用；全量851测试/build沿用阶段79。详见[范围准备与剩余接线](SAVED_PROCESSING_RECOVERY_SCOPE_2026-09-13.md)，不把准备函数当历史恢复已完成，原结果/费用未改；S01待确认，goal active。3017仍stage79 session78438。

2026-09-13阶段79 / O01、A06：接通明确processing-incomplete且尚无结果的旧终结检查点；原计划/费用/未保存运行门禁通过后补做缺项，terminalRecoveryOnly禁止重新发现公司。已有保存记录、缺失历史或语义角色待定不归此路径。851测试/build/局部lint、真实SQL原运行门禁和实际执行器未知费拒绝通过，fixture清理，0供应商/付费/发信；成功图的模型/保存仍为合成依赖。详见[旧终结未保存恢复](UNPERSISTED_TERMINAL_RECOVERY_2026-09-13.md)。已保存部分结果合并恢复/真实闭环仍缺，S01待确认，goal active。3017新build session78438，Chrome54组沿用阶段78。

2026-09-13阶段78 / A06、A12：任务完成状态/action/回执合并租户事务，用户/会话/thread核对，重复完成复用回执、冲突拒绝；失败/暂停状态也原子写入，已完成任务忽略迟到失败。真实SQL回滚、2并发仅1回执、迟到失败保留、隔离及原未知费用三项恢复通过；849测试/build、Chrome两视口54组、局部lint通过，fixture清理，0付费/发信。回执保存观测与未知用户采用分开，详见[完成事务报告](WORKFLOW_COMPLETION_ATOMICITY_2026-09-13.md)。旧终结缺项完整恢复/真实业务仍缺；S01待确认，goal active。3017新build session91496。

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

2026-09-13阶段66：修复完成run重复提交不同输入却返回新数量的问题。实际SQL验证相同输入幂等、目标/国家/评分变化拒绝、历史无身份保留，14事件/2国家记录不变；834测试/build/局部lint通过，0付费。历史终结缺项恢复仍待。

2026-09-13阶段65：A09待处理数量展示及刷新完成，真实检查点/API/Chrome两视口1/1→0/0、未知/owner拒绝/恢复通过；累计44组UI、832测试/build/生成check及局部lint通过。复用现有接口，0节点执行/新付费，checkpoint与fixture清理。真实业务生成到页面仍待，详见本地页面报告。

2026-09-13阶段64：生产Chrome桌面/手机42组检查通过，九类任务数量/停止/刷新核对；修复failed等状态有已知保存数却不显示缺口。原国家/角色等级路径记忆/手工图/成本/鉴权回归通过，832测试/build/生成check通过。无新业务调用、任务或采用事件，fixture清理。待校正/待评分数投影及真实生成闭环仍待，[页面证据](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段63：实际产品结果保存通过隔离SQL验收，修复带有效证据入库的PostgreSQL参数类型冲突。两国4并发、共享身份/国家隔离、快照有效期、事件幂等、合成分摊守恒和RLS通过；fixture清理，0真实付费。此证据覆盖真实存储函数，仍非真实模型/搜索/UI完整闭环，[范围](RESULT_PERSISTENCE_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段62：服务端交付与用户采用事件分开，新事件采用/查看unknown；校正有效量不再包含未完成。4针对性、832全量测试及实际SQL幂等/冲突/RLS/国家验证通过，迁移054应用且fixture回滚。新来源行displayed保持null，selected标明系统语义。真实UI采用及全业务链路仍未验收，[报告](ARTIFACT_OBSERVATION_BOUNDARY_2026-09-13.md)。

2026-09-13阶段61：P06增加真实PostgreSQL两进程恢复证据，100条独有原文、准备遥测和先前合成额度均保留；已完成校正不重做，身份隔离及请求依赖变化通过。typecheck通过，0付费，隔离thread已清理。模型/业务保存使用合成适配器，整体仍未验收。[详细范围](P06_STRUCTURED_SINGLETON_2026-09-13.md)。

2026-09-13阶段60：P06独有证据及事实采用无损字段表，超限继续暂停不业务拒绝；请求准备聚合数据接入校正/评分metadata。63针对性测试、生产build通过；100条证据/100条事实反解相等，图内存检查点恢复保留费用且不重搜。不能据此宣称真实模型质量、跨进程全链路或任意大小输入通过，[报告](P06_STRUCTURED_SINGLETON_2026-09-13.md)。

2026-09-13阶段59：Sol市场计划精确请求具备USD27.345252完整保守上界与严格契约、到期拒绝；当前余额17.675596无法预留，最小真实闭环尚未运行。828 tests/181 files、生产build含类型检查通过，0付费。其他OpenRouter入口/Gemini、恢复及业务验收仍按[唯一矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)继续，整体未完成。

2026-09-13阶段58：产品124b0c2通过826测试/181文件、生产build（含类型检查）及生成check；npm audit生产/全依赖均0漏洞，lint0错误/11既有警告。A20已有credits-only确认被重新核实，用户再次明确当前账号/工作区无BYOK，撤销阶段56–57重复待确认状态；费用上界及真实业务仍未完成。新增付费0。

2026-09-13阶段57 / A21采用遥测：续搜创建记录1个有效新提案，重复复用记录0新输出，不再每次点击累计下游使用；两者执行计数0、userAdoptedItems=null，保留输入/耗时/重复原因/费用0。5项相关测试、typecheck、生成check及真实SQL通过：两次调用仅1新提案，无执行job，父结果不变且RLS通过。verify-search-continuation.ts改为临时隔离账号，全部schema/fixture事务回滚，无付费。历史终态缺项恢复仍待完成，BYOK确认尚未收到，goal active。

2026-09-13阶段56：实际LangChain市场计划请求离线捕获，7个顶层字段、2纯文本消息、strict JSON Schema、4096输出和既有provider参数，无工具/插件/特殊层；模拟门禁后仅1次传输捕获，0真实推理。typecheck通过。只读key元数据证实非管理key，不能据此推定未配置BYOK，已询问用户工作区状态；不索取密钥。详见[费用核验补证](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)。产品未改，无新增规则，goal active。

2026-09-13阶段55：公开API捕获Sol 7端点及来源哈希，官方证据澄清当前未启用特殊服务层，不需把flex/priority直接归入当前路由；标准Azure仍有长上下文/缓存收费差异。脚本和typecheck通过，0推理/付费/账号变化，未启用费率或改模型。详见[费用上界核验及下一步骤](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)，整体验收未完成。

2026-09-13阶段54：新增最小闭环只读预检脚本，当前目标1首池2，预算仍12.324404/30；市场计划实际openai/gpt-5.6-sol缺完整费率，未启动已知会中断的前置付费。仅验证5个入口费率可用性，不是整次费用上界；无调用/账号修改/任务认领，typecheck通过。详见[预检结果与下一必要工作](MINIMAL_PRODUCTION_PREFLIGHT_2026-09-13.md)。无新产品规则，goal active。

2026-09-13阶段53：搜索budgetedFetch→真实SQL预留防重放通过，未知后两并发重试不出网，参数换序不绕过，其他任务独立，成功请求也不能重放。复用verify-cost-reconciliation.ts --skip-migration，原核销/分摊检查通过。首次错误断言匹配文案失败，改为实际稳定code后通过，fixture均清理；typecheck通过。合成传输不替代真实业务闭环。

2026-09-13阶段52：修复非模型搜索未进入持久防重放的缺口；五个已核验同步搜索契约生成指纹，未知/已成功结果仍由既有预留门禁拒绝重复，模型历史指纹不变。825测试/180文件、build和生成check通过；首次新增测试遗漏Brave必填参数被正确拦截，修正fixture后通过。真实SQL搜索恢复及最小业务闭环仍未验收，新增付费0。

2026-09-13阶段51：邮件审核实际数据库并发/幂等和已存知识批准恢复通过；7条本人审核遥测仅2新输出，实际采用仍未知，恢复知识可检索。typecheck通过，0付费且fixture清理。新邮件提取/嵌入和页面审核/问答仍待验收。

2026-09-13阶段50：修复邮件候选审核并发批准/拒绝竞争，重复同决定不重复嵌入，未知失败不自动重放；部分批准已存知识则提示完成批准。8项针对性测试、820全量测试（遥测包装前）、最终包装后针对性/typecheck/build通过。此阶段为实现及合成测试，真实SQL并发、邮件导入审核到问答仍待验收。

2026-09-13阶段49：通用hybridSearch真实SQL补验通过，5文档/5切片验证私有用户隔离、共享可见、归档排除、可选国家过滤及切片RLS。未传国家允许本人跨国家检索，不宣称入口自动隔离。固定向量无付费，typecheck通过；邮件知识和答案生成全链路仍待验收。

2026-09-13阶段48：真实页面24组检查通过，包含一年以上证据提醒并保留旧证据；私有开发知识searchOutreachKnowledge真实SQL隔离验收通过，范围含用户/国家/角色/归档/用途过滤，不涵盖通用RAG/邮件知识全链路。仅扩展验收脚本，typecheck通过，无付费/发信，整体未完成。

2026-09-13阶段47：渠道图手工添加完成真实表单→API/SQL→图展示及重复公司验收。修复本地化国家字段/UK别名导致新增节点暂时不可见，未改变合格标准或调用模型。两视口22组检查、812测试与build通过，无付费/发信，整体仍未完成。

2026-09-13阶段46：补齐账户等级编辑入口；真实生产桌面/手机20组检查通过，角色/等级/路径修改、个人记忆及GB/MX隔离已验证，主角色变化仅提示评分待更新。812测试/build通过，无付费/发信。剩余渠道图手工表单、策略/跟进、私有知识检索与真实业务闭环见当前矩阵。

2026-09-13阶段45：生产版本be7c9a3真实Chrome两视口18组页面检查通过，含国家/鉴权/公司费用真实读取及刷新，合成fixture已清理，0付费/发信。脚本typecheck通过；产品812测试为阶段44结果。本次范围与仍缺项目见[生产页面报告](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)，整体验收未完成。

2026-09-13阶段44：修复首轮零候选被当通用异常导致数量/费用完成路径中断的问题。空结果保留实际调用证据，由既有停止规则决定；预算拒绝不被吞掉。812测试及生产build通过，合成两轮成功零新增与供应商失败分别记录耗尽/不可用，空集合无评分调用；整体验收仍未完成。

2026-09-13阶段43：任务预算详情新增“按公司分摊费用”，五种口径分开并显示覆盖率；完成前观测按当前存储集合投影，不累加历史观测，不写回费用。808测试、生产build及真实SQL隔离/守恒通过，静态渲染验证未知/零；浏览器交互与实际业务仍按当前矩阵A04/A11/A13待验。

2026-09-13阶段42：A07/A08共享费用完成钩子与完整门禁公司集合接入，结果事务内幂等保存，后到发票按该集合守恒；预留/未知费用不因分摊释放。805测试/175文件、typecheck/build及真实SQL合成验证通过。历史缺集合不推算，完成前观测的当前投影、公司成本UI和真实业务验收仍归[当前矩阵A04](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)。

2026-09-13阶段41：已统一[当前验收矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)，O01–O05逐项区分实现与真实验收；费用入口更新至阶段40，旧阶段矩阵原样归档。以下阶段描述仅为历史，不再表示当前待办。阶段41只验证文档/提交引用，最新产品回归仍为阶段40的802测试与typecheck/build；整体验收未完成。

2026-09-13阶段40：SearchAPI公开增强/普通速度费用包络及引擎参数校验实现，802测试/typecheck/build通过，无付费。Google仅请求固定10条第一页，不为中间数量增加隐式调用；当前整体验收仍未完成。[官方核验记录](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。

2026-09-13阶段39：Places Text Search费用上界及实际FieldMask校验完成，800测试/typecheck/build通过；非法头不预留不发送，密钥不入费用记录。无付费、无真实业务验收结论，完整goal继续。[来源与范围](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。

2026-09-13阶段38：Exa普通company文本搜索费用上界与请求兼容性修复完成，798测试及typecheck/build通过；本地排除保持、旧会话不静默复用、新付费0。[来源和限制](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。其余入口上界及整体验收未完成。

2026-09-13阶段37：普通Brave/Tavily搜索严格请求费用上界实现，796测试与typecheck/build通过；[核验来源、金额、期限和范围](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。无新付费，不把保守预留写成真实费用，其他缺上界入口和整体验收仍未完成。

2026-09-13阶段36：超限单公司支持无损重复证据文本字典压缩；合成还原及评分入口/缓存一致性通过，795测试/174文件、typecheck/build通过。没有真实模型质量验证或付费调用。无重复可压缩文本的超大单项仍暂停，完整P06与整体验收不据此标记完成。

2026-09-13阶段35：B26/P06备用模型使用自身真实请求序列化参与提前拆批，校正、评分及缓存查询采用同一批次规则。792测试、typecheck/build通过；受控传输验证实际fallback执行，不调用真实服务商。单项超限处理和整体真实业务/UI验收仍未完成。

2026-09-13阶段34：D13/O05角色证据锚点和评分前契约门禁实现，791测试及typecheck/build通过；冻结规则覆盖112/208/54分别为具体角色可用/主角色待定/校正需恢复的记录数。没有统一调分、修改冻结盲审或新模型验证。当前实施进度以[验收矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)为准，以下旧“尚未实现”仅描述历史阶段；真实业务/UI整体验收仍未完成。

2026-09-13阶段25：O01–O05用户已确认采纳（D13），尚未实现；旧待采纳表述仅为历史。OpenRouter完整报告核销已完成真实数据库+合成传输验证；761 tests/170 files、typecheck及生产build通过。整体业务验收仍未完成，[当前矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)优先于历史Demo清单。

## 2026-09-13 当前调查与验收入口

本轮范围按确认规则 A21/D12 执行。[当前唯一验收矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md) 覆盖下文历史的当前状态描述；旧失败与旧测试数量仅作阶段历史。模型连通性和 SMTP 发送/用户确认收件已通过，不因恢复而重测。整体仍未通过。

[哥伦比亚流失调查](COLOMBIA_CANDIDATE_ATTRITION_2026-09-13.md) 已新增545条公司×类别的脱敏离线关联、7来源哈希、8项对账与完整原成本台账核对；本次产品回归722 tests/169 files通过。39个输出槽位含1家跨类重复，评测有效38；未找到可直接补回的完整合格遗漏，原历史缺失不当作不合格。O01–O05仅为待采纳建议，不改搜索/角色/评分代码。新增模型token/API额度/付费调用/费用均0，实际用户采用未知。效率机会优先恢复未完成状态及减少重复证据工作；不虚构实际节省率。详细原各阶段输入/有效/下游使用/费用/延迟/重试/丢弃原因/使用率在关联JSON中，不能把跨阶段累计量当唯一公司数。

## Completed in the Demo

| Acceptance | Result |
|---|---|
| AC-01 new-market multi-node flow | Scenario switch, market playbook, Distributor and downstream results, role scoring, evidence, map, shortlist and plan are implemented. |
| AC-02 existing-distributor growth | Growth mode keeps Exel as the supply anchor and focuses results on downstream opportunities with Distributor Supply as the normal path. |
| AC-03 large ISP handling | Large ISPs render as Downstream + ISP + KA with Deep involvement and Brand Direct or Co-supply recommendations. |
| AC-04 manual edits stay consistent | Account Tier, Supply Model, Brand Involvement and stage update shared state used by list, detail, opportunities and plan. |
| AC-D01 real company identity | 50 Tavily live-search candidates; every company has source evidence and requires identity review. |
| AC-D02 role coverage | Distributor/VAD, resale/retail, SI/MSP and ISP are included. |
| AC-D03 evidence metadata | URL, title, capture date, evidence state, confidence and supported claim are available. |
| AC-A01 taxonomy | Automated tests enforce KA outside ChannelRole and ISP inside Downstream Channel. |
| AC-A02 score separation | Opportunity Fit and Evidence Confidence are displayed separately. |
| AC-A03 evidence-linked draft | Development drafts include visible Evidence IDs. |
| AC-A04 eval samples | 12 brief examples and 20 classification benchmark samples are included and tested. |
| AC-T01 documentation | README, startup, `.env.example`, data notes, architecture and reference schema are included. |
| AC-T02 quality gates | Build, TypeScript, ESLint and Vitest are configured. |
| AC-T05 degraded-state rule | Snapshot is explicitly labelled; no mock company is presented as a real live-search result. Provider error contract is included. |
| AC-T06 basic accessibility | Keyboard-focus styles, semantic tables, labelled inputs, buttons and keyboard-selectable SVG nodes are included. |
| AC-C01 conversational home | Persistent user-scoped conversations support create, rename, delete, greetings and suggested prompts. |
| AC-C02 grounded knowledge Q&A | Product, company and approved mailbox questions use tenant-aware RAG and render source citations. |
| AC-C03 explicit search confirmation | Natural-language lead requests produce a country/role/count plan; Tavily is called only after authenticated confirmation. |
| AC-C04 global market partitioning | Country names are resolved across major UI languages and saved results are grouped by country in one global workspace. |
| AC-C05 updated visual system | The main workspace, chat, login and mailbox surfaces use a responsive iPadOS-inspired light visual system. |
| AC-V01 production contact scoring | DeepSeek evidence assessment plus deterministic hard gates publish auditable current decisions; accepted, review and invalid outcomes remain separate. |
| AC-V02 safe automation | Automatic mode verifies only Official/HighConfidence, retains crawler source status, supersedes older decisions, and keeps outbound verification disabled. |

## Current local acceptance supplement (2026-09-14)

Stage 122 confirms that a graph-produced zero-company partial result is read through authenticated production HTTP and shown consistently on desktop and mobile task pages after refresh. The result remains a synthetic provider-unavailable case, not A11's real business run. See [stage 122](ZERO_RESULT_PRODUCTION_HTTP_UI_2026-09-14.md).

Stage 121 verifies that zero-result search completion persists a partial outcome and one receipt while retaining a synthetic unallocated cost reservation. Search runs and provider evidence are now restricted by workspace owner at the database layer. This is synthetic local SQL evidence; the paid natural-language-to-qualified-company minimum run remains A11 unverified. See [stage 121](ZERO_RESULT_GRAPH_TENANT_ACCEPTANCE_2026-09-14.md) and the [current acceptance matrix](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md). The older Demo scope notes below remain historical.

## Simplified for Demo

- The pages in PRD section 9 are presented as one persistent desktop workspace with navigable views rather than separate URLs.
- Search uses Tavily live API runs persisted in PostgreSQL; SerpAPI remains a planned next-version provider.
- Role-aware scoring inputs are stored in the snapshot and priority is deterministically recomputed; a production scoring configuration UI is not included.
- The map provides verified and hypothesis states; confirmation buttons are visual Demo controls and do not yet persist relationship decisions.
- Manual edits persist in the authenticated owner-scoped PostgreSQL workspace.
- The development assistant uses deterministic role rules instead of a live LLM so the Demo needs no credential and remains reproducible.

## Not implemented

- Scheduled source refresh and change detection
- Model telemetry and full prompt audit persistence
- Snov-backed verified contact enrichment and any outbound message sending
- Full responsive mobile layout; the PRD's 1280px desktop target is the primary layout
- Browser E2E automation in CI; unit/domain tests are included

## Quality commands

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```
