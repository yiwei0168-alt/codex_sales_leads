# 用户确认规则登记表
2026-09-14 stage 198 / A06-A11 implementation status: provider request, discovery recovery identity and read-only preflight now use the same trimmed Gemini model fallback. A blank primary override followed by a changed fallback invalidates the old paid checkpoint instead of silently reusing it. This implements the existing request-identity and no-automatic-paid-replay rules; it does not confirm or activate a new model route or tariff. Full 1,024 tests and build pass; live A11 remains open. [Evidence](GEMINI_DISCOVERY_MODEL_RECOVERY_IDENTITY_2026-09-14.md).
2026-09-14 stage 195 / A10-A08 implementation status: official ECB responses that parse correctly but have passed the already confirmed 72-hour validity window now receive a distinct append-only discard reason from transport/invalid failures. The existing `unavailable` state, one-hour retry, expired-FX paid hold, and A09/A10 values remain unchanged. Synthetic tests and current-build checks are documented in [evidence](FX_STALE_SOURCE_OBSERVABILITY_2026-09-14.md); this is not a new rule, a fresh exchange rate or live A11 acceptance.
2026-09-14 stage 193 / D13-O03 implementation status: the existing two completed zero-final-round safety stop now emits `no-qualified-progress`; legacy `confirmed-exhaustion` remains readable and is displayed as historical stagnation, not proof of market exhaustion. Both prevent an identical continuation. This implements the already confirmed O03 boundary without changing target, scope or thresholds. Full 1,021 tests and production Chrome 68 checks pass; live A11 is still open. [Evidence](O03_STAGNATION_STOP_REASON_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 190 / A08-A13 acceptance status: after migration 075, the current production build and 66 real Chrome desktop/mobile checks passed with isolated fixture cleanup, no paid provider call and unchanged USD30 occupancy. This validates tested UI paths under existing rules; it is not new user confirmation, real adoption or A11 completion. [Evidence](PRODUCTION_UI_REGRESSION_STAGE190_2026-09-14.md).
2026-09-14 stage 188 / A10-A11 implementation status: the 07:49 UTC scheduled public FX retry yielded no validated new reference; the stored 2026-09-11 snapshot remains expired, so CNY paid admission and the whole-run A11 gate stay closed. This is an observation under existing rules, not a new confirmed rate or authorization. [Evidence](FX_SCHEDULED_RECHECK_0749_2026-09-14.md).
2026-09-14 stages 185-187 / A06-A08-A13 implementation status: migrations 073-075 restore application SELECT/INSERT-only access to memory audit, continuation lineage, workflow telemetry/workspace audit and private document revision history after full migration replay. Two complete replays per stage and the final 23-table role audit passed; parent privacy deletion still cascades. These are integrity fixes to existing recovery, telemetry and isolation rules, not new user decisions or live A11 acceptance. [Memory/continuation](MEMORY_AUDIT_SEARCH_CONTINUATION_ACL_2026-09-14.md), [telemetry/audit](WORKFLOW_TELEMETRY_AUDIT_APPEND_ONLY_ACL_2026-09-14.md), [knowledge revision](KNOWLEDGE_REVISION_APPEND_ONLY_ACL_2026-09-14.md).
2026-09-14 stage 184 / B25 recovery implementation: migration 072 restores SELECT/INSERT-only application ACL for immutable processing-recovery lineage after migration 014's blanket replay. Two full migration replays and isolated SQL budget/ACL checks pass; this is a fix to the existing confirmed recovery/budget contract, not a new user rule or real A11 completion. [Evidence](PROCESSING_RECOVERY_APPEND_ONLY_ACL_2026-09-14.md).
2026-09-14 stage 180 / A11 read-only audit: Terra and Sol judge public standard-route proposal ceilings remain USD11.019202 and USD27.736500; no tariff admitted. S01 playbook plus one possible Terra conservative reservation totals USD21.642082, above the USD17.675596 remaining cap. This is not actual expense or new authorization. [Evidence](A11_REVIEW_ROUTE_BUDGET_AUDIT_2026-09-14.md).
2026-09-14 stage 179 / A11 acceptance visibility: read-only whole-run preflight now lists inactive Tavily /extract as missing-strict-contract, rather than omitting it from readiness. Candidate tariff remains unapproved/inactive, totalRunBoundUsd null, USD30 gate unchanged. [Evidence](A11_EXTRACT_PREFLIGHT_VISIBILITY_2026-09-14.md).
2026-09-14 stage 178 / A10 implementation observation: the planned 06:48 UTC ECB retry returned no fresh reference; 2026-09-11 remains expired, next retry 07:48 UTC. The confirmed 72-hour rule and paid gate are unchanged; this is not a new rule or A11 acceptance. [Evidence](FX_SCHEDULED_RECHECK_2026-09-14.md).
2026-09-14 stage 177 / A11 pending decision: Tavily basic /extract USD0.032000 candidate and strict request validator are documented and tested, but no active tariff was added. This is a proposal under the existing rule that new billing contracts require confirmation; no product approval, paid call, or A11 completion is inferred. [Candidate](TAVILY_EXTRACT_TARIFF_PROPOSAL_2026-09-14.md).
2026-09-14 stage 176 / D13-O03 implementation: final target and stop reason now use post-review eligible assessments; review-requested research pauses as processing-incomplete. Five existing search rounds are shared with read-only A11 preflight. Synthetic graph verification passed; this does not change the user's confirmed O01-O05 scope, prove real fill rate, or complete A11. [Evidence](O03_POST_REVIEW_TARGET_COMPLETION_2026-09-14.md).

2026-09-14 阶段175 / A11、S01验收状态：已批准市场计划专用路由的合成请求与单次合同仍有效，但官方OpenAI端点参数清单未列实际请求中的 `max_completion_tokens` 和 `temperature`；这是未验证的兼容性缺口，不是用户撤销S01或供应商拒绝的证据。路由、费率、4096输出和USD30门禁均未更改；真实业务与整体验收仍未通过。[证据](S01_PUBLIC_ENDPOINT_PARAMETER_GAP_2026-09-14.md)。

2026-09-14 阶段174 / A05、A06实施状态：迁移071将费用观测、价证和预算状态9张表从历史宽授权归一到追加式或状态更新所需最小权限，真实应用角色15/15权限及核销/任务限额SQL通过，未知账单6笔和USD30上限不变。这是既有追加式核销与恢复规则的修复，不是新产品确认，也不证明真实账单或A11完成。[证据](BILLING_LEDGER_ACL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段173 / A05、A10实施状态：迁移070修正既有应用授权残留，公共FX快照及刷新观测仅可追加/读取；官方9月11日参考值在14日00:00 UTC满72小时后继续阻止付费预留，计划刷新失败按原一小时退避。真实SQL和官方只读复核通过，0付费。这是既有确认规则的实施，不是新规则确认或A11通过。[证据](BILLING_FX_EXPIRY_AND_APPEND_ONLY_ACL_2026-09-14.md)。

2026-09-14 阶段161 / B25、B26实施验收进度：仅对现有已批准备用路由按实际请求身份保存并复用完成响应；路由变化、费用未知和模型不符仍暂停，126事实合成图与跨进程产品SQL通过，0真实付费。默认备用严格费率、较长请求、真实语义及A11未通过。这是既有恢复规则实施，不是新供应商/模型路由确认。[证据](P06_FALLBACK_ROUTE_CHECKPOINT_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段160 / B25、B26实施进度：现有OpenAI兼容备用提供方现在可计算与费用层一致的实际付费请求哈希；本地传输拦截核对通过，0真实付费。这不新增路由确认、不准入默认备用费率，也未完成备用响应检查点或A11。[证据](P06_FALLBACK_PAID_REQUEST_IDENTITY_2026-09-14.md)。

2026-09-14 阶段159 / C13、B25、B26实施验收进度：条件Pro在完整LangGraph评分前检查点→3事实阶段→Flash/Pro两次最终请求→产品SQL路径合成通过，151事实/证据、5条用量及Pro精确评估缓存可核对；0真实付费。既有升级阈值未改，真实语义、备用路由及A11整次验收仍缺。[证据](P06_PHASED_PRO_GRAPH_SQL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段158 / C13、B26实施验收进度：超限公司仅在既有8分或关键状态升级条件成立时使用有界Pro最终请求；阶段事实不重算，Flash与Pro响应各按精确合同保存，跨进程零模型复用。7分且无关键变化不升级。合成SQL/预检通过，0真实付费；这不是新模型路由确认或真实语义验收，A11整次费用仍未知。[证据](P06_PHASED_PRO_ESCALATION_2026-09-14.md)。

2026-09-14 阶段157 / B25、B26实施验收进度：最终评分付费结构响应在业务归一化与评估缓存前按完整请求身份追加保存，已保存结果跨进程复用而不重计模型调用；未知、截断、路由或哈希不符仍禁止自动重放。迁移069与合成SQL/全量回归通过，0真实付费。这是既有恢复规则实施，非新用户确认；Pro/备用路由、真实语义和A11仍缺。[证据](P06_FINAL_SCORE_RESPONSE_RECOVERY_2026-09-14.md)。

2026-09-14 阶段156 / B07、B25、B26实施验收进度：隔离合成公司151事实/151来源经现行图、评分Agent、3阶段加1最终请求、PostgreSQL跨进程检查点和产品SQL保存联通，派生缓存合同跨用户隔离；0真实付费。仅证实接线和持久化，不增加新评分规则，也不完成真实模型语义、备用路由、Pro升级或A11整体验收。[证据](P06_PHASED_GRAPH_SQL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段155 / A11、B25进度：只读整次预检显式计入“分阶段评分调用次数上界未知”，保持整次费用`null`与USD30门禁；4阶段合成示例评分+市场计划已超过当前剩余额度USD0.030089，不能启动真实业务。这是既有预算规则的验收状态，不是新增确认。[证据](A11_PHASED_SCORE_WHOLE_RUN_PREFLIGHT_2026-09-14.md)。

2026-09-14 阶段154 / B07、B25、B26实施进度：超限且可评分公司已接入任务范围内逐阶段检查点恢复及最终评分路径；本地SQL 4阶段跨进程部分恢复、图评估缓存先于付费恢复门禁、预算/备用路由/缺项/写失败停止后续请求通过。0真实供应商调用；真实语义、费用合同及生产完整图仍待验收，不能标记P06/A11完成。这是既有确认的实施。[证据](P06_PHASE_AGENT_SQL_RECOVERY_2026-09-14.md)。

2026-09-14 阶段153 / B07、B26实施进度：新增阶段响应完整覆盖综合与最终请求实际字节预检，150条独立事实及全部来源ID可在已批准上限内表达；较长摘要超界则技术暂停。原始证据保留于状态，关键/争议原文在最终请求保留，其他支持事实使用阶段摘要；语义质量仍未实测，阶段付费执行未接线。这是既有确认规则的部分实施。[证据](P06_PHASE_SYNTHESIS_PREFLIGHT_2026-09-14.md)。

2026-09-14 阶段152 / B07、B25、B26实施进度：分阶段完成行新增精确付费HTTP请求哈希，图恢复门禁仅对已报告、完整且哈希匹配的阶段响应免阻止；未知费用、截断和不匹配仍暂停。迁移068及模拟费用行SQL验证通过，尚未接线阶段Agent和最终综合，不视为P06完成；这是既有规则实施，不是新增确认。[证据](P06_PHASE_PAID_REPLAY_IDENTITY_2026-09-14.md)。

2026-09-14 阶段151 / B07、B25、B26实施验收进度：新增用户/任务/国家/来源/阶段/实际请求契约绑定的追加式完成响应SQL表，跨进程读取、重复幂等、RLS隔离及不可修改通过；模拟响应1、0付费。迁移001–067及067重复执行通过，1000项/205文件与生产构建通过。尚未接入评分Agent、未知付费防重放与最终综合；这是既有规则的部分实施，不是新增确认。[证据](P06_PHASE_CHECKPOINT_SQL_2026-09-14.md)。

2026-09-14 阶段150 / B07、B26实施进度：分阶段事实规划请求的Schema与严格输出校验共用定义，缺失/重复/捏造ID、跨事实引用及空摘要在缓存前拒绝，合法乱序归位；1000项/205文件全量回归及生产构建通过。仍未执行或保存阶段模型结果、未完成最终综合和P06；这是既有确认规则的部分实现，不是新增确认。[证据](P06_PHASE_OUTPUT_VALIDATION_2026-09-14.md)。

2026-09-14 阶段149 / B07、B26实施进度：P06既有许可范围内新增无付费、未接线的分阶段事实请求规划器，151事实/152本轮证据均按引用闭合拆入实际序列化上限内的请求；单条超界仍技术暂停。989项全量回归和生产构建通过；阶段响应校验、持久化、防重放、最终综合及真实模型未实施，不能标记P06完成。这不是新增用户确认。[证据](P06_PHASED_FACT_REQUEST_PLANNER_2026-09-14.md)。

2026-09-14 阶段148 / B07、B26实施验收进度：P06已确认边界内，受限原文折叠可与无损字段表及可选共享短语组合，仍按最终完整请求字节预检。110条高熵补充事实经真实序列化与跨进程产品SQL完成模拟评分，111条原证据/111条事实及遥测保留；125/150条边界仍技术待恢复，真实模型和任意大单项分阶段处理未验收。987项全量回归、类型检查和生产构建通过，0付费；这是既有规则的部分实现，不是新增用户确认。[证据](P06_FOLDED_FIELD_TABLE_COMBINATION_2026-09-14.md)。

2026-09-14 阶段147 / B07、B26验收进度：已确认P06边界内，折叠评分的56条原始证据/56条事实经PostgreSQL跨进程恢复及实际产品SQL保存；冲突原文、证据身份、事实与引用保留，准备元数据记录折叠条数，第二账号不可读，0付费。101/105无损路径复验通过。任意大单项分阶段处理、真实模型遵从及A11完整闭环仍缺。这是既有规则的部分验收，不是新增确认。[证据](P06_FOLDED_EXCERPT_CROSS_PROCESS_SQL_2026-09-14.md)。

2026-09-14 阶段146 / B07、B26实施验收进度：已确认的P06边界内，评分单公司无损准备仍超限时，可对校正已支持事实的部分冗长证据原文作显式结构化折叠；全部事实/状态/证据身份与引用保留，冲突、否定和未知原文不折叠，完整请求继续预检。55条独有事实含冲突来源的合成评分完成，全冲突及150条大单项仍技术待恢复；986项全量回归通过，真实模型质量与任意大单项分阶段处理未验收。这是既有规则的部分实现，不是新增确认。[证据](P06_SUPPORTED_EXCERPT_FOLD_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段145 / B07、B26及A11验收核查：无付费全量984项/203文件、生产构建、18项双视口浏览器、lint 0错误/11既有警告及生产依赖审计0漏洞通过。不可压缩的任意大单公司仍为技术待恢复，分阶段完成未实现；整次付费上界仍未知，A11与整体验收未通过。此为已确认规则的当前实施状态，不是新增确认。[证据](CURRENT_REGRESSION_AND_P06_BOUNDARY_2026-09-14.md)。

2026-09-14 阶段144 / B07、B25、B26及D13-O01/O05验收进度：现行补证函数以模拟 Tavily 搜索/提取各1次从空证据候选生成本轮官方证据，再由现行校正与评分 Agent 完成引用、SQL保存1家和生产双视口复核；真实供应商调用0。这是已确认规则的部分接线验收，不新增搜索、角色或评分规则，真实覆盖、语义及 A11 闭环仍未验收。[证据](CURRENT_EVIDENCE_COLLECTOR_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段143 / B07、B25、B26及D13-O01/O05验收进度：现行校正 Agent 用本轮官方夹具证据完成 Distributor 主角色与6条事实，现行评分 Agent 使用校正后的引用完成评分，正结果图经 SQL 和生产双视口保存1家；补充搜索和真实付费调用均为0。仅为已确认规则的部分合成验收，不新增角色或评分产品规则，真实语义、冻结盲审及 A11 闭环仍未验收。[证据](CURRENT_CORRECTION_AGENT_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段142 / B07、B25、B26与D13-O05验收进度：现行评分Agent在隔离合成正结果图中处理一条模拟结构响应，五门禁supported、无规模事实时规模维度中性8/15、7说明引用本轮证据，精确请求缓存入SQL，最终保存1家并经生产双视口复核。无真实模型/搜索或新盲审，O05语义正确率与A11完整闭环仍未证明；是既有规则的部分验收。[证据](CURRENT_SCORE_AGENT_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段141 / A09–A13、B25实施验收进度：隔离两轮自然语言仅用确定性降级生成/修改哥伦比亚Distributor计划，旧提案取消、新提案确认入队；合成完整图评分前暂停恢复后SQL保存1家，本地生产双视口达标，夹具费用守恒。真实Kimi、市场供应商/账单和A11付费闭环未验收；这是既有规则的部分接线验收，不是新确认。[证据](ASSISTANT_FALLBACK_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段140 / A10验收修正：阶段138–139的隔离正结果夹具初版清理遗漏全局公司身份；6条本轮无外键引用的合成残留已清除，脚本加入提交后零残留断言。用户USD30预算及真实业务数据未变；这只修正验收证据，不是新产品规则或A11真实闭环。[证据](POSITIVE_GRAPH_FIXTURE_CLEANUP_2026-09-14.md)。

2026-09-14 阶段139 / B07、B25、B26验收进度：隔离合成正结果图在评分前暂停，同一PostgreSQL检查点继续至公司入库与本地生产双视口；已完成前置阶段不重跑、夹具预留7 micro-USD不重复、越权恢复拒绝。仅验证同进程可控暂停，未知在途费用、跨进程完整正结果及A11真实闭环仍未验收；属于既有规则的部分验收，不是新确认。[证据](POSITIVE_GRAPH_SCORING_PAUSE_RECOVERY_2026-09-14.md)。

2026-09-14 阶段138 / A09、A10、A11、B07实施验收进度：隔离合成正结果从预置计划经图的发现/补证/校正/评分/复核/交接进入产品SQL和本地生产任务页面，目标1、保存1、两视口刷新一致；7 micro-USD夹具费用守恒分配。真实意图模型、搜索、账单及自然语言业务闭环未验收。属于既有确认规则的部分接线验收，不是新增产品规则。[证据](POSITIVE_RESULT_GRAPH_SQL_UI_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段137 / B07、B26实施进度：用户已确认的P06费用及超界处理规则下，评分Agent将不可压缩的超界公司保留为技术待恢复，其同批可评分公司继续按原最多5家及精确缓存契约评分。合成混合次序和全量984项回归通过；图仍在未完成检查点暂停，分阶段大公司、真实模型质量及A11闭环未验收。这是既有规则的部分实现，不是新增用户确认。[证据](P06_OVERSIZED_PEER_ISOLATION_2026-09-14.md)。

2026-09-14 阶段136 / B07、B26实施进度：评分超界的合成图检查点保留公司、原证据及前置额度，恢复不重跑发现/补证/校正；982项全量回归通过。无损压缩与技术暂停已有证据，但不可压缩大单项的分阶段完成和真实模型结构遵从仍未验收。此为既有确认规则的部分验收，不是新确认。[证据](P06_OVERSIZED_SCORE_GRAPH_CHECKPOINT_2026-09-14.md)。

2026-09-14 阶段134 / S01：用户多次明确批准同一项市场计划 Sol 路由和费用合同变更，仍受 A01 累计 USD30 及整次预检约束。实施范围和无付费验证见 [S01 验收](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)；真实最小业务闭环未完成。下文较早阶段所写“S01 待确认”均为当时状态，不代表当前规则。

2026-09-14 阶段133 / B25、B26实施进度：条件复核与裁决各自的有效输出按完整兼容请求依赖、用户/工作区/国家/公司追加式持久化；后续暂停复用已完成子调用，写失败不继续启动下一付费模型。迁移重复执行、真实SQL跨进程隔离及合成 Agent 回归通过，真实付费整图未验收。属于既有结果复用与批次安全规则的部分实现，不是新用户确认；历史费用未知、A11合同与S01待确认不变。[证据](REVIEW_SUBCALL_CHECKPOINT_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段131 / B07、B25、B26验收进度：同一隔离合成任务第一进程评分前暂停，第二进程从真实PostgreSQL检查点使用当前评分Agent和共享短语编码完成1次模拟评分并写入产品结果SQL；101证据/105事实及遥测保留，缓存契约一致，跨用户/动作恢复拒绝，合格和交付0、无真实费用。该路径仍从预置已校正候选开始，不含自然语言/真实供应商或任意大单项分阶段处理；是既有规则的部分验收而非新确认。[证据](P06_SHARED_PHRASE_CROSS_PROCESS_PRODUCT_SQL_2026-09-14.md)。

2026-09-14 阶段130 / B07、B26验收进度：101证据/105事实的无损共享短语评分经实际产品图与 `persistLeadWorkflowResult` 写入一条完成评估、101证据快照、评分遥测及用量；合格0、公司交付0，第二账号不可读、无付费记录。隔离夹具已清理。此为既有规则的真实SQL部分验收，不是新确认；两进程恢复与产品SQL为独立夹具，真实模型和A11完整业务仍未验收。[证据](P06_SHARED_PHRASE_PRODUCT_SQL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段129 / B07、B25、B26验收进度：101证据/105事实的共享短语评分请求经真实图与PostgreSQL检查点在第二进程由当前评分Agent完成，准备metadata及13个合成额度保留，前置阶段不重跑、跨用户/动作恢复拒绝、国家/证据变化使缓存契约失效。模拟评分完成但本夹具最终合格0；业务结果保存仍为模拟适配器、0真实付费。这是既有规则的跨进程部分验收，不是新确认或完整P06/A11通过。[证据](P06_SHARED_PHRASE_CROSS_PROCESS_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段128 / B07、B26实施与验收进度：P06 完整评分 Agent 的超界单公司可对重复的独有事实短语作精确字典引用，完整证据/事实/引用可反解；101证据/105事实合成请求进入既有61,440字节上限，151证据/155事实不可压缩案例仍在外发前暂停。970项测试、类型检查及生产构建通过，0付费。这是既有规则的部分实现及合成回归，不是用户新增确认；真实模型结构遵从与跨进程完整业务尚未验收。[证据](P06_SHARED_PHRASE_SINGLETON_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段120 / D13-O03、A09 验收进度：已采纳的“以最终合格保存数和缺口为目标，部分完成明确原因”在对话卡及详情页共用标签；合成生产 UI 两视口66组通过，缺失历史数仍为未知。此为既有确认规则的部分实现和测试，不是新的用户确认，也不证明真实业务填满目标。[验收](SEARCH_TASK_STATUS_LABEL_PRODUCTION_UI_2026-09-14.md)。

2026-09-14 阶段119 / A04、A07、O03 验收进度：零合格结果经实际产品 SQL 可并发幂等保存，空处理公司集合的合成共享预留保留为未分配、未知核销而不虚构公司费用。这是既有规则的部分实现证据，不是新的用户确认，也不证明真实业务停止原因或 A11 闭环。[证据](ZERO_QUALIFIED_RESULT_PERSISTENCE_2026-09-14.md)。

2026-09-14 阶段118 / B07、B26验收进度：完整评分 Agent 合成回归证明独有证据/事实在可压缩范围内保留值、顺序和引用；压缩后仍超限的公司在调用前停为未完成，不被判低分或不合格。这是既有 P06 边界的部分验收，不是新规则确认或真实模型质量证明。[证据](P06_FULL_SCORING_AGENT_SINGLETON_BOUNDARY_2026-09-14.md)。

2026-09-14 阶段117 / A02只读证据：当前配置的 SearchAPI 凭据可访问官方账号用量接口，但返回字段不能核定当前套餐单价；阶段116的费用拒绝继续有效。此为观察结果，不是用户新确认、已验证费率或准入。[报告](SEARCHAPI_ACCOUNT_READONLY_CHECK_2026-09-14.md)。

2026-09-14 阶段116 / A02实施进度：SearchAPI 当前账号套餐/速度档未核实，产品入口即使有公开参考价也在费用报价时返回 `missing-tariff`，不预留或外发；现有窄请求校验保留，未来准入须有账号合同证据与新版本。此为既有“完整上界缺失即阻止”的修复，不是新价格或路由确认。[验收](SEARCHAPI_ACCOUNT_BOUND_HOLD_2026-09-14.md)。

2026-09-14 阶段115 / A12、O03实施验收进度：发现执行器对合成 `missing-tariff` 与 `budget-exhausted` 保留费用拒绝错误，不写供应商故障或市场耗尽计数。此为既有预算/停止规则的无付费回归证据，并非新增用户确认或真实业务闭环。[报告](DISCOVERY_BUDGET_DENIAL_STATUS_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段114 / A11实施进度：当前最小路径的 Exa 条件发现及 Tavily 官方/校正两类补证，以生产提供方合成传输核对现行严格合同，3条请求均在外发前拦截。原费率、路由、地域与评分边界不变；这不是新用户确认、真实市场闭环或付费放行。[报告](MINIMAL_ACCEPTANCE_EXA_TAVILY_WIRES_2026-09-14.md)。

2026-09-14阶段113 / A11实施进度：最小路径 Brave 核心入口的生产提供方合成请求合同已捕获并验证，CO按既有策略使用 `country=ALL`、单次静态上界USD0.005；真实外发和预算变更均0。此为已授权预检，不是新搜索范围、费率或用户确认；S01及整次真实业务仍待。[验收](MINIMAL_ACCEPTANCE_BRAVE_WIRE_2026-09-14.md)。

2026-09-14阶段112 / A11实施进度：最小闭环只读预检现覆盖当前具体发现、补证、校正、评分和条件复核路径，明确两条搜索缺合同、Terra缺合同、Sol裁决超合同及现行市场计划单次超余额；无用户新确认、无产品路由或付费准入变更。S01依A11仍待单独确认，真实请求及整次预算未验收。[路径清单](MINIMAL_ACCEPTANCE_ROUTE_COVERAGE_2026-09-14.md)。

2026-09-14阶段111 / A05、A08实施进度：公开费率刷新在价证待审或既有粘性暂停时，后续追加遥测不再把它算成下游可用输出；有效价证与真正被下游使用分别计数，原暂停和静态合同不变。15项合成定向测试及 typecheck 通过，不回写历史记录、无新产品确认。[报告](PUBLIC_RATE_HOLD_USAGE_ACCOUNTING_2026-09-14.md)。

2026-09-14阶段110 / A05实施进度：Exa Search 和 Google Places Text Search Enterprise 的现行静态上界新增官方公开单价只读刷新与预算页面展示。真实SQL中 Exa 一致；Places 一次265字节短页无法核实，现保持 review-required/hold=true，后续独立官方页面与基线一致也不自动解除。原金额、截止、路由均未改；SearchAPI 套餐归属/完整上界仍缺，继续阻止。此为已授权部分验收，不是新费率或新用户确认。[报告](EXA_PLACES_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段109 / B25、D13-O01实施进度：评分付费响应已返回但缓存与图检查点都未持久化时，恢复保留原检查点时间，按用户/任务/公司国家哈希查询已记账响应并阻止自动重放；有效缓存仍复用、费用占用不释放。真实PostgreSQL跨进程合成故障回归通过。这是已确认规则的部分实现，不是新产品确认、真实模型闭环或整体验收。[证据](UNCHECKPOINTED_SCORE_RECOVERY_GUARD_2026-09-14.md)。

2026-09-14阶段108 / A05实施进度：现行 Brave/Tavily Search 静态上界新增每日官方公开单价与credit用量只读复核，漂移时按受影响规则粘性暂停新预留；真实SQL/生产UI通过。这是既有费用门禁的部分实现，不是新用户确认、新费率或新路由。原2026-09-20截止和A11/S01状态不变。[验收](SEARCH_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段107 / A05、A11实施进度：现行 DeepSeek Flash/Pro 静态合同新增每日官方公开费率只读复核、漂移时粘性暂停新预留和预算状态展示，真实SQL/生产UI通过。此为既有费用门禁与费率刷新要求的部分实现，不是新费率、新路由或用户确认；原合同金额及 2026-09-20 截止不变，A11变更确认与S01路由确认仍待。[验收](DEEPSEEK_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段106 / D13、P05实施进度：已完成评分批次缓存保存失败或缺少精确复用合同后，停止启动后续批次并保留待恢复状态；真实PostgreSQL合成检查点恢复通过。这是已有O01/O04及中断恢复规则的部分实现，不是新用户确认；A11新费用合同与S01路由确认仍待。[证据](ASSESSMENT_BATCH_PERSISTENCE_STOP_2026-09-14.md)。

2026-09-14阶段104 / A10、A11实施进度：现行 Sol 合同已接七天公开只读复核、漂移/无法核验时粘性暂停新预留，网络失败不延长静态期限；真实SQL和本地生产UI通过。这是既有确认规则的部分实现，不是新产品确认；其他费率刷新、变更确认及S01路由确认仍待。[验收](OPENROUTER_SOL_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段103 / A02实施核查：四条默认OpenRouter备用模型公开端点只读审计发现 DeepSeek V4 Flash/Pro价格证据已漂移、所有可兼容端点缺显式缓存写价，仍不得准入。[缺口审计](OPENROUTER_DEFAULT_FALLBACK_GAP_AUDIT_2026-09-14.md)。这不是新确认；A11变更确认、A20 credits-only、D13 O01–O05采纳及S01待确认状态不变。

2026-09-14阶段102 / A11预检进度：合成市场计划SDK实际传输4,171字节/4,096输出符合现行Sol合同，但27.345252单次上界超最后余额。此为已授权只读验收证据，不是新用户确认或付费许可；A11变更确认、A20 credits-only、D13 O01–O05采纳及S01待确认状态不变。[报告](MINIMAL_ACCEPTANCE_PLAYBOOK_WIRE_PREFLIGHT_2026-09-14.md)。

2026-09-14阶段101 / O04、P05实施进度：公开主角色缓存读取异常不再按未命中发起补证/模型，恢复后真实空缓存仍可继续。此为D13已采纳复用及已授权防重放修复，不是新用户确认；A11费用变更、A20 credits-only与S01待确认状态不变。[验证](ROLE_CACHE_READ_FAILURE_GATE_2026-09-14.md)。

2026-09-14阶段100 / O04、P05实施进度：可选市场计划缓存写入失败不再丢失已生成计划，图检查点保留计划及额度并可跨进程恢复。此为D13已采纳的复用与已授权恢复修复，不是新用户确认；A11费用变更确认、A20 credits-only和S01待确认状态不变。[验收](PLAYBOOK_CACHE_WRITE_RECOVERY_2026-09-14.md)。

2026-09-14阶段99 / A11费用合同进度：Sol 分歧裁决 12,000 输出的公开端点只读复核得 USD27.736500/次候选上界，仍超现行 4,096 输出合同及最后余额。这不是新用户确认或实际费率准入；A11变更确认、A20 credits-only、D13 O01–O05采纳与S01待确认状态均不变。[候选合同](OPENROUTER_SOL_JUDGE_PROPOSAL_2026-09-14.md)。

2026-09-14阶段98 / A08验收进度：真实本地生产HTTP和Chrome两视口58组证实阶段用量聚合刷新不重计、未知采用保留；这是已确认遥测规则的合成验收，不是新产品确认或真实业务采用证据。[报告](WORKFLOW_USAGE_PRODUCTION_HTTP_2026-09-14.md)。

2026-09-14阶段97 / A08实施进度：工作流阶段与模型聚合经独立API字段只读展示，未知用户采用不填零，真实SQL合成对账及跨用户隔离通过。此为既有A08遥测要求的实现，不是新用户确认；A11费用变更确认和S01待确认状态不变。[报告](WORKFLOW_USAGE_AGGREGATE_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段96 / P05实施进度：公开角色校正缓存引用绑定 v3 精确区分同页同摘录、不同标题证据；旧绑定 miss 保留历史。此为已确认缓存身份与引用正确性范围内的修复，不是新产品确认，不改变 D13、A11 费用变更确认或 S01 待确认状态。[验证](ROLE_CORRECTION_CACHE_BINDING_V3_2026-09-14.md)。

2026-09-14阶段95 / A11费用合同进度：官方公开 Terra 端点只读复核仍得二次复核候选上界 USD11.019202；这不是新用户确认或实际费率准入，不改既有 A11 变更确认、A20 credits-only、D13 O01–O05采纳和 S01 待确认状态。[候选合同](OPENROUTER_TERRA_REVIEW_PROPOSAL_2026-09-14.md)。

2026-09-14阶段94 / P05、用户修改优先的验收证据：隔离真实SQL证明再评估不覆盖同国手动主角色、账户等级、阶段和跟进行动，机器分数可更新、冲突继续标为需重验，另一国及用户隔离；fixture清理，0真实付费。此为已有确认规则的验收，不是新的产品确认。[报告](USER_OVERRIDE_REASSESSMENT_SQL_2026-09-14.md)。

2026-09-14阶段93 / A13实施进度：Gemini外部问答明确非完成响应不进入答案整合，费用和未完成状态保留；这是已授权回归修复，不是新用户确认。Gemini费用门禁、S01待确认及D13采纳状态不变。[验证](GEMINI_EXTERNAL_ANSWER_COMPLETION_2026-09-14.md)。

2026-09-14阶段92 / A02实施进度：Gemini发现请求新增12,000生成输出上限，明确非完成结果不转成有效公司；仍缺服务端搜索次数费用上界，保持拦截。此为已授权费用/未完成状态修复，不是新用户确认、不改变D13、A20或S01待确认状态。[验证](GEMINI_DISCOVERY_OUTPUT_BOUND_2026-09-14.md)。

2026-09-14阶段91 / A11预算核查：新增[条件复核情景](OPENROUTER_REVIEW_BUDGET_SCENARIO_2026-09-14.md)，S01与Terra上界合计超最后余额。此为只读推算，不是新确认、不改变A20 credits-only、D13采纳或S01待确认状态；付费前仍须重核累计USD30。

2026-09-14阶段90 / A20、D13实施进度：当前账号仅OpenRouter credits、无BYOK的已确认范围不变。公开抓取6模型52端点仅作证据；备用校正补默认8192输出上限，未知模型费率/完整合同仍拒绝。此阶段没有新用户确认规则，也没有采纳S01路由候选。[费用审计](OPENROUTER_REMAINING_ROUTE_AUDIT_2026-09-14.md)。

2026-09-14阶段89 / D13实施进度：恢复检查点继续前重新核验证据日期、内容/当前运行绑定、原快照及公共文档版本；到期或无法核实的公司重回必要补证，原费用保留。此为已确认O01/P05的部分实现证据，不新增确认规则。888测试/195文件、build、局部lint与隔离SQL通过，0真实付费；真实业务仍缺。[阶段报告](RECOVERY_RESUME_DEPENDENCY_REVALIDATION_2026-09-14.md)。

2026-09-14阶段88 / D13实施进度：恢复链唯一保存公司数按用户、原任务、国家及已完成运行的实际入库选择对账；重复槽位不补量，缺失来源保留未知。此为已采纳O01–O03的实现/合成验收证据，不新增确认规则，不改冻结测评。882测试/194文件、build、真实SQL及生产Chrome两视口56组通过；0真实付费/发信，A11仍未验收。见[恢复链对账](RECOVERY_FAMILY_RECONCILIATION_2026-09-14.md)。

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

2026-09-13阶段66 / A21、B25恢复验收：结果提交保存完整JSON输入身份；同一run相同输入幂等，不同输入拒绝，历史无身份保留待核对。实际产品SQL两国6次冲突/2次旧记录拒绝通过，原事件/国家/费用守恒；834测试、build含类型及局部lint通过。无新用户规则、无真实付费，不把此项当历史缺项恢复完成。

2026-09-13阶段65 / A21待处理展示：复用已有检查点接口公开待校正/待评分候选项，按阶段不相加；任务刷新重新读进度，缺失/失败unknown、已知0保留。生产Chrome两视口44组通过，真实Postgres检查点1/1→0/0、owner拒绝及恢复验证，无节点执行/新付费，fixture清理。832测试/build/生成check及局部lint通过；无新产品规则。

2026-09-13阶段64 / A21页面验收：失败或暂停等有已记录保存数的任务也显示实际缺口，unknown不倒推0；不改变续搜执行规则。最新本地生产Chrome两视口42组检查通过，含九类数量/停止状态与刷新，原国家/个人修改/成本回归通过。832测试/build/生成check通过，无真实付费/发信，fixture清理；待处理检查点数量展示及真实业务UI仍未完成，无新规则。

2026-09-13阶段63 / A21实际入库验收：调用产品persistLeadWorkflowResult定位并修复证据有效期参数整数/文本冲突。两国4并发实际SQL通过，1共享身份/2国家记录/2证据/14幂等事件，23微美元合成预留分摊守恒且未知保留、跨用户不可读；fixture清理。无新规则、无真实付费、未改累计USD30；完整真实模型/UI闭环仍未验收。[报告](RESULT_PERSISTENCE_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段62 / A21遥测实施：结果保存写saved/delivery-selected并标记system，用户采用/页面查看为null；有效角色依完成契约计数。迁移054仅扩展事件枚举及v2唯一索引，历史不改。实际SQL重复仅7事件、冲突拒绝、国家/用户隔离通过，迁移已应用，fixture回滚、0付费。无新产品规则，真实UI采用仍待接线，[边界与回滚](ARTIFACT_OBSERVATION_BOUNDARY_2026-09-13.md)。

2026-09-13阶段61 / B25、B26验收：当前字段表压缩及实际序列化契约通过两进程PostgreSQL检查点恢复：100证据/准备metadata/13合成额度保留，校正不重做，owner/action拒绝及国家/证据契约变化通过。typecheck通过，隔离thread清理，0付费。仍是合成业务适配器，不替代完整真实业务或实际Agent全部契约；无新规则，goal active。

2026-09-13阶段60 / B07、B26实施：超限单公司新增独有证据/事实的字段表结构化压缩，完整值/引用/顺序保留，按实际主/备用请求测量；仍超限保持未完成并暂停。既有规则明确压缩或分阶段，未新增自动付费摘要。63针对性测试及生产build通过，内存图恢复保留候选/费用且不重复搜索补证；真实模型、跨进程全链路仍待验收。[边界与证据](P06_STRUCTURED_SINGLETON_2026-09-13.md)。

2026-09-13阶段59 / A20、A21实施：credits-only Sol精确标准文本JSON请求加入静态v1.6.0，完整上下文分别计入输入/缓存读/写，4096输出，上界USD27.345252，到期2026-09-20T00:00:00Z；不改模型/路由，未知能力拒绝。828测试/build通过，预算只读仍12.324404/30，单次预留高于余额，真实业务未调用。无新用户决定；A20确认不替代其他模型上界、历史费用或整体验收证据。[计算与限制](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)。

2026-09-13阶段58：A20既有credits-only确认已重新核对，用户再次明确当前账号/工作区“未配置 BYOK，仅使用 OpenRouter credits”，覆盖本次询问列举的OpenAI/Azure/Bedrock等供应商。此前阶段56–57重新列为待确认是恢复核对遗漏，现撤销该当前阻塞，保留历史过程。当前产品124b0c2全量826测试/181文件、生产build含类型检查、生成check通过；生产依赖及全依赖npm audit均0漏洞，lint0错误/11既有警告。无新付费，整体仍未完成。

2026-09-13阶段57 / A21采用遥测：续搜创建记录1个有效新提案，重复复用记录0新输出，不再每次点击累计下游使用；两者执行计数0、userAdoptedItems=null，保留输入/耗时/重复原因/费用0。5项相关测试、typecheck、生成check及真实SQL通过：两次调用仅1新提案，无执行job，父结果不变且RLS通过。verify-search-continuation.ts改为临时隔离账号，全部schema/fixture事务回滚，无付费。历史终态缺项恢复仍待完成，BYOK确认尚未收到，goal active。

2026-09-13阶段56：实际LangChain市场计划请求离线捕获，7个顶层字段、2纯文本消息、strict JSON Schema、4096输出和既有provider参数，无工具/插件/特殊层；模拟门禁后仅1次传输捕获，0真实推理。typecheck通过。只读key元数据证实非管理key，不能据此推定未配置BYOK，已询问用户工作区状态；不索取密钥。详见[费用核验补证](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)。产品未改，无新增规则，goal active。

2026-09-13阶段55：公开API捕获Sol 7端点及来源哈希，官方证据澄清当前未启用特殊服务层，不需把flex/priority直接归入当前路由；标准Azure仍有长上下文/缓存收费差异。脚本和typecheck通过，0推理/付费/账号变化，未启用费率或改模型。详见[费用上界核验及下一步骤](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)，整体验收未完成。

2026-09-13阶段54：新增最小闭环只读预检脚本，当前目标1首池2，预算仍12.324404/30；市场计划实际openai/gpt-5.6-sol缺完整费率，未启动已知会中断的前置付费。仅验证5个入口费率可用性，不是整次费用上界；无调用/账号修改/任务认领，typecheck通过。详见[预检结果与下一必要工作](MINIMAL_PRODUCTION_PREFLIGHT_2026-09-13.md)。无新产品规则，goal active。

2026-09-13阶段53 / A21、D13-O04验收：阶段52搜索指纹通过真实应用角色SQL与合成传输验证，未知响应后两并发重试在出网前拒绝、参数换序复用身份、原10微美元合成预留保留、其他operation独立、成功请求禁止重复。原核销/分摊检查继续通过；typecheck通过，fixture清理，真实付费0，无新规则。

2026-09-13阶段52 / A21、D13-O04恢复：已核验的Brave/Tavily/Exa/Places/SearchAPI同步搜索在发送前生成请求指纹，接入既有按用户/operation/stage隔离的持久账本防重放；模型原指纹不变，轮询不扩大适用。查询/正文排序规范化，Places字段范围纳入身份，凭据不进入语义身份。825测试/build/生成check通过，真实SQL搜索恢复待补验。预算只读重核仍USD12.324404/30、6未知，无新付费；无新产品决定。

2026-09-13阶段51 / A21验收：阶段50审核修复通过真实SQL补验，包括跨用户、事务锁、重复决定、并发唯一新决定、部分批准恢复、遥测2个新输出及知识可检索。固定合成数据与预存知识，无新付费；首次fixture字段缺失已回滚修正。无新产品决定，邮件模型提取/嵌入及页面全链路仍未完成。

2026-09-13阶段50 / A21恢复与采用率收尾：邮件候选审核按用户/候选事务锁串行，重复同决定复用，相反决定或处理中返回409；已保存知识但状态提交中断时保留批准恢复资格，禁止改为拒绝。保持私有知识规则，无新产品决定。8项针对性测试、820全量测试（遥测包装前）、最终包装后针对性/typecheck/生产build通过。真实SQL并发及邮件全链路仍待验收。

2026-09-13阶段48 / A21验收：两视口24组真实浏览器检查通过，新增一年以上证据提醒及保留查看；私有开发知识真实SQL检索验证两用户、国家/角色/归档/用途过滤及RLS，无嵌入API。首次合成状态值错误已事务回滚后修正。typecheck通过、fixture清理、无付费/发信，无新规则；通用RAG/邮件知识全链路仍不据此标完成。[证据](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段47 / A21渠道图验收：修复手工添加响应的国家字段和英国别名归一，新增节点即时显示；保持公司身份共享、国家业务隔离与待核实状态。真实Chrome桌面/手机22组检查通过，含手工表单、重复返回已有公司且不新建。812测试/build/生成check通过，0搜索/模型/发信，fixture清理。未新增产品决定，[证据](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段46 / A21 UI收尾：详情新增缺失的账户等级编辑，沿用现有层级兼容与个人记忆保存规则；真实生产Chrome两视口20组检查通过，其中角色/等级/路径三项修改经页面→API→SQL记忆核对，国家隔离及评分待更新提示正确。无自动重评/搜索/发信，fixture清理。812测试/build/生成check通过；无新产品规则，[页面证据](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)，整体仍未完成。

2026-09-13阶段45 / A21本地生产验收：真实Chrome桌面/手机18组页面检查通过，范围为鉴权、国家详情/图、任务/知识导航、预算取消与读取、公司成本真实API和刷新；数据均隔离合成，0付费/发信，已清理。累计占用只读重核USD12.324404/30、6未知保留。仅此范围通过，用户修改/真实业务闭环仍待验，不新增规则。详见[页面报告](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段44 / A08与D13-O03：首轮零候选不再直接抛异常；保留run、调用证据、费用和实际处理集合，由已有图控制器决定继续/耗尽/供应商不可用。预算异常仍抛出，不返回伪零结果。812测试/178文件、生产build（含类型检查）和生成check通过；合成图验证零输出可进入结果/费用完成路径且不调用评分。无新规则或付费，实际浏览器/业务仍待验。

2026-09-13阶段43 / A07–A08：任务预算API及页面接入公司当前费用投影，逐预留读取五种独立口径，按已保存归属/完成集合分摊，未关联归属独立展示；每种金额显示已知次数/相关调用次数，未知与零分开。仅从当前用户当前任务搜索结果关联域名/国家，不借用其他任务身份。808测试/177文件、typecheck/build、真实SQL守恒/重复读/用户任务隔离与静态页面渲染通过；浏览器和真实业务尚未验收。无新业务规则或付费。

2026-09-13阶段42 / A07–A08实施：工作流公共开销显式task-shared，直接公司调用继续覆盖为company-inputs；跨轮累计实际门禁处理公司键，含拒绝/缓存复用，不按目标或合格数分摊。结果事务保存完成集合及独立预留分摊，集合不可静默改变；后到核销采用该集合，原观测和金额不重写。旧检查点缺集合保持未知。805测试/175文件、typecheck/build/生成check及真实SQL合成核销通过；公司成本页面和真实业务仍未完成，不新增确认规则。

2026-09-13阶段41 / A21阶段4、D13状态同步：当前验收矩阵已逐行整合阶段25–40实现、合成/SQL验证及剩余真实验收；旧矩阵原样归档，避免旧“全部待实现”覆盖O01–O05当前证据。D13采纳持续有效，无新产品决定；Gemini完整费用上界仍缺官方搜索次数约束，继续门禁。仅文档核验，无代码/费率/付费变化，整体验收未完成。后续状态以[唯一矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)为准。

2026-09-13阶段40 / A21费用及D13-O04兼容性：SearchAPI普通Google/Bing第一页保守上界USD0.008接入，覆盖公开增强速度最高档，至2026-09-20T00:00:00Z；Google按官方固定num=10，Bing最多20，不自动追加分页。严格字段/引擎契约，旧发现会话版本不静默复用。802测试/typecheck/build通过，无付费；[依据及范围](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。

2026-09-13阶段39 / A21费用收尾：Google Places现有Text Search字段集合按Enterprise SKU保守预留USD0.035/次，至2026-09-20T00:00:00Z；实际FieldMask纳入发送前白名单校验，禁止字段扩张沿用旧预留。800测试、typecheck/build通过，无付费。公开标准价、字段和范围详见[核验来源](SEARCH_REQUEST_BOUNDS_2026-09-13.md)，不把预留当作已核销账单。

2026-09-13阶段38 / A21费用收尾及D13-O04兼容性：Exa auto/company纯文本搜索最多20结果的保守预留USD0.027已按官方来源核验并接入，至2026-09-20T00:00:00Z过期。移除官方已不支持的company/excludeDomains组合；原查询及本地排除保留，不扩范围。请求契约版本升级，旧会话不能静默复用；costDollars只作估算，不核销。798测试、typecheck/build通过，无付费；来源与限制见[搜索上界核验](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。

2026-09-13阶段37 / A21费用收尾：按已授权边界核验并启用Brave普通Web Search上界USD0.005/次、Tavily basic/advanced Search统一保守上界USD0.016/次；仅公开标准计费，严格方法/端点/字段白名单，有效至2026-09-20T00:00:00Z。见[来源与请求边界](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。796测试、typecheck/build通过，无新增付费；预算只读重核仍USD12.324404/30，6笔历史未知保留。此为请求上界，不是账单核销；其他未核验入口继续阻止。

2026-09-13阶段36 / B26-P06：超限单家公司请求新增无损重复文本字典压缩。只合并完全相同且至少256字符的证据标题/摘录，保留每项ID、URL、来源、全部事实与引用；只在实际主/备用请求字节减少时采用。原始证据不改写，缓存身份使用压缩后的实际请求。795测试/174文件及typecheck/build通过，无付费。普通批次不改变；无可合并文本或压缩后仍超限继续暂停，独有事实过大的分阶段处理及完整P06仍未完成。

2026-09-13阶段35 / B26-P06：校正/评分拆批开始使用主路由及获准备用模型各自序列化后的完整字节数，包含schema、实际模型和extraBody，最多5家公司及既有字节上限保持。公开专用路由不参与私人请求拆批；熔断状态不改变批次或缓存身份。真实适配器+受控传输验证备用schema导致的双公司拆分、发送字节一致及路由成功；全量792测试、typecheck/build通过，无付费。这是提前按所有获准路由拆批，单项仍超限时继续暂停，结构化压缩/分阶段处理仍待实现，不标记完整P06通过。

2026-09-13 阶段34 / D13-O05：13 个具体角色的可观察证据锚点接入评分请求，沿用现有评分卡、权重、资格与证据上限；family/subtype 不一致、Hybrid 或 Unresolved 不进入评分付费批次，保留 research-required/retry-required。缓存依赖同步采用过滤后的实际批次与新提示版本。冻结 374 条校正记录覆盖回放：112 条具体角色可用、208 条主角色待定、54 条校正需恢复；不等于唯一公司数或恢复数量。791 测试、typecheck/build 通过，无付费、无盲审重跑。O05 规则实施及离线覆盖完成，真实产品接线验收和整体 goal 仍未完成。

2026-09-13 阶段33 / D13-O04：策略1.7.0将四类搜索各轨Brave设为核心，Retail Places、Distribution/SI Exa、Distribution/Resale Gemini按任务+类别的已购新增公司贡献条件启用；SI原有Gemini也保留为可选探测，其余类别不变。不全局禁工具，连续两次成功新请求无新增才暂停该任务类别的可选调用（沿用已有阈值2），故障/缓存不计无贡献。跨轨复用忽略内部类别/轨道/机制标签，但严格保留实际请求输入差异；策略/契约版本进入会话依赖。788测试/typecheck/build通过，无新实验/付费，实际业务验收仍待完成。

2026-09-13 阶段32 / D13-O04：发现调用结果与门禁结果在轮内写入带用户/工作区/国家/任务/请求契约的检查点；恢复重建已完成调用与门禁，不再当作新供应商调用。遥测写入事务化且按运行/请求指纹幂等，整轮汇总按轮次幂等；保存故障不污染供应商健康。786测试、真实SQL并发幂等/恢复边界、typecheck/build通过，无付费。跨轨实际请求去重、类别条件路由及整体业务/UI验收继续。

2026-09-13 阶段31 / D13-O04：产品发现轮次之间开始传递任务会话快照，保存去重集合、已购搜索结果、失败/熔断/冷却状态到图检查点。依赖覆盖原请求、任务、国家、策略与供应商配置摘要，变更时阻止直接恢复旧会话；不保存明文凭据或rawResponse。784测试、typecheck/build通过。单轮内部中断保存、跨轨请求契约去重和类别条件工具顺序仍待完成，O04未整体验收。

2026-09-13 阶段30 / D13-O02/O03：O02真实路由SQL验证通过，用户/工作区/国家隔离和范围外状态已核对。角色待判明确返回role-unresolved，不能认定搜索耗尽；最终保存不足返回qualified-shortfall而非沿用中间target-met；故障期间旧停滞数不能证明耗尽。任务消息与页面共用停止原因，未达标显示部分完成及缺口。完整780测试及生产构建通过；此进度不替代真实业务/UI整体验收。

2026-09-13 阶段29 / D13-O02：新增独立候选路由节点，按规范化公司身份、国家、目标家族关联；目标具体角色必须属于原请求，范围外只保存状态，同家族未请求子类型也不自动扩大范围。跨轮次重复只送一个公司评分，优先复用已有完整评估的候选ID；冲突角色保留待判。路由先写 run.metadata.candidateRouting，再进入评分，写入失败从路由检查点恢复，不重做校正。合成单元/图验收通过，真实路由SQL与冲突恢复闭环尚待验收。

2026-09-13 阶段28 / D13-O01/O03：真实 PostgreSQL 跨进程缺项恢复和核销后失败请求恢复门禁验证通过（合成公司持久化适配器）；续搜只排除 scoring_status=completed，连续零结果不单独认定市场耗尽，processing-incomplete 禁止新建续搜。O01 历史终态兼容、跨国家恢复和完整业务持久化验收仍未全部完成。

2026-09-13 阶段27 / D13-O01：处理缺项改为停在可恢复检查点，现有失败任务恢复入口只重开缺失校正及未完成评分，保留完整评分、证据与累计费用。恢复前核验整个任务的未知/在途/超界费用，禁止用改变批次绕过请求防重放。合成跨流程实例恢复验证通过；真实 PostgreSQL 跨进程恢复、历史终态任务迁移及全部 O01 验收仍待完成。

2026-09-13 阶段26 / D13 实施进度：O01 已接入校正完成状态、异常角色缓存读写门禁及处理未完成停止原因；角色策略升至 v4，使旧缓存依赖失效。合法多家族 Hybrid 与证据不足 Unresolved 保留原语义。未完成付费请求没有自动重放授权。恢复入口与完整状态持久化尚待实施，O01 未整体验收；O02–O05 的用户采纳持续有效，仍按报告边界实施。

版本：1.21.0。整理日期：2026-09-13。来源：本项目用户确认记录及仓库文档。

阶段25 / A05/A20：OpenRouter固定HTTPS即时响应在完整usage.cost、明确is_byok=false及请求唯一关联后可追加核销；缺失/过期/不匹配保留预留。761 tests/170 files、typecheck、生产build及真实数据库合成传输入口验证通过。未改变模型/路由，不新增付费，不开放未核验费率；真实完整业务待验收。验收占用只读重新核验USD12.324404/30，6笔费用仍未知。D13仅为新优化采纳，O01–O05实现仍未完成。

### D13 — 采纳 O01–O05（2026-09-13，用户明确确认，待实施）

用户原话：“采纳 O01–O05，按报告边界实施”。对应 [流失调查方案表](COLOMBIA_CANDIDATE_ATTRITION_2026-09-13.md)：O01异常角色/未完成状态、O02原请求四类别范围内可追踪错类转移与去重、O03最终合格目标/停止和恢复状态、O04任务工具健康/跨轨去重及类别条件启用、O05角色评分锚点与family/subtype校验。具体实施必须保留报告验收边界：不降标准、不扩大用户指定范围、不新增调查搜索/补证/模型盲审、不改写冻结结果、不把潜在恢复池当合格增量；模型质量验证如需额外调用仍受原授权边界约束。此确认覆盖D12及相关文档的O01–O05待采纳状态，不等于已实现或通过验证。确认时生产代码尚未改变；后续逐项登记实现及验收证据。

### A21 — 本次完整 plan 的验收范围（2026-09-13，用户明确授权）

完成已授权费用门禁/核销/公司成本、P05/P06与中断恢复、遥测/UI及本地生产最小真实闭环和最终回归；累计 USD30 上限不重置，最后历史占用 USD12.324404，付费前重新核验。只用隔离验收账号，不执行已有用户待办；已通过模型连通性及 SMTP 收件不重复列待测，除非相关实现变化影响其证据。不含云部署、新市场实验或无关扩展。全部必需项实际通过才标记整体验收完成。实现/验收状态：部分实现、整体未通过，以 [当前矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md) 为准；创建 active goal 不构成实现或测试证据。

### D12 — 候选不足调查与新优化采纳边界（2026-09-13，用户明确授权）

仅使用冻结现有测评数据，不重跑正式实验、不新增搜索/补证/模型盲审；不降低合格标准、不扩大指定范围、不使用重复公司补量。以最终合格数量为目标；预算、供应商不可用或有依据的耗尽允许部分完成，并明确缺口和停止原因。新搜索/角色判断/评分优化须形成可核对方案，用户确认后才能进入真实产品。原冻结报告与盲审失败不改写，不将确定性回放解释为实际填充率提升。实现/验收状态：首版 [调查与O01–O05建议](COLOMBIA_CANDIDATE_ATTRITION_2026-09-13.md) 完成、8项离线对账通过；原历史缺失明确未知；O01–O05尚未采纳，生产代码未因调查而改动。本轮不使用旧恢复文档中追加最小模型校准的建议发起模型调用。

阶段 24 / A06/A07/B21：补证和主角色补充搜索逐公司费用归属、门禁逐真实批次归属已接入；补证预算停止不再被吞为普通警告。722 tests /169 files、typecheck/build 通过，无新增付费。没有新增规则或扩大预算；完整共享成本与真实业务等未完成，详见验收阶段 24。

### A20 — 当前 OpenRouter 账号计费方式（2026-09-13，用户已确认）

再次确认原话：“未配置 BYOK，仅使用 OpenRouter credits”。范围为当前产品使用的OpenRouter账号/工作区及所有供应商BYOK，不仅限于下面历史说明中的OpenAI/Anthropic。实施状态：credits-only报告适配已在阶段25实现并经合成SQL验证；完整请求上界尚未启用，真实业务费用报告仍待验证。当前无需再次询问此账号状态，除非用户明确告知配置发生变化。

用户明确确认：当前账号仅使用 OpenRouter 充值余额，未配置 OpenAI/Anthropic BYOK。这是本项目当前账号的计费前提，不推定其他账号或未来账号配置。网关接口报告仍需完整且唯一匹配调用才能按 A05 核销；账号确认本身不证明单次费用、不释放历史未知预留、不提高 USD30 验收预算、不改变模型或路由。如后续启用 BYOK，须重新核验上游单独计费边界，不沿用 credits-only 的完整性结论。本条覆盖阶段 23 的账号待确认状态；正式网关费率及报告适配尚待验证。

阶段 23 / A02/A06/B21：北京区 text-embedding-v4 同步纯文本预留契约及完整向量检查已接入，保留原模型、1536 维配置、无 Embedding 冗余。官网完整批次 CNY0.040960，经有效 FX 和 5% 缓冲预留 USD0.006412；未知账单不释放。719 tests /168 files、typecheck/build、真实库只读预算/FX 核验及双范围依赖审计通过。规则版本不变；OpenRouter 当前账号是否 BYOK 尚待确认，非用户已经批准的计费假设，整体验收未通过。详见验收阶段 23。

### A19 — 兼容评分入口输出上限（2026-09-13，已实现待完整业务验收）

用户明确确认：复核 8,192、裁决 12,000、备用评分 8,192，分别可配置；模型、推理强度和升级条件不变，截断未完成且不自动重试。生效范围 OpenAiCompatibleProvider 的 lead-review-secondary / lead-review-judge / lead-qualification；原生 DeepSeek 主评分等不受影响。实现与检查详见验收阶段 22。本条覆盖 A18 及阶段 21 中关于这些入口的历史待确认状态。

### A18 — 三类文本输出上限（2026-09-13，已实现待完整业务验收）

用户明确确认：回答/整合各 8,192，playbook 4,096。分别可配置，不改变模型和 thinking；截断不记成功、不自动重试，已发生用量与未知费用保留。实现 text-output-policy.ts、三个 SDK 入口及账本完成状态；playbook 缓存纳入契约。详见验收阶段 21。复核/裁决/备用评分额外上限未获确认，不包含在本条授权中。

阶段 20 / A01–A08：现有追加式费用观测保存估算/报告/发票及前后占用的独立守恒分摊，只使用原预留中已存公司归属，不取发票处理任务的上下文。未知仍 null，旧缺失归属不猜测，不新增支出或核销权限。701 tests /163 files、生产 build、真实 SQL 052 合成六观测守恒/幂等/发票优先验证通过，真实账单适配及任务共享完成分摊等仍待完成，详见验收阶段 20。

阶段 19 / A07–A08：评分、主角色矫正、异常复核及修复/升级入口记录实际输入公司与国家键，在原预留事务保存独立的守恒预留分摊；失败费用不丢弃，未知不填零、不新增支出。697 tests /162 files、typecheck/build、真实 SQL 051 合成守恒/隔离验证通过。任务共享完成分摊、其他费用口径持久化和完整公司成本展示尚未完成；规则未变，详见验收阶段 19。

阶段 18 / A01–A06、B11–B15：公共 ECB 参考快照独立入库，worker 运行时每日刷新、失败每小时恢复、跨进程去重；严格 72 小时及 5% 预留缓冲，不扩展既有授权。680 tests /160 files、生产 build、真实 SQL 053 并发/缓存/不可覆盖验证通过，无新增付费。并未据此启用人民币费率或发票核销，不等于整体验收通过；详见验收阶段 18。

阶段 17 / A01–A06、A12、B11–B15：上线版本 request-bounds-v1.1.0 仅允许严格非思考文本 DeepSeek Flash Chat / Pro Anthropic，官网上下文保守上界为 USD0.324404 / USD1.416561 每次，2026-09-20T00:00Z 最迟失效。不是新模型/新费率决策的虚构用户确认，是既有官网费率与保守预留原则的实现计算；其他接口仍缺失即阻止。真实 V4.1 单合成样本计数 155=155、输出有效、一次调用通过；原累计预算占用现 USD12.324404/30，估算 USD0.000054 只追加记录不释放预留，账单未知。详见验收阶段 17，不代表整体通过。

阶段 16 / B21：Kimi 意图、开发策略/邮件/跟进、邮箱学习及 Claude 修改邮件原生入口已关联真实尝试序号与提示版本。667 tests /157 files、typecheck/build 通过。官方 Kimi 原币价格表读取成功，和 DeepSeek 来源观察存入独立 reference-only JSON，未导入付费规则；不等于费用上界/汇率/账单核销通过，无新增付费。

阶段 15 / A06、B21：SDK 调用级预算停止、逐实际 HTTP 尝试归因接入 RAG Embedding/回答、答案整合、LangChain playbook；预算错误不被 playbook 降级吞掉。原生 model 请求在缺少 invocation 时也持久防重放，非模型轮询保持原行为。665 tests /156 files、typecheck/build、真实 SQL 051 合成回归通过；不是所有模型入口或真实业务验收通过。无新增付费，规则内容未改。

### A17 — V4.1-Flash 门禁批准（2026-09-13）

编号勘误：历史阶段文字中用于 Flash 批准的 A12 统一映射为 A17；下方表格原 A12 规则不变，历史记录保留。

用户明确回复“批准；继续尚未完成的剩余验收”，批准采用实际 V4.1-Flash 作为轻量 discovery gate，重新核验版本、费用上界及缓存依赖。门禁默认及旧文本别名配置归一为 `deepseek-flash`；主评分/升级 Pro、thinking 和输出预算保持不变。此批准覆盖下文阶段 13 的“待确认”状态，不追溯改写历史。

实施阶段 14：已修改门禁选择及 Flash 缓存批准 epoch，旧 Flash 快照不再命中，Pro 缓存契约不变；epoch 不是服务商不可变版本保证。账本历史 USD 12/30 预留保持，缺失可信费用上界仍阻止付费。模型切换批准不等于计数方法/费用/真实业务已经验收。官方 recipe 的 V4.1 专用 encoding 已发现，旧 V4 本地统计不可直接作为新模型证明；核验继续中。

实施阶段 13：B25/B26 的单项完整检查点在批内恢复前保存，完整批次依赖不变，不把部分批次标为完成；坏评分快照校验后 miss。A11/B15 的新外部边界：2026-09-13 直接读取 DeepSeek 官网，旧 deepseek-v4-flash 实际已换成 V4.1-Flash。本地该别名用于 discovery gate，主评分/升级均为 Pro，未更改配置或开放费率。采用新实际门禁模型及重新核验的授权待用户明确确认，不伪造确认记录。详见最新验收报告阶段 13。

A01–A08 阶段 9：迁移 052 与真实 SQL 核销验证通过，追加观测/唯一匹配/发票优先/差额占用/受影响费率暂停、四口径折叠展示已实现；638 tests、typecheck/build 通过。内部可信账单适配边界不等于已接入真实账单，原币汇率/分摊/正式计费验收仍待完成。保留历史未知预留，不放宽规则。

A06/B25 阶段 8：已接入上下文的模型请求以完整 HTTP 指纹在用户预留锁内防同任务/阶段重放，迁移 051 与真实 SQL 并发/RLS/未知状态测试通过。历史无指纹不推定等价，不干扰轮询；结果缓存与费用未知仍独立，核销和完整恢复验收尚未完成。

A06/B25 阶段 7：预算作用域内已预留的传输异常作为未知结果停止自动重试/备用切换；未知预留不释放，且不记录为调用前零费用拦截。响应体中断、跨进程幂等及核销仍待完成。

B25/B26 阶段 6：现有用户/工作区评分缓存补显式国家及完整主模型请求依赖；常规完整批次逐批保存，缓存写失败不使已完成评分重放。费用未知不妨碍有效结果复用，预留不释放。跨进程幂等与完整批内恢复等尚未完成。

B21/P02 实施阶段 5：用户/任务预算现有折叠区接入白名单用量合计与覆盖尝试数，不跨协议相加、不推测现金折价；16 组生产模式真实登录检查通过，仅空观测 SQL/合成 UI，非空服务商数据与完整账本仍待验收。

B25/P05 实施阶段 4：公共主角色缓存要求完整主模型请求契约，依赖 v2 纳入身份/输入条件/证据标题与顺序，缺失契约旧数据不视为命中；完整候选 ID 覆盖、模型/路由一致才可写。ID 变化保守 miss，非评分/路径持久缓存完成。规则内容未变，整体验收未通过。

执行指令补充（2026-09-13）：用户要求自动完成剩余任务，再进入主线未验收项目，不再询问是否继续；不扩大既有预算/付费授权。B26/P06 阶段 3 已实现完整 UTF-8 请求预检、常规拆批与超限不可重试保护；单家公司分阶段处理/批内持久恢复等仍待完成，未整体验收。

实施状态补充（阶段 2b）：B21/P02 的 DeepSeek/compatible 调用已关联逐次 attempt、task/promptVersion、请求与响应模型、网关主机/端点类型；规则未变。评分版本关联、其他入口及聚合 UI 待完成，不能声明 P02 整体验收通过。

实施状态补充（2026-09-13，阶段 2a）：B21/P02 逐 HTTP 尝试的缓存/reasoning 原始数值字段已落账本 JSON，未知为 null，测试覆盖失败响应和隐私白名单。版本/重试归因及汇总 UI 仍待完成，不代表整项验收通过；规则内容和版本不变。

最新实施状态：P01/P03 的代码与本地回归已完成，P04 保留完整 Schema；其余 P02/P05/P06 及账本、线上业务验收尚未完成。下方旧条目的“待实施”是确认时状态，以本段和阶段记录为准。596 tests / 142 files、类型检查通过；没有付费模型调用或实测成本降幅。

这是产品规则的审阅入口，不是“产品全部完成”证明。最近的明确用户决定优先于旧方案；历史实验结果不覆盖产品规则。下文“已确认”仅表示需求获准，除明确标注外，不表示代码实现或验收已通过。

## 维护与变更

- 每条规则有稳定编号；修改保留旧版本、原因、用户确认依据、生效范围、实现位置和验证结果，通过 Git 历史追溯。
- 状态按“已确认待实施 / 部分实现 / 已实现待验收 / 已验收 / 已替代”维护；不得以讨论确认替代测试证据。
- 每个实现阶段同步更新本表、相关 PRD/端到端文档和效率台账，并关联提交与检查结果。未逐项核查的历史功能明确列为“待映射”，不推定实现完成。
- 用户未来可通过修改文档提出规则变更；文档修改不直接改动运行配置。运行时配置须另行版本化、校验、验证并记录采用版本，保留旧结果使用的规则快照。
- GitHub 只保存规则和脱敏聚合记录，不保存密钥、环境文件、邮箱地址、原始邮件、私有记忆、客户证据原文或完整模型载荷。

## A. 本地验收与费用账本（已确认；完整新机制待实施/验收）

| ID | 确认规则 | 实现/验收边界 |
|---|---|---|
| A01 | 本次只验收本地生产构建；云服务器部署另行验收。真实模型验收累计上限 USD 30，超过前询问。 | 不是所有产品用户的默认预算；不重置历史占用。 |
| A02 | 每次付费调用先按可配置费率保守预留；缺费率、有效汇率或可证明调用费用上界时阻止付费调用。 | 历史 v1.0 空规则保留；阶段 17 已接入严格 DeepSeek v1.1，阶段 21 接入 Kimi 大陆文本原币 v1.0；其他缺失规则仍阻止。 |
| A03 | 分开记录预算预留、基于用量估算、服务商接口报告、发票核验四种金额。未知是 null/unknown，不是 0。 | 不把四种金额相加当作实际成本；历史失败不视为免费。 |
| A04 | 预算占用 = 已结算占用 + 未结算预留；历史预留累计不是当前占用。 | UI 与账本保持同一口径，发票与接口报告区分。 |
| A05 | 只有费用完整、能唯一匹配调用的服务商报告才可自动释放预留差额；仅 token 估算仍保留占用等待核验。 | 接口报告仍不等同于发票；核销/更正追加记录，不覆盖历史。 |
| A06 | 超时/费用未知保留预留，不自动重复调用；可证实未计费的失败可释放。超过费用上界暂停受影响规则。 | 不因记账失败重放已经成功的业务调用。 |
| A07 | 公司直接费用直接归属；共享费用另记分摊记录。批处理无可靠逐公司用量时按实际输入公司等分。 | 分摊不是新增支出；保存方法版本并验证金额守恒。 |
| A08 | 搜索/规划等任务共同费用在完成时按实际处理的去重公司分摊，不按目标槽位或仅合格公司数分摊。 | 零结果仍是任务成本；后续新轮次单独记录。 |
| A09 | 保留原币种；USD 换算保存汇率来源、日期和版本；预留加 5% 汇率缓冲。 | 缺汇率阻止相关付费调用；发票实际美元金额优先。 |
| A10 | 费率每 7 天只读刷新；促销截止即失效；汇率每日更新，最长有效 72 小时。 | 刷新失败可沿用尚有效版本，过期阻止调用。 |
| A11 | 涨价、计费合同变化、模型路由变化需用户确认；可信降价且合同不变时可自动生成新版本。 | 不以静默切换模型或质量换预算。 |
| A12 | 仅暂停受影响付费环节，保存已完成结果；可继续不依赖阻塞环节的免费缓存/本地步骤。 | 合法、已批准备用模型仍须预算充足，旧未知预留不能释放来给备用模型腾预算。 |
| A13 | 恢复从检查点继续，不重放成功环节，不自动减目标公司数、评分质量或规则。 | 模型冗余不豁免预算门禁。 |
| A14 | 任务中心/公司详情用简洁摘要和可展开账本，展示预留与真实费用差异。 | 不展示或记录原始敏感载荷。 |
| A15 | 真实模型价格先查对应服务商官网，找不到按用户授权采用 OpenAI 参考费率并明确标记。 | 参考值不是该服务商真实账单，也不自动构成可证明费用上界。 |
| A16 | SMTP 只向用户授权测试收件人发送明确标记测试邮件；用户已确认收到。 | 已有发送验收提交 `cade233`；不因此授权发送客户邮件。 |
| S01 | 2026-09-14 用户确认：仅 `buildLeadMarketPlaybook` 使用 OpenRouter credits 的 `openai/gpt-5.6-sol` 时限定 OpenAI 标准端点，`provider.only=["openai"]`、`allow_fallbacks=false`，保留 `require_parameters=true`、`data_collection=deny`；单次保守预留 **USD10.622880**，最多 61,440 请求字节、4,096 总输出 token、严格 JSON Schema，不启用工具、插件、特殊服务层或显式缓存；端点不可用时暂停。其他模型/阶段不改，旧多供应商上界 USD27.345252 保留。 | 已实现专用请求合同、版本 v1.7.0、实际 SDK 合成传输与拒绝路径；完整生产业务和真实账单尚未验收。真实付费仍须累计 USD30 与整次费用预检，不因单次可容纳而放行。[报告](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)。 |

实现索引：`src/lib/billing/`、`src/providers/deepseek.ts`、`src/lib/mailbox/smtp-transport.ts`。现有预算基础设施不等于上述完整账本新规则已实现。

## B. DeepSeek 请求边界（本次确认）

| ID | 已确认规则 | 状态 |
|---|---|---|
| B01 | 主模型以当前使用配置为准；此轮不改变 thinking 行为，不静默换模型。 | 待后续实现阶段持续校验。 |
| B02 | 输出默认上限保留 8,192；不自动调到 16,384，也不擅自下调。 | 当前默认值已读代码并离线测得；16,384 是现有可配置最大值，不是新默认。 |
| B03 | 拆批按完整序列化请求体计算，包括系统提示、JSON Schema、证据 ID、业务输入和封装。 | 已确认待实施；UTF-8 字节与 JS 字符不能混用。 |
| B04 | 补证/主角色矫正初始完整请求体上限 **36 KiB = 36,864 字节**。 | 已确认待配置和边界测试。 |
| B05 | 仅评分初始完整请求体上限 **56 KiB = 57,344 字节**。 | 已确认待配置和边界测试。 |
| B06 | 评分＋合作路径初始完整请求体上限 **60 KiB = 61,440 字节**。 | 已确认待配置和边界测试。 |
| B07 | 多公司超限先拆批；单公司超限进入保留关键信息的证据压缩/分阶段处理。 | 已实现无损压缩与超界前暂停；图检查点/合成恢复通过。仍不可压缩的任意大单项分阶段完成及真实模型质量未验收。不静默截断、低分、不通过或绕过限制；压缩本身若付费也受预算门禁。 |
| B08 | 字节上限只是工程边界，不是 token 上限；真实付费放行前另行建立可靠输入 token/完整计费上界。 | 尚未完成，不能因 B04–B06 已确认就开放付费。 |
| B09 | 按每次尝试保存 usage、缓存用量、finish reason、重试与路由；缺失不是 0。 | 已确认待补齐；旧聚合事件不能冒充逐请求 P95。 |
| B10 | 两种 DeepSeek 传输端点分别评估；以已核验高峰/缓存未命中费率保守预留。 | 当前 Pro 自动选择 Anthropic 兼容端点；其 thinking 与 Chat 端点存在差异，此轮不改。 |
| B11 | 完整输入 token 优先使用与当前模型匹配、可本地运行的官方 tokenizer 计算，含系统提示、Schema、证据和业务输入。 | 已确认待实施；还须计入模型聊天模板/特殊 token，不能简单对 HTTP JSON 字符串编码就称为实际输入。 |
| B12 | 不能准确计数时只接受可核验的保守上界；不以字符/token 经验比例放行。 | 无可信上界仍阻止相关付费调用并提示原因。 |
| B13 | 每次预留 = 输入 token 上界 × 输入费率 + 输出 token 上限 × 输出费率 + 其他已知费用上界。 | DeepSeek 高峰/缓存未命中预留，输出暂为 8,192；差额遵循 A05，不能由估算自动释放。 |
| B14 | 按每次尝试预留，不一次占用所有可能重试次数；重试须获准且预算足够。 | 上次未知费用占用保留；不新增自动重试授权。 |
| B15 | 模型、传输端点、计费合同变化时重新核验 token 方法和费用上界。 | 未核验不得沿用旧方法放行。 |
| B16 | 采用官方 recipe＋匹配当前模型的 V4 tokenizer，固定版本/校验值，在隔离环境离线验证两种现有文本请求格式。 | 2026-09-13 用户同意；固定源码和 tokenizer 校验及 B17 合成文本验证完成，完整业务计数未验证，未接入产品。 |
| B17 | 允许使用本机 Docker 隔离安装构建依赖；依赖准备后断网验证，不全局安装 Windows 工具链，不注入产品密钥，不开放付费。 | 2026-09-13 用户同意；首轮纯文本 Rust 构建和断网合成验证通过。 |
| B18 | 将已有 207 家冻结公司重建的完整请求送入本地计数器，分析业务输入及各部分开销；不新增证据、不调用模型、不改变评分。 | 2026-09-13 用户同意；三模式单公司/现行批次共 1,053 请求离线计数通过，评分仍为标准 playbook，不是历史完整上下文回放。 |
| B19 | 审核固定提示/评分规则重复内容和缓存复用，先提出不改变评分含义的方案，先讨论、不改产品逻辑。 | 2026-09-13 用户同意；只读审核完成，见下方方案。P01–P06 尚未获准实施。 |
| B20 | 确认 P01 固定内容前置：保留原消息权限、全部规则/证据与数组顺序，只调整字段排列；不共享个人记忆、不用规则 ID 替代正文、不付费预热、不降并发。 | 2026-09-13 用户确认，待实施；先离线校验，质量/实际命中另行验证。P02–P06 全部确认后再修改产品代码。 |
| B21 | 确认 P02 七条缓存观测细则：逐尝试记录，保留协议真实用量和未知状态，区分本地免调用/服务商折价，展示命中及覆盖率，估算与账单分离，未命中预留，不保存额外正文/密钥，复用折叠费用 UI。 | 2026-09-13 用户确认，待实施；记录失败不重放成功调用。P03–P06 全部确认后统一改代码。 |
| B22 | 继续未完成/未通过验收项，同时完成 P03–P06，之后以完成验收为主线；不扩展新优化议题。 | 2026-09-13 用户明确安排。继续既有逐项确认约定，不视为 P03–P06 具体方案已确认或新增付费/云部署授权。 |
| B23 | 确认 P03 模型规则投影：保留全部评分语义/角色标准/证据门禁；精确重复字段单点表达；等级阈值与管理元数据留程序/审计；从唯一完整配置确定性生成，不调用模型压缩。 | 2026-09-13 用户确认，待实施；原始规则/版本/缓存依赖保留，首版不裁其他角色，不改输出 Schema，先规则覆盖及离线计数再质量验证。 |
| B24 | 确认 P04 六条 Schema 保障：完整字段/必填/类型/枚举/边界与模式差异保留，单一来源生成并完整传送；仅审查周边明确重复，不强制结构压缩；无效结果不冒充成功或低分，不新增重试；按有效输出及整体成本验收。 | 2026-09-13 用户确认，待实施；没有明确收益可以不改 Schema，模型质量验证受费用边界约束。 |
| B25 | 确认 P05 八条精确结果复用与失效规则：公共矫正/私人评分分域、完整有效依赖含批次/版本、证据重绑定、尊重人工覆盖、主动重评按范围、并发幂等、成本未知与结果成功分开、记录复用收益及失效原因。 | 2026-09-13 用户确认，待实施；完整已校验结果可复用但未知费用预留保留，禁止跨域或未验证跨模型复用。 |
| B26 | 确认 P06 七条批次安全/完整性规则：保留最多五家、检查最终完整请求和输出约束、单公司超限不降分漏报、按任务保留路径、不跨域凑批、不重复成功结果、按整体有效结果验收。 | 2026-09-13 用户确认，P01–P06 全部获准实施；批次/无损压缩/图暂停与合成恢复已部分验收，任意大单项及真实模型全链仍缺；不豁免费率、预算或既有外部动作边界。 |

固定提示审核：[P01–P06 已确认方案与实施状态](FIXED_PROMPT_CACHE_REVIEW_2026-09-13.md)。现进入实施与剩余验收，确认与实现/验收仍分开记录。

### B18 冻结业务请求离线计数

可复现诊断入口：`scripts/offline-tokenizer/measure-frozen.ts`。原始请求仅经内存 stdin 送入禁网、只读、非 root 容器，不写原文文件，不挂载宿主或注入密钥。使用当前 agent 请求构建器与模拟 DeepSeek 传输；不执行 agent.evaluate、搜索、RAG 或评分。模型配置实际为 `deepseek-v4-pro` / Messages / thinking disabled / 输出 8,192。当前运行只验证这个配置，前面的两格式合成测试不能替代另一格式的业务覆盖。

输入：207 家冻结德国候选。每模式逐公司 207 请求，加现行字符规则批次 103/158/171，共 1,053 请求；完整编码各重复一次共 2,106 次，全部 token ID 一致。八类输入片段另行孤立计数共 8,424 次。Docker 阶段墙钟 68,289 ms，诊断脚本墙钟 78,824 ms（不含镜像构建和启动器）；包含重复与分项诊断，不是未来单请求生产耗时。模型调用/费用为 0。

| 模式 | 现行批次数 | 批次 token P50 / P95 / 最大 | 单公司 token 最大 | 超已确认字节上限 |
|---|---:|---:|---:|---:|
| 补证 | 103 | 7,450 / 8,931 / 9,492 | 6,462 | 0 |
| 仅评分 | 158 | 9,742 / 12,117 / 13,513 | 12,078 | 0 |
| 评分＋路径 | 171 | 10,117 / 12,785 / 13,017 | 13,017 | 0 |

每请求系统提示（含输出 Schema）孤立计数为 848 / 1,162 / 1,661；评分 rubric 为仅评分 2,041、带路径 2,299；任务 instructions 为 851 / 662 / 844。这些是诊断分项，不应相加当总量：input 包含 instructions/rubric/evidence/findings，user 又包含 input。不同部分独立分词存在边界差异，null/空占位也会计数。

仅评分现行批次输入合计 1,559,247；评分＋路径合计 1,772,323，高 213,076（约 13.67%），同时批次数 158→171。它说明路径任务输入/拆批额外开销，不是产品已实现节省率；输出费用和模型质量未测试，不授权取消用户需要的路径。固定规则/提示的复用、减少不影响信息的重复结构值得下一步研究；不自动压缩评分标准。

原字节规则单公司超限缺陷仍存在；本批样本在新建议字节上限内不代表修复。最大实测 token 不是所有输入的安全上界，不能直接加经验余量成为美元预留保证。仍未核验线上 usage/实际账单，不改变付费门禁。完整脱敏聚合及来源文件哈希：[计数记录](reports/OFFLINE_FROZEN_TOKEN_COUNTS_2026-09-13.json)。原始证据不提交。

### B17 隔离运行结果（取代 B16 下方历史环境阻塞状态）

诊断代码：`scripts/offline-tokenizer/`，不被产品运行时引用。Docker Linux 可用；只编译官方协议/文本编码 Rust crates，不编译 Python/图像组件，所以不需要安装 OpenCV。固定官方源码提交与 V4 tokenizer 保持不变，Rust 1.97.1 基础镜像摘要已固定，依赖版本保存于 Cargo.lock。构建可下载公开依赖；执行使用 `--network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 65534:65534`，无宿主目录挂载、无密钥环境变量。

四类合成文本 × 两种格式 × 有/无系统 Schema，共 16 个组合，每个重复编码一次，共 32 次编码；全部非空且重复 token ID 一致，所有 Schema 增量为 30 tokens。首轮编码测试循环 69 ms（不含进程启动、tokenizer 加载或构建时间），不是生产延迟承诺。

锁文件及镜像摘要固定后重建通过，再次断网执行同一组 32 编码通过，全部计数与首轮一致，循环 68 ms；两轮共 64 编码，仍只有 16 个不同输入组合。依赖锁、构建器、测试源码纳入 Git；无业务模型调用。专用未启动锁文件导出容器已删除，镜像和构建缓存保留。

| 合成输入 | Messages 无/有 Schema | Chat 无/有 Schema |
|---|---:|---:|
| 英文短文本 | 10 / 40 | 111 / 141 |
| 中文混合业务短文本 | 21 / 51 | 122 / 152 |
| 多语言及 emoji | 20 / 50 | 121 / 151 |
| 长证据式文本 | 8,010 / 8,040 | 8,111 / 8,141 |

两种请求按现有 Pro 构建方式分别使用 disabled/enabled thinking，Chat 另有 JSON object 设置，因此差异不能直接归因于单一因素，也不能把 101 当通用固定开销。未改变实际产品设置。范围仅合成文本编码：未重放 207 家完整业务请求、未比较线上 usage、未建立美元费用保证。API 模型调用和费用均为 0；产品付费门禁仍关闭。构建缓存/镜像保留本地便于恢复，不推送到容器注册表。

### 官方工具核查（2026-09-12；事实与待确认选型分开）

- [官方 token 用量说明](https://api-docs.deepseek.com/quick_start/token_usage/)提供离线 tokenizer 下载；字符比例只是近似，实际用量以 API usage 为准。
- [官方 deepseek-recipe](https://github.com/deepseek-ai/deepseek-recipe)支持 Messages/Chat Completions/Responses 格式转换、V4/V4.1 prompt 编码，提供 Rust/Python 接口。[tokenizer 指南](https://github.com/deepseek-ai/deepseek-recipe/blob/main/docs/tokenizer.md)要求匹配模型 tokenizer 和特殊 token。
- 仓库声明不支持 JSON Schema 输出约束；本产品当前 DeepSeek 将 Schema 作为系统提示文本，不能把这与 API 原生约束混同。工具存在不证明托管 API 计费完全一致。
- [Anthropic 兼容文档](https://api-docs.deepseek.com/guides/anthropic_api/)提示不支持的模型名会映射为其他模型，因此端点格式兼容不等于模型身份/费率一致；不得以 Claude tokenizer 计算 DeepSeek 用量。
- 当前只读核查未安装依赖、执行官方工具或请求模型；本项目尚无已接入的本地 token 计数器。原有 `maximumChargeMicros` 固定上界规则仍在使用，全球规则为空。
- **已由 B16 确认（2026-09-13）**：选择官方 recipe＋匹配的 V4 tokenizer，固定版本/文件校验值，在隔离离线环境先验证当前两种文本请求格式。通过前仅为离线诊断，不用于付费放行；不改 thinking、不自动跟随最新版、不将样本误差上浮若干百分比冒充数学上界。

### B16 固定版本与环境检查（2026-09-13）

- 官方源码提交：`8cadfede7063c896b944e7bae05daa3549ae97ea`，Python 项目声明版本 `0.1.1`；只下载到 Git 忽略的 `tmp/deepseek-recipe-audit-20260913`，未安装、未执行其中代码。
- V4 tokenizer：`static/tokenizers/v4/tokenizer.json`。Windows checkout 自动转 CRLF，磁盘 6,634,504 字节，SHA-256 `d9c43162add2f9b6d2ccde2e8873c0e67b78320ccafe7714dab0f213c5dd7e46`；在内存还原 LF 后 6,367,146 字节，SHA-256 `97d2f31b020d18b5aee5c9b3d5b4efb10ea210f3fe3f7dffe3f1cd90542d6b19` 与官方同提交 README 一致。不能以官方 LF 哈希直接验证 CRLF 文件；未来固定资产应明确字节规范。本地 JSON 解析通过：BPE，词表 128,000 项，added tokens 1,283 项。这不是 token 编码执行测试。
- 官方 README 说明此 tokenizer 相比 Hugging Face 对照版本交换了两个 image token 的 ID；本次只验证文本，未来不得据此直接开放图像计费。对照来源版本 `b5968e9190ef611bbf34a7229255be88a0e937c1`。
- 使用官方 PyPI 索引、有限超时/零重试查询，未获得可用发行包；不能断言所有平台无包。本机 Python 3.11.9，`cargo`/`clang`/`cmake` 不在 PATH；官方源码构建文档要求 Rust、C/C++、Clang/libclang 和 OpenCV 4.x 等依赖。尚未安装完整编译工具链。
- 结论：来源、版本和文件完整性检查通过；两种请求格式实际 token 编码、耗时与线上 usage 一致性仍未验证。无付费模型、无产品依赖/配置变化；继续 fail-closed。下一步需选择隔离构建环境，不能把源码检查当作运行验收通过。

### 离线依据：不是历史 token 重放

207 家德国冻结候选公司，当前补证/评分请求构建器＋模拟 DeepSeek 传输，1,053 次本地截获，网络/模型调用均 0，服务商费用 0。评分使用标准 playbook，不含原始 RAG 或个人长期记忆，不保证覆盖未来最大载荷。一次性诊断脚本在本地 `tmp/offline-deepseek-request-sizing.ts`，不是产品运行代码；不提交原始样本。

| 环节 | 当前拆批数 | 完整请求体 P95 / 最大（字节） | 遗漏封装开销范围（字节） | 原规则下超限单公司数 |
|---|---:|---:|---:|---:|
| 补证 | 103 | 33,075 / 33,496 | 4,608–5,756 | 0 |
| 仅评分 | 158 | 49,707 / 50,567 | 7,017–8,701 | 0 |
| 评分＋路径 | 171 | 51,887 / 54,383 | 9,115–10,867 | 1 |

现有代码只计算 `JSON.stringify(request.input).length`，补证 28,000 字符、评分 42,000 字符，且只在已有其他公司时拆批。以上批次数是当前规则重建结果，不是新上限的测试结果，也不能作为优化节省率。单公司问题和高结构开销是已识别优化点。

## C. 搜索、证据、评分与开发（历史明确决定索引，实现逐项待映射）

| ID | 确认规则 | 对应文档/范围 |
|---|---|---|
| C01 | 取消“优先向上”；agent 识别实际主角色并按用户发展阶段分析合作路径。搜索通道不是主角色或路径。 | PRD、端到端工作流。 |
| C02 | 路径仅五类：一级代理直接供货、通过已有/未来代理商供货、直接下级渠道供货、OEM/ODM、其他。每公司最多两条，取消路径 confidence。 | 评分与开发；全部路径低于 65 时只展示最高一条。 |
| C03 | 路径子分为角色/结构 30、用户阶段/供货适配 25、产品/客户/场景 20、采购影响 15、执行可行性 10；总分由程序计算。 | 见当前 qualification agent；正常推荐至少 65。 |
| C04 | 主角色、账户等级、合作路径可由用户修改，写入个人长期记忆和学习数据。角色与可能路径输入后续开发策略/邮件 agent。 | 私有数据不得污染通用知识库。 |
| C05 | 产品/场景 50（产品家族 25、客户/场景 15、定位 10），合作路径/采购影响 15，同主角色规模/覆盖 15，执行/赋能 10，机会/风险 10。 | 版本化评分配置；历史评分保留版本，不能套用新权重冒充原结果。 |
| C06 | 使用最适合的启用产品轨道，不因 SMB 专注或 broadline 非相关业务稀释产品匹配。SMB SI 按项目 B 端、零售/电商按消费者场景分别判断。 | 大集团按相关区域/业务单元，不要求全集团资料穷尽。 |
| C07 | 先识别规模；高价值大公司可深查。明确识别长尾且有限补证仍不足可低分/不推荐，但缺资料不等于证实规模小。 | 未知事实不能伪装成负面证据。 |
| C08 | KA 只用于下级渠道候选，不用于一级代理/分销商；TD SYNNEX 不能据规模评为 KA。 | 销售账户等级与主分数分开。 |
| C09 | 模型负责语义判断及各子项分数，程序负责确定性总分和状态；说明压缩但保留关键证据。 | 不用模型重复计算可确定部分。 |
| C10 | 完整公共证据结构化存入现有数据库中的独立证据库，可跨用户检索公共公司证据。私有知识/长期记忆严格隔离。 | 公司身份/公共证据共用，各国家业务状态独立。 |
| C11 | 必要补证、主角色矫正和可能重复任务首次执行即建立缓存和结构化结果供下游复用；两条搜索轨道实时反馈去重。 | 不新增重复搜索/补证流程；缓存须保留来源与版本。 |
| C12 | 信息超过一年提示，不自动 invalid；用户要求核实时再搜索。二次引用应预期总分改变至少 8 分或满足已确认关键状态条件；仅小幅增加置信度不升级。 | 搜索/证据新鲜度与评分有效性区分。 |
| C13 | 高能力升级只在预计能显著解决当前模型不能解决的问题时；Top-N 不作为正式产品升级依据。 | 实验质量门禁 Top-N 90%、MAD 3 分仅实验范围。 |
| C14 | 意图保持 Kimi 轻量模型、多轮交互，不改成确定性优先；每任务轻量判断标准 playbook/搜索模板是否需改，明确复杂任务再 Kimi K3 规划。 | 模板和缓存不替代意图识别。 |
| C15 | 主模型按当前配置；有限失败重试后可临时跨厂商同级冗余，不影响预算约束；Embedding 不设冗余。 | 未确认具体备用路由不可臆造。 |
| C16 | Gemini Product 与 Gemini Full 机制重合，默认不重复调用；同搜索引擎/机制工具仅有特殊补充能力理由才并用。 | 混合搜索须与补证/评分适配，支持明确 50/100 等目标数与结束机制。 |
| C17 | 错类公司符合其他目标类别可转移并去重；搜索阶段只轻量结构化关系，由后续 agent 深入判断。 | 不把分类转移当新增公司贡献。 |
| C18 | 默认不搜索 Agent 或 OEM/ODM 销售线索，除非用户明确要求；产品不寻找给 Cudy 代工的供应商。 | OEM/ODM 销售机会与采购供应商不同。 |
| C19 | PDF 提取前判断价值；过程中/升级提取方法前根据已有内容再次判断价值与预算。 | 具体解析器方案须沿用既有已确认文档，不在此编造。 |
| C20 | 已确认知识/个人记忆优先；经用户确认的营销表述可进入用户开发上下文。 | 不把营销夸张变成公共事实或客观评分证据。 |
| C21 | Cudy 定位先本地 RAG＋Web＋分析，再用户确认入库；Omada 为 TP-Link 企业分支、Mercusys 为低端子品牌，Archer/Deco 是系列，AVM、DrayTek 纳入竞品。 | `knowledge/CUDY_POSITIONING_CONFIRMED_V1.md`。 |

## D. 界面、邮件与实验边界（历史明确决定索引，实现逐项待映射）

| ID | 确认规则 |
|---|---|
| D01 | 销售线索、渠道图按国家独立页面；公司身份共用，各国评分、路径、账户等级和开发进度独立。结果经流程确认后自动保存对应数据库/板块，不能等同于用户开发采用。 |
| D02 | 用户可手工加公司到渠道图；当前单用户产品，不做团队管理/负责人；用户可主动标记已联系，产品发送成功也可推进状态。 |
| D03 | 已发送邮件保留时间和详情；同公司不同联系人可复用邮件版本，新公司策略/邮件由行动 agent 生成。跟进可展开原信参考，用户自然语言表达内容，agent 复用称呼/职位及商务格式；生成不等于发送。 |
| D04 | 用户每次邮件修改可沉淀为个人风格偏好；私有记忆与通用知识库隔离。 |
| D05 | 成本降低是永久任务；记录各阶段输入、有效输出、下游使用量、token/API额度/美元、延迟、重试、弃用原因、利用率、具体优化机会。未知指标明确未知，不能把 HTTP 成功当业务采用。 |
| D06 | 已讨论优化目标为 token 再降 40%、付费搜索额度至少降 30%，不牺牲质量；目标不是已经达成的节省率。代表性样本每类 1–2 家。 |
| D07 | 测评中的产品改动应用真实产品前需用户确认，实验分支结果不能自动等于生产批准。搜索机制、端到端流向与迭代需在 GitHub 留档。 |
| D08 | v3.0 工具评分沿用 v2.0 搜索结果/证据，不加搜索/证据，不生成路径或策略；只评线索价值并分析混合搜索优化。 |
| D09 | 首次正式实验英国/墨西哥，四类 Distributor/VAD、Reseller/VAR、Retailer/E-tailer、SI/MSP，每市场每类 30 槽位；冷启动、独立高能力盲审，产品/对照实际时间各自记录，不要求等时。 |
| D10 | 首次实验 USD 100 硬上限，在 20/40/60/80% 检查并预测总成本，预计超限则预警并确认设计调整；哥伦比亚下一轮四类各 50、上限 USD 50，在 20/40/60% 检查。两者不替代 A01 本地验收预算。 |
| D11 | 盲审 fallback 曾获准对话内 Codex、不调用 Codex API；后续模型网关改动与具体实验协议以对应版本为准，不用历史授权擅自重跑付费实验。 |

## 文档索引与剩余核对

- 产品需求：[`Network_Channel_Copilot_PRD_v1.1.md`](../Network_Channel_Copilot_PRD_v1.1.md)。
- 当前 UI/业务端到端：[`PRODUCT_UI_V1.1_WORKFLOW.md`](PRODUCT_UI_V1.1_WORKFLOW.md)。
- 搜索：[`HYBRID_SEARCH_WORKFLOW.md`](HYBRID_SEARCH_WORKFLOW.md)；评分工作流：[`generated/LEAD_EVALUATION_WORKFLOW_V2.md`](generated/LEAD_EVALUATION_WORKFLOW_V2.md)。
- 成本与优化：[`PRODUCT_WORKFLOW_EFFICIENCY_LEDGER.md`](PRODUCT_WORKFLOW_EFFICIENCY_LEDGER.md)。
- 验收证据：[`LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md`](LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md)。
- 恢复：[`RESUME_PRODUCT_UI_2026-09-11.md`](RESUME_PRODUCT_UI_2026-09-11.md)。

本次补齐可恢复的明确规则，不能声称已复原对话中所有仅回复“确认”但原提案未保留的细节。后续验收须逐 ID 补代码/配置/测试映射；PDF 解析器具体选择、账户等级完整枚举、各类搜索工具路由及实验最新盲审细则须从对应既有文档/版本核对，不凭空补写。发现冲突或缺失先标明，不自动改产品。

## 版本记录

- 1.12.0 / 2026-09-13：确认 P06（B26），实施阶段 1 完成 P01/P03 本地代码及测试；P04 无 Schema 改动；其余验收继续。
- 1.11.0 / 2026-09-13：确认 P05（B25），补齐最后一项 P06 待讨论细则；产品逻辑未改。
- 1.10.0 / 2026-09-13：确认 P04（B24），补齐 P05 待讨论细则；未改产品逻辑。
- 1.9.0 / 2026-09-13：确认 P03（B23），补齐 P04 待讨论细则；未改产品逻辑。
- 1.8.0 / 2026-09-13：记录 B22 验收主线安排，验收报告增加缺口/通过依据表；P03–P06 待逐项确认。
- 1.7.0 / 2026-09-13：确认 P02（B21）全部细则，新增 P03 待确认保留/排除方案；仅文档更新。
- 1.6.0 / 2026-09-13：用户确认 P01（B20），补齐 P02 待讨论细则；保持全部确认后再改产品代码。
- 1.5.0 / 2026-09-13：确认 B19 分析范围并完成代码/官方缓存文档核查；列出 P01–P06 待确认建议，无产品逻辑变化。
- 1.4.0 / 2026-09-13：确认 B18；当前构建器冻结业务请求 1,053 条离线计数及重复校验通过，记录分项开销和边界；无运行时规则/费率改变。
- 1.3.0 / 2026-09-13：确认 B17；新增 Docker 纯文本隔离验证器、固定构建依赖及合成测试结果。未变更产品逻辑或付费许可。
- 1.2.0 / 2026-09-13：确认 B16，固定官方源码与 tokenizer 校验值；记录本地环境限制及未完成运行验证。
- 1.1.0 / 2026-09-12：用户确认 B11–B15 token/预留原则；新增官方工具核查及待确认选型。无产品代码或付费调用变化。
- 1.0.0 / 2026-09-12：集中登记明确用户决定；补齐费用账本规则、36/56/60 KiB 边界及离线依据；明确确认与实现/验收分离。仅文档和工作约定更新，无运行时变化或付费调用。
