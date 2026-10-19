# MA24 G01–G13 当前剩余门槛（2026-10-16）

## 当前结论（2026-10-19，源码基线 c60c7e76）

执行范围仍为 G01–G13；G14–G20 暂缓，完整 Goal 未完成。下方按阶段保留的记录描述当时状态；其中“待重跑”“仍待接线”等历史表述，应结合其后的验收收据判断，不能单独作为当前结论。

- 配置签发的历史、三类安全、前瞻五类材料已在同一冻结下完成实际数据库组合、统一回读与持锁重建；该次通过范围包含精确迁移 144–149，模型/网络/预算为合成适配器。[通过证据](evidence/ma24-g09-configured-five-category-database-2026-10-17.json)。
- 迁移 150 的前瞻 campaign/job 锁已通过独立并发数据库验证并接入重建；包含此锁的完整五类回归已退出 0，组合、统一回读和持锁重建通过，缺少人工判定仍阻断策略。[当前范围](evidence/ma24-g09-prospective-source-locks-2026-10-17.json)。
- G09 仍缺完整可变来源撤销保护、生产采集器/提供方资格、真实质量判决及最终启用事务；自动启用保持关闭。下表的其他真实业务和生产门槛也未因合成联验关闭。
- G01 首批入口已改为公司 LAN/VPN 内网访问，无需以备案域名作为该内网方案的前置项；Caddy 内部 CA 与内网 IP 绑定模板已准备。用户提供目标 LAN IP `192.168.0.170`，但目标主机地址固定/冲突、内部 DNS、防火墙和证书信任分发尚未验收，当前没有线上交付证据。[部署实施单](TEAM_PILOT_NEW_HOSTING_2026-10-16.md)。
- 现有 Web/采集器镜像早于当前源码；最终发布需从冻结源码重建，并在目标环境验收。内部主机与网段信息仍待公司侧提供。

## 阶段记录与逐项门槛

2026-10-19 G09 固定方法来源锁：材料重建现锁定原任务的全部 Skill 固定绑定、状态和版本，并锁后复查本地经验来源。56 项定向回归、类型/lint 及一次性新库六类并发写入等待/恢复与撤销拒绝通过；同源码完整五类组合随后退出 0，两臂材料、五题组合、持锁重建与开发审核写入/撤销通过。发现目录、文件字节、最终时效、生产资格与最终启用仍未全部完成。[工作流](SKILL_ACCEPTANCE_TASK_JOURNAL_LOCKS_2026-10-16.md)、[证据](evidence/ma24-g09-pinned-method-source-locks-2026-10-19.json)。

2026-10-19 G09 fresh-cluster 验收脚本新增早期夹具隔离检查：多个各自要求全新占位账号数据库的子检查不能在同一次运行中组合，须逐个 fresh-cluster 执行。负向组合在 Docker 初始化前按预期拒绝，`npm.cmd run typecheck` 与 `git diff --check` 通过。[工程证据](evidence/ma24-g09-fresh-cluster-fixture-preflight-2026-10-19.json)。这只修复验收编排，不改变产品门槛或 G09 质量/生产验收状态。

2026-10-17 固定快照 f4363630 的完整私有资料组合已通过，覆盖邮件/单客户时间线/列表、记忆门禁、三条来源收据及五类材料。知识发布门禁 149 不在该快照，仍需完整验收。[组合证据](evidence/ma24-g09-private-source-composition-2026-10-17.json)。原始任务传输签名验证组件已通过 48 项回归、类型/lint；生产签发、日志/失败链接线、二进制资格和最终启用仍未完成。[工作流](ORIGINAL_TASK_TRANSPORT_RECEIPTS_2026-10-17.md)。

2026-10-17 知识发布门禁（迁移 149）已接入：实际文档/原件/指针/审核写入等待、释放恢复，以及写入线程先持原件行时元数据复核可完成；锁内策略数据库、24 项回归、类型/lint 通过。持锁期间所有知识写入等待，生产等待/容量、原件字节、最终时效与来源语义仍待验。当前完整快照 f4363630 不包含 149。[证据](evidence/ma24-g09-knowledge-publication-gate-2026-10-17.json)、[工作流](SKILL_KNOWLEDGE_SOURCE_ADMISSION_2026-10-17.md)。

2026-10-17 记忆写入门禁（迁移 148）已接入持锁证据入口之前：35 项测试、类型/lint、记忆并发与锁内策略两个实际数据库流程通过；同账号和共享政策写入等待，另一账号私有记忆可继续。完整私有资料快照 e91c2055 因夹具参数未规范化被正确拒绝，已修正并待重跑。知识来源、最后提交前时效、生产及自动启用仍未完成。[门禁证据](evidence/ma24-g09-decision-memory-write-gate-2026-10-17.json)、[组合记录](evidence/ma24-g09-private-source-composition-2026-10-17.json)。

2026-10-17 邮件/单客户时间线/列表的完整组合夹具已准备，包含三条来源收据、实际候选读取及邮件/时间线锁断言，类型/lint 通过。将从固定提交验证，尚未判通过。[记录](evidence/ma24-g09-private-source-composition-2026-10-17.json)。

2026-10-17 固定快照 500405a4 的完整含附件五类组合已通过，附件严格字段误拒问题完成该版本的完整链路修复验收；后续邮件/时间线锁、当前记忆时效不在该快照，完整组合仍待继续。此结果不改变真实质量、生产和自动启用门槛。[证据](evidence/ma24-g09-attachment-source-locks-2026-10-16.json)。

