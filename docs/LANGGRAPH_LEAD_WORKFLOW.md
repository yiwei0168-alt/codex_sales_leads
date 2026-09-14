# LangChain / LangGraph 销售线索工作流
2026-09-14 stage 200 A06: the SearchAPI provider and discovery-session dependency share the effective account key and base URL resolution. A blank standard key can use the compatibility alias, and changing that actual paid identity pauses old checkpoint recovery rather than silently reusing completed results. [Evidence](SEARCHAPI_ALIAS_RECOVERY_IDENTITY_2026-09-14.md).
2026-09-14 stage 198 A06: the actual Gemini discovery model used in a paid request is the same normalized value hashed into the persisted session dependency. A changed fallback model cannot silently reuse prior paid results when the primary override is blank; read-only A11 preview displays that model without sending a request. [Evidence](GEMINI_DISCOVERY_MODEL_RECOVERY_IDENTITY_2026-09-14.md).
2026-09-14 stage 197 A11: the current conditional `gemini-full` discovery step can have at most ten provider HTTP attempts across five rounds, but Gemini 3 may bill several model-generated Google queries per attempt. The per-prompt Gemini 2.5 option is research only; no discovery route or eligibility gate changes. [Evidence](A11_GEMINI_GROUNDING_BOUND_REVIEW_2026-09-14.md).
2026-09-14 stage 195 A10: the credential-free scheduled FX refresh records a distinct `staleOfficialReference` discard when valid ECB source XML is too old, and `unavailableOrInvalidReference` for other failures. It still retains the previous snapshot, waits one hour on failure and blocks native-price paid steps after 72 hours; no source response or raw error enters telemetry. [Evidence](FX_STALE_SOURCE_OBSERVABILITY_2026-09-14.md).
2026-09-14 stage 193 O03: after final assessment review, two completed fresh-search rounds with no new final-qualified company trigger the existing safety stop under `no-qualified-progress`. This observation does not prove market exhaustion. The old persisted `confirmed-exhaustion` value remains readable; provider failure, incomplete processing and role pending still have separate stop reasons. [Evidence](O03_STAGNATION_STOP_REASON_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 188: the credential-free ECB refresh ran through a single-purpose command outside the lead worker. No validated new CNY FX reference was stored, so native-price requests continue to pause before paid transport; an immediate repeat reused the one-hour refresh state. [Evidence](FX_SCHEDULED_RECHECK_0749_2026-09-14.md).
2026-09-14 stage 186: committed stage metrics, model usage and artifact observations are historical INSERT records. Migration 074 removes application UPDATE/DELETE after broad migration replay; seven artifact events still persist idempotently and usage aggregates remain readable in isolated SQL. The optimization-opportunity state remains mutable by its existing upsert. [Evidence](WORKFLOW_TELEMETRY_AUDIT_APPEND_ONLY_ACL_2026-09-14.md).
2026-09-14 stage 184: processing-recovery parent/child links now retain SELECT/INSERT-only application privileges after full migration replay; owner UPDATE/DELETE can no longer mutate inherited task-budget lineage. Existing insertion and resume flow passes isolated product SQL, while live external interruption remains unverified. [Evidence](PROCESSING_RECOVERY_APPEND_ONLY_ACL_2026-09-14.md).
2026-09-14 stage 180 A11: the review node can invoke configured Terra secondary and Sol judge. Free public endpoint audits retain proposal-only ceilings USD11.019202 / USD27.736500; no request contract or paid route admitted, and S01 plus possible Terra exceeds current preflight capacity. [Evidence](A11_REVIEW_ROUTE_BUDGET_AUDIT_2026-09-14.md).
2026-09-14 stage 179: the no-paid A11 preflight enumerates collect_evidence Tavily /extract with max four official URLs and separately notes the 20-URL contact caller. Missing active tariff contributes to checkedTariffsAvailable=false; no new paid route is enabled. [Evidence](A11_EXTRACT_PREFLIGHT_VISIBILITY_2026-09-14.md).
2026-09-14 stage 177 A11: collect_evidence may call Tavily /extract for up to four official URLs, but its billable route is still missing from active policy and therefore pauses before transport. A strict candidate validator and public-price proposal exist; no active route change or paid call. [Candidate](TAVILY_EXTRACT_TARIFF_PROPOSAL_2026-09-14.md).
2026-09-14 stage 176: score_candidates keeps primary scores separately; review_assessment_anomalies sets the final eligible count, no-final streak and next edge before handoff or another discovery round. Reviewed retry-required pauses recovery. The unchanged five-round ceiling is shared with the read-only preflight; no new paid run. [Evidence](O03_POST_REVIEW_TARGET_COMPLETION_2026-09-14.md).

2026-09-14 / 阶段175 A11：市场计划的实际合成SDK请求与S01合同一致，但 OpenRouter OpenAI标准端点公开参数清单未列其中的 `max_completion_tokens`、`temperature`；预检显式标记该元数据缺口和实际端点未验证，不能把无付费合成通过当供应商成功。原路由、输出上限及预算门禁不变。[证据](S01_PUBLIC_ENDPOINT_PARAMETER_GAP_2026-09-14.md)。

2026-09-14 / 阶段174 A05、A06：费用核销与任务恢复所依赖的追加式费用/价证行由迁移071限制为应用角色只读/新增，预算及预留状态保留更新但禁止删除；15张表真实权限、核销/限额SQL通过。旧宽授权来自迁移014重放，未来全量重放末尾须复验ACL。实际付费和真实账单仍未验收。[证据](BILLING_LEDGER_ACL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段173 A05、A10：工作流共享的ECB参考快照过期时继续拒绝人民币付费预留，计划刷新失败一小时后再试，旧参考行保留。迁移070修正旧应用授权残留，快照和刷新观测只能追加/读取，状态行可更新；真实SQL验证通过。当前官方仍只给9月11日参考日，A11整次费用无上界。[证据](BILLING_FX_EXPIRY_AND_APPEND_ONLY_ACL_2026-09-14.md)。

2026-09-14 / 阶段171 A11：图的发现执行器与隔离最小业务只读预检共用首轮请求量函数；目标池2时Brave/条件Exa的实际maxResults为12，原执行公式未改。合成HTTP合同通过，整次费用、真实响应和供应商可用性仍未知。[证据](A11_MINIMAL_DISCOVERY_REQUEST_SIZE_PREFLIGHT_2026-09-14.md)。

2026-09-14 / 阶段166 P06：超限事实阶段仅对已支持的非关键来源长摘录保首尾、长度及SHA标记；原事实/完整证据入库和来源指纹不变，最终评分获知折叠来源。关键、冲突、未知及无关联长来源继续技术暂停；合成测试与SQL恢复通过，真实语义和A11未验收。[证据](P06_PHASE_SINGLETON_EXCERPT_FOLD_2026-09-14.md)。

2026-09-14 / 阶段164 P06：超限分阶段最终评分的事实引用以来源行索引可逆表示，来源行仍持原 ID，评分输出须回到原 ID；主/备用实际请求字节再核验，旧完成合同比对和防重付费保持。151来源/155事实合成预检通过，不代表真实语义或完整备用图已通过。[证据](P06_PHASE_SOURCE_REFERENCE_COMPACTION_2026-09-14.md)。

2026-09-14 / 阶段161 P06：现行已批准备用路由可用其实际映射模型、序列化合同和付费哈希分别恢复事实阶段及最终响应；配置变化的旧完成行阻止同动作重付费。126事实/来源合成公司跨进程图→产品SQL保存评估1、模型用量4，备用阶段和最终各1，合格0；严格费率和真实模型仍未验收。[证据](P06_FALLBACK_ROUTE_CHECKPOINT_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段160 P06：OpenAI兼容备用提供方暴露与费用流水相同的精确付费HTTP哈希，供后续实际路由恢复使用；当前图仍只以主路由合同保存阶段和最终响应，备用结果不冒名缓存。[证据](P06_FALLBACK_PAID_REQUEST_IDENTITY_2026-09-14.md)。

2026-09-14 / 阶段159 P06：条件Pro合成公司从图评分前PostgreSQL检查点由第二进程完成3事实阶段、Flash与Pro最终评分，产品SQL保存原151事实/证据和5条用量，Pro合同命中评估缓存；结果合格0，真实模型/费用与A11仍未验收。[证据](P06_PHASED_PRO_GRAPH_SQL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段158 P06：分阶段Flash最终评分只有满足既有重大变化条件才接Pro最终请求；用同一阶段摘要、Pro自己的完整传输字节与独立检查点合同，跨进程复用Pro完成行。只读整次预检显式增加可选Pro一次的合成成本，但总任务仍无上界、不得真实付费运行。[证据](P06_PHASED_PRO_ESCALATION_2026-09-14.md)。

2026-09-14 / 阶段157 P06：超限公司分阶段事实完成后，最终评分请求的主路由结构响应先按精确执行合同/付费哈希保存，再校验业务输出及发布评估缓存；跨进程可零模型调用复用。图评分恢复门禁仅对已报告完整且匹配的阶段/最终响应放行。备用路由及Pro升级未接入该最终恢复路径。[证据](P06_FINAL_SCORE_RESPONSE_RECOVERY_2026-09-14.md)。

2026-09-14 / 阶段156 P06：151事实/151现行来源的合成超限公司在评分前图检查点后，由第二进程通过现行评分Agent执行3个事实阶段和1个最终评分请求，产品SQL保留全部原始事实与证据、4条模型用量及1条评分指标；评估缓存可由阶段完成行派生精确合同后复用。该夹具最终合格0，真实模型及整次费用仍未验收。[证据](P06_PHASED_GRAPH_SQL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段155 A11：整次只读预检明确分阶段评分调用次数及上界未知，合成4阶段加最终评分的价格只作示例，不作为真实任务搜索或公司数量预测；当前剩余额度不足以同时覆盖该示例和市场计划，真实运行继续阻止。[证据](A11_PHASED_SCORE_WHOLE_RUN_PREFLIGHT_2026-09-14.md)。

2026-09-14 / 阶段154 P06：图把用户/工作区/动作传入评分Agent，超限公司按精确主路由请求合同与付费哈希逐阶段读写完成行，再做有界最终评分；恢复时先计算阶段派生的评估缓存合同，命中后再考虑丢失付费评分门禁。SQL跨进程部分恢复已用模拟模型通过；真实模型/费用与最终产品验收仍待做。[证据](P06_PHASE_AGENT_SQL_RECOVERY_2026-09-14.md)。

2026-09-14 / 阶段153 P06：加入无付费阶段完整覆盖综合和最终评分请求预检，阶段摘要连同纠正状态、关键/争议陈述、原引用及全部来源身份进入紧凑表；真实字节超界保留待处理。图评分节点尚未执行阶段计划，摘要语义需真实验收。[证据](P06_PHASE_SYNTHESIS_PREFLIGHT_2026-09-14.md)。

2026-09-14 / 阶段152 P06：评分恢复门禁识别同任务已保存的阶段完成行及对应付费HTTP身份，仅对已报告且完整的匹配响应放行；未知费用、截断及无关联继续暂停。阶段Agent目前仍未调用新检查点，不代表整体P06完成。[证据](P06_PHASE_PAID_REPLAY_IDENTITY_2026-09-14.md)。

2026-09-14 / 阶段151 P06：完成的分阶段事实响应可按用户、工作区、动作、国家、公司、来源指纹、阶段序号及主路由实际请求契约追加保存；跨进程读取重验Schema/引用、重复幂等，RLS保护。当前仅SQL适配及模拟夹具，尚未由图中评分节点调用，缺项不能绕过已有未知付费防重放门禁。[证据](P06_PHASE_CHECKPOINT_SQL_2026-09-14.md)。

2026-09-14 / 阶段150 P06：事实阶段的提供方JSON Schema由同一严格Zod定义生成；阶段输出必须逐事实/独立来源完整覆盖、引用只取当前事实可见来源，合法乱序按原顺序归位。校验门禁已实现但尚未接入付费Agent或SQL缓存，最终综合与检查点恢复仍缺。[证据](P06_PHASE_OUTPUT_VALIDATION_2026-09-14.md)。

2026-09-14 / 阶段149 P06：新增独立的阶段事实请求规划器，对超大单公司按原事实顺序、同阶段引用闭合及未引用来源全覆盖构造实际序列化上限内的请求；单个原子事实/来源仍超界则技术阻止。它尚未接入评分图或付费模型，阶段结果与恢复检查点、最终综合仍须实施。[证据](P06_PHASED_FACT_REQUEST_PLANNER_2026-09-14.md)。

2026-09-14 / 阶段148 P06：单公司评分在无损准备仍超限时，受限折叠请求可继续转换成精确字段表，并按实际主/备用序列化字节择短；准备metadata组合编码与折叠数进入评分遥测。110条高熵补充事实通过当前评分Agent、跨进程检查点及产品SQL，原111证据/111事实保留。125/150条仍超界暂停，未实现任意大单项分阶段综合。[证据](P06_FOLDED_FIELD_TABLE_COMBINATION_2026-09-14.md)。

2026-09-14 / 阶段147 P06：在原评分前检查点跨进程恢复，`supported-excerpt-fold-v1` 变体经当前评分Agent一次模拟请求写入实际 `persistLeadWorkflowResult`，原始56证据/56事实分别保留于评估和证据快照，评分遥测保存折叠条数及用量；跨用户不可读。101/105共享短语路径同步复验。前置发现/补证/校正未在此夹具中执行，真实模型与任意大单项分阶段处理仍待验收。[证据](P06_FOLDED_EXCERPT_CROSS_PROCESS_SQL_2026-09-14.md)。

2026-09-14 / 阶段146 P06：`LeadQualificationAgent` 的单公司完整请求在无损准备仍超界时，使用 `supported-excerpt-fold-v1` 保留校正事实和证据引用、保护冲突/否定/未知原文，并记录折叠条数；实际模型路由仍按完整序列化字节预检，超限继续技术待恢复。55条独有事实的模拟请求完成，150条仍超界，尚需任意大单项分阶段路径。[证据](P06_SUPPORTED_EXCERPT_FOLD_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段145：全量无付费回归复核现行图和页面；P06对不可压缩超界单公司仍在评分前生成技术待恢复结果，同批可请求公司可继续，尚无保留全部事实/引用的分阶段最终综合。只读预检因汇率与条件费率缺口仍无整次费用上界，不启动真实任务。[边界核查](CURRENT_REGRESSION_AND_P06_BOUNDARY_2026-09-14.md)。

2026-09-14 / 阶段144：正结果图由现行 `collectLeadEvidence` 对空证据候选执行限定公司域名的基础搜索、同域筛选、模拟提取及稳定证据哈希，现行校正/评分 Agent 依次引用该证据和事实；评分前检查点恢复后产品 SQL 及生产双视口保存1家。Tavily 方法已在隔离脚本中拦截，真实搜索与 A11 费用闭环仍未验证。[证据](CURRENT_EVIDENCE_COLLECTOR_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段143：隔离正结果图在校正节点调用现行 `LeadEvidenceCorrectionAgent`，基于本轮官方夹具证据完成主角色和6条事实，补证调用0；评分节点由现行 `LeadQualificationAgent` 引用这些校正事实完成模拟评分，之后交接、产品 SQL 与本地生产双视口各见1家。暂停恢复不重跑已完成前置节点，真实提供方语义和 A11 费用闭环仍未验证。[证据](CURRENT_CORRECTION_AGENT_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段142：两轮自然语言降级正结果任务在评分前检查点恢复后，由当前`LeadQualificationAgent`对合成模拟提供方响应执行完整请求准备、资格门禁、确定性评分和精确SQL缓存，再经图交接/产品SQL/生产双视口保存1家。模拟响应不证明真实模型语义或A11账单。[证据](CURRENT_SCORE_AGENT_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段141：实际助手服务两轮自然语言用`deterministic-fallback`产生目标2再改目标1的提案，旧提案取消后确认新任务；图在评分前停于PostgreSQL检查点，恢复后合成正结果经SQL及本地生产双视口达标。内部阶段仍为夹具，模型真实语义及A11可信账单未验收。[证据](ASSISTANT_FALLBACK_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段140：正结果图→产品SQL验收夹具增加全局`sales_company`清理及清理后断言；初版6条本轮无引用合成残留已删除。此为验收夹具数据卫生修复，原图、费用、角色和评分合同不变，真实业务仍待A11。[证据](POSITIVE_GRAPH_FIXTURE_CLEANUP_2026-09-14.md)。

2026-09-14 / 阶段139：预置正结果图在`score_candidates`入口受控暂停，PostgreSQL保留已校正证据与7 micro-USD夹具预留；同检查点恢复后前置节点不重跑，评分/复核/交接及真实结果SQL各完成1次，生产任务页面双视口刷新一致。越权恢复拒绝，未知在途付费请求与跨进程完整正结果仍须另验。[证据](POSITIVE_GRAPH_SCORING_PAUSE_RECOVERY_2026-09-14.md)。

2026-09-14 / 阶段138：隔离合成正结果经当前图各节点、真实任务认领、PostgreSQL结果持久化与本地生产任务API/两视口页面，最终保存1家且`target-met`，重复完成回执保持1。预置计划和各阶段夹具不代表自然语言或真实供应商判断；真实费用与A11闭环仍缺。[验收](POSITIVE_RESULT_GRAPH_SQL_UI_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段137 P06：完整评分Agent先隔离无损准备后仍超界的单公司，保留`retry-required`及全部原证据；可请求同伴照原批次上限评分并即时保存完成项的准确缓存契约。混合顺序合成验证不污染缓存；图有未完成项时仍停在恢复检查点，不据此交付部分合格。任意大公司分阶段评分与真实业务模型未验收。[证据](P06_OVERSIZED_PEER_ISOLATION_2026-09-14.md)。

2026-09-14 / 阶段136 P06：超大单公司评分的完整请求预检抛出 `LeadRequestTooLargeError` 时，图停在 `score_candidates`，保存已校正公司、原证据和前置额度；合成恢复只重新执行缺失评分，发现/补证/校正各不重跑。当前无损压缩仍有不可压缩边界，真实模型质量及分阶段方案未验收。[图检查点验收](P06_OVERSIZED_SCORE_GRAPH_CHECKPOINT_2026-09-14.md)。

2026-09-14 / 阶段135：Kimi 自然语言意图与北京 Embedding 在阶段134 S01 后的整次预检因共享 ECB CNY/USD 参考日过72小时而暂停，静态模型合同本身未到期。官方源仍为9月11日参考日；不能将9月14日抓取时间当作新价证。刷新机制等待有效参考日，旧结果/费用不变，真实工作流未启动。[归因](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段134 S01：`buildLeadMarketPlaybook` 使用 Sol 时，实际 LangChain 请求的 `provider` 限定 OpenAI 标准端点并禁用供应商回退；新的 `openrouter-sol-openai-playbook-v1` 费用合同只按该工作流任务选择，其他 Sol 保留原合同。端点错误使计划阶段暂停，旧计划缓存因新增模型/路由身份失效；未完成的工作不被当成有效计划。静态报价 USD10.622880/次须先通过累计 USD30 与整次预检，真实供应商链路尚待验收。[证据](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段133：`review_assessment_anomalies` 调用当前复核 Agent 时使用用户/工作区/国家隔离的追加式子调用检查点；Terra 结果校验并保存后才进入 Sol 裁决或下一公司，恢复按完整实际请求键复用并单列复用量。保存故障走非重放暂停，旧费用保留。SQL 跨进程读取与 Agent 合成中断恢复分别验收，真实付费全图仍缺。[验收](REVIEW_SUBCALL_CHECKPOINT_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段132：当前条件复核 Agent 在合成分歧案例中按序生成 Terra 二次复核及 Sol 匿名 A/B 裁决的完整兼容请求；传输拦截确认无工具、严格 JSON、输出上限与 provider 约束，现行费率报价分别缺失和超界。未更改评分、路由或预算，真实模型/账单和A11闭环仍缺。[请求预检](OPENROUTER_REVIEW_ACTUAL_WIRE_PREFLIGHT_2026-09-14.md)。

2026-09-14 / 阶段131：同一图任务的评分前检查点由第二进程恢复，当前Agent以无损共享短语请求执行1次模拟评分，并经产品 `persistLeadWorkflowResult` 写入评估/证据快照/阶段遥测。101证据、105事实和缓存契约跨进程一致；合格0、公司交付0，用户/动作不匹配拒绝。预置已校正候选和模拟模型不证明自然语言到真实合格线索、供应商账单或仍不可压缩单项的分阶段处理。[联通验收](P06_SHARED_PHRASE_CROSS_PROCESS_PRODUCT_SQL_2026-09-14.md)。

2026-09-14 / 阶段130：另以隔离双账号及实际产品结果 SQL 验证共享短语评分落库：图从已校正候选执行一次模拟评分，完成评估1、证据快照101、事实105、评分阶段指标及模型用量各1；最终合格0、不写交付公司，跨用户读取拒绝。该模式与阶段129两进程模式分别验收，未联成同一条跨进程自然语言任务；未知真实费用、模型字典遵从及不可压缩分阶段处理继续保留。[SQL 验收](P06_SHARED_PHRASE_PRODUCT_SQL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段129：实际PostgreSQL检查点将评分前的101条原证据、105条事实、原计划及13个合成额度交给第二进程，当前评分Agent按完整请求压缩后执行一次模拟评分，准备metadata进入模拟保存适配器。前置阶段不重放，拥有者/动作不匹配拒绝，国家/证据变化不复用原缓存契约；最终资格仍按确定性门禁，本夹具合格0。真实模型、业务SQL保存及未知付费恢复不由此单例证明。[跨进程验收](P06_SHARED_PHRASE_CROSS_PROCESS_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段128：评分节点的超界单公司在重复整段字典和字段表仍不足时，可对证据标题/摘录与事实陈述中的共享短语进行可逆编码；只在完整请求实际更小时采用。Agent 合成路径的101证据/105事实进入现有上限，反解保持原值及引用；151证据/155事实不可压缩输入继续未完成，外发为0。缓存按实际编码请求，主/备用路由字节及费用门禁仍分别约束；真实模型和跨进程完整业务须另验。[部分验收](P06_SHARED_PHRASE_SINGLETON_ACCEPTANCE_2026-09-14.md)。

2026-09-14 / 阶段122：同一条图生成的0家公司、`provider-unavailable`任务经真实任务API及Chrome桌面/手机任务详情显示缺口1，刷新后不变；隔离合成输入，不代表A11付费业务闭环。[生产HTTP/UI验收](ZERO_RESULT_PRODUCTION_HTTP_UI_2026-09-14.md)。

2026-09-14 / 阶段121：搜索运行、查询、结果、提供方调用和出现记录按工作区所有者执行数据库 RLS；发现阶段必须携带用户费用/任务上下文，缺失时在写入或外发前失败。隔离 SQL 的目标1、合格0、提供方不可用案例经图、保存和任务回执完整接线，回执仅1条，5 micro-USD 合成预留保持未核销/未分配；不是新市场测评或真实付费闭环。[验收](ZERO_RESULT_GRAPH_TENANT_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段120：图的 `targetCompletionReason` 与结果 `accepted/requested` 继续分别保留；对话卡及任务详情的完成标签只在最终保存数已知时判断是否填满，历史缺数显示未知。零结果或部分结果不再仅因后台 `completed` 被标为达标。停止原因仍来自图结果并在任务详情独立显示；真实搜索和模型接线尚待 A11。[生产 UI 验收](SEARCH_TASK_STATUS_LABEL_PRODUCTION_UI_2026-09-14.md)。

2026-09-14 阶段119：结果保存节点允许零合格公司仍持久化运行和空交付计数；并发重试按输入指纹复用同一结果。任务共享费用在明确处理公司集合为空时保存 `zero-company-task`，不生成公司份额，原预留仍占用且核销未知。`workflow_phase=completed` 只表示结果存储已提交；图层停止原因和目标缺口仍须在真实任务中核对。[SQL 回归](ZERO_QUALIFIED_RESULT_PERSISTENCE_2026-09-14.md)。

2026-09-14 阶段118：评分节点的当前 Agent 完整请求对61条当前证据/65条事实可无损字段表化并保留引用；更大101条证据/105条事实仍超界时在模型前保持未完成。图的跨进程恢复及真实模型结构遵从不由这两例证明。[边界](P06_FULL_SCORING_AGENT_SINGLETON_BOUNDARY_2026-09-14.md)。

2026-09-14 阶段116：发现路由中的 SearchAPI 产品请求因当前账号费用上界未核实而在费用报价处停止；既有检查点恢复与任务状态机制仍需用完整实际接线另验。不得将阻止解释为市场搜索耗尽，也不得在恢复时用公开参考价放行。[费用门禁](SEARCHAPI_ACCOUNT_BOUND_HOLD_2026-09-14.md)。

阶段114条件发现/补证预检：生产Exa公司搜索、Tavily官方站补证及校正缺口补证的合成传输均通过现行请求合同；保留缓存/检查点与真实费用门禁，0外部调用。[请求边界](MINIMAL_ACCEPTANCE_EXA_TAVILY_WIRES_2026-09-14.md)。

阶段113核心发现预检：Colombia/Distributor合成计划经生产Brave提供方形成GET请求，当前费用合同按127字节查询、2结果及USD0.005/次通过；传输被拦截，真实HTTP与预算写入0。实际执行器查询及下游公司证据仍未验证，[边界](MINIMAL_ACCEPTANCE_BRAVE_WIRE_2026-09-14.md)。

阶段112最小闭环路径预检：只读脚本从当前 Colombia/Distributor/目标1家计划与现行路由列出核心Brave、条件Exa/SearchAPI/Gemini、Tavily补证、DeepSeek校正/评分、Terra复核与Sol裁决。市场计划现行Sol单次预留超USD17.675596余额；脚本标明实际请求未全验及整次上界未知，不认领任务。[逐入口状态](MINIMAL_ACCEPTANCE_ROUTE_COVERAGE_2026-09-14.md)。

阶段111费用遥测：Sol、DeepSeek和四个同步搜索来源的公开价证分别记录生成、与静态基线一致、实际可供下游使用。待审页无效，旧暂停即使遇到一致新页仍记下游使用0及待人工复核原因；不改预算门禁或旧费用。[定向回归](PUBLIC_RATE_HOLD_USAGE_ACCOUNTING_2026-09-14.md)。

阶段110搜索费用边界：Exa `/search` 与 Google Places Text Search Enterprise 的原静态合同加入每日官方公开价只读复核，不改请求/金额；缺价或短页只暂停受影响新预留。当前 Exa validated、Places 因短页 hold=true，SearchAPI 无完整合同继续拒绝。[SQL、官方来源和页面验收](EXA_PLACES_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

阶段109评分恢复边界：生产重入评分前保留原检查点时间；先读取已完成评分与有效缓存，再对剩余公司按同用户/任务/公司国家哈希查询检查点后的已返回评分付费响应。命中则在新请求前暂停，重复恢复不刷新时间屏障，原预留/报告费用保留；其他公司可继续。[真实PostgreSQL跨进程合成验证](UNCHECKPOINTED_SCORE_RECOVERY_GUARD_2026-09-14.md)。丢失的语义输出无法由账本重建，真实模型闭环仍未验收。

阶段108搜索费用边界：worker到期后独立只读抓取Brave Search Plan与Tavily Search credit官方价格，按现行USD0.005/0.016静态上界复核；跨进程去重，漂移只暂停受影响规则的新预留。预算API与页面只读，真实搜索0，[SQL及UI证据](SEARCH_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

阶段107费用边界：worker 每五分钟检查 DeepSeek 官方公开价格复核是否到期；Flash/Pro 共享一次每日 GET 和跨进程锁，漂移/不完整页使对应现行静态规则的预留粘性暂停。预算 API/页面只读两条状态，不刷新外部源或延长期限。[真实SQL与生产UI证据](DEEPSEEK_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。其他来源刷新及 A11 实际模型业务仍缺。

阶段107边界修正：HTTP成功但返回非HTML、206部分页、转移页、404或超大页面按无法核验公开合同处理并暂停新预留；429、5xx和传输故障保留原hold及快照，按一小时退避。仅增加合成响应测试，不发起业务调用。

阶段106评分批内控制：已完成批次缓存写失败，或缺少安全的精确请求契约时，评分器停止领取新批次并暂缓同批缺项修复；已在途请求完成，未开始公司为 `retry-required`，不作业务拒绝。完整评分节点检查点保存已完成项和待恢复项；三进程 PostgreSQL 合成恢复只评分缺项，[验证](ASSESSMENT_BATCH_PERSISTENCE_STOP_2026-09-14.md)。首批响应到缓存/图检查点均失败的窗口仍受未知费用门禁约束，真实模型闭环未验收。

阶段105评分恢复边界：评分缓存读取故障在模型前停止；可选缓存写失败后，已完成评分仍进入 PostgreSQL 图检查点。四进程合成故障回归证明从完整评分节点的检查点恢复时不重评、原额度保留，[证据](ASSESSMENT_CACHE_FAULT_RECOVERY_2026-09-14.md)。批次结果在节点检查点前发生故障的持久性和未知付费请求的完整业务验证仍缺。

阶段104费用边界：worker 为现行 Sol 静态合同每五分钟检查七天只读公开费率复核是否到期，跨进程去重、失败一小时退避；漂移/不完整价证使新预留粘性暂停，已完成检查点及历史费用不变。预算页面只读状态，不刷新外部源。[SQL与生产UI证据](OPENROUTER_SOL_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。其他路由的费率刷新和真实模型业务仍待。

阶段103费用边界：角色校正/评分的四条默认OpenRouter备用路由仅完成公开端点兼容性和缺价审计；动态DeepSeek价格漂移、缓存费用字段缺失，保持 `missing-tariff` 停止与原检查点恢复资格。没有调用模型或重算冻结哥伦比亚结果。[只读审计](OPENROUTER_DEFAULT_FALLBACK_GAP_AUDIT_2026-09-14.md)。

2026-09-14阶段102：最小闭环预检现在从实际LangChain序列化捕获一条合成市场计划请求，按完整JSON/传输字节核验现行合同；[只读证据](MINIMAL_ACCEPTANCE_PLAYBOOK_WIRE_PREFLIGHT_2026-09-14.md)显示该形态有效但27.345252保守上界超余额。真实RAG、发现到评分及复核请求尚未逐入口覆盖，不启动图任务或付费调用。

2026-09-14阶段101：公开角色校正缓存读取故障现在在补证和模型之前抛出技术暂停；缓存返回空才作为真实未命中进入校正。[确定性验证](ROLE_CACHE_READ_FAILURE_GATE_2026-09-14.md)显示首次故障0付费调用、恢复后仍可处理同一候选。图线程和历史费用不清零；真实任务全链恢复未由此单项测试证明。

2026-09-14阶段100：`build_playbook` 已生成计划后，可选缓存写失败只进入告警/阶段元数据，计划仍写入图检查点。[跨进程验收](PLAYBOOK_CACHE_WRITE_RECOVERY_2026-09-14.md)证明恢复直接进入发现边界、生成器不重跑，原额度保留；缓存读取故障仍在生成前停止。该验证使用合成适配器，不代表A11真实业务完成。

2026-09-14阶段99：条件分歧裁决仍是 Sol `reasoning.effort=high`、严格JSON和12,000输出token；公开端点复核候选上界 USD27.736500，[只读审计](OPENROUTER_SOL_JUDGE_PROPOSAL_2026-09-14.md)。当前费用门禁的4,096输出合同继续拒绝该请求，图执行与模型路由未改；实际服务商契约、预算及A11真实闭环仍缺。

2026-09-14阶段98：本地生产验收将合成 `workflow_stage_metric`/`workflow_model_usage` 各一条经同源登录 HTTP 两次读取，两视口均看到同一聚合而不新增事件；原图执行、费用、模型调用均未触发。[HTTP回归](WORKFLOW_USAGE_PRODUCTION_HTTP_2026-09-14.md)。这不替代真实模型业务闭环。

2026-09-14阶段97：结果持久化后的 `workflow_stage_metric` 与 `workflow_model_usage` 现在由 `/api/tasks/usage` 作为两份独立只读聚合暴露；阶段输入、生成、有效、下游使用与 token/耗时分开对账，异常计数留空利用率，用户采用仍未知。[SQL与API验证](WORKFLOW_USAGE_AGGREGATE_ACCEPTANCE_2026-09-14.md)。不改图执行、事件写入、预算或计费。

2026-09-14阶段96：公开角色校正缓存的同页证据重绑由 URL/哈希/来源扩为 URL/哈希/来源/标题/摘录，依赖指纹升 v3，缺新字段的旧快照 miss 后走正常缺项流程；[边界与回归](ROLE_CORRECTION_CACHE_BINDING_V3_2026-09-14.md)。评分证据本来就要求摘录哈希有效；跨进程检查点仍只重做缺失阶段，不把引用碰撞或缓存 miss 判为业务拒绝。

2026-09-14阶段95：条件二次复核的 Terra OpenRouter 路径只核对现有文本/结构化响应请求与公开端点能力及最坏价格，得到单次候选上界 USD11.019202。[只读审计](OPENROUTER_TERRA_REVIEW_PROPOSAL_2026-09-14.md)。图节点、实际模型路由、费用门禁和评分规则均未改；当次预算仍按全部可能后续调用预检，不能因单次可容纳启动整次业务。

2026-09-14阶段94：实际数据库回归在已有国家公司记录上先经用户更新入口保存主角色/等级/阶段/行动，再经结果保存入口写新版机器评估；物化视图保留用户修改，机器分数更新，角色冲突保持需重验，另一国不变化。[SQL证据](USER_OVERRIDE_REASSESSMENT_SQL_2026-09-14.md)。无模型、搜索或费用合同改变。

2026-09-14阶段93：助手混合问答外部检索先校验 Gemini 同步响应的明确完成状态；非完成即走已有外部检索错误分支，内部RAG可独立返回，不把带引用的部分回答送入综合结论。[边界](GEMINI_EXTERNAL_ANSWER_COMPLETION_2026-09-14.md)。无新费用准入或自动重试。

2026-09-14阶段92：Gemini Full/Product发现的实际 Interactions 请求显式限制生成输出12,000 token；明确非完成响应作为技术未完成保留，不从部分工具/模型步骤提取公司，也不自动重放已付费请求。搜索工具内部查询次数仍无法从输出上限推断，费用规则继续拦截。[边界与验证](GEMINI_DISCOVERY_OUTPUT_BOUND_2026-09-14.md)。

2026-09-14阶段91：市场计划后若条件触发二次复核，预算需分别覆盖实际已核销费用和下一请求的完整保守预留。[离线情景](OPENROUTER_REVIEW_BUDGET_SCENARIO_2026-09-14.md)说明S01单次可容纳不等于整次图可完成；Sol裁决亦是独立费用门禁。没有改变复核触发、图节点、模型路由或评分标准。

2026-09-14阶段90：`lead-evidence-correction` 的 OpenAI兼容备用路由现在显式限制总输出8192 token；不完整JSON/finish_reason不能作为校正完成，现行费用门禁对未核准网关模型仍先于传输拒绝。六模型公开端点证据与未完成合同见[费用审计](OPENROUTER_REMAINING_ROUTE_AUDIT_2026-09-14.md)。不改变原公司范围、角色标准、评分卡或S01供应商路由。

2026-09-14阶段89：`runLeadWorkflow`继续已保存恢复检查点时重读来源有效期与公共文档当前版本，按现行评分证据期限检查检查点中的新证据。失效公司标陈旧并清除旧校正/评分/复核/交接，从`build_playbook`的专用证据边重新进入；仍有有效新事实则只重算决策，没有才补证。既有额度/用量保留，阶段指标记录失效数量。888测试/195文件、build、局部lint及隔离SQL回归通过。[证据与边界](RECOVERY_RESUME_DEPENDENCY_REVALIDATION_2026-09-14.md)；真实业务仍缺。

2026-09-14阶段88：恢复链结果由同用户递归原任务/子任务、完成运行及`selected`评估的单次SQL快照计算，按归一域名去重；已完成来源不完整则返回未知，未完成子任务不算已保存。只读摘要接任务详情，聚合遥测按来源快照幂等记录，不重跑图或供应商。882测试/194文件、build、真实SQL及两视口Chrome56组通过。[恢复链对账](RECOVERY_FAMILY_RECONCILIATION_2026-09-14.md)；长期依赖失效、真实模型及A11闭环仍缺。

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
