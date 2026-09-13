# Product UI v1.1 implementation workflow

2026-09-14 阶段125：全局公司仍可复用，工作区公司成员关系与账户等级/优先级由拥有者RLS隔离；手动添加两账号各自保存，任务列表、联系人统计与国家视图的本地生产桌面/手机回归66组通过。旧CLI发现/报告及联系人发布回滚核对明确工作区主人，避免取错第一个工作区。会话和工作区基础表另行迁移，0实际供应商/邮件外发。[验收](WORKSPACE_COMPANY_TENANT_RLS_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段124：工作区模式保存经租户事务写入审计事件；审计内容按工作区拥有者读写，并拒绝跨户插入和冒用操作者。真实SQL与本地生产Chrome桌面/手机66组通过，0实际付费/发信；`app_session`、`market_workspace`、`workspace_company`的独立隔离迁移仍待处理。[验收](WORKSPACE_AUDIT_TENANT_RLS_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段123：联系人补全/核验运行由拥有者上下文读写，9张私有产物表以RLS隔离；历史缺工作区的邮件保留但对应用角色不可见。`/api/contact-enrichment/runs/latest`按会话用户查询，匿名401、两隔离账号各自HTTP200/预期条目通过；隔离SQL和本地生产Chrome桌面/手机66组回归通过。其余4张拥有者字段表另迁移。缓存复用避免重复调用，0实际供应商调用/发信。[验收](CONTACT_ARTIFACT_TENANT_RLS_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段120：搜索任务在对话卡和任务详情共用完成标签；`completed` 且最终保存数达到目标才显示“目标已满足”，不足显示“运行结束，目标未填满”，旧结果缺数显示“运行结束，最终数量未记录”。任务详情仍分别展示缺口与图停止原因。桌面/手机本地生产66组合成页面检查通过，真实业务未验收。[证据](SEARCH_TASK_STATUS_LABEL_PRODUCTION_UI_2026-09-14.md)。

2026-09-14阶段108：预算页面新增Brave/Tavily Search独立公开费率状态、上次检查/下次尝试和待审暂停提示，页面刷新只读数据库；隔离账号本地生产桌面/手机64组含API到页面对账通过。[证据](SEARCH_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段107：预算页面新增 DeepSeek Flash/Pro 官方公开费率复核的独立只读状态、检查时间、下次尝试和漂移暂停提示；本地生产桌面/手机62组 HTTP/Chrome 回归与真实SQL状态一致，页面刷新不调用外部价格页。[报告](DEEPSEEK_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段106补充：评分批次缓存保存失败或缺精确可复用请求契约时，停止领取后续批次、暂缓同批缺项修复；未请求公司保留待恢复，已完成评分进入图检查点。并发已在途请求可完成，未知费用不重放。[详细验收](ASSESSMENT_BATCH_PERSISTENCE_STOP_2026-09-14.md)。

2026-09-14阶段98：独立本地生产服务的隔离账号Chrome桌面/移动共58组回归，新增 `/api/tasks/usage` 同源HTTP→SQL聚合和重复读取不新增计数；预算/任务/国家/草稿/暂停等既有行为保留。[报告](WORKFLOW_USAGE_PRODUCTION_HTTP_2026-09-14.md)。fixture清理，0真实付费/发信。

2026-09-14阶段97：鉴权 `/api/tasks/usage` 原操作/HTTP字段保持兼容，新增工作流阶段及模型用量的独立30天聚合；未知采用与费用不填零，四账本不能相加。真实SQL合成事务验证并回滚，[边界](WORKFLOW_USAGE_AGGREGATE_ACCEPTANCE_2026-09-14.md)。本阶段未新增页面组件，真实用户查看与采用仍待验收。

2026-09-13阶段51：邮件审核服务真实SQL验证事务锁返回busy、重复同决定复用、相反决定冲突、部分批准恢复，恢复后知识仍可检索；未经过HTTP/浏览器审核入口。7本人调用仅2个有效新决定，下游使用仍unknown，未把检索测试计为用户实际采用。

2026-09-13阶段50：邮件候选PATCH转到按用户/候选加事务锁的审核服务；处理中/已有相反决定/部分批准待完成返回409，重复同决定返回reused=true。已保存知识的中断批准可通过再次批准复用现有内容完成状态，不能随后标为拒绝。审核仅记录聚合决定，不将刷新或重复点击当新采用；页面真实并发体验待验。

2026-09-13阶段49：知识检索验收直接运行hybridSearch与应用角色SQL，不启动嵌入/生成。私有内容按用户隔离；market为可选精确过滤，不传则本人跨国家可见；共享内容仍受传入国家/公司过滤。5文档/5切片合成验证通过，邮件导入审核到检索及答案生成尚未据此验收。

2026-09-13阶段34：D13/O05角色锚点及评分入口契约验证实现；角色未定返回research-required/retry-required，沿用既有恢复状态，不显示为业务不合格。13具体角色覆盖、混合批次缓存一致性及原确定性分数回归通过；全量791测试。此为后端规则验证，未替代页面到数据库的真实业务验收。

2026-09-13 阶段33：搜索后台采用1.7.0类别条件路由，阶段记录可区分缓存复用、工具故障与同任务可选工具暂无新增贡献。该暂停不等同市场耗尽、不扩大角色范围，也不影响其他用户或新任务启用工具。实际UI/业务闭环待验收。

2026-09-13 阶段32：发现阶段失败后沿原任务恢复，可复用轮内已完成搜索/门禁，保留原费用而不重复累加任务汇总。数据库遥测故障明确报为检查点保存失败，不标记供应商不可用。最新实际UI/业务闭环验收仍未完成。

2026-09-13 阶段31：搜索检查点延续任务级发现会话，阶段遥测可见是否复用会话、保留结果数和工具熔断数。恢复遇到国家/任务/原请求/服务商配置依赖变化会明确停止，不自动新增付费调用。完整UI与单轮内部中断恢复验收继续。

2026-09-13 阶段30：任务通知按最终保存数显示达到目标/部分完成及缺口，详情展示角色待判公司数；消息和页面共享停止原因文案，区分角色待判、处理未完成、服务不可用、安全上限、搜索耗尽和最终审核/保存不足。执行层completed仍表示流程终结，不代表目标填满。最新真实浏览器验收尚待完成。

2026-09-13 阶段29：后台新增原请求范围路由阶段，检查点阶段指标记录转移、范围外、重复与角色待判数量；它们是内部下游使用记录，不是用户采用。范围外公司不增加请求目标、不生成新搜索任务。路由真实数据库与完整UI展示验收仍待完成。

2026-09-13 阶段28：处理缺项不显示续搜入口，API也拒绝创建续搜；已有恢复按钮用于原任务缺项恢复。续搜排除仅含完成评分，不因为两次零结果自动阻止用户续搜，明确耗尽与三次安全上限继续生效。

2026-09-13 阶段27：缺项任务使用现有失败任务“确认费用并从检查点恢复”控件，检查点进度提供缺失校正/评分量与已合格量。恢复不会重跑搜索、补证或完整单项；未知费用继续阻止付费。完整跨进程/UI数据库链路尚待验收。

2026-09-13 阶段26：搜索详情支持 processing-incomplete，显示“校正或评分未完成，已有结果和费用保留”。该状态描述处理缺项，不代表公司不合格或市场耗尽。O01 恢复入口及任务整体业务状态仍未验收完成，见当前验收矩阵。

## 2026-09-13 实施阶段25：OpenRouter完整报告核销

实现A05/A20：仅固定OpenRouter HTTPS chat/completions即时响应、请求与响应模型一致、唯一gen请求ID、完整token合计、终止标记和明确`is_byok=false`的`usage.cost`进入可信追加报告；数据库再核验请求哈希唯一匹配后才能核销。缺字段、BYOK、非固定端点、额外工具/多模态或来源过期保留原预留。来源核验2026-09-13，最迟2026-09-20T00:00Z失效。`cost_details`不重复相加；十进制美元一次向上到微美元，避免0.07浮点乘法多计1微美元。截断输出可有完整财务报告，但仍不是有效业务结果。核销写失败不重放已购输出，历史未知费用不追溯释放。另补OpenRouter cache_write_tokens数值观测。

依据：[官方Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)、[OpenAPI ChatUsage](https://openrouter.ai/openapi.json)、[美元credits说明](https://openrouter.ai/docs/faq)。实际接入响应来源与仅凭用户填写金额严格区分；不是发票核验或全服务商报告支持。

验证：761 tests/170 files、typecheck通过；`verify-cost-reconciliation.ts --skip-migration`以真实数据库和内存合成响应验证入口到SQL、并发仅释放一次、重复报告幂等、重复genID不释放、BYOK保留、跨用户拒绝、追加历史/发票优先/原公司分摊守恒；合成账户数据已清理，没有改数据库结构或客户数据。只读预算状态为USD12.324404/30，剩余USD17.675596，6笔费用仍未知。模型/搜索/SMTP新增调用和实际付费均0。生产完整业务、网关费用上界、共享成本/P06/采用遥测等仍待完成。

效率：每次仅复用已有响应，报告输入1、可验证输出1、唯一核销消费至多1；记录核销延迟、重试0、未匹配原因、利用率，原token/API额度/请求费用独立保留。未匹配及缺失报告不伪造0费用；新增报告解析token/API成本0，无额外服务商查询。具体机会：完整报告可释放过度预留，减少保守预算阻挡，但本阶段无真实报告释放或已实现节省率。

用户本阶段明确采纳O01–O05（D13），覆盖下文旧待确认状态；只是批准，五项实现/验收尚未完成，见当前矩阵。

## 2026-09-13 当前调查与验收入口

本轮范围按确认规则 A21/D12 执行。[当前唯一验收矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md) 覆盖下文历史的当前状态描述；旧失败与旧测试数量仅作阶段历史。模型连通性和 SMTP 发送/用户确认收件已通过，不因恢复而重测。整体仍未通过。

[哥伦比亚流失调查](COLOMBIA_CANDIDATE_ATTRITION_2026-09-13.md) 已新增545条公司×类别的脱敏离线关联、7来源哈希、8项对账与完整原成本台账核对；本次产品回归722 tests/169 files通过。39个输出槽位含1家跨类重复，评测有效38；未找到可直接补回的完整合格遗漏，原历史缺失不当作不合格。O01–O05仅为待采纳建议，不改搜索/角色/评分代码。新增模型token/API额度/付费调用/费用均0，实际用户采用未知。效率机会优先恢复未完成状态及减少重复证据工作；不虚构实际节省率。详细原各阶段输入/有效/下游使用/费用/延迟/重试/丢弃原因/使用率在关联JSON中，不能把跨阶段累计量当唯一公司数。

## 2026-09-13 实施阶段 24：补证/门禁公司归属及预算停止

落实 A06/A07/B21：普通补证及主角色补充搜索在真实请求前携带对应公司+国家的哈希归属；轻量门禁按当批实际输入公司记录，不把整池候选分摊到每批。并发子作用域隔离，归属不进入模型提示。生产门禁必须提供国家；无产品预算上下文的既有实验入口不改变。无效域名仍在原检查处跳过，不为了成本归属生成付费请求。

修复普通补证吞掉 BudgetDeniedError 的问题：预算阻止/未知费用停止直接上传，不伪装一般证据缺失继续评分。保留既有普通工具失败处理、模型、并发及搜索参数。沿用账本输入/有效输出/下游使用边界、token/API 额度、延迟、重试和丢弃原因；新增归属不产生额外支出，预算停止不能记为成功证据。优化机会：公司直接费用准确归属后再计算每条成本，避免把失败费丢弃或使用目标槽位作分母。

验证：722 tests /169 files、typecheck、生产 build 通过；新增测试覆盖并发归属隔离、门禁逐批输入、生产缺国家拒绝及预算停止不吞掉。没有新增真实模型/搜索/SMTP、数据库写入或费率放行；预算最后只读核验 USD12.324404/30。共享费用最终分摊、完整公司成本 UI、OpenRouter 费用上界/报告核销、P06 超大单公司恢复、真实 E2E 和最终采用遥测仍未完成。Goal 保持 active，非整体验收通过。

## 2026-09-13 A20 确认：OpenRouter 仅充值余额

用户已确认当前账号未配置 OpenAI/Anthropic BYOK，仅充值余额；覆盖阶段 23 的待确认状态。范围限当前账号，非所有部署默认保证；未来启用 BYOK 必须重新核验上游费用。A05 的完整且唯一匹配要求、历史未知预留、USD30 累计上限不变，账号确认不等于账单核销或网关验收通过。当前预算占用最后核验 USD12.324404，本次只更新确认文档，无新增付费/调用/费用观测，不虚构效率收益。后续先完成网关费用上界与完整报告适配，再进行真实业务验收。

## 2026-09-13 实施阶段 23：北京 Embedding 预算边界与响应完整性

继续 A02/A06/B21，不新增模型或冗余策略。官方北京区 text-embedding-v4 同步输入价为 CNY0.0005/千 token，最多 10 条、每条 8,192 token；参考 https://help.aliyun.com/zh/model-studio/text-embedding-synchronous-api 。版本 aliyun-embedding-bounds-v1.0.0 仅放行 HTTPS 北京 workspace maas 精确域名结构与 /compatible-mode/v1/embeddings，纯字符串输入、float 输出及受支持维度。国际区、其他模型、文件/稀疏/工具/额外字段、过期来源和超限请求均拒绝，不自动迁移端点。完整 10 条输入预算 CNY0.040960，以库内新鲜 ECB 汇率及 5% 缓冲预留 USD0.006412；不当作实际用量或账单，不假设免费额度。来源最迟 2026-09-20T00:00Z 失效。

新增向量完整性门禁：每个真实输入恰好返回一个唯一合法索引的有限数值向量，长度必须符合请求维度。缺条、重复、维度错误、无效数字或无法读取的响应不记成功；SDK 不能自动重放，未知费用和原用量保留。沿用原账本 inputTokens/outputBytes/latency/retries，失败 validOutputItems=0，丢弃原因为 incompleteModelOutput；检查结果消费于阻止错误数据下传，不冒充用户采用。模型 token/API 额度额外开销为 0。优化机会：复用已有响应验证，避免坏向量进入 RAG 后触发无效回答及补检索。

验证：719 tests /168 files 全部通过，typecheck、生产 build 通过。真实数据库只读验证当前配置匹配北京契约，Kimi/Embedding 共享有效 FX，累计验收占用仍 USD12.324404/30；新真实模型/付费搜索/SMTP=0，未写客户或预算记录。npm audit --omit=dev 与全量 npm audit 均 0 漏洞。GitHub 文档同步运行 34744359639 对 812c98e 成功，仅证明文档 CI，不等于业务 CI。

下一主线：OpenRouter 网关上界/可信报告、共享费用完成分摊、P06 单公司恢复、完整业务 E2E/最新鉴权 UI 及最终采用遥测。已核查 OpenRouter 当前官方目录：长上下文档位、缓存写入、premium 路由价格不能用最低展示价替代；公开观察不是新生产费率放行。官方 https://openrouter.ai/docs/cookbook/administration/usage-accounting 与 https://openrouter.ai/docs/faq 说明 credits 以 USD 计价，但 BYOK 可能上游另计；已向用户询问当前账号是否仅充值余额、无 BYOK，尚未答复，不假定。完整关联报告可核销原则不变，原 USD12 历史预留不追溯释放。没有更改模型、thinking、账号路由或付费配置。


## 2026-09-13 实施阶段 22：兼容评分入口独立输出上限

A19 用户已确认复核 8,192、裁决 12,000、备用评分 8,192，覆盖阶段 21 的待确认状态。分别以 LEAD_REVIEW_MAX_OUTPUT_TOKENS、LEAD_JUDGE_MAX_OUTPUT_TOKENS、LEAD_FALLBACK_SCORING_MAX_OUTPUT_TOKENS 配置。仅接入 OpenAI-compatible 适配器对应任务；不修改原生 DeepSeek 主评分、原模型、推理强度、升级条件或其他任务。OpenAI 模型使用 max_completion_tokens，其他兼容模型使用 max_tokens；显式上限不能被 extraBody 覆盖，完整请求预检包含该字段。

HTTP 正常但缺少完整停止标记、空内容、拒答或响应 JSON 无法读取均终止为未完成；长度截断即使 JSON 合法也不成功，不重试或切换备用模型。账本沿用原任务归因，显式完成契约只作用于兼容入口，不误判原生 Anthropic 响应。用量、延迟和未知预留保留，截断有效输出为 0、丢弃原因 incompleteModelOutput；未新增 token/API 请求来判定完整性，后续采用仍单独计数。

验证：全量 713 tests /166 files、typecheck、生产 build 通过；随后补充不可读取响应保护并重跑相关回归。无新增真实付费调用，累计占用 USD12.324404/30 不变。费用上界适配及整体验收仍待完成，设置输出限制本身不开放缺费率调用。优化机会：完成标记直接取已有响应，避免对不完整评分进行重复付费修复。


## 2026-09-13 实施阶段 21：文本输出上限及 Kimi 原币预留

用户确认 A18：RAG 回答 / 混合整合默认各 8,192 输出 token，搜索 playbook 默认 4,096；分别通过 RAG_ANSWER_MAX_OUTPUT_TOKENS、HYBRID_SYNTHESIS_MAX_OUTPUT_TOKENS、LEAD_PLAYBOOK_MAX_OUTPUT_TOKENS 配置。保持模型与 thinking 配置。请求使用 max_completion_tokens；HTTP 200 或有效 JSON 不等于完整输出，长度截断、拒答、空内容或缺失正常停止标记均不记成功，不自动重试。账本保留用量/费用并记录 incompleteModelOutput，不能释放未知费用。playbook 缓存纳入输出上限及完成契约版本，旧缓存不绕过新契约。

Kimi 官方大陆文本入口新增版本化人民币保守上界：完整上下文按未命中价加已配置输出上限计价，再使用库内新鲜 ECB 汇率及 5% 缓冲。仅明确模型和严格文本请求可用，费率/汇率过期或请求越界即阻止，不改变原模型、推理和输出配置。真实库只读验证 K2.6/4,000 上限 USD0.283612，K3/12,000 上限 USD3.470370；不是实际账单。费率配置 config/billing/kimi-text-bounds-v1.0.0.json 最迟 2026-09-20T00:00Z 失效。

验证：新增缓存变更前全量 708 tests /165 files、typecheck、生产 build 通过；lint 0 errors /11 既有 warnings。新增缓存回归另行执行。没有新增真实模型、付费搜索或 SMTP 调用；累计验收预算占用仍 USD12.324404/30。效率沿用逐次输入、用量、延迟、重试及下游采用记录；截断有效输出为 0，不虚构实际节省。优化机会：本地缓存汇率和完成契约检查无新增模型 token，避免截断结果触发付费重放。

整体仍未通过：OpenRouter 等剩余真实费率上界/可信账单适配、任务共享成本完成分摊、P06 单公司超限恢复及真实完整业务验收待完成。异常复核/裁决/备用评分额外上限尚待用户确认，本阶段不代为批准。


## 2026-09-13 实施阶段 20：费用观测独立分摊历史

在现有追加式 paid_cost_observation.metrics 中保存 cost-observation-allocation-v1：估算、服务商报告、发票各自按原请求公司输入生成守恒分摊，同时保留核销前/后 occupied 的独立分摊。不将五个口径或多个历史版本求和，不新建支出，不改变核销规则。verified-unbilled 保持原独立事件，不冒充零元发票；未知报告金额仍 null。来源是否完整、唯一匹配仍由已有独立字段表示，分摊本身不证明账单可信。

延迟观测读取被关联 reservation 中已存归属，不取当前任务的公司上下文，避免迟到发票串公司；旧记录缺失/格式不合法时保留全部未归属金额，不猜公司且不阻止合法核销。没有修改历史账单观测或给旧未知记录补造归属。复用现有 SQL 返回与追加写入，无新增数据库往返。

验证：701 tests /163 files、生产 build 通过；新增模块相关 13 项与 typecheck 通过。真实 SQL 052 合成验证六条追加观测逐条原金额=公司分摊合计、占用前后值一致、归属保持；原预留 100、估算 20、后续报告 10、发票 40、最终占用 40 分开保留，未叠加。并发核销只释放一次、未匹配仍保留、发票优先、超支仅暂停相关规则、追加历史不可修改均通过。审计合成行已清理，真实模型/搜索/SMTP=0；预算占用仍 USD12.324404/30。

效率边界：输入一笔已有请求的费用观测，有效观测与分摊存储各一组，生成/采用仅限账本；token/API 额度/本阶段付费成本为 0，延迟与重试沿用核销指标。优化机会：一次读取复用原请求归属，避免逐公司查询或让模型推断归属。实际发票接入真实性、任务共享完成分摊/完整处理公司集合、公司成本 UI、其他工具归属仍未完成，不代表整体通过。


## 2026-09-13 实施阶段 19：公司请求归属与预留分摊基础

落实 A07/A08 的前置事实：评分常规批次/单项修复/升级、主角色矫正常规/修复/升级、异常复核及裁决，在真实调用前记录本次实际输入的去重公司键。键采用规范域名 + 国家 SHA256；只记录身份键，不记录提示词、证据、联系人或凭证；跨国键独立。完整工作流使用 graphThreadId 的哈希区分用户新轮次，暂停恢复不生成新轮次。并发子作用域独立；同任务子入口继承归属，新 operation 不继承旧归属；实验无产品预算上下文时行为不变。输入域名矫正后的别名归并尚需完整身份映射，不伪造历史映射。

每次预留的同一 SQL 事务保存 costAttribution 和独立 reservationAllocation 字段，版本 company-cost-allocation-v1；按实际输入公司等分，无可靠逐公司 token 时不猜权重；微美元余数按键排序稳定分配，金额守恒。失败/未知请求同样保留原始输入归属，单项修复只归属该项。分摊 additionalSpendMicros=0，只增加原有一次预留。预留分摊不是实际发票成本，未更改核销/预算释放、模型输入、输出上限或并发。

纯算法分别支持 reservation/estimate/provider-report/invoice/occupied，禁止未知金额填零；未归属保持原金额，任务未完成不分摊，匹配轮次完成后按实际去重处理公司分摊，零公司保留全部任务成本。当前生产只接入以上具体模型入口的归属与预留分摊；未接入的搜索、补证工具等环节明确 unclassified，不假定 task-shared。A08 实际完整公司集合/完成钩子、其他四口径的持久化与公司成本展示仍待接入，不宣称费用分摊整体验收通过。

验证：697 tests /162 files、typecheck、生产 build 通过。真实 SQL 051 扩展验证同笔请求预留分摊 5+5=10、原占用仍 10、归属在外发前保存、并发/重放/租户隔离不变；仅合成审计行，已清理，不改客户数据。主评分模拟批内缺一项回归确认第二次请求只有待修复公司，遥测未进入模型 payload。本阶段新模型/付费搜索/SMTP=0，累计预算占用仍 USD12.324404/30。

效率：复用原预留记录，无额外模型 token、API 额度或付费调用，无新增数据库往返；沿用逐次请求输入输出量、用量、延迟、重试、丢弃原因与采用边界。分摊仅账本归属消费，不是用户采用。机会：补齐真实公司与请求对应后再计算逐公司成本，避免目标槽位或合格数作分母导致失真；归属字段不进入模型提示，避免额外 token。


## 2026-09-13 实施阶段 18：公共外币预算参考缓存

固定读取 ECB 官方 daily XML（https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml），无凭证、禁止重定向、15 秒超时、64 KiB 流式上限，拒绝实体声明及缺失/重复/非法报价与日期。USD/EUR ÷ CNY/EUR 用整数有理数换算；沿用 5% 仅预留缓冲与 72 小时新鲜度。来源仅有日期时保守取 UTC 零点，不因周末延长。该参考不是银行交易汇率、发票汇率，也不自行批准人民币模型费率。

迁移 053 在现有数据库新增独立公共参考快照、刷新状态、追加式观测表；不写个人知识、客户业务状态或账单。应用角色仅可追加快照/观测，不可覆盖历史。worker 运行时每 5 分钟检查到期状态，跨进程 advisory lock 保证单次刷新：成功间隔 24 小时，失败 1 小时；失败保留旧快照但不刷新其原始日期，过期读取返回空并继续阻止依赖该汇率的付费调用。没有启动 worker 执行用户待办，也没有部署云端定时器；worker 未运行时不宣称自动刷新。

验收：680 tests /160 files、生产 build 通过。真实 SQL 053 验证固定官方来源、并发最多一次 HTTP、重复命中缓存、应用身份不可更新快照；有效来源日期 2026-09-11，保留公共参考记录。汇率 USD/EUR=1.1592、CNY/EUR=7.7762，CNY1 加缓冲后向上预留 USD0.156524。新模型/付费搜索/SMTP=0，累计预算占用 USD12.324404/30 不变，实际账单未知。

效率边界：一次刷新输入项 1，验证成功输出 1，公共缓存写入消费 1；这不是实际付费调用采用。记录响应字节、耗时、重试 0、无效原因、利用率，模型 token/API 额度/付费成本均 0。机会：共享每日快照，避免各用户及每次模型调用重复查汇率。缓存读取/未到期检查不冒充新 HTTP；实际调用采用与最终用户采用仍需后续链路记录。

剩余主线：人民币完整请求费用上界与实际采用、其他服务商费率/账单核销、费率每周刷新与版本审批、A07/A08 费用分摊、P06 超大单家公司及备用重拆批、真实业务 E2E 与最终采用遥测；整体尚未通过。



## 2026-09-13 实施阶段 17：DeepSeek 完整请求上界与 V4.1 实际方法验收

最终回归：672 tests /158 files 全部通过，typecheck/生产 build 通过；lint 0 错误/11 既有警告。当前参考规则不是全接口计费覆盖，下面尚未通过的项目继续保留。

按已批准的保守上界原则实现 requestContract=deepseek-nonthinking-text-v1。仅 DeepSeek 官方 Flash Chat / Pro Anthropic 两种当前纯文本、非思考请求，严格白名单验证字段、消息结构、JSON 格式、8192 输出上限、61440 UTF-8 字节及无 query；工具、图片、额外字段、thinking enabled、其他网关/模型/协议拒绝后才可预留，未改变原模型生成配置。沿用各评分/补证更小的分阶段字节预检。

新版本 config/billing/request-bounds-v1.1.0.json 已由产品 policy 导入，保留旧空配置及候选方案历史。上界独立于本地 tokenizer：用大于等于官网 1M 的 1,048,576 输入 token 上限、峰值 cache-miss 和 8192 输出保守计算，Flash 每次 USD 0.324404、Pro USD 1.416561。来源为 DeepSeek pricing、create-chat-completion（输入+输出受上下文限制）及 guides/anthropic_api（max_tokens 支持）官方页，均于本阶段直接 HTTP 读取。验证日期保守取当日 UTC 零点，最迟 2026-09-20T00:00Z 失效，未实现自动刷新前过期仍阻止；其他接口缺费率继续阻止。

真实 V4.1 方法核验仅新增一次：输出 JSON 严格有效、reported model=deepseek-flash、官方 V41 本地编码与托管 prompt_tokens 均 155，输出 6，736 ms。只有一个合成样本，不宣称所有载荷的 tokenizer 等价或真实线索业务通过。scripts/verify-flash-v41-acceptance.ts 默认 preview；--run 以原验收 advisory lock/禁用无密码审计账户/原 USD30 上限/独立 stage 保存且跳过任何既有尝试，不重跑其他模型。最初非提升执行在实际模型前停止；后续获得系统权限完成隔离 Docker 后仅发送一次。

费用：原 USD12 保留，累计占用 USD12.324404、剩余 USD17.675596。调用的峰值全未命中 token 估算向上到微美元为 USD0.000054，已通过 append-only usage-estimate 写入真实账本（complete=false），不是实际账单；--reconcile-estimate 两次运行均复用原结果，零新增模型，零预留释放。实际账单未知，未将此估算用于核销。输入=1 合成请求，格式有效输出=1，方法验收消费=1，非销售线索最终采用；原 token/延迟/重试及边界观测保留。HTTP 次数=1、自动重试=0，未搜索/发送邮件。

本阶段代码 671 tests /158 files、typecheck/build 通过；新增 active-contract 限定测试另通过（最终全量结果见后补记录）。仍未整体验收：CNY 汇率生产刷新/其他完整费率及真实账单适配、费用分摊、P06 超大单家公司/备用重拆批、完整业务 E2E、最终采用链路。ECB 官方 XML 的 2026-09-11 观察已读到 USD/EUR=1.1592、CNY/EUR=7.7762，仅为预算参考来源，不是交易汇率或发票汇率，未据此放行 CNY 调用。优化机会：保守上下文预留明显大于实际 token 估算；完成可信核销/更紧且已核验的上界后减少占用，不能直接因单样本一致放宽。



## 2026-09-13 实施阶段 16：原生模型调用归因与官方费率证据

Kimi 意图轻量/规划、开发策略/独立策略/独立邮件/跟进、邮箱学习，以及 OpenRouter Claude 邮件修改入口新增 invocation 与逐次序号。复用现有提示版本，跟进和 Claude 反馈补标当前模板版本；只在本地异步上下文传递，不修改模型输入/模型/输出上限/重试或发送邮件。HTTP 原始用量、输入输出量、耗时、重试、丢弃原因沿用既有账本；真实下游采用未知时仍不填造。新模型调用/搜索/SMTP 均为 0。

667 tests /157 files、typecheck、生产 build 通过，29 项相关回归验证意图、Kimi/Claude 开发、邮箱及真实适配器的归因/预算停止；两个调用不混用 invocation，逐次序号不写入模型请求。全量通过不代表真实业务或美元成本降幅已验收。

费用来源现已补齐：读取 https://platform.kimi.com/docs/pricing/chat.md 原始 DocTable（不能把 JSX 表格整体当 HTML 标签删除）确认每百万 token，K3 CNY 2/20/100、K2.6 CNY 1.10/6.50/27，顺序为输入缓存命中/未命中/输出。与阶段 14 DeepSeek 峰值观察一起记入 config/billing/rate-observations-2026-09-13.json；参考观察不被产品计费 policy 导入，不激活付费，不核销历史预留。CNY 汇率、完整调用上界及账单真实性仍需核验，历史 USD 12/30 保持。

后续主线：完整费率/调用上界与原币账单核销、日/周刷新版本审批、A07/A08 费用分摊、P06 超大单家公司与备用重拆批、真实输入到持久结果 E2E、最终采用边界。P02 的 Gemini/搜索特有调用及账单字段仍需逐接口核验，不按 OpenAI 协议猜测。优化机会：复用同一有效费率来源快照，避免各入口重复查价；按真实批次保留失败费用与有效结果，避免只统计最后一次重试导致低估。



## 2026-09-13 实施阶段 15：SDK 预算停止与尝试归因

按 A06/B21 补齐一个实际漏洞：本地 OpenAI SDK 会将 transport 异常包装为连接错误并重试，LangChain 外层也可能重试；旧 playbook catch 会吞掉预算停止。新增调用级上下文，在首次 BudgetDeniedError 后锁住该次调用，SDK 后续重试不再进入预算/网络，并在调用出口恢复原错误。playbook 预算/未知付费异常向上抛出，普通非预算故障沿用既有降级。没有调低正常重试配置，没有改变模型、输入、thinking、输出预算或新增 Embedding 备用模型。

已接入 RAG Embedding（每个实际批次独立调用）、RAG 回答、混合答案整合、现有 LangChain playbook 四个入口。逐真实 HTTP attempt 记录 invocation/序号/任务/提示版本及原模型/网关/用量，非 HTTP 的 SDK 重试不冒充付费尝试；Embedding provider 标为 embedding-configured，不猜测实际厂商，实际网关另记。原生含 model 请求即使尚无完整 invocation 也加入既有 owner/任务/阶段请求指纹防重放，不把非模型轮询/表单套入。原始输入、邮件和凭证不落遥测；保存/下游采用仍维持已定义边界，不把 HTTP 成功当业务通过。

验证：665 tests /156 files、typecheck、生产 build 通过；lint 0 错误/11 既有警告。真实 OpenAI SDK 与 LangChain + 模拟 transport 验证未知只发送一次、预算拒绝零网络、正常可重试失败逐次归因、共享客户端跨用户隔离；playbook 预算错误不降级。真实 SQL 051 回归验证并发单次预留、未知锁、owner 隔离、非空用量与已报告失败的既有限制重试；合成记录清理。本轮真实模型/搜索/SMTP 新增 0，历史 USD 12/30 不变，实际账单未知。

本阶段未完成所有 P02 原生入口归因，未建立完整费率/账单适配，P06 超大单家公司恢复、费用分摊、真实业务 E2E 及最终采用链路仍待完成。优化机会：避免 SDK 在已停止调用上的无效本地等待；当前只阻止再次预留/外发，未静默更改 SDK 正常重试策略。实现依据本地 node_modules/openai/src/client.ts 和 @langchain/core/dist/utils/async_caller.js 的实际错误处理；官方 SDK 入口 https://developers.openai.com/api/docs/libraries 不替代本地行为测试。



## 2026-09-13 实施阶段 14：已批准 V4.1-Flash 门禁与计数方法纠正

阶段验证完成：657 tests /154 files、typecheck、生产 build 通过。Docker 固定源码/两套词表哈希检查及 16 组（两模型×两协议×四文本）断网合成测试通过，完整 Schema 均增加 token，重复编码一致，编码耗时 138 ms；不是托管账单对齐验收。模型/搜索/SMTP 新增调用仍为 0。

用户已明确批准 A12，覆盖阶段 13 的待确认边界。仅 discovery gate 默认/旧文本别名环境配置归一为 deepseek-flash；主评分及升级 Pro、thinking、8192 默认输出上限不变。Flash 缓存加入批准 epoch，旧 Flash 请求契约失效，Pro 契约不变；不宣称 epoch 固定了服务商的实际版本。环境密钥文件未修改、未提交。

官方固定 recipe 8cadfede7063c896b944e7bae05daa3549ae97ea 的 docs/tokenizer.md 指定 V4.1 使用独立 DeepseekV41Encoding + v41/tokenizer.json。因此离线诊断按模型选择编码器/词表，未知模型拒绝，构建校验两套词表哈希；旧 V4 统计不能证明新版计费。真实托管用量一致性仍待核验，离线成功不开放付费。

本轮直接读取 https://api-docs.deepseek.com/quick_start/pricing/ 成功（Web 阅读接口超时后用普通只读 HTTP 获取）：确认旧 Flash 别名退役映射 V4.1；当前 Flash 峰值每百万输入 cache-miss USD 0.30、输出 USD 1.20，Pro 分别 1.32、3.96。这里只记录来源观察，不生成付费规则或把 token 单价当完整调用上界。累计历史预留 USD 12/30 不变，实际账单未知。

当前验证：657 tests /154 files、typecheck 通过；隔离 tokenizer 镜像和生产构建验证继续中，后续结果另记。新增真实模型/付费搜索/SMTP 调用 0。输入/有效输出/下游使用/token/API/延迟/重试沿用既有 HTTP 与工作流观测，批准 epoch 不增加外部调用；离线诊断只输出合成案例计数与耗时，不计作真实线索产出。优化机会：先核验实际 serving revision 与可保守计费契约，再降低保守缓存 miss/预算占用，不以旧 V4 方法放行。其余未完成项保持阶段 13 列表，整体验收仍未完成。


## 2026-09-13 实施阶段 13：单项检查点、缓存校验与主线验收边界

评分与主角色补证在修复/升级前先保存同批已经独立完整校验的候选项；同级单项修复成功也绑定其真实单项请求。快照粒度始终是候选公司，依赖保留原始完整批次，不宣称整批完成；这取代早期仅完整批次才写任何单项快照的保守实现。同次回调避免重复写，写失败不重放成功模型。评分恢复命中一部分后，按剩余候选重新计算请求契约并有界读取修复快照，不把不同批次当作等价请求。

新增本地缓存结构校验（不改变传给模型的 JSON Schema）：完整字段、总分与子分、七个不同维度理由、角色、范围和当前引用/选定路径均检查；坏缓存不作为低分或有效命中。模型运行时也检查七个维度理由唯一。生成量、有效量与下游使用量不再把复用的旧结果混入本次新生成分母；复用量单列 metadata，跳过的复核不冒充新复核使用。仍不等于用户最终采用。

验证：655 tests /154 files、typecheck、生产构建通过；18 项桌面/手机隔离浏览器测试通过，预算测试已同步四口径折叠区并验证未知/覆盖率。16 组真实登录生产页面复验及账本 052 合成 SQL 回归通过、测试记录清理。生产依赖 audit 0 漏洞；lint 0 错误/11 既有警告。7492bd1 的 GitHub 文档同步成功（34715024773），不是完整测试 CI。最新运行时维度唯一校验补丁后再次完成全量 655 tests /154 files、typecheck/build/lint，全部通过（lint 保留上述 11 项既有警告）。

重要外部边界：本轮终于直接读到 [DeepSeek 当前官方页面](https://api-docs.deepseek.com/quick_start/pricing/)，旧 deepseek-v4-flash 已由 V4.1-Flash 服务；并非先前搜索索引中的 V4-Flash。只读核对本地配置：routine=deepseek-v4-pro、escalation=deepseek-v4-pro、discovery gate=deepseek-v4-flash。主模型/配置未改，付费规则仍为空。A11/B15 要求模型路由变更确认与方法重核验，不能以默认自动继续代替这个授权。待确认是否采用实际 V4.1-Flash 作为轻量门禁，并重新核验其版本/费用/缓存依赖，主评分 Pro 保持不变。

尚未完整验收：正式费率/完整调用上界与实际账单适配、日/周刷新及变更审批、费用分摊、P02 其余入口真实尝试归因、P06 超大单家公司分阶段恢复/备用重拆批、真实端到端及最终采用链路。检查点复用仍对身份变更/跨运行 ID、升级或备用模型保守 miss；不把本次修复宣称全部完成。真实模型/搜索/SMTP 新增调用 0，原验收预留 USD 12/30 保留，实际账单未知。优化记录：进一步降低保守 miss 和无用本地缓存查询，须先证明契约等价，不降低评分语义。

## 2026-09-13 实施阶段 12：结束原因、评分版本与有条件缓存命中率

逐 HTTP 观测新增受控结束原因和原始 thinking token 数值；DeepSeek/compatible 在每次尝试关联实际请求中的评分版本。其他已接入计费的模型 HTTP 请求至少记录请求模型/网关/端点，缺失 invocation、重试序号和提示版本仍为 null，不伪造。现有费用折叠区按评分版本/结束原因分组，不把截断混入正常完成记录。

输入命中率目前只支持 api.deepseek.com 的 Chat Completions：每条记录检查 prompt=hit+miss，组内所有尝试三个字段全覆盖，分母非零才计算加权 hit/prompt；其他协议/网关或缺失/不一致为不可计算，不转换为现金节省。依据 [DeepSeek 官方用量定义](https://api-docs.deepseek.com/api/create-chat-completion/)；新增 Claude thinking 字段依据 [官方 Messages 定义](https://platform.claude.com/docs/en/api/typescript/messages)，不将其叠加输出总量。

651 tests /154 files、typecheck/build 通过；真实 SQL 合成记录验证评分版本、结束原因、完整零命中率及未知输出字段，测试记录清理，无真实模型/搜索/邮件调用。汇总复用既有 SQL，无模型步骤增加。优化机会：逐网关核验其他缓存协议再扩展比率；补齐其余入口的真实 invocation/重试归因，不能直接按兼容格式推断语义。真实业务成本和模型质量仍待验收。

## 2026-09-13 实施阶段 11：费率过期与外币预留保护

已接入 7 天费率有效期上限及促销截止即时失效；显式外币上界必须有原币金额、来源/日期/版本和精确有理数汇率，最长 72 小时有效，未来/缺失/无效汇率拒绝。用整数精确换算、加 5% 预留专用缓冲并向上取整；配置的美元上界不足时拒绝。原币上界、汇率快照及缓冲与原预留单次写入，不增加模型或数据库写步骤，不把缓冲加入实际发票。

648 tests /153 files 与 typecheck 通过，覆盖过期/促销边界、原币保存、微金额向上取整、不足缓冲拒绝。全局 rules 仍为空，无新增真实付费。来源读取本轮 DeepSeek 页面直接获取超时，搜索索引有不同日期价格，不能据旧快照静默开放规则；Kimi 官方价格入口可读但表格未返回具体金额。官方来源仍以 https://api-docs.deepseek.com/quick_start/pricing/ 和 https://platform.kimi.com/docs/pricing/chat 为准。

本阶段只是已确认时效门禁与原币预留基础，不是汇率每日自动抓取/费率每周刷新、版本审批或真实账单原币核销全部完成。优化机会：单次只读刷新服务同币种调用共用缓存；刷新失败只沿用仍有效版本，禁止放宽过期校验。聚合遥测沿用原调用预留、拦截、token/API/耗时/重试和采用边界，无新增外部付费调用。

## 2026-09-13 实施阶段 10：逐候选输出校验与同级恢复

补证与评分不再因 JSON-valid 批次中的一项 Schema 错误而整批修复：逐项使用原完整 Schema 校验，只采纳唯一且属于请求的 candidateId，重复 ID 全部拒绝、陌生 ID 不采用；缺失/无效项走已有单次同级修复，补证漏项不再直接 Pro 升级。单公司修复/升级也要求完整唯一 ID 对应，不拿数组第一项替换目标公司。语义升级仍须原有实质变化门禁，不增加重试次数、搜索或输出预算。完整批次缓存仍只接收完整原批次，未把部分结果冒充完整命中。

批次 usage 新增聚合输入、Schema 有效项、无效项、缺失项、完整状态；并非最终用户采用，沿用原逐调用 token/成本/耗时/重试观测。优化机会：进一步保存修复期间暂停前的单项检查点；目前仅保证同次正常恢复不重跑有效同批公司，跨中断部分恢复与超大单家公司处理仍待完成。

验证：643 tests /152 files、typecheck 通过；测试证明一好一坏仅重试坏项、补证漏项不升级、重复/陌生 ID 不误用。阶段 9 生产构建已在 3100 重启，16 组真实登录桌面/手机回归通过，合成数据已清理，零真实模型/搜索/SMTP。本阶段 agent 改动尚待最终生产构建回归，不据此宣称真实评分质量或美元降幅。

## 2026-09-13 实施阶段 9：账本核销与四口径展示

迁移 052 已在同一应用数据库完成加法式应用：保留历史预留，新增估算/发票/核销/当前占用及只追加的成本观测、owner 隔离的费率暂停记录。完整且唯一匹配的可信报告才调整占用差额；估算、原始 HTTP usage、缺失或歧义报告不释放。发票优先于后来的普通报告，更正追加记录，重复来源幂等且冲突拒绝。报告超界保守增加占用并暂停该用户对应费率版本，不新冻结整个账户；历史冻结不擅自解除。

用户/任务预算折叠区分别展示历史预留、当前占用、Token 估算、服务商报告、发票核验及覆盖次数，不相加，不将缺失当零。核销仅提供内部可信适配边界，不向 HTTP 用户或模型开放金额/完整性授权；服务商账单真实性、原币/汇率和正式适配器仍待完成，因此现有未知账单不自动释放。

验证：638 tests /151 files、typecheck、生产 build 通过；verify-cost-reconciliation.ts 真实 SQL 验证估算/歧义保留、并发单次释放、发票优先、不可修改历史、超界规则隔离和非空费用汇总，verify-paid-replay-guard.ts 再次通过。合成用户与记录已清理，无真实模型、搜索或邮件调用。观测记聚合输入/输出/核销采用、零外部成本与重试、耗时及未核销原因；不是新增支出。复用原汇总查询，未增加模型步骤。优化机会：接入可核验且唯一匹配的真实账单适配，降低无必要的长期占用；不得拿 Token 估算释放预留。

尚未整体通过：正式费用上界/汇率费率与真实业务验收、成本分摊、P02 完整观测、P06 超大单家公司与部分输出恢复继续推进。当前新增页面仅静态测试与构建通过，最新生产浏览器复验待执行。


## 2026-09-13 实施阶段 8：持久请求防重放

迁移 051 为原账本添加可空 request_fingerprint 和 owner/operation/stage 索引，不改历史金额。已接入 ModelAttemptContext 的 DeepSeek/compatible 产品请求对 HTTP 方法、端点及完整 body 做 SHA-256；只改费率不能绕过防重放。与预留共用用户行锁，在发送前阻止同任务/环节中相同请求的在途、未知、超界或 HTTP 成功记录。已报告费用且 HTTP 失败仍可按既有有限重试规则再次预留；不增加重试权限。未接入上下文的轮询/普通工具请求不启用此指纹保护，避免误拦正常轮询。旧无指纹记录不能推定匹配，新用户/新任务仍隔离；跨任务通用复用继续依赖结果缓存。

`verify-paid-replay-guard.ts` 只应用 051、核对迁移与应用数据库同址后，用两名临时合成用户实测并发单预留、未知后拒绝、RLS 隔离、非空用量汇总、已报告失败再次预留；全部通过，测试记录已清理。全量 629 tests /149 files、typecheck 通过；真实模型/API/邮件调用 0。指纹与原预留单次 insert，避免额外 update；新增阻止事件只说明本次新传输未发生，不将历史未知费用算零。仍待已核验账单核销、受影响规则冻结范围、真实费用上界/模型验收与 P06 超大/部分输出处理，不能标记全部验收完成。

并行只读验收：`npm audit --omit=dev --audit-level=moderate` 为 0 个已报告漏洞；GitHub 文档同步在 fd1a116 成功（run 34712289304）。这不是完整云端测试 CI 或开发依赖审计证明。


## 2026-09-13 实施阶段 7：未知付费传输不自动重试

后续补齐：响应体读取中断同样归为未知付费结果，区别于完整结果返回后的账本写入失败。现有 626 项全量测试通过，新增流中断测试后 12 项 transport 测试与 typecheck 通过。Lint 发现阶段 1 遗留未用 policy import，已删除；其余 11 项旧警告不改。下文“响应体中断仍待完成”已由本补充取代，HTTP 完整但模型输出缺失/截断等仍待核对。

A06/B25：产品预算作用域中，HTTP transport 抛错发生在预留之后，现记录未知费用/用量/输出、失败传输耗时并抛出 `PaidCallOutcomeUnknownError`。错误沿现有预算停止通道直达工作流，不触发 DeepSeek 自带重试或 resilient 备用切换；不能用未知占用为备用腾预算。未把这类已尝试传输记成调用前拒绝的零费用事件。实际未发送也可能被保守视为未知，需可核验来源再核销；不静默释放。未改独立 CLI 实验的单独授权计费策略。

11 项 transport 单元测试和 typecheck 通过，包括真实 provider 包装层三次重试配置下只传输一次、备用零次、预留一次且费用为 null。验证是 mock 网络，无真实费用。剩余：响应体中断/未完成模型输出、跨进程未知请求锁、已验证未计费失败的核销机制仍需完成；此阶段不等于账本验收全部通过。


## 2026-09-13 P05/P06 实施阶段 6：国家隔离评分缓存与批次保存

验证：625 tests / 149 files、typecheck 和生产构建通过。准确指标名为 `batchCacheSaveAttempts`（回调尝试数，不冒充实际写入行数）；下面方案描述中的 completedBatchWrites 名称已替换。

复用现有 `lead_assessment_cache`，没有新建重叠存储。依赖 v2 加入国家名/代码、完整主模型请求契约（含批次/顺序/模型/端点/Schema/私有输入）、身份、证据 URL/标题/正文/有效状态和矫正说明；继续按 user/workspace 的 RLS 隔离。缺国家或完整契约的历史缓存不命中。只有完整、ID 一一对应的主模型常规输出在标准化完成且无需升级后才赋予可写契约；备用/升级/修复对象保守不共享。此缓存不改用户手动覆盖字段，费用未知不阻止复用已验证结果，也不释放费用预留。

评分 worker 每批完成后立即请求现有缓存保存，不等待所有批次结束；最终阶段避免重复写同一批。可选缓存写入失败记录聚合标志/警告并保留本次评分，不能触发模型重放。测试验证前批回调在后批预算暂停前完成、存储回调失败不重放、缺费用仍保留有效输出契约、国家/来源/请求依赖变化。该机制不是跨进程任务锁或完整批内部分响应恢复；未知传输、升级结果恢复、单家公司超限处理仍待完善。统计沿用 cacheHits/cacheMisses，增加 completedBatchWrites/cachePersistenceFailed，真实节省未测。无新增模型/API 调用。


## 2026-09-13 P02 实施阶段 5：成本页缓存观测

现有用户预算/任务预算折叠区增加模型用量观测，无新页面或模型调用。服务端按 owner、可选任务及 stage/provider/requestedModel/reportedModel/promptVersion/gateway/endpoint 分组，只返回白名单字段的已报告合计与覆盖尝试数。未知为 null，显式零保留；未把输入与缓存字段机械相加，未把观测量推成现金折价，也未把 HTTP 响应等同下游采用。UI 只传序列化类型，不引入数据库或服务端凭据模块。后续优化：版本/路由组长期增多时增加分页或预聚合，不在页面加载触发付费计算。

8 项针对性测试、类型检查及生产构建通过。localhost:3100 的生产模式真实登录/UI/数据库检查 16 组通过（1366/390px、GB/MX、预算观测空值、停用用户拒绝），手机观测截图已复核。首次失败为 Playwright 独立 HTTP 客户端在本地 HTTP 下未按浏览器 Secure Cookie 行为发送会话；验收脚本改为真实浏览器 fetch 后通过，产品安全 Cookie 未降低。仅合成测试用户，完成后清理，真实模型/搜索/SMTP 调用 0。此阶段只验证空观测 SQL 与合成字段渲染；非空真实服务商账单/缓存率、全部 provider 归因、评分版本与核销仍待验收。


## 2026-09-13 P05 实施阶段 4：公共角色缓存依赖收紧

主角色快照读取/写入要求完整主模型请求契约：DeepSeek 实际序列化体、模型、端点、Schema、提示版本、生成参数、全部批成员/顺序及 evidenceIds 的 SHA-256。依赖 v2 另含公司身份、官方 URL、输入角色/类别、缺失证据、国家/目标和证据顺序/标题/内容哈希/来源。旧缺失契约记录保留但不命中；无可靠契约的 provider 不启用此缓存。只记录完整、候选 ID 一一对应且未切换模型/备用 provider 的常规批次结果；升级/修复/合并生成的新对象保守不写，避免归因冒充。

此版本为了安全保留原始 ID 参与请求哈希，因此跨运行 ID 变化会 miss；既有引用重绑定工具保留，但不据此假定完整请求等价。缓存命中可能暂时降低，未测真实节省率。复用仍在现有公共证据库，未引入私有评分/路径跨用户共享。已有 cacheHits/cacheMisses、逐调用用量/字节/耗时/重试及下游未知口径沿用；本地哈希不调用模型，费用 0。后续待验收：证据 ID 可证明等价替换、评分/路径租户国家隔离持久缓存、跨进程幂等和未知费用恢复。阶段 4 不等于 P05 全部完成。


## 2026-09-13 P06 实施阶段 3：完整请求字节预检

补证/评分拆批现使用与 DeepSeek 实际发送相同的序列化器，包含 system、完整 Schema、evidenceIds、转义及 UTF-8 字节。上限补证 36,864、仅评分 57,344、评分含路径 61,440；保留最多 5 家及更小调用者限制、既有字符软限制、原顺序和并发。所有常规批次先完成本地预检；超大单家公司明确抛出不可重试暂停错误，不截断或生成低分。DeepSeek 和 compatible 最终发送前再次校验，备用请求独立检查实际序列化体积。没有改输出 token/thinking，没有自动搜索或模型压缩。

本阶段是 P06 部分实现：单家公司压缩/分阶段恢复、批内成功结果持久恢复及备用模型自动重新拆批尚未完成。常规批次预检避免本阶段先付费后发现超限，但既有补证搜索及之前阶段的 checkpoint 不等于批内完整幂等。新流程字节统计不等于可信 token/美元计费上界，空费率门禁不变。遥测沿用逐尝试输入/输出字节、用量、耗时、重试及未知下游采用；新增步骤仅本地序列化，无模型/API 费用。后续优化记录：备用载荷与批次持久恢复仍需完善，不能声称成本节省率或完整验收通过。

## 2026-09-13 stage 2b: model attempt attribution

DeepSeek/compatible execute -> isolated invocation/attempt context -> paid reservation metadata (task, prompt version, requested model, gateway host, endpoint kind) -> separate response-reported model. No telemetry is sent to providers. Retry policy and budget occupancy are unchanged; other provider attribution, scoring-policy version, aggregate denominators and UI remain pending. Async context isolation and real wrapper retry linkage are tested using synthetic transports.

## 2026-09-13 stage 2a: attempt-level usage persistence

Paid transport -> existing per-attempt reservation -> response usage numeric allowlist -> reservation metrics.providerUsage. Explicit source paths preserve protocol differences; missing counts remain null. No response content, credentials or arbitrary metadata are retained. Failed HTTP responses are observed independently; accounting failure never replays successful work. P02 remains partial: routing/version attribution, retry linkage and compact UI aggregation are pending. No billing reconciliation behavior or paid-call authorization changed.

## 2026-09-13 implementation stage 1

All P01–P06 approved. Full policy -> deterministic model projection -> structured request -> fixed-prefix user JSON -> existing provider transport -> unchanged output Schema/parser. DeepSeek and compatible fallback share the ordering helper. Arrays, values, message authority and privacy remain unchanged; source policy/checksum persistence is not replaced. Prompt versions invalidate old semantic identities. 596 tests / 142 files and typecheck pass. This stage does not implement cache telemetry, exact persisted score reuse, full-body batching or new billing rules; hosted quality/cost gates remain open.

## 2026-09-13 P05 approved, final P06 discussion

B25 confirms exact cache reuse with tenant/country/input/version/batch dependencies, citation rebinding and manual overrides. Valid results may be reused while unknown charges remain reserved. No runtime implementation yet. Final P06 proposal retains at most five companies, checks final full-body limits/output completeness, preserves task modes and prevents replay; after confirmation implementation returns to acceptance closure.

## 2026-09-13 P04 approved

B24 approves complete output Schema and validation safeguards; no runtime edit. Next P05 discussion separates shared public correction reuse from tenant/workspace/country-scoped scoring, with full input/version/batch dependencies, evidence-ID rebinding and no replay of unknown-cost attempts. P05/P06 remain unapproved; implementation follows complete confirmation.

## 2026-09-13 P03 approved

B23 approves deterministic model-policy projection with full semantic constraints and audit snapshots retained. No runtime change yet. P04 proposes preserving the complete output contract while reviewing redundant surrounding format guidance, not automatically rewriting Schema. P04–P06 require confirmation before unified implementation and acceptance.

## 2026-09-13 acceptance-led scope

B22 restores the agreed P03–P06 discussion alongside remaining acceptance, then prioritizes closure of acceptance gates over new optimizations. P01/P02 are confirmed; P03–P06 still require detailed confirmation before unified edits. The acceptance report's latest gate table is authoritative for gaps and required proof, not a new pass claim. Existing cost/privacy/no-cloud boundaries remain unchanged.

## 2026-09-13 P02 approved, P03 pending

B21 approves the seven per-attempt cache telemetry rules in the review: preserve unknown/protocol semantics, separate avoided calls and provider discounts, show coverage, retain miss-rate reservations, no raw sensitive content or replay on metric failure. No implementation yet; discuss P03's deterministic model-policy projection next and wait for all remaining confirmations.

## 2026-09-13 P01 approved, implementation deferred

Rule B20 approves fixed-prefix field ordering with unchanged message authority, content, array ordering, privacy boundaries and concurrency. No paid warmup. Implementation waits for P02–P06 confirmation; no runtime change in this stage. Next discussion covers per-attempt cache observation, keeping application cache avoidance, provider cache discounts and actual settled cost distinct.

## 2026-09-13 fixed prompt/cache review only

[Review P01–P06](FIXED_PROMPT_CACHE_REVIEW_2026-09-13.md) follows approved B19 analysis. Dynamic evidence IDs precede task instructions and candidates precede rubric; proposed stable-prefix ordering is not implemented. Existing public correction cache remains, exact qualification reuse needs dependency review, and provider usage currently drops cache detail. Application result reuse, provider cache discounts and prompt token reduction are separate metrics. No inference, product change or cache-hit guarantee from this review.

## 2026-09-13 frozen request counting

Approved B18 diagnostic: frozen snapshots -> current request builders (standard playbook; no original RAG/private memory) -> mocked provider body -> in-memory stdin -> disconnected read-only Docker -> aggregate counts. All 1,053 Pro Messages/disabled requests passed repeated encoding; no agent evaluation, search, scoring, persistence or real model call. Existing batch input maxima are 9,492 / 13,513 / 13,017 tokens; all within approved byte caps. These are observations, not proven billing bounds. The diagnostic does not implement new byte-based batching. Full aggregate and limitations are linked in rule register v1.4.0.

## 2026-09-13 isolated text encoding verification

B17 is approved. `scripts/offline-tokenizer/` builds only official text/protocol Rust components in Docker, overcoming the previous local Python/native prerequisite issue without OpenCV. The no-network, read-only, unprivileged synthetic audit passes 16 input variants and 32 repeated encodes. It is not imported by product code. Exact counts and scope are in rule register v1.3.0; full business-request replay and hosted billing equivalence remain unverified, with paid gates unchanged.

## 2026-09-13 local token accounting prerequisite

B16 in the [rule register](CONFIRMED_PRODUCT_RULES.md) is now approved. Official source and V4 tokenizer are pinned and integrity-checked in ignored local storage; no tokenizer runtime or provider call has run. Official PyPI lookup yielded no installable distribution and the local native toolchain is absent from PATH. Isolated build environment selection remains pending; this is not a billing upper-bound acceptance. No runtime workflow or dependency changed.

## 2026-09-12 confirmed-rule checkpoint (documentation only)

Register v1.1.0 adds approved B11–B15: model-matched local token accounting or verified upper bounds -> input/output/other-charge quote -> per-attempt reservation, retaining unknown prior costs. Changed model/endpoint/contracts require revalidation. Official recipe discovery is documented; its concrete integration is still a proposal, not a tested billing guarantee.

The [confirmed rule register](CONFIRMED_PRODUCT_RULES.md) is the review index for exact user decisions and their implementation status. Approved next flow: frozen/reusable evidence -> current semantic request -> full serialized UTF-8 body measurement -> split oversized batches or handle oversized single-company evidence without silent loss -> independently verified tariff/token bounds -> reservation -> provider attempt -> separate reported/estimated/invoice amounts -> downstream adoption metrics. Body limits: correction 36,864 bytes; score-only 57,344; score-and-paths 61,440; output default remains 8,192. These new limits and full reconciliation rules are **not implemented by this documentation stage**. Global tariffs remain empty/fail-closed. Rules A01–B10 govern the next stage; historical workflow results below retain their original scope.

## SMTP send acceptance — latest 2026-09-12 update

Following separate user confirmation, one synthetic test email passed the real product send path: SMTP accepted, encrypted receipt and sent timestamp persisted, encrypted readback validated. No retry, no model call. The test node remains distinct from customer records. Await recipient confirmation before marking inbox delivery accepted; server `sent` status alone does not prove it.

## SMTP system-DNS connector — 2026-09-12

Confirmed product change: saved mailbox -> system DNS (5-second bound) -> up to four distinct TLS endpoints (5 seconds each, transport failures only) -> secured socket handed to Nodemailer -> authentication -> existing explicitly confirmed send/idempotency flow. Preserve hostname/certificate verification; no hardcoded IP, TLS bypass, or post-handoff retry. System resolution avoids the observed mismatch with Nodemailer's DNS resolver. Authentication-only live check passed in 504 ms, no mail or database mutation. Actual delivery remains pending. See the acceptance report for diagnostics and limits.

## DeepSeek recharge recheck — latest 2026-09-12 update

User-authorized single-stage retry selects only DeepSeek with a fixed new audit stage, under the existing advisory lock and cumulative $30 budget. The original 402 and its reservation remain immutable; repeat invocations skip the new receipt too. HTTP 200 / valid JSON, 1719 ms, 102 input and 27 output tokens. Reservation now $12, not actual spending. No production routing or mailbox settings changed; five provider contracts now pass but full business acceptance remains incomplete. See `LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md`.

## 2026-09-12 local production and bounded provider acceptance

Latest authority: `LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md`. Local production only. Login body validation precedes account lookup; each session requires an active user. Kimi K3 requests use the provider-supported completion cap; the billing boundary rejects obsolete-only caps. Server-side acceptance scopes inherit isolated reviewed tariffs without modifying the fail-closed global product policy or normal user budget.

Flow: fixed synthetic input -> exact provider/model request -> durable $2 reservation under isolated $30 cap -> one HTTP attempt -> JSON/vector validation -> aggregate receipt and estimate -> report. No tools, search, business data or automatic retries. Five attempts, four valid validator-consumed outputs, $10 reserved; OpenRouter reports $0.00015, other invoices unknown. Failed requests and resumed runs retain costs and never replay automatically. This is not full business-agent acceptance. SMTP verification failed before send and no outbound receipt exists. 586 tests, 18 browser checks, 14 authenticated groups and build/typecheck pass. Remaining gates and official price sources are in the linked report.

## 2026-09-12 自然语言预算提案（最新补充）

assistant-intent-plan-v1.3继续使用现有Kimi轻量模型和多轮历史，新增budget_change结构：user/task范围、绝对累计美元上限。币种、范围或金额不明确时澄清；数字校验由程序完成，预算提案不升级K3、不调用RAG/网页搜索。联合“新搜索+预算”先澄清两步建立计划/设置预算，不默默丢掉预算或自动执行。模型不能返回可信任务ID。

助理消息保存可审阅提案；页面允许修改金额，任务范围必须从当前对话拥有的搜索任务中手工选择，取消任务不列出。点击后再次明确确认，通过已有owner校验的/api/budget写入，旧预留不重置、额度不自动追加、任务不启动。初始没有预算或费率时，Kimi调用本身仍受阻；任务中心的直接预算表单可用于首次设置。

提案复用既有意图模型聚合遥测和预算变更审计，没有增加第二次模型识别、补证或搜索流程。预算提案生成不等于用户采用；成功确认只代表预算配置采用，不代表真实费用或搜索结果。后续优化：增加提案ID到确认审计的细粒度关联，以量化提案改写率；当前不虚构该指标。

567项单元测试/136文件、18项桌面/手机隔离浏览器检查、类型检查和生产构建通过；lint 0错误/11项既有警告。隔离检查现同时加载globals.css与ipados.css，避免漏掉实际主题覆盖。真实登录验收12组通过（新增预算提案读取/取消无写入），390px截图已复查，合成记录已清理。没有实际模型、搜索或SMTP调用；这不是Kimi真实账号连通性验收。剩余上线限制仍为审核后的供应商请求费用上界/发票核销合同、真实SMTP测试收件人，以及后续真实采用链路测量；未擅自更改实验策略。

## 2026-09-12 任务预算与聚合遥测收尾（最新状态）

迁移050已应用：task_spend_limit保存owner/action级可选累计上限，spend_budget_change以只追加记录保存用户确认的修改和零外部调用聚合指标。每次HTTP预留在同一用户行锁下同时检查总预算和任务预算，修改上限不得低于已有预留；不重置历史占用、不自动启动任务。任务详情折叠读取预算，支持明确确认修改，展示各阶段预留/已报告费用/未知账单/累计HTTP耗时；耗时不是并行墙钟时间，预留不是实际支出。无任务上限沿用用户总预算，续搜仍是需独立确认的新任务。

新增trackedOperation覆盖独立RAG回答、知识分块存储、手动私有记忆和跟进生成的成功/失败聚合记录：输入量、有效输出、存储采用或待审核、token/费用/重试未知值、耗时、弃用原因和优化机会。只保存计数，不写提示词、邮件或错误原文；指标落库失败不重放成功的业务操作。嵌套阶段保留父任务预算ID，不能因新建指标ID逃逸任务上限。RAG回答返回不等于用户采用；知识/记忆入库不等于未来检索或邮件采用。HTTP账本与操作指标有重叠，不相加。跟进token为最终响应报告，不冒充包含所有重试的总量。

验证：561项单元测试/135文件、16项隔离浏览器测试、类型检查通过，lint为0错误/11项既有警告；任务预算真实SQL探针验证预留拒绝不增加占用及跨用户RLS。登录验收扩展为10组桌面/手机真实本地API检查，包括零美元合成任务预算；付费调用和SMTP发送均为0。临时合成用户清理新增预算外键时曾回滚，已用严格身份/无付费记录检查清理并修正自动清理顺序；未删除客户数据。

仍不能声称已完成真实付费上线验收：已审核网关全包请求费用上界尚缺，config/billing/request-bounds-v1.0.0.json保持空规则；部分无输出上界请求继续阻止。发票核销/释放依赖账单接口合同，未知占用保留。真实SMTP需要专用测试收件人。自然语言预算变更尚未实现，当前只有显式表单确认；未实现的最终用户采用事件保持unknown，不虚构完整利用率或节省百分比。手动记忆持锁embedding的连接占用、SDK包装拒绝的无网络重试以及更细的语义采用链路作为后续优化记录，未擅自降模型或输出质量。

## 2026-09-12 登录后响应式验收

新增scripts/verify-authenticated-ui.ts：只允许localhost，用同库迁移连接建立临时合成用户/工作区，真实应用角色和密码登录访问API；检查1366px与390px的GB/MX独立候选、详情Escape、实际渠道图、任务/知识/邮箱导航及预算/用量读取。浏览器禁止外网及非登录写入，不替换API响应。8组检查通过，付费预留0、真实邮件0；临时用户/工作区/公司已清理，正常登录审计保留。另有14项隔离浏览器测试、552项单元测试及构建通过。

实际检查发现并修复手机顶栏溢出、筛选文字竖排、侧栏图标缺可访问名称和移动端退出入口被隐藏；渠道图表单整理为响应式布局，SVG横向滚动仅限图框。已截图复查。验收使用合成数据，不代表所有真实客户历史异常或SMTP发送均已验收；费率和真实收件人未确认的外部调用继续阻止。验收初次localhost探测受CLI代理影响已改为显式本地直连，不能据此断言原3000服务本身故障。

## 2026-09-12 剩余付费入口与拒绝审计

已接入联系人、存量关系分析、独立RAG查询/知识入库、开发上下文/反馈/手动记忆、邮箱授权学习的用户预算作用域；本地邮箱筛选不调用模型。Snov OAuth也不假定免费，表单仅按已审核端点/请求体积报价，无费率不发送。结果链接限定官方域名和结果路径、禁重定向；按顶层status判断完成，轮询未完成抛出unknown而非缓存为空；保留第一页最多50条的现有范围并明确提示，不自动翻页。依据：https://snov.io/api 。

DeepSeek/兼容模型/搜索/补证/主评分/复核捕获预算拒绝后向上抛出，不触发备用供应商、候选失败评分或付费重试。预算拒绝记录到product_operation_metric，仅本次被阻止HTTP的现金/token为0，不把此前调用视为免费。用量接口把操作表与30天HTTP预留/已报告费用/未知数/耗时分开，不重复加总；输入输出使用效率仍以各业务表语义为准。新增552项总回归通过、类型检查通过；不含真实付费调用。

剩余边界：供应商/网关的全包请求费用上界仍未审核，费率保持空，不把公开token单价或历史估算冒充合同上界；任务子预算、发票核销释放、独立RAG/记忆等完整语义利用率仍待补齐。手动记忆目前持锁进行embedding，需后续优化连接占用；仅新增费用检查未改变其并发写入语义。当前代码覆盖已识别的产品入口，不等于历史费用全量或真实模型/SMTP验收。

## 2026-09-12 助手与开发生成预算边界

助手主图、开发策略/修订及跟进生成建立用户费用作用域；Kimi、Claude、Gemini聊天搜索及综合回答HTTP传输接入预留检查。并发子作用域独立，禁止跨用户嵌套；开发生成沿用已持久化操作ID。Kimi/Claude捕获预算拒绝后直接退出，不重试、不生成模板冒充成功、不切换供应商。跟进入口返回明确402，不改变原邮件。既有输出token上限不降低，未设上限请求继续保守阻止。

验证：541项测试、类型检查通过，lint 0错误/11项已有警告；新增无费率零网络调用及并发归属测试。无付费调用、真实邮件发送或数据库迁移。联系人、独立知识处理/邮箱学习、完整阶段细分与拒绝遥测、费用上界配置及登录端到端验收仍未完成；未验证费率保持空，不能将预留占用当实际成本或声称全产品已封顶。

## 2026-09-12 completed-underfilled continuation

049 adds owner-private parent/child/root lineage and exclusion snapshots. A completed task with a known gap can create one idempotent **proposed** child, never queue or execute it. The original result, checkpoint and cost remain unchanged. The child uses the remaining target, original market/roles and current product scoring policy; historical scores are not retroactively recomputed. Prior assessed domains across the lineage seed the existing discovery exclusion mechanism; they are not added to playbook prompts. The new task page exposes a separate plan/fee confirmation before execution through the existing budget-controlled workflow. Repeated clicks return the same child and record cache reuse. Maximum three continuations, confirmed exhaustion or consecutive zero-yield tasks require replanning; missing run provenance/counts or oversized exclusions are not silently inferred/truncated. Conversation deletion cascades lineage. 536 tests, 14 isolated browser checks and real rollback proposal/idempotency/RLS/deletion checks passed; migration 049 applied without running a paid search.

## 2026-09-12 uncertain-cache reconciliation

Task details offer explicit local closure for a company-detail contact lookup still running after ten minutes, and for failed/ten-minute-stale relationship analysis. Server ownership/status/time checks are authoritative; this never calls a provider, issues a refund or releases a dollar reservation. Contact cache becomes unknown, requiring a separate explicitly confirmed refresh. Relationship attempts retain their original ID/results/metrics and archive the cache key so a separate explicit analysis creates a new ID. Completed/recent-running/already-reconciled records cannot be reset. Contact writes lock and verify run ID/status before persistence; relationship completion requires its old ID still running. Late output records usage/discard reasons only, never replaces new results or returns suggestions. No new migration; per-owner local audit aggregates record reconciliation separately from uncertain external fees.

## 2026-09-12 country state cutover

047/048 are now applied, superseding the foundation-only status below. Search/manual candidates, list/edit/assessment, assistant lookup, relationships, development strategy, contact aliases and outbound/follow-up resolve workspace-country candidates. Global identity is not overwritten on reassessment; matching-role reassessment can clear stale flags without removing user decisions or contact progress. New mail stores country and updates only that market. Old country-unconfirmed mail is labeled and excluded from market totals until an explicit audited assignment; no resend. Historical draft country is recovered only from a matching stored search run; otherwise task history says unknown. Real application-role reads and rollback isolation/reassessment probes passed, plus 10 isolated desktop/mobile browser checks. See `COMPANY_MARKET_STATE_CONTRACT.md`; no paid calls or authenticated/live-delivery acceptance claim.

## 2026-09-12 country state foundation (not enabled)

Migration 047 and a country-state repository preserve global identity/legacy FKs while isolating workspace/country snapshots and overrides. Existing candidate IDs survive backfill; reassessment preserves development progress. Six tests and a real database rollback probe verified country/owner isolation. The migration is not yet applied and production readers/writers are not switched: mail/strategy provenance and all candidate-action lookups must be adapted together. See `COMPANY_MARKET_STATE_CONTRACT.md`. No new evidence/model/search/mail operation.

## 2026-09-12 conservative budget foundation

User confirmed fail-closed missing prices and country-independent business states. Migration 046 adds integer micro-USD owner budgets and pre-network reservations. Task Center has lazy-loaded budget edit/refresh with explicit confirmation and separate occupied/reported/unknown amounts. The production lead workflow binds per-action scope through embedding/playbook/discovery/evidence/scoring transports and retries. Empty unverified tariff configuration blocks uncached paid work. This is a foundation: independent chat/mail/contact/knowledge entry scopes, reviewed provider bounds and task sub-limits are still pending. See `BILLING_BUDGET_CONTRACT.md`; no full-product cap or actual cost reduction is claimed. Real RLS probes passed with verification writes rolled back.

## 2026-09-12 compatible security patch verification

Next.js and its lint config upgraded to 16.3.4, mailparser to 3.9.24, Vitest to 4.1.11 and compatible transitive js-yaml to 4.3.2. This addresses the preceding audit alerts without forced major upgrades or dependency overrides. Official Windows advisory: https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36 . Final install audit reports zero known vulnerabilities; this is a point-in-time dependency check, not a full security certification. Running processes must restart to load new dependencies; an older loaded native binary was left untouched rather than killing an unidentified user process. Existing experiment artifacts and databases were not altered.

## 2026-09-11 relationship adoption linkage

Analysis responses include the cache record ID and original (pre-filter) suggestion index. Loading a suggestion alone is not adoption; saving carries this reference and validates owner, workspace, country, directed company pair and completed analysis in the same transaction. Saved indices are deduplicated under a row lock, so retries do not increase downstream-used counts. The user may edit the proposal; the metric means used as a source for a saved relationship, not unchanged acceptance or verified cooperation. Manual relationships require no analysis and consume no tokens. Historical saves are not backfilled speculatively.

## 2026-09-11 isolated browser acceptance

Company/task/evidence dialogs share topmost-only Escape handling, Tab containment, opener focus restoration and background scroll locking. Assessment retry clears the previous failure only after a successful read. Six Chrome checks pass at 1366px/390px using actual React components and production CSS, with synthetic fixtures and every network request intercepted. This verifies interaction, not authenticated Next.js navigation, real provider calls or live SMTP. Run `npm run test:browser` with installed Chrome; output stays in ignored `tmp/`. Test fixtures do not expose a product route or authentication bypass.

Production dependency audit reports six affected packages, including a critical Next.js advisory; this is a deployment risk pending a separately verified compatible dependency fix, not introduced by the browser fixtures. No `npm audit fix --force` or unverified dependency override applied.

## 2026-09-11 completion continuation: dependency invalidation and delivery accounting

Development snapshots now store a conservative hash over visible knowledge revisions, owner memories/status and owner relationship revisions. Reading an old strategy compares this hash without embedding or generation; legacy snapshots remain unknown. Role/path/tier edits in the same page mark the loaded strategy for review immediately. This conservative scope can flag unrelated knowledge edits and should later narrow only with proven complete dependencies.

Development generation/revision reserves a durable operation before execution, settles persisted-output metrics, and records failed/abandoned attempts as failed/running with unknown cash cost. Task feed shows running/failed generation attempts as a sixth kind, avoiding a duplicate completed task next to the saved draft. This supplements, not replaces, saved draft usage. Retries without source telemetry remain null. No failed model call is automatically replayed.

Lead persistence stores added/updated/role-changed counts relative to the user's workspace; role changes are a subset of updates and exclude an explicit primary-role override. Counts are written in the result transaction and reused on persistence replay. Manually protected companies now advance their assessment run link without overwriting protected business fields. This does not yet implement multiple same-domain country memberships or completed-run continuation. Task detail defaults to readable metadata, candidate table and contact summary; complete raw data remains collapsed. JSX tests are now included in Vitest rather than silently omitted.

## 2026-09-11 resumed: market counts and company correspondence

Global overview counts active (confirmed/running/sending) tasks across all five shared sources without list pagination. Countries with active tasks but no candidates appear; unknown/mixed counts stay separate. Refresh is visible-only/non-overlapping at 30 seconds; unavailable statistics are not zero. Manual company creation exposes optional role, remains unverified and invokes no model.

Company development records list locally imported, owner/company-associated correspondence in pages of twenty. The API fetches a twenty-first sentinel but decrypts only projected rows; body/ciphertext never enter the list response. Expansion uses the existing owner-protected mailbox API. No sync/learning/search is triggered. Association does not prove a shared thread. New read stages retain durable counts, zero model/search cost, latency/failure/discard and projection boundaries. 493 tests / 115 files, typecheck/build pass; lint zero errors/11 old warnings; real task aggregate SQL/RLS checks pass. Browser/SMTP acceptance remains outstanding.

## 2026-09-11 resumed: durable non-lead usage

Intent and local company lookup now reserve/settle owner-isolated product operation records (migration045). Unknown costs and incomplete token usage remain null. Finished intent telemetry is persisted before downstream routing; failed final telemetry does not discard the paid result. The new read-only `/api/tasks/usage` reports these sources separately from lead search/model ledgers, not as a complete budget. It has no UI hard-limit claim. Pending work remains in the completion checklist.

Authoritative scope: `Network_Channel_Copilot_PRD_v1.1.md`. Product functionality is explicitly authorized; experiment mechanism migrations are not included.

## Stage 1a: country routing

Authenticated user -> current owner-scoped workspace + user's search-action countries -> country selector -> `/markets/{country}/{leads|channel-map}` -> freshly loaded saved workspace -> selected-country list/map. Names are normalized across supported locales. All-country maps show a selection prompt. Conversation result buttons pass the task country. Switching countries does not invoke acquisition, scoring or generation.

Verification: country normalization unit tests and TypeScript. This stage does not claim completion of the table redesign, polling/incremental persistence, map relationship editing or other PRD functionality.

## Remaining stages

### Stage 4e: multi-type task feed

Task center now reads one owner-scoped projection of assistant searches, contact enrichment batches, outreach drafts and outbound SMTP records. Type/country/status filtering happens before pagination across history; 50 rows plus one sentinel. Existing search detail links remain unchanged. Draft approval is explicitly not proof of sending; SMTP acceptance is not delivery/read. Unknown SMTP status asks for verification, never auto-retry. Contact batches without reliable country snapshots remain unknown/mixed; draft/send countries reflect current canonical company country rather than an immutable task snapshot.

Metadata-only list excludes email bodies/addresses, strategies, evidence and full model responses. Visible active pages poll at five seconds with per-effect in-flight deduplication; terminal pages use manual refresh. Existing latest-contact detail is lazily expanded and explicitly independent of feed filters. This is four-source history integration, not a fully unified execution engine: relationship analysis, standalone scoring, running/failed draft-generation attempts and follow-up generation audits are not yet integrated. Full typed detail/recovery and per-step budget accounting remain pending.

Validation: three API/status tests, TypeScript, targeted lint and real DB read-only execution for all four branches under the application role, with unknown-owner results empty. No paid calls or data writes in feed verification. Authenticated visual QA remains outstanding.

### Stage 4d: transactional memory change audit

Migration 039 adds owner-RLS `user_memory_audit` and an AFTER INSERT/UPDATE/DELETE trigger on private memories. Every source writer, including Agent upserts and workspace-less manual saves, now produces audit in the same transaction; timestamp-only changes are suppressed. Owner UI lazily opens paginated history, including deleted memory IDs. Snapshots contain status, kind, scope and content length, plus changed field names, but no title, body, embedding or arbitrary context. This is change auditing, not full-text version recovery; historical text rollback remains unsupported and pre-migration changes are not reconstructed.

Migration applied. Real-database rollback smoke passed for create/archive/delete, no-op suppression, no private text duplication and other-user RLS invisibility. API tests cover auth, pagination and private caching; TypeScript and targeted lint pass. No paid API call or real user deletion occurred. Browser interaction QA remains outstanding.

### Stage 4c: manual style/claim authoring

Private memory editor -> explicit scope/content confirmation -> owner-locked, version-checked save -> existing Embedding provider for changed content only -> atomic content/vector write. Stable create IDs block duplicate records/calls on retry; conflicts are surfaced, not overwritten. Title/scope-only edits reuse vectors. Archived records stay archived when edited. Marketing claims require explicit external-use approval and remain excluded from objective scoring. Company-specific facts and structured path choices continue through their authoritative editors; arbitrary text cannot rewrite structured path history.

Private outreach RAG now filters country and role scope before ranking, rather than merely rewarding matches. Manual content caps at 1,200 characters to avoid truncating new preferences in downstream packets. No embedding failover is introduced. Eleven mocked memory tests, TypeScript and targeted lint pass; no paid embedding call or live-browser save was performed. Remaining: complete revision/provenance audit, company-specific memory authoring, price normalization and durable failure telemetry; manual scope fields currently require canonical role names and two-letter country codes.

### Stage 4b: private-memory lifecycle

Knowledge page -> session-owner memory list (50 per page) -> explicit confirmation -> archive/activate/delete transaction. Only reusable preferences/approved claims have lifecycle controls; company-classification mirrors are maintained through company/relationship source editors. Existing mail, current classifications, relationship facts and audit history are not deleted. Private RAG already requires active status. Path learning now also requires a matching active `path-edit:{id}` memory instead of unconditionally replaying modification history. Deleted or archived path preferences cannot re-enter through that history reader. Legacy edits without a matching memory are conservatively excluded. In-flight contexts and already generated drafts are not retroactively rewritten.

No new schema, embedding or generation calls. Deletion removes the memory record, not source material, after an explicit irreversible-action warning. Source reprocessing may create new memory and is not a permanent forget/blocklist. Create/edit, provenance links, full lifecycle auditing for workspace-less records and downstream consumption telemetry remain pending. Five focused tests, TypeScript and targeted lint validate this stage; authenticated UI/real-database interaction QA remains outstanding.

### Stage 4a: search task visibility

Task center -> owner-scoped assistant actions (50 per page) -> page-local country/status filters -> `/tasks/{id}` -> owner-checked search detail. Conversation cards link to the same detail component. Counts distinguish missing from measured zero, qualified from persisted and completed-shortfall from target met. Country-library links explicitly include other tasks' results. List projects only result counters; original request appears on detail. No search/retry/model action is triggered. Active pages poll every five seconds, pause when hidden and refresh on visibility return; terminal lists use manual refresh. Contact enrichment mounts only when expanded.

This stage does not yet unify strategy, relationships, sending and all contact history into one task model. Per-stage live logs, task-specific company lists, budget/cost breakdown and safe stop/resume remain pending. Detail is explicitly a page-load snapshot. Validation: four mocked API/count tests, TypeScript and targeted lint; no live authenticated browser QA.

### Stage 3a: opportunities and explicit outbound mail

Owner workspace -> seven-stage board/list -> next action/date or manual Contacted -> canonical persisted company. No team owner. SMTP acceptance advances only early stages to Contacted and protects that state from search refresh; later stages are never downgraded. Sent summaries show first/latest acceptance and follow-up counts, distinct from manual contact.

Owner mailbox -> explicit SMTP verification -> reviewed single recipient/subject/body -> encrypted sending reservation -> one SMTP call -> sent/failed/unknown receipt. Owner/key and owner/content uniqueness prevent resubmission after refresh. Uncertain sends are locked, not retried; acceptance does not establish delivery/read. Owner-only history supports original-mail expansion and reuse for another contact with recipient cleared. Follow-up selects original sender/recipient and explicitly invokes existing Kimi with an 1,800-token output cap; no search or strategy regeneration. User edits and separately confirms sending with reply headers linked to the parent.

Migration 038 applied locally. Verification: 11 focused tests, TypeScript and targeted lint, without real SMTP delivery or paid inference. Remaining: authenticated visual/live-mailbox QA, unknown-receipt reconciliation, full conversation/private style-memory retrieval, durable draft usage linkage and complete failed-call model metering. History caps at 100 messages per company. This is not completion of the full PRD.

Stage 2a: user-channel relationships replace the legacy map. Stored edges are owner/country scoped and require two workspace members in the requested country. Pending, user-confirmed and user-rejected changes persist with audit history and a relationship-scoped private-memory record; users cannot label their own submission evidence-supported. Same-direction/type saves update the existing edge. All current-market company nodes are reachable by scroll/search, with no fixed 5+8 cap. Manual company creation deduplicates owned domains across countries and names within a country; website is optional, and new records remain unassessed. Existing shared records are not overwritten; user-specific display/classification lives in workspace overrides. Relationship decisions now enter development strategy context, including rejected states. No automatic search, scoring or email sending occurs.

Validation: migration 037 applied; three schema/domain tests passed; typecheck and targeted lint passed. Database smoke verified insert, owner read and other-user invisibility under the application role, rolling back all test writes. Browser automation exposes no browser surfaces in this session, so visual and authenticated interaction QA remain unverified. Cross-country duplicate domains currently require opening the original country; the legacy one-workspace-company membership cannot represent the same company in multiple countries independently. Relationship edit of type/endpoints creates another edge; users should reject the old edge when replacing it. Group collapse/zoom, relation freshness, automatic analysis and complete detail UI remain pending.

Stage 1c: six business columns now show company, primary role, account tier, current score, selected cooperation path and stage; evidence confidence lives in detail. Missing paths display unanalysed. Empty results are explicit. Evidence older than one calendar year is flagged using the latest dated Verified/Corroborated source, excluding inference and future/invalid timestamps. One freshness test, typecheck and targeted lint passed. Fine-grained status filters, timestamps from persisted qualification and UI integration verification remain open.

Stage 1b implemented: role/account/path editing saves owner-scoped JSON overrides on workspace_company, with audit history and company-scoped private memory in one transaction. A role change invalidates score applicability and repairs incompatible account tiers. API returns persisted company state; UI does not optimistically claim a failed save. Development context merges overrides and current workspace fields, and excludes stale assessment/handoff. Company-classification memory is excluded from broad preference RAG; it is applied directly only to its company. Migration 036 applied successfully. Five domain/navigation tests, TypeScript and targeted lint passed. Array-generated map links were removed. Relationship CRUD, compact list redesign and all later stages remain pending.

1. Finish compact lead list, task linkage, role/score/path detail and manual persistence.
2. Implement relationship storage/maintenance and manual company creation.
3. Single-user opportunities, outbound email, historical messages and follow-up Agent.
4. Unified task center, memory management, mailbox learning and final integration.

All stages must update the PRD status and efficiency ledger, inspect diffs, run appropriate checks and push verified commits. No customer email is sent during implementation testing.
## 2026-09-11 completion continuation: persisted UI and safe recovery

Country opportunities now have independent URLs. Global overview uses actual company counts, not fabricated coverage percentages. Lead partitions/advanced score, path, stage and freshness filters reuse stored records. Bulk changes serialize owner-checked existing mutation calls; failed rows remain selected, and next-action forms stay open on failure. Company detail has overview, historical scoring policy/dimensions/evidence and development tabs. Saved strategy is loaded without generation; asynchronous generation responses cannot overwrite another selected company. Legacy placeholder overview/drawer and notification counts were removed. Relationship map adds role grouping visibility, zoom and evidence freshness.

Contact lookup now reserves a tenant/company/provider cache before a paid call, persists contact/email records and task status, and reuses completed results even when old. Explicit re-verification is required to spend again. Running calls cannot be duplicated; ambiguous failures are not automatically retried. Provider-reported emails are not represented as independently Agent-verified. Migration 040 is applied. A crashed running reservation still needs operational reconciliation; it is deliberately not silently retried.

Search tasks support requested pause at stage entry, not cancellation of in-flight provider work. Migration 041 is applied. Failed/paused execution resumes the existing LangGraph pending stage using null input instead of resetting arrays and credits. Completed checkpoints reuse the result if downstream receipt handling failed. Checkpoint owner/action identity is verified. A pause arriving during final persistence does not reclassify committed results as failed. User confirms possible subsequent cost before resume. Read-only progress displays checkpoint stage metrics/usage, not uncommitted in-flight cost.

Validation: all 461 tests across 103 files, TypeScript and production build passed; lint has zero errors and 11 pre-existing warnings. Migrations 040–041 applied. No paid provider/SMTP calls or authenticated visual QA claimed. Remaining checklist remains authoritative; this stage is not full PRD completion.
## 2026-09-11 continuation: mail management and task drilldown

Verification for this stage: all 469 tests in 106 files, TypeScript and production build pass. Lint remains zero errors with 11 existing warnings. Testing did not send mail, delete user mail, disconnect a real account or call a paid model. Live mailbox/provider acceptance and authenticated visual QA are not certified by these checks.

Outbound history is paginated at 50 records. User-confirmed reconciliation applies only to unknown/stale-sending records, labels its source and never calls SMTP. Follow-up retrieves at most eight same-sender/recipient ancestors and four active workspace/market/role-scoped style memories; original body and ancestor excerpts are bounded. This is sent-mail context, not fabricated recipient replies. Imported replies are not yet associated with company threads.

Mailbox disconnect clears credentials and retains local records; deleting local imported mail retains confirmed knowledge by default and preserves disabled mailbox identity for outbound receipt references. Neither operation deletes remote mail. Sync exposes inbox/sent scope and date range; explicit historical import skips known UIDs and does not advance incremental cursors. Individual message deletion and company association remain open.

Leads now use stored assessment eligibility for partitions, retain unknown legacy qualification as review-required, and offer record-created/workspace-updated sorting. Visible workspaces refresh stored results every 30 seconds, guarding against stale refresh overwriting in-flight edits. Task center opens all four task types in a common drawer; its separate URL reuses the same detail view. Search candidate diagnostics are bounded to 100 records with truncation disclosed. Score presentation reads saved policy weights; no current-policy substitution.
## 2026-09-11 continuation: local knowledge, relationship analysis and mailbox links

Knowledge management now has separately scoped private/shared/public-evidence lists; shared evidence remains read-only. Private-document deletion does not delete raw mail. Upload conflicts require confirmation before replacement; an optimistic hash check under a per-document lock rejects concurrent overwrite. New uploads preserve exact content revisions; legacy replaced content is reconstructed from saved chunks and explicitly labelled (not claimed a byte-identical original). History deletion follows document deletion. Migrations 042–044 are applied.

Imported mailbox messages store a domain-matched company only when exactly one owned candidate matches external party domains. Ambiguity remains unresolved; explicit assignment/unlink is preserved across re-import. Local-message deletion is separate from confirmed knowledge, blocks analyzing messages and does not touch remote mail. Message/company association is not by itself proof that a reply belongs to a particular outbound thread.

Explicit directed relationship analysis uses the configured routine DeepSeek/resilient provider, current saved Verified/Corroborated evidence, at most two suggestions and exact-quote validation. It does not add searches or assert actual cooperation automatically. Unchanged input versions reuse a tenant cache; failures/in-flight records are not automatically paid again. Rejections capture evidence fingerprints; unchanged evidence cannot regenerate rejected types. Historical rejections without fingerprints remain suppressed conservatively. Suggestions remain pending until user saves. Relationship task attempts/results/metrics are visible as a fifth task type. Focus filters show one company and its direct neighbours.

Verification: real application-role reads for workspace eligibility and available task kinds passed. Temporary contact-cache and analysis inserts were visible to the owner and invisible to another tenant, then rolled back. Real MemorySaver pause/resume test verifies no duplicate discovery or credit reset. Final regression including revision storage: 474 tests / 108 files passed, TypeScript/build passed, lint zero errors and 11 existing warnings. No paid inference or live mail delivery performed.

## 2026-09-11 pause checkpoint: local actions and follow-up reuse

Kimi intent prompt v1.2 adds product-action routing for stored-company lookup, strategy and follow-up entry points. A tenant-scoped literal name/domain query with optional country/role filters returns at most 20 choices. The user chooses the company, then uses the existing strategy/mail workflow; no automatic generation, paid search or sending. Assistant tasks reuse the Task Center drawer. Search/contact diagnostics paginate by 50. New completed searches retain structured stop reason. New searched companies enter Discovered, not the user's development shortlist; historical records are not mass-reclassified.

Saved strategy responses compare a business-context fingerprint (role, tier, chosen path, supply model, summary, country and evidence). Changed or legacy-unknown snapshots warn rather than regenerate. Relationship/private-knowledge versions are not yet fingerprinted. Follow-up drafts are retrievable from encrypted generation audits (latest ten per parent). Selected draft IDs are owner/parent validated before send reservation; a separate usage event links draft to reservation, not delivery. Edits do not overwrite the original generated snapshot.

Follow-up excludes the repeated parent from ancestor excerpts. Up to four same-contact incoming messages are selected from the latest 50 encrypted, company-associated inbound records; these are correspondence, not guaranteed replies to the chosen thread. Private style remains scoped/bounded. Generation does not trigger mailbox sync. Older unassociated messages may need manual association.

Paused at user request. See `RESUME_PRODUCT_UI_2026-09-11.md`. Regression: 479 tests / 110 files and application-role local-lookup/task SQL plus cache/analysis RLS passed. No paid inference, live SMTP delivery or authenticated visual QA performed.