2026-10-17 G03/G09 当前决策记忆有效期改用检查时刻：实际同事务跨过到期/生效边界后，过期项消失、新生效项出现，旧决策快照拒绝；14 项回归、类型/lint 和既有数据库并发通过。写入/共享政策并发、最终提交前时效和完整来源仍未完成。[证据](evidence/ma24-g03-g09-memory-wall-clock-2026-10-17.json)、[工作流](MEMORY_TIME_BOUND_VALIDATION_2026-10-17.md)。

G09 时间线与列表来源锁已接入（迁移 147）：26 项回归、类型/lint 和实际七类更新/新增阻塞、释放恢复、跨账号拒绝通过；101 客户引用与列表混合分批通过。完整组合包含邮件/时间线锁的验收待执行，知识与记忆全部来源保护仍未完成。[证据](evidence/ma24-g09-timeline-source-locks-2026-10-16.json)。

G09 mail_read 来源锁已接入：从持锁工具日志派生邮件 ID，按当前账号锁邮件行后再复核。23 项回归、类型/lint 和实际七类并发阻塞通过；未连接真实邮箱，完整组合包含新接线的验收仍待执行。当前固定快照 500405a4 的组合回归不包含邮件锁。[证据](evidence/ma24-g09-mail-read-source-locks-2026-10-16.json)。

G09 含附件完整组合返回失败：附件投影误拒正常 content；已修正并通过含完整任务字段的 21 项回归、类型/lint，修复后的完整组合待重跑，不能沿用旧版通过结论。新增固定提交快照运行器已通过实际数据库检查，后续验证与主工作区开发可并行。[附件证据](evidence/ma24-g09-attachment-source-locks-2026-10-16.json)、[运行方式](MA24_SNAPSHOT_DATABASE_CHECKS_2026-10-16.md)。

G09 冻结锁后复查竞态已补验：两类模型日志写入先等待，持锁事务提交撤销后，两者恢复并拒绝，证明锁后能读取刚提交的撤销；类型/lint 及完整传输日志回归通过。仍非生产或自动启用验收。[证据](evidence/ma24-g09-model-journal-freeze-serialization-2026-10-16.json)。

G09 模型日志追加与冻结撤销现由迁移 146 的数据库触发器共用事务锁。实际新库证明尝试/结果追加和直接 SQL 撤销等待，释放后继续，撤销后两类日志写入拒绝；签名/回退/隔离/不可改写及类型/lint 通过。未部署生产，完整含附件组合仍独立运行，最终启用未完成。[证据](evidence/ma24-g09-model-journal-freeze-serialization-2026-10-16.json)。

G09 附件元数据锁（迁移 145）已接入材料入口，从持锁任务派生原件并分批加锁。21 项回归、类型/lint、120 附件分批和实际六类任务/日志/附件并发验证通过；含登记附件的完整组合正在运行。此前会话锁版本完整五类组合已通过。资料发布、审核和全部来源保护门槛仍未关闭。[附件证据](evidence/ma24-g09-attachment-source-locks-2026-10-16.json)、[会话证据](evidence/ma24-g09-task-origin-locks-2026-10-16.json)。

G09 原始会话锁（迁移 144）已接入材料入口，并通过账号/会话/消息更新及历史消息追加的实际并发验证，18 项回归、类型/lint 和该版本完整组合通过。此前任务日志锁版本的完整五类组合也已通过，两者范围分别保留。[会话锁证据](evidence/ma24-g09-task-origin-locks-2026-10-16.json)、[任务日志锁证据](evidence/ma24-g09-task-journal-locks-2026-10-16.json)。

G09 任务与工具日志锁已接入材料重建入口：从已存包派生任务、锁定任务与已有日志，阻止并发修改和追加；16 项定向回归、类型/lint、一次性数据库并发与该版本完整五类组合验收通过。新增会话来源锁后的完整组合另行验收。[工作流](SKILL_ACCEPTANCE_TASK_JOURNAL_LOCKS_2026-10-16.md)、[证据](evidence/ma24-g09-task-journal-locks-2026-10-16.json)。外部来源撤销、生产认证和最终启用仍未完成。

本轮补验：G10 已通过一次性 Linux compiled standalone 的 HTTP 到库及实际 Chrome 自签 HTTPS 页面读取、保存、重新进入回读与撤销，[HTTP](evidence/ma24-g10-prospective-standalone-http-2026-10-16.json)、[浏览器](evidence/ma24-g10-prospective-standalone-browser-2026-10-16.json)。真实质量和生产身份仍未关闭。所有合成审核判定为 false，最终撤销，不构成质量批准。

当前执行范围沿用用户最新要求：先完成 G01–G13，G14–G20 留待后续。原 Goal 的完整范围保留；本清单不将本阶段完成等同于原 Goal 完成。当前没有证据证明 G01–G13 已整体完成，也不能从局部工程通过推导真实质量或生产验收。

本轮依据：已推送源码 `c22bc67b`、当前计划/台账及列出的源码路径。下面的“生产”栏是缺少验收的范围，不能解释为本轮重新盘点了所有运行进程。

