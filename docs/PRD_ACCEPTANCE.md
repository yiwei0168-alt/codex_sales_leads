# PRD v0.3 Acceptance Report

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