| 项目 | 已有依据 | 仍缺的实现或验收 | 下一项能关闭缺口的证据 |
| --- | --- | --- | --- |
| G01 发布基线 | 固定 Linux 镜像、本机 HTTPS、10 合成成员隔离、两版 Web 回切、数据库跨集群恢复及上传卷恢复均有局部收据 | 目标云账号/主机、域名及成员未确定；目标部署、可信 HTTPS、异地副本、实际资料与数据库一致恢复、资源观察未验 | 目标主机上的实际包摘要、成员业务、备份恢复和回切记录；产品源码变化后在最终冻结点重建一次 |
| G02 来源撤销 | 真实图、旧 checkpoint、隔离模型及局部 HTTP 证据 | 当前服务上真实账号有界任务的生成期撤销、后续工具阻断和最终保存核对 | 获授权的专门来源/账号任务及撤销前后收据；新付费请求另列具体清单 |
| G03 纠正与双时间 | 来源归属和自然纠正局部修复、隔离恢复证据 | 真实偏好/经历/业务事实与纠正样本不足；当前候选完整链路、通知/撤销/历史时间和本地 worker 试点未验 | 对照原句与更正内容的自然样本判决，以及当前 worker 的持久记录 |
| G04 记忆图谱 | outbox、租约、故障恢复及 PostgreSQL 降级局部工程证据 | 当前版本获准真实样本的连续抽取、投影、时间/权限回校、撤销召回未验 | 连续消费及图谱停机/恢复的同一批来源收据 |
| G05 Incremental knowledge | Synthetic PDF/PPTX pass formal workers, synthetic visual review, private registration, full-text search and exact source-coordinate reads; peer account is denied search/tree/evidence access ([full-chain receipt](evidence/ma24-g05-pdf-pptx-review-register-search-citation-isolation-2026-10-19.json)) | Real-user sources, independent visual/content judgment, actual business answer citations, revised-version failure matrix and production worker remain unverified | Review approved real sources and verify page/slide citations in an actual user-facing task; finish revision isolation and target deployment acceptance |
| G06 安全 | 已定位旧歧义与注入失败，工具模型视图等边界已有修复 | 修复后固定协议的真实模型回答、独立安全判分不足；既有本地超时不能判通过 | 有明确请求范围的有效模型回答及答案/引用/权限/注入人工判决；相同超时配置不重复试跑 |
| G07 真实回放 | 服务器持久收据与只读回放适配已实现；历史资格审计已有排除结果 | 尚无满足当前来源、Skill 相关性及完整收据要求的真实任务 | 同账号有效的完整只读任务或精确收据限定的子任务，固定版本回放和独立审核 |
| G08 前瞻影子 | 原有登记、采集、局部影子/审核机制存在 | 真实任务开始前配置登记、原流程与候选的真实结果、可信生产身份不足 | 一次前瞻登记到执行、持久收据及审核的完整链；不能把历史任务补标成前瞻 |
| G09 自动启用 | 冻结、存储、政策计算、恢复版本后停用等已实现 | **代码未完成**：可信生产 runner/collector 来源类别及其认证，最终启用事务对 Skill/来源/冻结/最新审核的锁定和重校尚未接通 | 服务器可验证运行来源、完整安全/回放/影子材料和最新审核；隔离正反例实际启用/拒绝/停用后再做有界试点 |
| G10 审核 | 前瞻合成两臂日志到数据库、compiled standalone HTTP 及 Chrome 页面读取、保存/回读、撤销和拒绝边界通过 | 完整真实人工材料、真实质量、生产身份及目标入口未验 | 在既有授权边界内准备真实同版本/冻结材料，逐题核对真实质量及生产入口 |
| G11 邮箱/客户 | 同步进度、批量、并发冲突、阅读区等已有隔离工程证据 | 真实 IMAP 日期范围、全分页、断线续传/去重，客户归属/摘要质量及 worker 运行验收未完成 | 已授权账号及日期范围上的收件/已发送对账、恢复与逐例归属判定；历史提供方对账单独保留 |
| G12 三模式 | 恢复原因白名单修复，60 项定向测试及全新库 12 组脚本业务通过 | 真实只读业务回答、提供方失败/迟到/未知结果恢复及正式加载未验 | 有界真实任务和隔离提供方响应的持久收据；已消耗的 MODESEL-14 授权不复用 |
| G13 前端 | F01–F13 已有多个候选实际页面/API/隔离库结果 | 真实邮箱/资料/任务、部分状态及批准后执行、最终候选的生产入口未验 | 依赖 G05/G11/G12 的实际业务任务逐入口复核；显示正确不替代业务执行结果 |

## 已核实的实现断点

新增[分组组合内部函数](SKILL_ACCEPTANCE_COMPOSITION_2026-10-16.md)：单元边界和实际新库完整历史/安全/前瞻组合、追加幂等、五类统一材料回读及来源清除/冻结撤销拒绝均通过。[初始边界](evidence/ma24-g09-skill-evidence-composition-2026-10-16.json)、[完整数据库正例](evidence/ma24-g09-complete-composition-database-2026-10-16.json)。组合包自身 HTTP/页面、真实质量、可信生产 runner/提供方和最终启用事务仍未完成。

安全候选审计 `auditSkillSafetyArm` 现已拒绝图重建的 `candidateSkillUsed !== true`，保留基线不读候选的行为。25 项定向回归和实际新库审计/采集拒绝、正常候选统一回读通过，[收据](evidence/ma24-g09-safety-skill-usage-audit-2026-10-16.json)。生产认证和最终启用接线仍未完成。

共享 PostgreSQL Pool 的断线退出已修复：[DAL 三类断线](evidence/ma24-g01-database-pool-recovery-2026-10-16.json)及[固定 standalone 镜像空闲断线](evidence/ma24-g01-standalone-database-recovery-2026-10-16.json)通过。镜像 `99f51e5b` 原进程、原会话、TLS 重连和后续读写隔离通过，并补自签 HTTPS/十合成账号检查。此前恢复事件仍不唯一归因；目标云网络、Web 执行中断线、未知提交结果及持续容量仍待验。

G09 声明观察时间绑定已补强：追加与读取都核对非空观察的计划/题目/固定版本/来源和时间，声明起止由持久记录派生；33 项定向测试和新库历史记录拒绝回归通过，[收据](evidence/ma24-g09-runner-observation-time-binding-2026-10-16.json)。这不关闭下列生产认证和启用缺口。

2026-10-16 G10 已新增[前瞻来源、统一观察收集和材料读取适配](SKILL_PROSPECTIVE_ACCEPTANCE_2026-10-16.md)，51 项定向/路由回归、合成两臂数据库贯穿、实际 compiled standalone HTTP 及 Chrome 页面审核保存/回读/撤销通过；真实质量、生产身份和目标入口仍待验收。

2026-10-16 G09 已新增[运行声明认证及独立存储](SKILL_RUNNER_ATTESTATION_2026-10-16.md)，临时库仅增加迁移 141 并使用临时密钥；生产签发/登记、运行包/提供方验证、影子绑定和启用事务仍待接通。下列断点未因基础组件及存储通过而关闭。

- `src/lib/assistant/main/skills.ts` 的非人工启用路径仍拒绝；不能把 `skill-acceptance-policy.ts` 的 `policyPassed` 直接当成授权。
- `db/migrations/130_skill_acceptance_evidence.sql` 的来源类别只有 `synthetic-fixture` 与 `production-runner-pending-verification`，没有已经认证的生产来源类别。
- `skill-acceptance-collector.ts` 的历史收集结果明确为 `runtimeIdentityVerified=false`；`skill-runtime-identity.ts` 计算源码指纹，本身不认证已部署进程。
- `skill-acceptance-review.ts` 现已为 `prospective-task` 校验引用并进入独立材料适配器；完整真实日志贯穿数据库、API 和页面仍待验。独立 `skill-shadow-review.ts` 的本地影子材料不自动满足统一验收的生产等价要求。

这些断点按原规则继续实现，不能通过修改布尔标记、放宽来源类别或将合成结果改名来关闭。

## 执行顺序

G09 [本地经验来源锁已接入持锁读取](evidence/ma24-g09-memory-source-lock-wiring-2026-10-16.json)：从版本来源引用派生 ID，锁后再查当前性；实际存储链、纠正/失效后拒绝及事务开始后过期拒绝通过，32 项回归及类型/lint 通过。未核实经验的质量等级不变，普通导入包不新增此依赖；其他来源保护、生产认证及最终启用仍缺。

G09 [五类材料持锁重建与策略联合入口](evidence/ma24-g09-locked-materials-2026-10-16.json)已通过 34 项回归、类型/lint 和完整实际新库验收：逐题统一读取重建后核对材料/策略快照，全部 5 题完成，缺少人工判决仍被阻断。任务和答案为合成夹具；底层来源完整语义/权限门槛、全部可变来源的最终锁定、生产认证及启用写入仍未完成。

G09 [本地经验来源锁](evidence/ma24-g09-memory-source-locks-2026-10-16.json)的独立新库并发验收已通过：纠正、失效和已有冲突状态更新均等待，释放后恢复。迁移 142 只在测试库精确安装，没有应用观察表 UPDATE 增权或延后测评迁移。最终事务调用接线、其他来源类型及生产认证仍未完成。

G09 [嵌套读取同事务复用](evidence/ma24-g09-bound-tenant-transaction-2026-10-16.json)已接入锁内策略，解决外层更新锁与另一个连接共享锁的自等待风险。实际新库确认同后端和锁下正常回读；22 项回归覆盖账号/角色切换、自动提交、事务漂移及作用域结束后异步误用拒绝，类型/lint 通过。全部材料重验、生产认证及最终启用仍待接通，不能据事务复用标记 G09 完成。

G09 锁内策略已补[实际数据库贯穿](evidence/ma24-g09-locked-policy-database-2026-10-16.json)：服务器重建真实存储任务的运行身份，锁内重读和数据库时间审算通过；缺判决/开发判决不获批准，审核及撤销改变最新哈希，跨账号/冻结撤销拒绝。任务与五类观察为合成政策投影，未重建全部候选/安全/前瞻材料；真实来源认证与最终启用写入仍缺。

G09 已接入[保留事务锁的策略审算适配](evidence/ma24-g09-locked-policy-adapter-2026-10-16.json)：运行引用从存储材料派生，服务器重建各来源运行身份，重查锁内当前 pin/最新判决，并使用数据库时间审算。54 项适配/策略测试、类型检查和 lint 通过。身份读取沿用独立来源事务，全部来源的最终锁定/重建及生产认证仍缺；`policyPassed` 仍非启用授权，非人工启用路径未开放。

G09 已补[同事务锁定证据读取](evidence/ma24-g09-locked-evidence-read-2026-10-16.json)：审核包→冻结→Skill 锁序、数据库当前 pin 与最新判决哈希派生通过实际新库验证；并发开发审核撤销等待持锁读取，释放后下一次读取看到撤销第 2 版。跨账号及冻结撤销拒绝，类型检查/lint 通过。该入口只提供最终事务读取基础，未认证运行来源或重建全部材料，最终自动启用仍未接通。

G09 [冻结锁接线后的完整数据库回归](evidence/ma24-g09-locked-workflow-database-2026-10-16.json)已通过历史/安全/前瞻收集、三来源五类组合与统一回读、运行声明追加/读取；扩展回归还实际保存开发审核、拒绝旧版本提交并写入/回读第 2 版撤销。开发判决均为 false、未造成人工批准。三个临时库已清理，真实模型调用 0；生产身份和最终启用仍未完成。

G09 已接入[冻结撤销与写入的事务级串行协议](evidence/ma24-g09-freeze-transaction-serialization-2026-10-16.json)：收集/组合、运行声明追加及有效审核写入在同一事务取得冻结 advisory lock 并重查；撤销共用该锁。实际 PostgreSQL 观察到撤销等待持锁事务、释放后完成、后续重查读到 revoked；56 项定向回归通过。该协议不约束绕开应用的特权 SQL；最终启用事务仍未实现，既有镜像也未包含此修改。

G01/G09 [Web/采集器当前基线](evidence/ma24-g01-g09-web-collector-baseline-2026-10-16.json)：Web `57832601` 已从提交构建并与采集器 `6fc08071` 核对源码/Node 指纹一致；十合成账号、原会话及五条独占空闲连接终止后的 TLS 重连/读写隔离通过。完整编译依赖等价性、真实提供方和生产身份仍待验，不能将此核对升级为 G09 通过。

G09 采集镜像已更新为 `ma24-skill-collector:6fc08071`（包含失败/回退签名），[新镜像验收](evidence/ma24-g09-fallback-collector-image-2026-10-16.json)通过源码一致、34,424 个文件/链接完整性、篡改拒绝和可信 CA 数据库预检。此前“待重建”已由本轮关闭；生产提供方任务、生产身份及最终启用事务仍未完成。Web 的既有镜像没有因此更新，正式联调须统一源码/运行身份。

G09 已补[可回退失败签名与完整日志链验收](evidence/ma24-g09-signed-fallback-journal-2026-10-16.json)：失败签名随 unavailable 结果先保存，再执行下一路由；服务器核对每个前驱与最终成功收据。93 项定向回归和实际新库 HTTP 503→成功两条签名持久化/回读通过，无真实模型调用。终止/取消/未签名未知结果不构成通过证据；固定采集镜像待重建，真实生产来源和启用事务仍未关闭。

G09 固定采集器镜像已补[可信 CA / verify-full 数据库预检](evidence/ma24-g09-collector-image-tls-preflight-2026-10-16.json)，以独立受限登录读取服务器冻结记录；容器为非 root、只读、无 capabilities。该测试使用临时库网络命名空间内的 localhost，不代表真实云网络或模型执行，生产来源及失败/回退收据仍待完成。

G09 独立采集器已形成固定 Node 基础摘要、锁文件依赖及启动完整性核对的镜像；[实际镜像证据](evidence/ma24-g09-collector-image-2026-10-16.json)证明源码与提交一致、34,422 个包内文件/链接核对、非 root/只读/无网络启动及篡改拒绝。生产主机/密钥/提供方尚未认证，未运行 `--execute`，最终启用事务仍未完成。

G09 后续已实现[独立编译采集进程](SKILL_COLLECTOR_PROCESS_2026-10-16.md)：服务器读取冻结计划、独立受限登录、计费上下文和三类配置入口接线。构建、类型检查、lint、普通 Node 帮助入口及一次性新库独立进程预检通过；应用角色成员资格会被拒绝。完整提供方执行和生产包认证仍未验收，最终启用仍未接通；此前“进程待实现”记录保留为阶段历史。

G09 受控入口计费边界复核发现共享 `budgetedFetch` 在无上下文的 CLI 下直接透传；工厂现显式要求同账号固定计费操作，并在调用、网络发送和返回后重查，防止该入口绕过计费准入。42 项定向回归、类型检查及 lint 通过，无真实付费调用；独立编译采集进程仍待实现与认证。[范围](SKILL_MODEL_TRANSPORT_RECEIPTS_2026-10-16.md)。

G09 受控安全评测两臂入口已接线至配置请求工厂和持久日志核对，执行前后重查冻结来源；33 项定向编排/请求/日志测试、类型检查和 lint 通过。历史/前瞻候选受控入口随后也接至持久核对及各自收集器；25 项两类入口编排回归、类型检查和 lint 通过。旧基线没有因此获得传输认证，测试未运行真实提供方；生产部署包认证、完整采集器进程执行及最终启用事务仍缺，具体范围见[传输工作流](SKILL_MODEL_TRANSPORT_RECEIPTS_2026-10-16.md)。

1. 目标云账号/主机、域名和成员信息待补；目标部署步骤依赖这些信息。本机已通过且代码无变化的检查不再重复。
2. G09/G10 先建立可验证的运行来源与影子绑定，再接启用事务；过程中保持未认证材料无法自动启用。新增 schema 只按这一工作包精确迁移，不能顺带执行已延后的 G14–G20 迁移。
3. G02–G08、G11–G13 的真实验收按现有授权与有效来源准备具体任务；需要新增付费调用时，先完成可审阅的调用清单及执行边界，再取得对应授权。

G09 本轮补充：[模型传输收据实现与验证范围](SKILL_MODEL_TRANSPORT_RECEIPTS_2026-10-16.md)。已实现签名用途隔离、成功请求工厂及服务器日志核对；72 项定向回归通过，包含网络/数据库读取夹具下的工厂和日志组件接线。后续[一次性新库实际入库验收](evidence/ma24-g09-transport-journal-database-2026-10-16.json)通过受限角色追加、签名回读、恢复复用、跨账号隔离、不可改写及密钥/冻结撤销拒绝；模型内容与签名密钥为合成夹具，未执行生产请求工厂。生产身份及最终启用事务仍未完成，不改变 G09 未关闭的结论。

主要依据：[当前台账](MA24_EXECUTION_STATUS_2026-10-13.md)、[执行计划](MA24_REMAINING_EXECUTION_PLAN_2026-10-13.md)、[试用发布](TEAM_PILOT_RELEASE_PLAN_2026-10-16.md)、[G09 断点审计](evidence/ma24-g09-activation-readiness-audit-2026-10-15.json)、[G12 当前集成](evidence/ma24-g12-fresh-db-scripted-business-2026-10-16.json)。
# G09 来源锁补充进展（2026-10-16）

本地经验锁新增原始账号、会话、任务及用户消息保护，一次性数据库实测四类更新等待并在释放后恢复，原文变化被复查拒绝。见 [验收证据](evidence/ma24-g09-memory-origin-locks-2026-10-16.json)。此项仅关闭本地经验原始记录并发缺口；其他来源保护、可信生产评测和最终启用仍为未完成，G14–G20 暂缓。

G09 原始任务成功签发工厂与 mode 持久执行已接线，47 项定向工程测试及类型/lint 通过；数据库、模型 RPC 与底层网络为模拟，仅验证保存参数和恢复复用。真实 SQL 贯穿、失败/回退链、生产密钥与部署认证仍待完成，自动启用保持关闭。[工作流](ORIGINAL_TASK_TRANSPORT_RECEIPTS_2026-10-17.md)、[证据](evidence/ma24-g09-original-task-transport-signing-2026-10-17.json)。G14–G20 继续暂缓。

G09 原始任务可回退失败签发、验证与图执行保存接线已实现，90 项定向回归通过；失败收据先保存再回退的顺序在模拟持久层验证。实际 SQL、当前账号日志整链审核和部署资格继续待办。[更新范围](ORIGINAL_TASK_TRANSPORT_RECEIPTS_2026-10-17.md)。

G09 知识库门禁加入完整组合后的固定快照 `453e88cc985b07ae7835bf5280398f70419031fa` 已实际退出成功：新 PostgreSQL 库、前瞻来源/配对材料及 completeCompositionVerified 均通过。该快照含迁移 149，不含后续原始任务签发接线；模型和内容为合成夹具，HTTP/浏览器及生产质量未由此验证。[快照收据](evidence/ma24-g09-knowledge-composition-snapshot-2026-10-17.json)。

G09 已增当前账号已存 mode 调用链的只读审核组件，43 项定向测试和类型/lint 通过；尚未接入资格判定，实际 SQL、全部任务决策完整性、上下文绑定与部署认证待办。[范围](ORIGINAL_TASK_TRANSPORT_RECEIPTS_2026-10-17.md)。

G09 原始任务签名日志已补实际新数据库验证：应用角色持久化/恢复、失败前驱与成功签名回读、跨账号/撤销/篡改/断链拒绝通过；既有评测日志回归也通过。仍缺受控请求工厂与 SQL 贯穿、全部预期决策/上下文绑定、资格接线和生产身份。[实际收据](evidence/ma24-g09-original-task-journal-database-2026-10-17.json)。

G09 签发工厂准入已补普通 Node 编译进程与实际数据库验证；私钥/登记、当前账号待执行调用及计费上下文检查通过，错误任务/跨账号/缺失计费拒绝。请求闭包尚未执行，完整签发 SQL 贯穿、任务上下文/完整性及生产认证仍待办。[证据](evidence/ma24-g09-original-task-compiled-admission-2026-10-17.json)。

G09 历史/前瞻受控候选入口已要求原始任务签名审核，调用前后及候选收据验证后比较原始审核哈希。58 项回归、类型/lint、采集器构建通过；完整入口真实 SQL、请求闭包和生产资格待办，自动启用仍关闭。[接线](evidence/ma24-g09-original-task-runner-gate-2026-10-17.json)。

G09 失败请求闭包已在实际数据库贯穿：真实工厂/model 请求逻辑生成合成 503 失败签名，应用接口保存、恢复和实际验签通过。网络/预算适配器为显式测试透传，成功闭包、完整候选入口 SQL、生产认证仍待办。[收据](evidence/ma24-g09-original-task-closure-database-2026-10-17.json)。

G09 原始失败→成功两条签发闭包现均完成实际数据库保存/恢复/整链验签，成功端覆盖真实 SSE 解析；类型/lint 和拒绝回归通过。网络与预算适配器仍为测试替身，完整候选入口、生产身份及最终启用待办。[收据](evidence/ma24-g09-original-task-success-closure-database-2026-10-17.json)。

G09 原始签发工厂已补计费 operationId 与 runId 精确绑定；44 项回归及实际新数据库失败/成功签发回归通过。发现并修复同账号其他任务计费范围可通过准入的问题。完整候选入口联验与生产资格仍待办。[收据](evidence/ma24-g09-task-billing-binding-2026-10-17.json)。

G09 签名日志已与产品初始消息、当前决策记忆、原始用户消息和最终答案完成实际 SQL 上下文/任务链/图回放联验；原文/最终答案变更拒绝。仅 quick 单决策无工具夹具，完整候选入口、多决策转换和生产认证仍待办。[收据](evidence/ma24-g09-signed-task-context-database-2026-10-17.json)。

G09 已补两决策/三签名尝试及真实工具描述转换的实际数据库联验，签名、任务链、图回放和拒绝回归通过。业务读取、完整候选入口及生产资格仍待完成。[收据](evidence/ma24-g09-signed-tool-transition-database-2026-10-17.json)。

G09 已补真实工具执行/读取收据与签名后续输入的实际数据库联验：三决策四签名、消费读取收据、任务重建和图回放通过，收据篡改拒绝。合成客户不构成真实质量验收；完整候选入口及生产认证仍待办。[收据](evidence/ma24-g09-signed-business-read-database-2026-10-17.json)。

G09 standard 模式签名任务已实际通过基线投影和候选快照构建，保留只读收据、核对输入/模型配置哈希且 Skill 仍停用。候选模型执行/收集与生产资格尚未完成。[收据](evidence/ma24-g09-signed-candidate-snapshot-database-2026-10-17.json)。

G09 完整候选执行首次联验暴露可选 usage 的 JSON 入库哈希冲突，已在日志边界归一化修复，40 项回归、类型/lint 通过。实际完整入口重跑仍在进行，未记为通过。[证据](evidence/ma24-g09-model-journal-json-normalization-2026-10-17.json)。

G09 完整 historical 配置入口已通过实际数据库签发/候选执行/证据收集联验，Skill 保持停用；修复此前缺失 usage 的结果入库哈希冲突。网络/预算为测试适配器，其余四类冻结题、前瞻入口、真实质量和生产认证仍待验。[收据](evidence/ma24-g09-configured-signed-candidate-database-2026-10-17.json)。

G09 候选签发已补计费操作与 evaluationId 精确绑定，54 项定向回归、类型/lint 通过；完整历史候选数据库回归随后退出 0，链路通过且 Skill 保持停用。[证据](evidence/ma24-g09-evaluation-billing-binding-2026-10-17.json)。

G09/G10 完整 prospective 配置入口已通过实际数据库联验：先登记/冻结，再真实触发器捕获新任务，完成签名原流程及候选执行/签发/审核/收集，Skill 保持停用。仅工程合成模型响应，其余题型联合验收、生产身份和最终启用仍待办。[收据](evidence/ma24-g09-configured-prospective-database-2026-10-17.json)。

G09 三类安全题六臂配置入口签发/持久审核/收集与统一回读已通过实际数据库联验，人工判定为空，Skill 仍停用。脚本化响应不构成真实质量；同冻结五类联合材料、生产身份和最终启用事务仍待办。[收据](evidence/ma24-g09-configured-safety-database-2026-10-17.json)。

G09 同一冻结下的配置签发五类联合材料已通过实际数据库工程联验：两条签名原任务、三组证据组合、五题统一回读及持锁重建通过，缺失人工判定阻断，Skill 仍停用。仍需生产来源/提供方认证、真实质量、完整可变来源撤销保护、最终启用事务及最终镜像/目标环境验收；本结果不推进 G14–G20。[收据](evidence/ma24-g09-configured-five-category-database-2026-10-17.json)。

G09 前瞻元数据锁已实现并接入：实际新库并发、28 项回归、类型/lint 通过；同冻结五类新锁回归仍运行。`sourceRevocationsLocked` 保持 false，不视为全部来源或最终启用完成。[证据](evidence/ma24-g09-prospective-source-locks-2026-10-17.json)。

G09/G10 影子租约准备新增重建后数据库时钟复查，17 项回归、类型/lint 通过；实际数据库跨到期边界仍待验，修改后的完整联验不沿用上一版通过结论。[证据](evidence/ma24-g09-shadow-lease-recheck-2026-10-17.json)。

影子租约后续实际新库时间边界验收已通过：同事务租约/campaign/任务年龄到期和跨账号均拒绝，产品与夹具共享检查函数；完整五类联验仍待进行，G09 未关闭。[证据](evidence/ma24-g09-shadow-lease-recheck-2026-10-17.json)。

2026-10-19 固定快照复核：基于 `8a968d361a4958ad1c24480c761fe08ed229f214`，`node scripts/run-ma24-snapshot-check.mjs --transport-journal` 退出码 0；同一冻结版本五类材料、锁定材料及前瞻来源锁通过，完整数据见 [G09 证据](evidence/ma24-g09-prospective-source-locks-2026-10-17.json)。真实质量仍未接受，计费/网络适配仍为合成，来源撤销锁未全部完成，生产资格与自动启用均为 false。

G01 内网试点配置：用户已选择公司 LAN/VPN 内访问，后续明确本次暂不上线。Compose 与 Caddy 模板静态校验通过；用户提供主机 LAN IP `192.168.0.170`，尚未核实固定/冲突。目标主机、内部 DNS 和防火墙/证书分发尚待提供与验收，服务未启动、端口未开放。[验证证据](evidence/ma24-g01-pilot-lan-template-validation-2026-10-19.json)。

G11 IMAP 分页修复（2026-10-19）：首次同步改为按最早 UID 开始取页，解析失败或缺少原文时抛错且不返回前进游标，避免续跑跳过旧邮件或把不可解析邮件默默当已处理。定向 3 项、类型检查、相关 ESLint 通过。[工程证据](evidence/ma24-g11-imap-oldest-first-pagination-2026-10-19.json)。仍未完成真实邮箱全范围对账、断线恢复和客户归属/摘要质量验收。

G05 当前正式 worker 复跑（2026-10-19）：隔离 MA11 回放库的监督进程中断、租约恢复、跨账号并行与损坏 PDF 失败隔离通过，OCR 检查点复用；无资料发布、无模型/外部调用。[工程证据](evidence/ma24-g05-supervisor-recovery-rerun-2026-10-19.json)。成功 PDF/PPTX、修订多作业矩阵、用户可见引用及生产部署仍待验。

G11 并发去重续页补强（2026-10-19）：同步页仅因并发导入而整页跳过时，worker 继续处理后续 UID 页；无导入、无去重且仍发现邮件时仍按解析失败保留任务错误。真实邮箱及 provider 故障恢复仍待验。[工程证据](evidence/ma24-g11-concurrent-dedupe-page-continuation-2026-10-19.json)。

G11 IMAP UID 页完整性补强（2026-10-19）：对每页选中的 UID 建立请求/回传集合核对；服务端漏回、重复或越界 UID 时拒绝整页且不返回前进检查点，避免后续 UID 越过未取回邮件。5 项合成定向测试、类型检查和相关 ESLint 通过。[工程证据](evidence/ma24-g11-imap-fetch-uid-integrity-2026-10-19.json)。真实邮箱对账及断线恢复仍待验收。

G09 transport-journal current-snapshot rerun (2026-10-19): the transport-journal disposable database check passed from the `7ebc47d7` git archive, including signed request closure, journal persistence/recovery, cross-account isolation, revocation and tamper rejection. The candidate Skill remains disabled and model calls were 0. [Receipt](evidence/ma24-g09-transport-journal-current-snapshot-rerun-2026-10-19.json). This mode does not cover the full five-category source composition; real quality, production identity, binary qualification and final activation remain incomplete.

G01 current-source production build (2026-10-19): `npm.cmd run build` passed on `11276bc4` with Next.js 16.3.4 and generated 26 static pages. [Build receipt](evidence/ma24-g01-current-source-production-build-2026-10-19.json). Local build only; no service started, no port opened, and target-host/HTTPS/backup/team acceptance remains incomplete.

G01 local read-only release preflight (2026-10-19): schema/prerequisite markers 123–135 are present, the collector role is restricted, and the application database role cannot set/inherit it. The newest local backup checksum matched but was 68.6 hours old; release remains false until a fresh cutover backup, an integrated source/service rollback package and runtime/queue verification are complete. No migration, service start or deployment occurred. [Receipt](evidence/ma24-g01-local-readonly-release-preflight-2026-10-19.json).

G05 successful PDF/PPTX worker isolation rerun (2026-10-19): actual formal workers extracted synthetic text-plus-image PDF and PPTX, preserved extracted text/coordinates, and queued both for visual review while an unrelated held job and v3 pointers remained unchanged. No documents were published. [Receipt](evidence/ma24-g05-successful-pdf-pptx-worker-isolation-2026-10-19.json).

G05 synthetic PDF/PPTX end-to-end review and citation isolation (2026-10-19): formal worker extraction, synthetic visual-review completion, private registration, search and exact source-location readback passed; cross-account search/tree/evidence reads were denied. Cleanup assertions confirmed no synthetic accounts, jobs, review rows or documents remain. [Receipt](evidence/ma24-g05-pdf-pptx-review-register-search-citation-isolation-2026-10-19.json). This is engineering evidence only; real source quality and user-facing answer citation remain unaccepted.

G05 IEEE PPTX current product-citation rerun (2026-10-19): re-ran the authorized tutorial on the isolated MA11 replay clone. All 133 review decisions persisted and read back, registration/search succeeded, exact slide 5 and 22 citations and tenant/collection denials passed, and synthetic rows/files were cleaned. No model or external calls. [Receipt](evidence/ma24-g05-ieee-pptx-current-product-citation-clone-2026-10-19.json). This closes only the previously authorized PPTX read/citation acceptance scope; it does not establish model-answer quality, independent Gold or production acceptance.

G13 review UI backup-clone rerun (2026-10-19): restored a real backup to a disposable database and exercised old Web, candidate Web, and old Web after candidate upload using a synthetic account. Candidate review page passed desktop/mobile layout, source download match, revision conflict, refresh recovery, changed-original rejection and unchanged release pointer. Review remained unresolved and zero documents were published; real business material, actual review completion, usage accounting and production rollback remain open. [Receipt](evidence/ma24-g13-review-ui-backup-clone-2026-10-19.json).

G10/G13 Skill acceptance review UI rerun (2026-10-19): corrected the synthetic safety replay fixture so it executes the fixed Skill read through the recorded graph and accurately asserts five journaled calls per arm. Full isolated browser-to-database review, exact receipt copy, revision refresh/revocation, durable recovery and tenant isolation passed with zero actual model calls. Synthetic review only; reviewer quality, runtime attestation, production permissions and activation remain unverified/disabled. [Receipt](evidence/ma24-g10-skill-review-ui-safety-fixture-rerun-2026-10-19.json).

G09 runner-attestation store fresh-cluster rerun (2026-10-19): disposable Docker PostgreSQL verification passed migration/role setup, signed synthetic declaration binding and idempotency, drift/empty evidence rejection, app-write and cross-account denial, append-only enforcement, disabled-key and revoked-freeze rejection, and serialized latest-review reads. The harness removed its container and volume. Production collector/provider identity, complete source revocation, human quality and final enable transaction remain unverified; no product migration/key/activation occurred. [Receipt](evidence/ma24-g09-runner-attestation-fresh-cluster-rerun-2026-10-19.json).

G09 fresh-cluster engineering matrix (2026-10-19): independently fresh clusters passed runner declaration, shadow and memory-source locks, locked-policy DB clock/latest-review checks, safety usage, prospective five-category composition/locked material reread, and signed transport journal/recovery. Each fixture was run separately because the child checks require a pristine database. The policy verifier reports full source-payload reconstruction false; transport binary qualification and TLS image preflight are false; production identities, human quality and final activation are still absent. No production write/key/activation. [Matrix](evidence/ma24-g09-fresh-cluster-engineering-matrix-2026-10-19.json).

G09 current-source collector image TLS preflight (2026-10-19): rebuilt from the committed `42f71ded` Git archive and ran the restricted collector's `--check` against a fresh disposable PostgreSQL database with a read-only CA mount and `sslmode=verify-full`; synthetic transport journal, recovery and revocation checks passed. The earlier matrix's TLS-preflight false is superseded for this current image only. `binaryVerified` and production qualification remain false; no model calls or production writes. [Receipt](evidence/ma24-g09-current-collector-image-tls-preflight-2026-10-19.json).
