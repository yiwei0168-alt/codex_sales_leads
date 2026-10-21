# PRD v0.3 Acceptance Report

2026-10-21 / MA24-06：候选 PostgresSaver 隔离存储适配及共享事务桥通过新库实际载荷/待处理写入/重建回读、RLS/应用角色拒绝、长锁回滚；普通适配器独立到期/接管回归通过，73 测试/类型/lint 通过。170 仅由夹具明确安装；候选运行入口未切换，完整协议和生命周期未关闭，不提升真实质量。[组件边界](CANDIDATE_POSTGRES_CHECKPOINT_BACKEND_2026-10-21.md)。

2026-10-21 / MA24-06：44023 旧固定 0ce190f3/fcddf26b 完整 Linux 五类/包登记、提交后进程终止/原租约自然到期/恢复不重放退出 0 并清理。不能证明此前失败唯一根因，也不覆盖 a3dba04c 短锁等待修复；新组合 61937 仍运行，完整协议/生命周期和真实质量待办。[终态](CHECKPOINT_WAIT_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06：a3dba04c 三镜像构建、1020 源码/33503 依赖/ESM、采集器边界及 Web 检查通过，检查点短锁等待修复已入包。新组合 61937、旧组合 44023 分别运行，均不判通过；完整协议/生命周期与真实质量仍待办。[范围与收据](CHECKPOINT_WAIT_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06：检查点短暂更新锁误拒绝已实库复现并修复为最多等待 1 秒，拿锁后仍重验所有权和墙钟。新 169 库认领/保存、长锁失败无改写和等待时令牌变化拒绝通过；48 回归、类型/两文件 lint 通过。仅合成工程证据，未入固定包，不替代运行中的 44023 或完整协议/真实质量验收。[范围](SKILL_CHECKPOINT_RENEWAL_LOCK_2026-10-21.md)。

2026-10-21 / MA24-06：0ce190f3 正式采集器声明 TLS、实际 API/Worker 的五项合成回执/来源恢复检查退出 0 并清理，无新模型或业务工具。仅工程恢复证据，首次提供方请求/原始崩溃未验。完整 Linux 组合以 fcddf26b 夹具重跑 44023 仍运行，不判通过。[收据与边界](CONTENTION_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06：0ce190f3 固定三镜像及源码/依赖/ESM、采集器边界/Web 检查退出 0。候选失败诊断仅发布受限格式码与静态消息，分块缓冲至流关闭后解析，类型/lint 通过。新包独立 TLS/实际 Worker 仍运行，完整组合待重验，不能将组件通过替代整轮或真实质量。[当前包](CONTENTION_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06 私有续租与检查点锁竞争：已实库确认 55P03 误取消并修复；新 169 库竞争期间截止不变、有效工作不取消、释放后正常节拍续租通过，48 回归/类型/lint 通过。只处理该已知锁竞争，原窗口和其余拒绝规则不变。完整组合与新固定包未重验，不能认定旧 1418 唯一根因或提升真实质量。[范围](SKILL_LEASE_RENEWAL_CONTENTION_2026-10-21.md)。

2026-10-21 / MA24-06：新增仅夹具的空检查点标准模式模型回执恢复，实际固定 d2bde5b9 API/Worker、新 169/TLS/Internal 与类型/lint 通过，模型节点/检查点/终态贯通但实际模型调用 0，合成原回执行不变。1418 完整 Linux 组合已退出 1，前瞻私有租约失败未定位 SQL 原因，不记通过；独立 TLS/普通 Worker 结果分范围保留。[当前状态](EMPTY_CHECKPOINT_MODEL_RECOVERY_2026-10-21.md)。

2026-10-21 / MA24-06：d2bde5b9 新固定三镜像及源码/依赖/ESM、采集器和 Web 检查通过；实际 API/Worker 的认领、来源撤回、合成完成/未知回执恢复与独立正式 TLS 退出 0 并清理。实际模型/新增工具/启用为 0，首次模型及原始崩溃未验。1418 新包完整组合仍运行，旧 5957f402 同类已通过；不混用版本证据。[当前验收](CHECKPOINT_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06 普通主图检查点：原生 saver 对照复现跨到期仍写入；同客户端账号事务/任务行锁/墙钟复查修复通过新 169 库两类写入与 blob 回滚、实际接管拒绝旧令牌、真实共享图保存回读和线程/终态拒绝，39 回归/类型/lint 通过。非完整 SDK Worker 验收，候选私有协议与生命周期未统一；5957f402 不含本轮。该包独立 TLS 已另通过，完整组合仍运行。[范围](AGENT_CHECKPOINT_LEASE_2026-10-21.md)。

2026-10-21 / MA24-06：5957f402 三镜像及源码/依赖/Node/ESM、采集器边界、Web 源码/静态检查通过，包含两项已实库验证的起始事务竞态修复。新固定包 Linux 全组合/故障与独立 TLS 验收仍运行；旧 7541219d 故障专项通过单独保存，不扩称本版本或真实质量通过。[当前包与范围](CALL_APPROVAL_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06：7541219d 固定 Linux / 601abc6e 夹具专项已退出 0，历史正式任务真实子进程提交后终止、默认租约自然到期恢复与旧行/HTTP 不重放，普通 Worker 控制及五类八任务通过，临时资源清理。后续 112493bf/5957f402 不在该镜像；非整组生产入口/TLS、非完整 checkpoint/生命周期和真实质量。[专项记录](SHARED_LEASE_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06 批准消费时效：旧版实际批准行锁跨过期仍成功已复现；最终墙钟联合批准/租约检查通过 19 测试、类型/3 文件 lint、新 169 库批准锁/调用写锁两种自然过期拒绝与整体回滚、正常批准及过期完成回执复用。无业务或模型调用，资源清理。未修改人工审批入口，不代表贯穿提交/完整生命周期或真实质量通过，旧镜像不含新代码。[证据](APPROVAL_EXPIRY_LOCK_WAIT_2026-10-21.md)。

2026-10-21 / MA24-06 工具起始事务：旧租约行锁跨到期仍成功已实库复现；修复后新 169 库任务行锁/工具表锁两种自然到期均拒绝且无调用记录遗留，正常创建/完成回执复用、参数变化/取消拒绝通过，资源清理。17 项测试、类型/4 文件 lint 通过；不代表贯穿 COMMIT 的全部授权租约，现有 7541219d 固定包不含新修复。[证据与边界](AGENT_CALL_LEASE_LOCK_WAIT_2026-10-21.md)。

2026-10-21 / MA24-06 7541219d 当前固定 Linux 组合退出 0：两原任务/八隐藏任务/五类统一材料、实际测量登记及缺人工判断阻断、原件撤回恢复与登记停用等待提交通过并清理。独立 TLS 结果另存，不代表整组生产入口/TLS。专项旧归档已主动停止，修正夹具 601abc6e 的专项 61799 正在运行，固定包内故障恢复尚未验收。[结果与范围](SHARED_LEASE_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06：7541219d 独立固定采集器声明入口 TLS 新库验收退出 0，签发/复用及身份/密钥/撤销/登记禁用串行通过；不代表整组生产包装器/TLS。固定包历史崩溃与 Worker 控制专项夹具接通，语法/类型/lint 通过，实际专项尚未验收，完整组合待终态。[记录](SHARED_LEASE_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06 固定包：7541219d 三镜像构建、1018 源码/33503 依赖字节/ESM、采集器边界及 Web 源码检查通过，共享租约修复已入新包。新包完整 Linux 组合/独立 TLS 数据库验收仍运行；不沿用旧版本结果，无部署/启用或真实质量结论。[固定包](SHARED_LEASE_FIXED_PACKAGES_2026-10-21.md)。

2026-10-21 / MA24-06 普通 Worker/G09 共享租约验收：29 项定向测试、类型/8 文件 lint 和新 169 库通过。实际续租、事务跨到期后的拒绝、编译 Worker 初始暂停/运行中暂停与取消/传输失败不重放、过期任务直接控制、G09 取消不运行模型并结算、历史候选提交后 SIGKILL 与默认租约自然到期恢复均通过。临时资源已清理，无真实模型或生产写入。完整 checkpoint/使用生命周期、含本轮修改的固定包及真实身份/质量继续待验。[范围与原始结果](SHARED_AGENT_RUN_LEASE_2026-10-21.md)。

2026-10-21 / MA24-06 G01/G09 current fixed-image acceptance: 6d700395 immutable main/collector measurements and byte-identical runtime source with e410c1d7 fixtures passed fresh-169 Linux full five-category/eight-task composition. Actual runtime-package readers return registered/provenance true and no package blockers; missing human judgment still blocks. The same collector production declaration entry independently passed fresh-169 TLS issuance/readback/retry, registry-disablement commit waiting and CA/deployment/account/key/purpose/revocation/NODE_OPTIONS rejection. Both runs use synthetic tasks/keys/network adapters, no production keys/model calls/activation. Whole-fixture production wrapper/TLS, fixed-image process-crash recovery, ordinary Worker/checkpoint integration, use lifecycle and real quality remain pending. [Scope and receipts](SKILL_RUNTIME_PROTOCOL_MEASURED_LINUX_2026-10-21.md).

2026-10-21 / MA24-06 G09 formal task crash: fixture-only compilation terminates the actual child after committed skill_read while its graph checkpoint still lists that call pending. A fresh-169 run passed early takeover rejection, natural default task/private lease expiry, new-process recovery, unchanged old model/tool rows and a transport guard forbidding repeat HTTP for completed steps 0/1. Completed reuse, signed audit, review and material locks also passed. Product executor source unchanged; host Node historical case only, fixed-image/ordinary Worker/other-case fault recovery and real quality remain pending. Typecheck/lint passed, real model calls 0, Skill disabled. [Scope](SKILL_FORMAL_RUNTIME_PROCESS_CRASH_2026-10-21.md).

2026-10-21 / MA24-06 G01/G09 fixed baseline and native full composition: 6d700395 Web/main/collector images built from fixed Git archives. Web source/static/private-file checks passed; main/collector match 1016 source inputs, Node 24.21.0/binary, 33503 dependency files and ESM; collector enrollment/read-only/non-root/no-network/tamper checks passed. Fresh-169 host Node full five-category composition with database trust passed: 2 original tasks, 8 runtime tasks in the locked ledger, all material/transport checks, attachment withdrawal/restoration and registry-disablement commit serialization; missing human judgment still blocks. Native package-registration-missing is retained. Fixed-image full execution/registration, same-runtime crash recovery, Worker/checkpoint unification and real quality remain pending. No activation/deployment/model calls. [Scope and receipts](SKILL_RUNTIME_PROTOCOL_COMPOSITION_2026-10-21.md).

2026-10-21 / MA24-06 G09 safety runtime: negative/injection/permission arms now use fixed clean snapshots and distinct hidden tasks through the shared configured lifecycle. Safety v2 references reconstruct owned model/tool journals with no legacy fallback, paired-task validation and two-arm review; both tasks enter material locks/fingerprints. 103 focused tests, typecheck/lint and fresh-169 native verification passed: six compiled tasks/signature snapshots, first-case both-arm no-request reuse with unchanged journals, three-case unified review and six-task material lock acquisition. Synthetic responses, no human judgments, real model calls 0, Skill disabled. Same-source full five-category/fixed Linux packages, ordinary Worker/checkpoint unification, same-runtime crash recovery and real quality remain pending. [Scope](SKILL_SAFETY_RUNTIME_ENTRY_2026-10-21.md).

2026-10-21 / MA24-06 G09 prospective runtime: pre-task capture ID/projection now bind hidden task admission, dispatcher checks, settlement and completed readback. Historical/prospective configured entries share formal read journals and signed task snapshots; task-marked prospective v2 material never falls back to legacy audit. Unified review returns both arms; material locks/fingerprints include capture-bound tasks. 70 focused tests, relevant 15-test recheck, typecheck/lint and two fresh-169 native database runs passed. Final run verifies actual lock acquisition, exact projection/absent-or-other capture rejection, valid retry and no new requests/model/tool/bundle rows on completion reuse. Synthetic responses only; no quality or activation claim. Safety adaptation, Worker/checkpoint unification, fixed packages/full five-category current composition and real quality remain pending. [Scope](SKILL_PROSPECTIVE_RUNTIME_ENTRY_2026-10-21.md).

2026-10-21 / MA24-06 G09 configured historical entry: compiled collector now creates/claims a server-bound hidden runtime task and collects v2 references; signed model snapshots include task/spec binding. Completed retry independently audits persisted metadata/journals without a request adapter or new claim. 64 focused tests, typecheck, five-file lint and two fresh-169 native database runs passed; the second explicitly forbids network on retry and verifies unchanged model/tool rows and unique bundle ID. Skill stays disabled, real model calls 0. Prospective/safety adaptation, Worker/checkpoint unification, new fixed Linux packages, real quality and activation remain pending. No new user confirmation. [Scope](SKILL_CONFIGURED_RUNTIME_ENTRY_2026-10-21.md).

2026-10-21 / G09新协议已接统一历史收集、候选复核与审核读取，两臂回执按任务绑定；新任务/工具行锁和持续来源指纹接入。72项回归/类型/12文件lint、新169材料往返、私有来源、实际更新锁等待及结果指纹变化/回滚、落库篡改拒绝通过。无人工批准、资格提升或启用；配置采集入口和新协议完整签名/生产/质量验收仍待办。[验收](SKILL_RUNTIME_UNIFIED_MATERIALS_2026-10-21.md)。

2026-10-21 / G09新协议只读审核从服务器模型与正式工具日志重建，不执行工具或模型；核对全部调用、原来源、原请求与已结算结果。54项回归/类型/4文件lint、新169正向重建及未结算/实际落库篡改拒绝通过，审核无新请求/工具记录；JSONB键序问题两次失败保留，按已存请求恢复结构顺序并保持来源值严格核对。统一材料/CLI/页面及真实质量未完成。[验收](SKILL_RUNTIME_CANDIDATE_AUDIT_2026-10-21.md)。

2026-10-21 / G09正式任务候选循环已接入固定原提示、虚拟Skill、模型/正式工具持久日志、任务续租与私有检查点、来源重建和结果结算；33项回归/类型/7文件lint及新169实际结算回滚后终态复用通过，5份模型/2份工具日志均不重放，账号Skill不启用。配置CLI、新协议审核和前瞻/安全适配、正式Worker/真实质量与完整等价仍待办。[验收](SKILL_RUNTIME_CANDIDATE_GRAPH_2026-10-21.md)。

2026-10-21 / G09独立正式任务准入、显式租约认领、存储派生上下文与正式read分发接通；45项回归/类型/10文件lint、新169数据库隔离、实际注册只读工具回执、伪造/跨账号/写入/取消/冻结撤销拒绝通过。首跑暴露G16目录不适用于G09，现按schema和已验证来源分开，G16限制不放宽；完整候选图、模型/恢复与质量仍待办。[范围与收据](SKILL_CANDIDATE_RUNTIME_TASK_2026-10-21.md)。

2026-10-21 / G09实际候选进程SIGKILL后默认90秒租约自然到期、新进程恢复、提前接管拒绝、旧回执不变和第三进程终态零请求复用通过；类型/三文件lint、新169数据库整轮退出0，临时资源清理。仅工作区候选工程验证，正式Worker/真实提供方/启用链路仍待办。[验收范围](SKILL_CANDIDATE_PROCESS_CRASH_2026-10-21.md)。

2026-10-21 / G09检查点事务租约修复：认领与保存持有租约行锁，写后重核期限；类型/两文件lint、实际新169数据库延迟旧认领拒绝、新令牌不变及恢复/权限回归通过。上一版3105c990固定组合已通过但不含本修复，真实质量与完整执行等价仍未完成。[验收范围](SKILL_CHECKPOINT_TRANSACTION_LEASE_2026-10-21.md)。

2026-10-21 / G09候选169时限租约已接持久候选/安全两臂，48项回归/类型/11文件lint与实际20秒续租、短期限到期接管、旧令牌释放隔离、控制/冻结检查及编译候选通过。用户控制入口/审计、完整崩溃恢复与资格持续绑定及新固定包待验；非完整执行等价/真实质量通过。[范围](SKILL_CANDIDATE_TIMED_LEASE_2026-10-21.md)。

2026-10-21 / e2a6d31e checkpoint固定包新168完整签名五类/测量登记、实际恢复及旧写/篡改/权限拒绝通过；正式TLS声明与Worker另有收据，缺人工判断仍阻断。后续169未含，完整等价/质量/启用未完成。[收据](evidence/ma24-g09-candidate-checkpoint-fixed-composition-2026-10-21.json)。

2026-10-21 / G09候选checkpoint已接入私有168及持久候选/安全图；57项回归、类型/11文件lint与实际168保存后应用中断恢复、终态不重发、令牌/版本/绑定/篡改/权限拒绝和编译历史候选通过。不是SIGKILL或真实PG未知COMMIT注入，新固定包及完整租约/控制/恢复等价、真实质量/启用仍缺。[范围](SKILL_CANDIDATE_GRAPH_CHECKPOINT_2026-10-21.md)。

2026-10-21 / 16ef7e73所有权固定包新167完整五类/实测登记、实际并发及后端终止晚到回执恢复通过，缺人工判断仍阻断。与独立TLS声明分开记录；不含后续checkpoint，完整执行等价/质量/启用未完成。[收据](evidence/ma24-g09-candidate-ownership-fixed-composition-2026-10-21.json)。

2026-10-21 / G09候选执行事务所有权接入持久历史/前瞻与安全两臂，独立所有权/回执池；69项回归/类型/8文件lint和新167同臂拒绝、双臂回执并行提交、终止所有权后端后的晚到回执保留/重新接管通过。完整时限租约/控制/checkpoint等价及新固定包完整链待验，真实质量/启用未通过。[范围](SKILL_CANDIDATE_EXECUTION_OWNERSHIP_2026-10-21.md)。

2026-10-21 / bcc2c6e0修正固定双包的新167完整签名五类/测量登记和三类异常完成回执保存/恢复不重发/资格拒绝退出0；缺人工判断仍阻断，资源清理。整组归档夹具非完整生产包装器/TLS，另有正式TLS声明收据；完整执行等价/真实提供方和质量/启用仍缺。[收据](evidence/ma24-g09-rejected-response-fixed-composition-2026-10-21.json)。

2026-10-21 / bcc2c6e0异常回执修正新包的正式声明167/TLS/数据库信任及停用等待提交通过，完整签名五类仍运行未验收；完整执行等价、真实质量及启用仍缺。[收据](evidence/ma24-g09-rejected-response-fixed-declaration-2026-10-21.json)。

2026-10-21 / G09异常完成响应改为非重试失败证据并保留原回执；此前mock成功保存不能证明真实日志接受，现53项回归/类型/7文件lint与新167实际受限日志保存、回读、恢复不重发及传输资格拒绝通过。e1a59caf的TLS声明独立通过，但旧包不含本修正；新包和完整等价/质量待验。[范围](SKILL_REJECTED_COMPLETED_RESPONSE_2026-10-21.md)。

2026-10-21 / G09 e1a59caf双包新167签名五类/测量登记组合退出0，登记与来源真实读者、原件撤回恢复及停用事务等待通过，缺人工判断仍阻断。新包TLS正式声明另运行；整组非正式包装器/TLS，模型与身份合成，完整执行等价/真实质量/启用仍缺。[收据](evidence/ma24-g09-shared-model-measured-composition-2026-10-21.json)。

2026-10-21 / G09固定e1a59caf正式Worker恢复completed与started无回执两分支实跑通过；复用/unknown、不重做及Skill/原记录不变，模型0。仅构造检查点/调用状态，真实启用、崩溃/未知COMMIT同链路及质量仍缺。[收据](evidence/ma24-g09-started-receipt-worker-recovery-2026-10-21.json)。

2026-10-20 / G09新固定e1a59caf双包构建、997源码/完整依赖字节/ESM及采集器边界通过；同包完整签名登记组合仍运行，未记通过。完整执行等价、真实质量及启用仍缺。[证据](evidence/ma24-g09-shared-model-fixed-packages-2026-10-20.json)。

2026-10-20 / G09正式/候选共用模型响应处理接通，95项回归、类型/7文件lint通过；保留编号及签名元数据，异常已完成响应保留回执再拒绝消费，恢复不重发，候选正式错误类型保留。模拟依赖验证不代表完整执行等价或真实质量；旧固定包不含新源码，新固定完整链待验。[范围](SKILL_SHARED_MODEL_RESPONSE_LIFECYCLE_2026-10-20.md)。

2026-10-20 / 正式Worker在167/TLS/Internal网络中恢复合成待处理Skill调用，精确复用已完成回执一次，禁用状态/原回执不变，启用事件与模型尝试0，类型/2文件lint及实跑通过。先前启用未实际执行，未注入同链路崩溃/未知提交，不扩称真实启用恢复或质量验收。[收据](evidence/ma24-g09-committed-receipt-worker-recovery-2026-10-20.json)。

2026-10-20 / G09实际测量登记与签名五类在04433870夹具/c47e9f7c固定包/新167完整退出0，登记和来源组合真实读者返回true，缺人工判定仍阻断，自动启用false；前三次失败保留。临时身份及模型/网络合成，不扩称执行等价、生产/提供方或真实质量资格。[收据](evidence/ma24-g09-measured-registration-composition-2026-10-20.json)。

2026-10-20 / 167角色守卫兼容实库通过，仅admin可声明admin权限，admin可按member降权读取；非完整管理员来源链或质量资格。c47e9f7c当前双包/依赖字节/ESM及166/TLS声明通过。登记联合第三次退出1，已修正分用途停用键的严格期望，完整联合未验收。[角色](SKILL_ACTIVATION_USE_SCOPED_ROLE_2026-10-20.md)、[固定包](SKILL_CURRENT166_FIXED_PACKAGES_2026-10-20.md)。

2026-10-20 / G09使用后提交保护：166正常提交、返回后自然到期/换绑定提交回滚、停用守卫拒绝及私有删除拒绝通过，39项回归/类型/6文件lint通过；首次夹具等待被15秒上限中断保留，局部45秒重跑通过。默认延迟约束路径的组件证据，正向资格模拟，非完整生命周期/质量/生产通过，当前Linux待更新。[范围](SKILL_ACTIVATION_USE_COMMIT_2026-10-20.md)。

2026-10-20 / G09使用期完整绑定匹配修复：38项回归、类型/3文件lint及新165实库通过，元数据仍有效时旧绑定拒绝、精确当前绑定接受，组件变更回滚；正向资格仍模拟，非生产/质量或完整生命周期验收。当前Linux包不含新修复。[范围](SKILL_ACTIVATION_BINDING_SNAPSHOT_2026-10-20.md)。

2026-10-20 / 测量登记联合首跑因夹具首次修订0与正式NULL契约不符退出1，保留失败；仅修正夹具并支持显式固定归档提交，语法/类型/2文件lint通过，重跑尚未判通过。[范围](SKILL_MEASURED_RUNTIME_REGISTRATION_COMPOSITION_2026-10-20.md)。

2026-10-20 / G09实际测量登记联合夹具已接通，语法/类型通过，完整联合实跑未验收。运行包测量来自不可变镜像，测试源码与固定镜像运行源码逐字节核对；临时签名和合成模型不构成生产资格，人工判定与自动启用门槛不变。[范围](SKILL_MEASURED_RUNTIME_REGISTRATION_COMPOSITION_2026-10-20.md)。

2026-10-20 / 37a2ef90固定镜像内165签名五类退出0，实际Linux Node/依赖、同修订源码与固定编译声明入口，来源准备同事务/撤销恢复通过。缺包登记与人工判定仍阻断，非整组生产包装器/TLS/真实质量资格；下方该Linux“仍运行”由此取代。[收据](evidence/ma24-g09-current165-linux-five-category-2026-10-20.json)。

2026-10-20 / 943bbecd宿主165完整签名五类退出0，共用工具解析贯穿，真实来源准备/同事务绑定通过；登记/人工判定缺失仍阻断。该宿主快照较早“运行中”以此取代，不含后续期限修复，不替代Linux五类或生产/质量资格。[收据](evidence/ma24-g09-shared-dispatch-full165-2026-10-20.json)。

2026-10-20 / G09当前37a2ef90固定双Linux包构建及996源码输入/Node/33503依赖字节/ESM与采集器边界通过；同包165/TLS数据库信任声明及登记禁用等待提交通过。专用Linux五类入口语法、类型/2文件lint通过，首次实跑尚待终态；不将源码一致或依赖字节一致提升为完整执行等价、生产或质量资格。[范围](SKILL_CURRENT165_LINUX_PREPARATION_2026-10-20.md)。

2026-10-20 / G09候选模型回退外层期限修复：3文件50项回归、类型/2文件lint通过，单路1000ms下两路共1800ms合法回退完成，挂起回调仍受全部路线3000ms总上限中止且不执行迟到工具。实际模型/网络0，非完整执行等价或生产资格。943bbecd五类快照独立运行，不覆盖新修复。[范围](SKILL_CANDIDATE_FALLBACK_DEADLINE_2026-10-20.md)。

2026-10-20 / G09正式/候选共用工具解析，63项回归、类型/4文件lint通过；跨路径发现/描述/规范化读取摘要一致，正式执行适配器模拟、候选调用0次，执行等价性仍未完成。独立527b5fd7全新165完整签名五类退出0，真实来源准备及同事务ID通过，缺运行包登记/人工判定仍阻断。[范围](SKILL_SHARED_TOOL_DISPATCH_2026-10-20.md)。

2026-10-20 / G09使用期登记保护：新增read committed限定和信任/运行包非阻塞共享事务锁，65项定向测试、类型与3文件lint通过；全新165实库两后端锁保留/冲突拒绝、隔离级别拒绝及既有回归已退出0，不构成生产/质量资格或整个G09完成。[范围](SKILL_ACTIVATION_USE_ADMISSION_2026-10-20.md)。

2026-10-20 / G09来源准备/封闭条件生产者接通，100项测试、类型/10文件lint、全新165实际锁与旧守卫健康的拒绝/接受及提交回归通过。真实准备器的正向读者仍模拟，数据库其他启用资格仍替身，未授予生产资格；完整五类/受信任登记、最新Linux、运行等价性及真实质量未完成。[范围](SKILL_SOURCE_PROTECTION_PREPARATION_2026-10-20.md)。

2026-10-20 / G09声明源串行化：44项测试、类型/8文件lint、全新164重复安装、规范UUID验收锁与真实受限采集器直接追加advisory等待通过；追加成功后回滚、停用守卫/清空拒绝，既有回归通过。未签名组件不具备生产资格；来源总证明、运行等价性、真实质量及最新固定Linux完整链仍缺。[范围](SKILL_DECLARATION_APPEND_SERIALIZATION_2026-10-20.md)。

2026-10-20 / G09最新判定追加串行化：53项测试、类型/5文件lint、全新163顺序初始化/重复安装及受限应用直接追加等待真实读者通过；停用守卫拒绝适配器/封闭入口，包/审核TRUNCATE拒绝。开发判定全false且撤回，写事务回滚，0human批准/模型/生产资格；固定Linux及来源总证明未验。[范围](SKILL_ACCEPTANCE_REVIEW_SERIALIZATION_2026-10-20.md)。

2026-10-20 / G09运行指纹生命周期：52项测试、类型/5文件lint、全新162实际非执行源码标记变化导致读取/列表/运行中/依赖拒绝，恢复相同字节后组件可用性恢复，临时资源/标记清理。正向资格仍模拟，不等于生产等价性或当前固定Linux验收；自动启用仍关闭。[范围](SKILL_ACTIVATION_RUNTIME_BINDING_2026-10-20.md)。

2026-10-20 / G09来源组合有条件生产者已接通：100项测试、类型/4文件lint及162拒绝/既有事务回归通过，正向组合依赖模拟读取结果，不能视为生产资格。来源总门槛、运行等价性、真实质量与自动启用仍未通过；固定b4e75e97/162/TLS数据库信任声明已通过，新增组合的当前Linux联合正例仍待验。[范围](SKILL_REGISTERED_COLLECTOR_PROVENANCE_2026-10-20.md)。

2026-10-20 / 固定b4e75e97采集器在162/TLS文件信任模式通过，0模型/人工质量/生产资格；先前所述“数据库重跑”的实际结果为文件模式，已按专用开关另启数据库模式，尚未判通过。[范围](evidence/ma24-g09-current162-declaration-file-trust-2026-10-20.json)。

2026-10-20 / G09当前162签名五类工程联合验收通过，缺登记记录/人工判定正确阻断；固定采集器边界/篡改拒绝通过。宿主合成执行不替代固定Linux完整链或真实质量/生产资格。固定镜像162/TLS声明首轮末尾旧版缺表断言失败，修复后重跑仍未判通过。[范围](SKILL_CURRENT_SCHEMA_SIGNED_COMPOSITION_2026-10-20.md)。

2026-10-20 / 固定b4e75e97主运行/采集器构建及实际运行包/源码/Node/33503依赖字节/ESM一致性核对通过；采集器边界与全新162五类流程未取得终态，生产与质量仍未通过。[证据](evidence/ma24-g09-current162-composition-preparation-2026-10-20.json)。

2026-10-20 / G09当前162组合入口已实现并通过类型/3文件lint；全新162下完整签名五类及b4e75e97固定双镜像尚未取得终态。此前旧版夹具与162单独组件证据不能替代本轮联合验收。[范围](SKILL_CURRENT_SCHEMA_SIGNED_COMPOSITION_2026-10-20.md)。

2026-10-20 / G09未知COMMIT：正式适配器/全新162/本地协议故障通过已提交丢确认与未送达COMMIT两分支，重读不重新启用，显式重试单份回执/审计；类型/2文件lint通过。此为资格替身下真实事务组件验收，非生产资格或Worker恢复，固定Linux/TLS完整链仍缺。[证据](SKILL_ACTIVATION_COMMIT_OUTCOMES_2026-10-20.md)。

2026-10-20 / MA24-06 G09：迁移162的来源事务封闭组件通过，62张来源表的语句/行级拦截、精确启用三元写入、缺元组提交与晚期写入整体回滚已验证。38项回归、类型/8文件lint及全新162通过。资格正例为替身，无真实质量或生产启用；完整来源联合验收、生产身份/运行等价性、当前固定包及启用提交丢确认仍待完成。[范围](SKILL_ACTIVATION_SOURCE_TRANSACTION_FENCE_2026-10-20.md)。

2026-10-20 / G09 评测与捕获持续绑定：同冻结评测尝试/结果、当前包声明、相关捕获上下文与活动配置的实际摘要纳入启用资格；业务来源重建前后复查，变更阻断读取/列表/运行中与依赖校验。95项定向测试、类型/lint及全新161数据库通过；实测评测追加和活动修改等待持有锁，无关评测、租约和未采用本地结果不触发失效。指纹不代表正向资格，组件数据明确不具备前瞻时序或模型质量证明；零真实模型/human审核/生产启用。[证据](SKILL_ACCEPTANCE_LEDGER_LIFECYCLE_2026-10-20.md)。

2026-10-20 / G09 启用后业务来源：保存服务器原任务来源摘要，实际读取、模型/UI列表、运行中任务及依赖验收均重查；原任务/会话/消息/当前记忆撤销在全新161库阻断，另以五类组合实际读者验证知识、邮件、客户、记忆与原件字节篡改阻断和恢复。112项定向测试、类型/lint通过；正向资格仍为显式替身，零人工审核/模型调用/生产启用。评测臂日志/前瞻捕获的持续绑定及完整COMMIT来源保护仍未完成。[证据](SKILL_ACTIVATION_BUSINESS_SOURCES_2026-10-20.md)。

2026-10-20 / G09 记忆时效提交保护：实际数据库捕获当前决策记忆与隐式观测查询的下一时间边界，保留显式历史维度，并将准备/最终重查的最早时间并入最终启用期限。109项测试、类型/lint、全新161数据库通过；函数返回后跨过自然到期或预定生效，COMMIT整体回滚。时间生产者真实，其余正向资格仍为测试替身，零模型调用/人工审核/生产启用。当前代码尚未重建固定Linux包。[证据](SKILL_MEMORY_COMMIT_TIME_FENCE_2026-10-20.md)。

2026-10-20 / G09 当前固定Linux包：源码7ac672b3主运行与采集器构建、实际不可变镜像完整性、985源码输入/Node24.21/33503依赖字节及ESM成对核验通过；同一采集器权限/篡改拒绝和TLS声明矩阵通过。本轮TLS使用文件登记，未扩称数据库登记并发锁联合验收；161完整初始化是另一个隔离SQL场景，尚非当前固定Linux包内161五类完整链或生产等价性。[收据](evidence/ma24-g09-current161-fixed-packages-2026-10-20.json)。

2026-10-20 / G09 依赖方法与完整初始化：验收包固定方法现复查自动启用资格，真实受限SQL中登记/冻结/运行包/审核/期限失效阻断依赖方法验收；85项定向测试、类型及lint通过。全新临时库完整顺序初始化至161并通过18项当前结构标记及启用/回滚/失效链，不再只依据135加组件。真实来源、生产等价性及质量仍待验，固定Linux完整链另计。[证据](evidence/ma24-g09-current161-dependent-qualification-2026-10-20.json)。

2026-10-20 / G09 启用后资格：迁移161和实际新读取、模型/UI列表、运行中守卫已接通资格绑定；登记/冻结/审核/运行包修订或期限失效均阻断，人工状态或版本操作清除旧绑定，COMMIT绑定被清除整体回滚。49项定向测试、类型/lint和隔离真实SQL通过；正向资格仍为显式模拟器，零human审核、零模型调用、零生产启用。不替代完整来源保护、可信生产资格和真实质量。[证据](SKILL_ACTIVATION_LIFECYCLE_2026-10-20.md)。

2026-10-20 / G09 最终事务组件：最新包服务端选择、锁序、租约/调用绑定、原子Skill/回执/审计及160提交约束已接通。63项回归、类型/lint和隔离SQL正反例通过，含函数返回后提交到期回滚、审计失败、写入期间到期及回执重读不复活停用。正例资格生产者为明确模拟，无human审核或生产资格，真实生产者仍拒绝。160全新初始化/固定包、完整来源/可信生产证明、真实质量及真实正向启用未完成。[范围](SKILL_FINAL_ACTIVATION_TRANSACTION_2026-10-20.md)。

2026-10-20 / G09 ESM终态：固定ad3aeaf6主运行/采集器的ESM格式及源码/Node/33503依赖项一致、采集器完整入口/篡改拒绝、实际TLS声明矩阵通过；工作区五类ESM同冻结组合、实际声明CLI、两原任务/八评测臂传输和登记事务保留通过。缺真实人工判定仍阻断，0模型、Skill停用、临时资源清理。135加精确夹具迁移的工作区组合不等于159或Linux全流程；生产来源、真实质量和最终启用尚未完成。[证据](evidence/ma24-g09-esm-runtime-alignment-2026-10-20.json)。

2026-10-20 / G09 ESM源码阶段：修复主运行ESM/采集器CJS加载条件差异；统一构建配置、runner.mjs与v2构建绑定、夹具及可选格式登记。21项Node、99项定向回归、类型/lint和基础ESM签发隔离实库通过；五类组合、固定Linux入口及TLS矩阵待终态。无模型调用或真实审核，不授予生产及自动启用资格。[范围](SKILL_RUNTIME_ESM_ALIGNMENT_2026-10-20.md)。

2026-10-20 / G09 运行包依赖字节：登记检查新增实际依赖文件/链接测量；持锁读取三用途成对比较，缺字段的旧文档不提升。107项回归、类型/lint及干净627f1990主运行/采集器完整性、部署绑定及33503依赖项一致通过；旧7d1f382c采集器runner清单不符被拒绝。仅字节组件验收，无新实库登记、模型或真实质量；生产来源及最终自动启用仍未完成。[范围](SKILL_RUNTIME_DEPENDENCY_BYTES_2026-10-20.md)。

2026-10-20 / G09 人工操作来源锁：修复实际changeSkill启用已返回但原文仍能在外层事务提交前被改写的竞态。修复后编辑等待准确持锁PID、提交后继续，原文改变拒绝再次启用且允许停用。46项回归、类型/lint与135加精确来源迁移的隔离实库验证通过；无真实质量判定或模型调用，未验证当前159/固定镜像、提交后自动停用或最终自动启用事务。[证据](evidence/ma24-g09-manual-skill-source-locks-2026-10-20.json)。

2026-10-20 / G09 私有回执复核：材料准备及策略计算后重新核对已消耗的邮件、客户时间线与客户列表，来源变化/清除/归档或覆盖变化拒绝 readiness。68 项定向单元测试、类型和 lint 通过；仓库读取在测试中模拟，未验证本变更实库/镜像，不授予生产来源、真实质量或自动启用资格。[范围](SKILL_PRIVATE_RECEIPT_RECHECK_2026-10-20.md)。

2026-10-20 / G10、G13 固定镜像实库审核：21ade59d Web构建及打包组件字节核对通过，新159独立副本的真实Chrome/HTTPS/受限TLS接口贯通首次材料竞态、并发草稿协调、409、成功写入后回读503、采用最新判决和撤销。r1–r7精确入库且全为合成不通过，Skill未启用，测试记录和资源清理。390px导航退出、遮罩隐藏及无横向溢出截图已查看。首轮历史迁移覆盖新触发器的夹具失败保留；本阶段“新Web/实库贯穿待验”已补审核分支，不代表本夹具原件预览、五类真实质量或G09生产/自动启用验收。[证据](evidence/ma24-g10-review-draft-fixed-web-2026-10-20.json)。

2026-10-20 / G10、G13 审核草稿：已保留真实Chrome的r2修订/r1旧内容失败，修复首次读取同步与脏草稿重核时的静默换修订。四场景验证最新内容读取、并发草稿保留/显式协调、采用最新判决及成功写入后回读失败；390px无横向溢出，截图已查看。8项审核接口回归、类型/lint通过。HTTP和判决均合成，没有真实人工质量批准或启用Skill；新Web镜像/真实数据库贯穿仍待验。[证据](evidence/ma24-g10-review-draft-revision-2026-10-20.json)。

2026-10-20 / G11 固定镜像实际IMAP恢复：固定2a1fb556正式邮箱Worker/真实读取器/DNS守卫在生产NODE_ENV及只读非root边界、新159受限TLS数据库中通过首批2封提交、次页解析1封后SIGKILL137、原90秒租约自然到期恢复。最终4封唯一加密邮件及4/4/4/0统计；跨账号拒绝、旧批次取消、全局游标和空Worker数据库/协议快照不变，同源Web HTTP通过。16项回归、类型/lint通过，资源清理。下方本阶段固定镜像非空恢复待验由此取代；本地合成邮件服务不替代真实服务商、持续运行和内容/客户归属质量，G11不关闭。[证据](evidence/ma24-g11-fixed-image-imap-recovery-2026-10-20.json)。

2026-10-20 / G11 固定Linux镜像：2a1fb556邮箱Worker包/源码/产物哈希一致及全新159/受限TLS/只读非root空队列通过，非法参数、缺数据库和迁移连接拒绝。同提交Web构建及另一个新159库的账号隔离/登录HTTP通过，临时资源清理。替代本阶段“Linux入口待验”，不替代镜像非空IMAP/中断恢复、真实服务商和质量验收。[证据](evidence/ma24-g11-mailbox-runtime-package-2026-10-20.json)。

2026-10-20 / G11 邮箱Worker打包：独立产物、镜像复制和受既有边界守卫约束的入口已实现，退出关闭数据库池，单次领取失败向上抛出。三产物编译、类型/lint和语法通过；固定Linux镜像、实际队列与协议恢复仍待验，未部署或扩大邮箱访问。[证据](evidence/ma24-g11-mailbox-runtime-package-2026-10-20.json)。

2026-10-20 / G11 联合恢复统计：已保留实库4封邮件误计 processed/discovered=5 的失败证据，并修复恢复时累加未入库解析进度的问题。实际读取器/ImapFlow/mailparser、本地验证TLS、编译源码Worker及新159实库的SIGKILL/原90秒租约自然到期复验通过，结果为4封唯一加密邮件、4/4/4/0统计；跨账号拒绝、旧批次取消、全局游标和空Worker快照不变。16项回归、类型/lint通过，资源清理。该Worker为本机NODE_ENV=test源码包；旧Web仅验兼容，不授予新Linux包、真实服务商或内容质量资格，G11仍未关闭。[证据](evidence/ma24-g11-imap-worker-count-recovery-2026-10-20.json)。

2026-10-20 / G11 本地 IMAP 协议：实际读取器、ImapFlow/mailparser 的 TLS 日期分页、已知 UID 去重、UIDVALIDITY 重置、半页断线拒绝/原游标重读及主机名错误登录前拒绝通过。共9项测试与类型/lint通过；首次 LIST 根目录和过早断线夹具失败保留。未使用真实邮箱/发信/模型，不写数据库；实际服务、Worker/持久化联合恢复、真实归属/摘要质量仍未验收，G11不关闭。[证据](evidence/ma24-g11-local-imap-wire-2026-10-20.json)。

2026-10-20 / MA24 G01/G02 批处理提交恢复：固定 b1a5d549 正式 Worker、全新159/TLS实库两种提交故障通过。真实COMMIT丢确认保留单份回执；最终UPDATE成功但COMMIT未送达则费用/调用/终态/事件回滚，原90秒租约自然到期后新token保存一次，后续空Worker快照不变。共享代理定时派发双分支回归通过，3次合成状态GET、0真实提供方调用，临时资源清理，类型/lint/语法通过。仅关闭本地提交恢复工程检查，G01–G13仍未整体完成。[证据](evidence/ma24-g01-batch-worker-commit-2026-10-20.json)。

2026-10-20 / MA24 G01/G02：固定b1a5d549同源Web/Worker构建与全新159实库批处理验证通过。正式Worker真实TLS GET本地合成状态、正常保存、最终UPDATE等待中SIGKILL137后快照回滚、原90秒租约到期后新token恢复、费用观察唯一及空Worker快照不变通过。取消任务未恢复，3次合成状态GET、0真实提供方调用，资料/容器/网络/证书卷清理；类型/lint/语法通过。测试保留网关与TLS校验，不等于真实提供方、模型质量、支付准入或COMMIT丢确认验收。[证据](evidence/ma24-g01-batch-worker-crash-2026-10-20.json)。

2026-10-20 / MA24 G01/G02 批处理回执：已复现并修复终态失败但费用回执提交的分事务缺陷。28项回归、类型/lint及全新159实库原子回滚、真实90秒poll租约接管/旧响应拒绝、进行中/终态/重复/冲突与取消且停用账号迟到回执通过，0真实提供方调用，资源清理。范围为源码与合成状态传输；旧6255598f Web仅验HTTP兼容，含修复Worker、进程/提交丢确认、真实提供方和质量仍待验。[证据](evidence/ma24-g01-batch-settlement-2026-10-20.json)。

2026-10-20 / MA24 G01/G02 定时派发COMMIT：固定6255598f实际Worker在全新159/TLS库的真实COMMIT完成/idle确认丢失后保留已提交任务；成功UPDATE后阻断COMMIT则回滚，租约自然到期后仅派发一份任务。后续空Worker逐行快照不变；共享代理旧主任务提交双分支回归通过，协议失败0，类型/lint/语法通过，0模型，临时资源清理。恢复任务因夹具关闭API而partial；首次模型、提供方、生产与质量仍缺。[证据](evidence/ma24-g01-schedule-worker-commit-2026-10-20.json)。

2026-10-20 / MA24 G01/G02 定时派发：固定6255598f同源Web/Worker已构建，在全新159/TLS库的实际派发UPDATE等待中SIGKILL137，无未提交任务碎片或残留事务；原租约自然到期后新token恢复单份任务，后续空Worker无新增记录。最终partial来自夹具有意关闭API，0模型；资源清理、类型/lint通过。此为新镜像提交前中断分支，COMMIT丢确认和真实模型仍缺。[证据](evidence/ma24-g01-schedule-worker-crash-2026-10-20.json)。

2026-10-20 / MA24 G01/G02：定时派发分事务遗留任务已实库复现并修复，入队与定时完成记录现在原子保存并最终核对租约墙钟。24项回归、类型/lint、全新159实际数据库的失败/取消/真实60秒租约过期回滚与恢复、一次/间隔/并发和停用/账号列表边界通过。源码调用未执行排队任务，0模型，临时账号/资料/集群清理；旧固定Web仅验HTTP兼容，新Worker镜像、进程死亡和未知提交仍待验。[证据](evidence/ma24-g01-atomic-schedule-dispatch-2026-10-20.json)。

2026-10-20 / MA24 G01 固定558a7598：同源Linux Web/主运行构建与完整性通过，三种初始认领网络黑洞约20秒回滚退出，正常空队列通过。全新159/真实API及编译Worker的有效/撤回来源合成检查点任务、Web HTTP账号边界通过；0模型/外部动作，临时资源清理。首次LF/CRLF比较失败和修复后的精确归档比对保留，不授予首次模型、真实派发/提供方、生产或质量资格。[证据](evidence/ma24-g01-fixed-preclaim-image-2026-10-20.json)。

2026-10-20 / MA24 G01：初始 Worker 数据库期限已实现，19 项回归、类型/lint、真实源码 Worker 在批处理/定时/主任务空认领的三种网络黑洞与正常网络对照通过；故障约 20 秒退出，无本次认领提交或残留事务，临时资源清理，0 模型。范围为一次性合成数据库与源码 Worker，固定 Linux 镜像、实际业务派发、全入口及生产质量仍未验。[收据](evidence/ma24-g01-preclaim-database-deadline-2026-10-20.json)。

2026-10-19 / MA24 G13 扩展页面联验通过：固定 4a1ee07f Linux 镜像、全新 HTTPS/153 隔离库中，四套邮箱加六套附件/任务历史/版本历史/管理区/JSON/非邮件审批，共十套合成账号场景退出 0。实际核对跨账号附件任务拒绝、两条追加要求、两份停用草案、部分拒绝/冲突状态；真实模型、Worker、二进制资料真实性和批准后外部执行未验。类型/lint 和回环 TLS 例外范围检查通过，临时服务清理。[收据](evidence/ma24-g13-current-extended-ui-2026-10-19.json)。

2026-10-19 / MA24 G09：固定 `45d5e9b3` 的完整五类签名联验退出 0，包含近期记忆来源、图谱和流式修复；CLI/同冻结材料/持锁重建/传输复核通过，缺失人工判定仍阻断。该结果早于首页首帧修复，不授予生产、质量或自动启用资格，实际模型调用 0。[收据](evidence/ma24-g09-signed-composition-45d5e9b3-2026-10-19.json)。

2026-10-19 / MA24 G13 当前邮箱 UI 扩展验收通过：首次 e36ac0f5 的已登录首页 React 418 保留为失败记录；稳定问候首帧后的固定 4a1ee07f 镜像构建、949 运行源码导出比对及 HTTPS/153 隔离库四套抽屉/批量/同步/阅读区重验退出 0，原页错误断言未放宽。类型/lint 通过，已查看手机抽屉与长邮件截图。仅合成账号、部分失败和排队/阅读状态，不等于真实邮箱、模型学习或 G13 全体验收；临时服务清理，未部署。[记录](evidence/ma24-g13-current-mailbox-ui-2026-10-19.json)。

2026-10-19 / MA24 G09：原件身份校验快照 `e2891a90` 的完整签名五类联验已退出 0，CLI 签发、持锁重建及传输复核通过，缺失人工判定仍阻断。模型/网络/预算合成，调用 0；后续 G03/G04/G12 不在该快照，当前 Linux Web 验收另记，生产认证/真实质量/最终启用未完成。[收据](evidence/ma24-g09-signed-composition-e2891a90-2026-10-19.json)。

2026-10-19 / MA24 G01、G13 当前 Linux 候选：固定 `e36ac0f5` 镜像构建通过，949 运行源码与固定 Git 导出逐字节一致，未打包私有环境/存储文件。实际全新数据库至迁移 153、独立受限登录、HTTPS 浏览器和十合成账号并发隔离通过；只覆盖登录/会话/手动公司读写等入口，未覆盖邮箱、资料、完整模型任务或审批。临时服务/网络清理，未部署。[收据](evidence/ma24-g01-current-linux-web-2026-10-19.json)。

2026-10-19 / MA24 G12：流身份漂移和 finish 后的有效增量现拒绝，保留空内容末尾用量帧。57 项测试、类型/lint、三模式 12 组隔离数据库/本机 SSE 的失败保存、未知开始阻断及成功回读复用通过，外部/模型调用 0。未覆盖真实提供方、完整业务图或生产加载。[收据](evidence/ma24-g12-stream-identity-recovery-2026-10-19.json)。

2026-10-19 / MA24 G04：投影活跃账号/租约复核及后台失败退避实现，10 项测试、类型/lint 通过。新合成账号的本机 Graphiti/Neo4j 与固定本地嵌入模型实测通过纠正、历史时点、撤销不复活及 PostgreSQL 降级；两次实际投影，云端调用 0，夹具清理。Worker 重试证据来自模块夹具，真实连续采集、业务质量、生产认证仍待验。[收据](evidence/ma24-g04-local-graph-sequence-2026-10-19.json)。

2026-10-19 / MA24 G03：普通本地抽取在存储事务前后重核账号、主任务和用户消息，变化拒绝并回滚，租约准入/完成使用五分钟墙钟窗口。32 项单测、类型/lint、隔离库四种来源变化与恢复重试通过；既有显式/自然消息纠正矩阵复跑通过。模型为合成适配器，来源锁全程保护、真实抽取质量、G03 总体验收仍未完成。[收据](evidence/ma24-g03-local-memory-source-recheck-2026-10-19.json)。

2026-10-19 / MA24 G09 原件身份：附件及知识原件回执统一使用稳定描述符/当前路径身份校验。67 项回归、类型/lint 通过，真实文件系统的同路径替换在两个消费入口均拒绝；DB 元数据为夹具。固定 f3d2623e 完整组合不含此修改，新快照待验；不可变存储、生产与最终启用继续待办。[收据](evidence/ma24-g09-source-file-identity-2026-10-19.json)。

2026-10-19 / MA24 G11 Worker 恢复：迁移 153 的批次/任务租约绑定、旧批次限定回收、导入末尾租约检查及已提交批次统计恢复已实现。35 项定向测试、类型/lint、实际终止 Worker 后重新认领并完成固定日期范围的三封合成邮件、旧租约写入拒绝通过；原启动/断开矩阵复跑通过。IMAP 读取为合成适配器，真实服务器、质量和生产仍未验。只在隔离库安装 153，旧发布包不含本次修改。[收据](evidence/ma24-g11-mailbox-worker-recovery-2026-10-19.json)。

2026-10-19 / MA24 G09：固定 `f3d2623e` 完整签名五类组合退出 0，CLI 签发、材料锁内重建、2 条原任务/8 条评测臂传输复核和禁钥拒绝通过；缺失人工判定仍阻断。合成模型/网络/预算，真实调用 0。此快照不含后续邮箱修改，真实质量、生产认证和最终启用仍未验收。[收据](evidence/ma24-g09-signed-composition-f3d2623e-2026-10-19.json)。

2026-10-19 / MA24 G11、MAILCRM-02：同步启动在连接锁内复核状态，导入先检查当前连接及同账号/连接的运行任务。22 项定向测试、类型/lint、隔离数据库连接锁等待后禁用拒绝、并发唯一入场、断开/删除拒绝及失效导入不推进游标通过。实际导入仅为空消息夹具，真实 IMAP 日期/分页/恢复及业务质量继续待验。[收据](evidence/ma24-g11-mailbox-sync-admission-2026-10-19.json)。

2026-10-16 / MA24 G01：Linux Web 加全新恢复库完成两合成成员登录和单条手动公司写入/回读；另一成员工作区不可见、直接修改返回 404，原记录未变，付费预留 0。[业务收据](evidence/ma24-g01-linux-fresh-db-two-member-lead-2026-10-16.json)。只验证一条本机业务路径；目标云环境、可信 HTTPS、真实团队成员和完整租户隔离仍待验。

2026-10-16 / MA24 G01：Linux Web 与全新恢复库组合通过单个合成成员登录、认证会话、空上传列表、退出失效及 Secure/HttpOnly/SameSite=Lax Cookie 头检查；合成账号和会话剩余 0。[登录收据](evidence/ma24-g01-linux-fresh-db-synthetic-login-2026-10-16.json)。目标可信 HTTPS、真实团队成员隔离、业务写入及线上回滚仍未验。

2026-10-16 / MA24 G01：Linux standalone Web 与全新 PostgreSQL 容器中的 ACL 归档恢复库联合运行，受限应用账号下首页/会话 GET 200，未登录上传 GET 401，容器清理。[联合收据](evidence/ma24-g01-linux-fresh-db-integrated-smoke-2026-10-16.json)。仅覆盖本机最低服务组合；真实账号、业务写入、HTTPS、云端和实际回滚未验。

2026-10-16 / MA24 G01：迁移后含 ACL 的归档在未开放公网端口的全新本机 PostgreSQL 16/pgvector 容器直接恢复成功，预置受限全局角色后 8 个阶段标记、关键 ACL/RLS 和应用登录角色读取通过；采集角色不可由应用登录角色切换。[新集群恢复收据](evidence/ma24-g01-fresh-cluster-restore-2026-10-16.json)。目标云主机恢复、真实团队数据迁移决定和实际回滚仍待验。

2026-10-16 / MA24 G01：提交 `7d7acf39` 在本机 Docker Linux/Node 24 中完成独立生产构建和类型检查，生成的 standalone 包在本机受限应用数据库账号下通过首页与匿名会话 GET 200。[Linux 收据](evidence/ma24-g01-linux-standalone-local-smoke-2026-10-16.json)。目标云主机、HTTPS、真实成员、业务写入、worker 及回滚未验收。

2026-10-16 / PILOT-01、PILOT-02：用户确认新托管、首批主要从中国大陆访问、同时使用 10 人以内；目前没有备案域名，首批只用全新测试数据，真实应用阶段需要真实业务数据。试用主机应从空库初始化，后续真实数据迁移另行确定范围并验收。本机一次性空库的 001–135 迁移、受限应用角色、零真实用户/文档及重复初始化拒绝通过；两个合成成员由实际建号命令通过受限连接创建，密码验证与手动公司服务层隔离通过。本机生产包的回环 HTTP 双账号登录、公司新增/回读、跨账号拒绝和退出通过；自签 HTTPS 代理后的浏览器登录、导航、虚构公司写入/回读及退出也通过。合成试用库在同一 PostgreSQL 集群归档恢复后，受限应用权限、密码和跨账号可见性复验通过；另在全新本机 PostgreSQL 容器从零配置角色后重复空库迁移、建号、隔离及同容器恢复。当前 Linux 试用镜像已从干净提交构建并检查包内边界，但尚未连接新试用库。跨集群迁移与目标云主机仍未验。香港近端节点仍需从团队网络实测，云账号和试用域名未定。这不是线上部署或真实数据迁移验收。[实施单](TEAM_PILOT_NEW_HOSTING_2026-10-16.md)、[空库收据](evidence/ma24-g01-fresh-pilot-schema-2026-10-16.json)、[新集群收据](evidence/ma24-g01-fresh-pilot-new-cluster-2026-10-16.json)、[镜像收据](evidence/ma24-g01-current-pilot-linux-image-2026-10-16.json)。

2026-10-16 / MA24-18：当前 `layout-v2.0.10` 将 IEEE 2014 教程第 54、58、59、60 页的四个原生表格改为待审。原页核对后，隔离克隆保存并回读 133/133 项判决；第 59 页错误行关联被排除，另三表按限定原文保留。完成登记后第 5、22 页原文和幻灯片/块坐标读取、跨账号拒绝通过，合成记录清理。未验证真实用户的模型回答或生产加载，仍只作 PPTX 读取与引用工程验收，不计独立 Gold。[回归收据](evidence/ma24-g05-ieee-gepof-native-line-tables-current-clone-2026-10-16.json)。

2026-10-16 / MA24 G01：迁移后本机备份现在包含 ACL；一次性库完整恢复验证 8 个阶段标记、应用/采集角色权限及关键强制 RLS，旧版和候选版 Web 直接用恢复库通过合成登录及上传接口冒烟，未补拷现有数据库权限。[恢复收据](evidence/ma24-g01-postmigration-acl-backup-2026-10-16.json)。新主机角色/凭据配置、真实团队入口、切换前新备份和实际回滚仍待验收；不将本机恢复视为团队上线。

2026-10-16 / MA24 G14：FCC Thirteenth MBA 2022 候选的一题在用户内容确认后，通过原报告目标页、隔离产品证据、FCC 2026 不同发布家族题义及当前公开暴露闸门的有界终审，作为 **1 个私有独立 Gold 来源单元**批准。Source/Gold 快照和精确坐标仅保存在 Git 忽略隔离区，公开只留哈希。[家族判决](evidence/ma24-g14-fcc-mba-family-gold-disposition-2026-10-16.json)。完整题集、模型可见引用、G15 调用准入与 G16 双路质量未验。

2026-10-16 / MA24 G14：Glasgow 5G 小型 XLSX 候选的两天目标行按原件重筛各 2 条，原格和 Decimal 计算一致，Zenodo v2 文件 MD5、许可标注及现行公开暴露检查完成。候选只比较一个地点/设备/运营商的 4 次采样，网络全市推断限定已送用户逐题确认。[审核收据](evidence/ma24-g14-glasgow5g-per-case-source-review-2026-10-16.json)。用户回复、来源家族独立性、用户可见引用与正式 Gold 仍待验；G15/G16 未放行。

2026-10-16 / MA24 G05：超过现有 200 万字符登记上限的工作簿，上传任务现会记录 `extracted-content-too-large`，资料页明确提示拆分后重传。使用已退出独立题池的 Findex 原件在隔离克隆验证失败码、无发布文档及清理，10 项相关回归、类型和 lint 通过。[工程收据](evidence/ma24-g05-large-workbook-capacity-error-2026-10-16.json)。容量上限未变，大工作簿仍无法单件登记；生产用户界面与 G05 整体质量仍待验收。

2026-10-16 / MA24 G14：World Bank Findex 2025 私有 XLSX 四表离线抽取成功，目标原格在抽取物中存在；但两次 MA11 隔离上传均为 `failed`。按产品现有正文序列化函数实测注册正文 **11,460,342 字符**，超过当前 **2,000,000 字符**注册上限；worker 只持久化通用 `Error`，不声称已捕获其内部异常。[容量判决收据](evidence/ma24-g14-worldbank-findex-product-capacity-disposition-2026-10-16.json)。该来源退出本轮独立 Gold 候选，保留私有容量回归材料；独立 Gold 0，G15 关闭，G16 双路 0，G17–G20 暂停。

2026-10-16 / MA24 G14：Glasgow 5G 私有 XLSX 的四表离线产品抽取成功；MA11 隔离克隆真实上传后可检索，两张目标日表的 2 个证据块、10 个原格和来源绑定坐标回读一致，跨账号检索/读取拒绝，合成用户、任务、文档与上传目录清理归零。[产品回读收据](evidence/ma24-g14-glasgow5g-product-readback-2026-10-16.json)。仅通过产品读取链；生成答案、用户可见引用、逐题内容、家族独立性与正式 Gold 未验。独立 Gold 0，G15 关闭，G16 真实双路 0；G17–G20 暂停。

2026-10-16 / MA24 G16：实际双路执行函数现在直接在付费准入、任务认领和模型执行前校验冻结题面与具辨识度答案的公开暴露；绕过专用 CLI 调用执行函数也会拒绝受污染输入。执行器 19 项测试（含前置拒绝）、类型、定向 lint 和 G15 306 文件源码闭包通过。[工程收据](evidence/ma24-g16-runner-public-exposure-boundary-2026-10-16.json)。仍未完成 G14 独立 Gold、G15 付费准入或 G16 真实双路质量；G17–G20 暂停。

2026-10-16 / MA24 G15/G16：专用成对入队与逐题执行 CLI 现于写入/认领前逐题核冻结题面和具辨识度的 Gold 答案在当前 Git 跟踪文本及本地历史中的公开精确暴露，当前文本还核规范化整段命中；简短通用回答不单独判为暴露，Git 缺失或错误拒绝。隔离 Git 正反例、当前三个私有候选正例与已公开五题负例、G15 306 文件源码闭包、类型和定向 lint 通过。[工程收据](evidence/ma24-g15-g16-public-exposure-preclaim-gate-2026-10-16.json)。语义/家族及远端暴露仍需 G14 审核；完整 Gold 0，G15 付费准入关闭，G16 真实双路 0；G17–G20 暂停。

2026-10-16 / MA24 G14：FCC MBA、World Bank Findex 与 Glasgow 5G 三个私有新来源候选组成仅题面的临时题集，按当前 3,043 个跟踪文本和本地 Git 历史完成完整题面精确暴露筛查；各题答案另行精确筛查，完整题/答案命中均为 0。FCC/Findex 的通用片段仍有命中，语义、家族、来源许可、逐题内容、产品引用与整套覆盖未因此通过。[预检收据](evidence/ma24-g14-new-three-candidate-exposure-preflight-2026-10-16.json)。独立 Gold 0，G15 付费准入关闭，G16 真实双路 0；G17–G20 暂停。

2026-10-16 / MA24 G14：用户确认 FCC MBA 私有 v2 单题的答案与限定，决定 `MA24-23` 已绑定候选、原件及 Git 忽略的精确值回复收据哈希。[公开元数据收据](evidence/ma24-g14-fcc-mba-v2-user-answer-confirmation-2026-10-16.json)。该决定只完成逐题内容确认；来源家族独立性、正式独立 Gold、模型可见引用和 G16 真实双路质量仍待验。可冻结 Gold 0，G15 付费准入关闭，G16 真实双路 0；G17–G20 暂停。

2026-10-16 / MA24 G14：新增私有完整题集的冻结前公开暴露预检，已公开 5 题负例被拒，新 FCC 单题正例通过。[工程收据](evidence/ma24-g14-private-source-set-exposure-gate-2026-10-16.json)。该检查不覆盖语义改写、来源家族、远端暴露或 G15 运行时准入；完整 Gold 与 G16 真实双路仍待验收，G17–G20 暂停。

2026-10-16 / MA24 G14：FCC MBA 私有 v2 题目完成原页坐标、完整题文/答案的公开 Git 精确筛查以及与现有 FCC 2026 家族资料的有界比较；保留候选准备会话接触完整内容的限制。[审核准备收据](evidence/ma24-g14-fcc-mba-v2-family-readiness-2026-10-16.json)。逐题内容、整套独立 Gold、G15 付费准入和 G16 真实质量仍未验收，G17–G20 暂停。

2026-10-16 / MA24 G14：FCC MBA 新候选的 62 条页级视觉判决在隔离数据库完成保存与回读，私有检索树及 6 处目标证据可读，异账号拒读，合成记录已清理。[隔离回放收据](evidence/ma24-g14-fcc-mba-full-review-clone-2026-10-16.json)。此项验收限于产品资料读取链，未产生独立 Gold、付费模型回答或 G16 双路质量结果；G17–G20 暂停。

2026-10-16 / MA24 G14：FCC MBA 新候选 PDF 已完成全部 65 个物理页原尺寸视觉检查，62 个待视觉复核页的图表/表格存在性分类与原件图片哈希封存。[原件复核收据](evidence/ma24-g14-fcc-mba-original-size-visual-review-2026-10-16.json)。此阶段只完成来源检查；产品页级判决、引用、候选答案、独立 Gold 与 G16 真实双路质量仍待验收，G17–G20 暂停。

2026-10-16 / MA24 G15：专用评测领取前增加标准模式三后备路由的实际计费规则覆盖检查，并在模型/工具边界重核；缺项、过期、请求字节/输出上限不足及其他业务合同反例由 21 项定向测试覆盖。[工程收据](evidence/ma24-g15-preclaim-tariff-coverage-2026-10-16.json)。现行规则三路均为 0，v30 只读闭包匹配但 `readyForModelCalls=false`；完整 Gold、真实账号/运行包、费率规则、限额授权和 G16 双路质量待验，G17–G20 暂停。

2026-10-16 / MA24 G15：当前只读配置的三模型 OpenRouter 目录价及 41 个端点报价已取得并锁定响应哈希；目录报价不能覆盖所有端点及 GPT-6.1 Sol 长输入分档。[费率面收据](evidence/ma24-g15-public-openrouter-tariff-surface-2026-10-16.json)。尚未核最终路由、账号条款和限额，也没有付费授权或模型调用；`providerTariffsVerified=false`，G17–G20 暂停。

2026-10-16 / MA24 G14：NIST MAT 字段候选在隔离克隆完成工作簿可检索注册、来源树授权回读和 12 个原格核对，跨账号拒读。[回读收据](evidence/ma24-g14-nist-mat-isolated-readback-2026-10-16.json)。这只证明产品读取该证据块；逐题内容、整组独立性、用户可见引用和 Gold 冻结未通过，批准 Gold 仍为 5 题，G17–G20 暂停。

2026-10-16 / MA24 G15/G16：专用运行器增加 BGE 固定模型健康检查及 `knowledge_search` 降级失败结算；20 项定向测试、类型/lint 与本机健康探针通过。[工程收据](evidence/ma24-g15-g16-bge-degradation-gate-2026-10-16.json)。当前 v29 仍只读模拟，旧隔离包需按最终源码重建；独立 Gold、付费准入和真实双路质量尚未验收，G17–G20 暂停。

2026-10-16 / MA24 G01 当前源码 `81e44b14` 的隔离 Next 16.3.4 生产构建、追踪依赖、无环境文件独立包和 3031 本机三路状态冒烟通过。[构建收据](evidence/ma24-g01-81e44b14-current-isolated-package-2026-10-16.json)。这只验本地包可运行；生产加载、G14 独立 Gold、G15 非模拟准入和 G16 真实双路质量仍待验，G17–G20 暂停。

2026-10-16 / MA24 G15：新增私有冻结配置加载入口，并在现场重算预览上核代码、提示词、模型路由、工具臂、日期及 BGE 开关身份；默认仍为只读模拟，公开路径与漂移拒绝。33 项定向测试及私有未就绪配置检查通过。[工程收据](evidence/ma24-g15-private-admission-loader-2026-10-16.json)。本项仅补上代码可达性，来源/Gold、构建、费率、限额、用户授权和 G16 真实质量仍待验；G17–G20 暂停。

2026-10-16 / MA24 G16 专用执行器原先仅有显式认领的 90 秒租约，长达 120 秒的单次模型调用可能使租约过期。现已接入每 20 秒续租、失败边界拒绝和结算前停止；100 秒模拟调用及隔离 PostgreSQL 克隆的有效/过期租约反例通过。[验收收据](evidence/ma24-g16-evaluation-lease-heartbeat-2026-10-16.json)。这只验工程租约路径；G14 Gold、G15 非模拟准入和真实双路答案/引用仍未通过，G17–G20 暂停。

2026-10-16 / MA24 G14 FCC 全篇新版决定与隔离回放：178 页原尺寸页型审核汇总为 **122 页视觉证据、56 页装饰、0 页未决**；物理第 76 页改为仅保留成功抽取的脚注文字。[新版清单](evidence/ma24-g14-fcc-706-whole-pdf-visual-final-review-v2-2026-10-16.json)。MA11 合成私有账号完成 178 条审核保存和回读、资料树注册与第 28 页原图引用读取，另一账号被拒，合成记录清理归零。[隔离回放收据](evidence/ma24-g14-fcc-706-full-review-v2-clone-2026-10-16.json)。此项只证明 FCC 来源的页级工程链路，未完成逐格数字、长题 Gold、整套独立性、G15 付费准入或 G16 真实双路质量验收；G17–G20 暂停。

2026-10-16 / MA24 G14 FCC 附录原尺寸复核第 3 批：最后 36 页均已按原图哈希逐页复核，25 页为 A-5 县级表格续页，11 页为 A-6/A-7/A-8/A-11–A-16/A-18–A-20 统计表，均保留视觉证据提案。[第 3 批收据](evidence/ma24-g14-fcc-706-original-size-appendix-batch3-2026-10-16.json)。原先仅经联系表判断的 89 页现在全部完成原尺寸页型复核；第 76 页是唯一在本轮发现的改判。下一步汇总全篇新版决定和隔离产品回放。数字单元格及原件可能存在的重复值仍须按具体题目另核，G17–G20 暂停。

2026-10-16 / MA24 G14 FCC 附录原尺寸复核第 2 批：物理第 98–111、113–127 页共 29 页已逐页查看原尺寸渲染并绑定原图哈希，均为 Appendix A-5 县级表格续页，保留视觉证据提案。[第 2 批收据](evidence/ma24-g14-fcc-706-original-size-appendix-batch2-2026-10-16.json)。连同第 1 批，原先仅经联系表判断的 89 页中已有 53 页复核，仍余 36 页；第 76 页的修正继续有效。此处只审核页级结构，未逐格确认数字；全篇新决定和产品回放待剩余复核后再做，G17–G20 暂停。

2026-10-16 / MA24 G14 FCC 长报告附录原尺寸复核第 1 批：此前仅联系表判断的 24 页（物理第 68–95 页中的指定页）逐页核原渲染与哈希，23 页确认存在 A-1/A-3/A-4/A-5 表格；第 76 页实际上只有前页来源脚注尾句，成功抽取文字已保留，须把原“视觉证据”提案改为“装饰”。[修正收据](evidence/ma24-g14-fcc-706-original-size-appendix-batch1-2026-10-16.json)。仍有 65 页仅经联系表判断，旧版 123 证据/55 装饰及先前隔离回放仅作为历史记录，不能代表当前最终判决；FCC 正式长题与整组 Gold 仍未冻结，G17–G20 暂停。

2026-10-16 / MA24 G14 DBS 隔离产品回放：官方更正版年报在 MA11 合成账号回放库中完成 151 条页级审核决定保存与回读（67 视觉证据、84 装饰），随后可注册为私有可检索资料树。物理第 7 页更正文字与第 41 页图 2 分别按原块坐标回读，另一账号读取两者均被拒；合成记录清理归零，模型调用 0。[隔离回放收据](evidence/ma24-g14-dbs-full-review-clone-2026-10-16.json)。这证明该来源的产品工程路径，冲突题仍待用户逐题审核与家族独立性终审；整组 Gold、G15 付费准入和 G16 真实双路质量仍未完成，G17–G20 暂停。

2026-10-16 / MA24 G14 DBS 全篇页级决策清单：九批原尺寸提案与官方原件、抽取产物、渲染图逐页哈希绑定，151 个待审块恰好覆盖且无重复，**67 页保留视觉证据、84 页排除独立视觉内容**。其中 3 页纯装饰照片无文字层，其他拟排除页已核成功文字与 PDF 文字层词数一致。第 41 页图 2 的旧年份数值关系保留，并须与第 7 页更正单联读。[页级决策清单](evidence/ma24-g14-dbs-whole-pdf-visual-page-decisions-2026-10-16.json)。清单只供隔离产品保存与回读，尚未作为产品决定、Gold 或 G15/G16 验收；G17–G20 暂停。

2026-10-16 / MA24 G14 DBS 年报页级审核第 9 批：最后 7 个待审视觉块（物理第 149–155 页）经原尺寸复核，均提出保留财务附注表格视觉证据；第 151–152 页同一准备金附注跨年度延续，第 150 页比较年度表头原印为 `2023-22`，与上下文不一致，须保留原文并另行判断。[第 9 批提案](evidence/ma24-g14-dbs-visual-proposals-part9-2026-10-16.json)。至此 **151/151 个待审视觉页完成页级提案**，待审页为 0；这仍不是隔离产品保存回读、冲突题 Gold 或 G15/G16 真实验收，G17–G20 暂停。

2026-10-16 / MA24 G14 DBS 年报页级审核第 8 批：物理第 131–148 页的 18 个待审视觉块经原尺寸复核，提出 **12 页保留财务报表、业绩义务及资产附注表格视觉证据，6 页仅保留已成功抽取文字**；后者文字词数逐页与 PDF 文字层一致。资产附注第 145–146 与 147–148 页分别跨页延续同一资产类别列；原页有疑似不一致的日期标签，提案保留原文，尚未作纠正性解释。[第 8 批提案](evidence/ma24-g14-dbs-visual-proposals-part8-2026-10-16.json)。累计 144/151 页有提案，剩余 7 页；产品保存回读、冲突题 Gold 与 G15/G16 真实验收仍未完成，G17–G20 暂停。

2026-10-16 / MA24 G14 DBS 年报页级审核第 7 批：物理第 113–130 页的 18 个待审视觉块经原尺寸复核，提出 **10 页保留人员统计、费用与工时表格视觉证据，8 页仅保留已成功抽取文字**；后者成功文字词数逐页与 PDF 文字层一致。第 117–120 页的同名表格分别对应 2024–25 和 2023–24 年度，第 124 页两个表格使用不同申请量口径，后续引用须保留这些关系。[第 7 批提案](evidence/ma24-g14-dbs-visual-proposals-part7-2026-10-16.json)。累计 126/151 页有提案，剩余 25 页；产品保存回读、冲突题 Gold 与 G15/G16 真实验收仍未完成，G17–G20 暂停。

2026-10-16 / MA24 G14 DBS 年报页级审核第 6 批：物理第 95–112 页的 18 个待审视觉块经原尺寸复核，提出 **7 页保留薪酬、养老金及人员统计表/图，11 页仅保留已成功抽取文字**；后者成功文字词数逐页与 PDF 文字层一致。物理第 103–104 页的董事薪酬表跨页排版，姓名及薪酬行须与后页养老金、福利和总额列对齐，不能作为两个独立表解释。[第 6 批提案](evidence/ma24-g14-dbs-visual-proposals-part6-2026-10-16.json)。累计 108/151 页有提案，剩余 43 页；产品保存回读、冲突题 Gold 与 G15/G16 真实验收仍未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 DBS 年报页级审核第 5 批：物理第 77–94 页的 18 个待审视觉块经原尺寸复核，提出 **5 页保留表格/风险矩阵、13 页仅保留已成功抽取文字**；后者成功文字词数逐页与 PDF 文字层一致。第 80 页董事会与委员会出席矩阵、第 84 页风险等级说明、第 85 页战略风险表、第 86 页风险矩阵及第 92 页内部审计结果与等级说明均须保留结构关系。[第 5 批提案](evidence/ma24-g14-dbs-visual-proposals-part5-2026-10-15.json)。累计 90/151 页已有提案，剩余 61 页；产品保存回读、冲突题 Gold 与 G15/G16 真实验收仍未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 DBS 年报页级审核第 4 批：物理第 59–76 页的 18 个待审视觉块经原尺寸复核，提出 **5 页保留实质图表/结构图、13 页仅保留已成功抽取文字**；后者成功文字词数逐页与 PDF 文字层一致。第 59 页收支类别与数额、第 62–63 页环境绩效跨年表、第 70 页董事会组成图和第 72 页治理结构图需保留视觉关系。[第 4 批提案](evidence/ma24-g14-dbs-visual-proposals-part4-2026-10-15.json)。累计 72/151 页已有提案，剩余 79 页；产品判决保存、冲突题 Gold 及 G15/G16 真实验收仍未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 DBS 年报页级审核第 3 批：物理第 41–58 页的 18 个待审视觉块经原尺寸复核，提出 **8 页保留图表或表格视觉证据、10 页仅保留已成功抽取文字**；后者成功文字词数逐页与原 PDF 文字层一致。第 41 页图 2 仍把 Basic checks 的两个年度数值标为旧归属，必须与物理第 7 页 Correction 2 一同用于冲突题解释和引用。此为来源绑定提案，尚未写入产品判决。[第 3 批提案](evidence/ma24-g14-dbs-visual-proposals-part3-2026-10-15.json)。累计已提案 54/151 页，剩余 97 页；冲突题 Gold、G15/G16 实际运行仍待验，G17–G20 暂停。

2026-10-15 / MA24 G14 DBS 年报页级审核第 2 批：物理第 23–40 页的 18 个待审视觉块均经原尺寸复核，提出 **9 页保留表格视觉证据、9 页仅保留已成功抽取文字**。前者包括四项战略目标的承诺与完成情况表，以及第 38 页的 11 项公开服务标准表；后者的成功文字词数逐页与 PDF 文字层一致。这是页级提案，尚未写入产品判决。[第 2 批提案](evidence/ma24-g14-dbs-visual-proposals-part2-2026-10-15.json)。累计已提案 36/151 页，剩余 115 页；冲突题引用、Gold、G15/G16 实际运行仍待验，G17–G20 暂停。

2026-10-15 / MA24 G14 DBS 年报页级审核第 1 批：物理第 1–22 页的 18 个待审视觉块均经原尺寸复核，提出 **4 页保留视觉证据、14 页仅保留已成功抽取文字**；后者成功块词数逐页与 PDF 文字层一致，但词数不证明顺序或语义。第 14 页数据概览的格内数值未抽出，不能标作装饰；第 17 页图 1 须连同物理第 6 页 Correction 1 解释。物理第 7 页 Correction 2 数值文字块已核完整。[第 1 批提案](evidence/ma24-g14-dbs-visual-proposals-part1-2026-10-15.json)。还剩 133 个待审页块；这只是提案，产品保存判决、冲突题引用与 Gold 尚未验收，G15/G16 真实运行未解锁，G17–G20 暂停。

2026-10-15 / MA24 G14 DBS 更正冲突题的 157 页年报已完成 **151 个待审视觉页**的原件绑定渲染与 17 张页码联系表巡检；66 页可见实质图表、表格、矩阵或组织图，保守列为视觉证据候选，其余 85 页仍待原尺寸判断。目标物理第 7 页 Correction 2 与第 41 页图 2 已再按原尺寸核对：前者要求交换 2021–22 / 2022–23 的 Basic checks 数值，后者仍显示旧归属。[全页分诊收据](evidence/ma24-g14-dbs-whole-pdf-visual-triage-2026-10-15.json)。这只是分诊，最终逐页判决、隔离产品保存/引用、逐题用户回复和 Gold 均未完成；G15/G16 真实运行不因此解锁，G17–G20 暂停。

2026-10-15 / MA24 G15 标准模式三条 OpenRouter 路由的公开费率与现行请求体只读核对：Sonnet 5.5、GPT-6.1 Sol、Kimi K3 页面均列出价格，但当前产品未在发送前固定具体提供方，Kimi 的多提供方价格不同；缓存等计费项和完整请求上限也不能由标题价替代。现行全局计费政策中没有三路精确已批准费率，预览仍为 `providerTariffsVerified=false`，因此不建立付费预留、不解锁调用。[只读收据](evidence/ma24-g15-standard-route-public-rate-audit-2026-10-15.json)。整套 G14 与 G16 实际双路仍未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 正式报告长题已备逐题审核：第 27–28 页原尺寸复核 2024 年约 78% 的实体与 2025 年 52% 的学生分别对应不同年份、分母和带宽门槛，第 28 页图 12 的 `Overall` 2025 年 52% 与正文一致；当前抽取块、隔离私有引用与异账号拒绝已核。[审核包](MA24_G14_FCC_706_LONG_REPORT_REVIEW_PACKET_2026-10-15.md)。它与已批准新闻稿题仍共用一个 FCC 来源单元；用户尚未逐题确认该解释题，Gold 不新增，整套 G14/G15/G16 未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 26-55 隔离产品回放：178 页原件经实际上传及 `layout-v2.0.10` worker，全部 178 条视觉判决写入并回读（123 证据、55 装饰），完成审核与私有可检索登记；第 28 页图 12 可按页回读，异账号拒绝。合成记录已清理，模型调用 0。[回放收据](evidence/ma24-g14-fcc-706-isolated-product-review-2026-10-15.json)。这是产品审核/引用工程验收，不批准 FCC 长报告题 Gold；家族独立性、整套 G14、G15 准入与 G16 实际双路质量仍待验，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 26-55 正式报告形成 178 页原件哈希绑定的保守视觉判决清单：55 个拟为文字或装饰的页面均经原尺寸复核，且每页已有成功抽取文字；123 个含图表或表格的页面一律保留视觉证据，其中 34 页经原尺寸核对、89 页仅联系表分诊，后者的具体数值和标题尚不能视为原页审核通过。[判决清单](evidence/ma24-g14-fcc-706-whole-pdf-visual-final-review-2026-10-15.json)。判决尚未在隔离产品保存和回读，FCC 长报告题不新增 Gold；G14 整套、G15 付费准入及 G16 真实双路仍未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 正式报告视觉审核第 6 批：物理第 161–172 页的 A-10 至 A-21 表格拟保留，173–178 页委员声明经原尺寸核对为文字页，提案保留其成功抽取文字；第 173 页与已批准新闻稿题共享 77% 事实，仍按同一 FCC 暴露单元。[第 6 批收据](evidence/ma24-g14-fcc-706-visual-proposals-part6-2026-10-15.json)。178/178 页已有原件绑定提案（123 证据、55 装饰），但多页仍只经联系表分诊；最终逐页复核、隔离产品保存/回读和长文档题 Gold 审核未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 正式报告视觉审核第 5 批：物理第 129–160 页为附录 A-5 县级表格尾段及 A-6 至 A-9 独立表格，32 页原件哈希绑定拟保留；第 129/144/156/157/160 页原尺寸抽查，其余联系表分诊。[第 5 批收据](evidence/ma24-g14-fcc-706-visual-proposals-part5-2026-10-15.json)。累计 160/178 页有提案，18 页未提案，尚不能声称全篇最终视觉判决或产品登记；G14 Gold/G15/G16 未通过，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 正式报告视觉审核第 4 批：物理第 97–128 页均为附录 A-5 县级覆盖率表格的续页，32 页按原件渲染哈希绑定拟保留；第 97/112/128 页原尺寸抽查，其余联系表判别，未据缩图转录具体数值。[第 4 批收据](evidence/ma24-g14-fcc-706-visual-proposals-part4-2026-10-15.json)。累计 128/178 页有提案，50 页待提案、最终逐页判决及产品保存均未完成；Gold/G15/G16 不解锁，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 正式报告视觉审核第 3 批：物理第 65–96 页的附录目录和 A-1 至 A-5 表格形成原件渲染哈希绑定提案，30 页暂定视觉证据、2 页目录文字暂定装饰；第 65/66/67/75/77/82/85/96 页另按原尺寸核对，其余按联系表分诊，不能当最终视觉验收。[第 3 批收据](evidence/ma24-g14-fcc-706-visual-proposals-part3-2026-10-15.json)。累计 96/178 页提案，产品保存判决仍为 0；G14 Gold、G15/G16 真实验收未通过，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 正式报告视觉审核第 2 批：物理第 33–64 页形成原件/当前抽取产物绑定提案，第 53–54 页跨页图 17 的表格经原尺寸核对拟保留，其余 30 页联系表未见独立视觉图表且每页有成功文字块。[第 2 批收据](evidence/ma24-g14-fcc-706-visual-proposals-part2-2026-10-15.json)。累计 64/178 页提案，余 114 页待审，产品保存判决 0；Gold 与 G15/G16 真实验收未解锁，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 正式报告视觉审核第 1 批：物理第 1–32 页形成与原件渲染哈希及当前 `layout-v2.0.10` 产物绑定的页级提案，15 页图表/表格经原尺寸复核拟保留，17 页暂定装饰且各有成功文字块；第 28 页图 12 保留。[第 1 批收据](evidence/ma24-g14-fcc-706-visual-proposals-part1-2026-10-15.json)。余 146 页尚未逐页形成提案，产品判决保存 0；来源/Gold 与 G15/G16 真实质量未验，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 178 页正式报告完成全页离线渲染及 12 张联系表分诊：123 页暂定含图表/表格、55 页暂定仅文字或装饰；原尺寸第 27/28/53 页复核，题目所用第 28 页图 12 须保留视觉证据。当前 `layout-v2.0.10` 重抽 2,584 块，与旧版在块 ID、页号、类型、文字、状态和坐标上一致。[分诊收据](evidence/ma24-g14-fcc-706-whole-pdf-visual-triage-2026-10-15.json)。尚未逐页完成最终判决或产品登记；FCC 长文档题不新增 Gold，G15/G16 真实验收仍待完成，G17–G20 暂停。

2026-10-15 / MA24 G14 ITU 长 PDF 候选补审：原件 129 页哈希及物理第 3、70、71 页重核；发布页写有“all rights reserved”，PDF 版权页写有 CC BY-NC-SA 3.0 IGO，来源用途尚未定案。旧题只要求四类维修延误因素中的至少三类，和 G16 全 Gold 来源覆盖评分不一致；私有草案改为要求四类，5 个产品证据块的页号与摘录均核对通过。[补审收据](evidence/ma24-g14-itu-gcr2025-source-use-and-four-factor-review-2026-10-15.json)。本题 Gold 未批准，完整来源暴露审计及 G15/G16 真实验收仍待完成；G17–G20 暂停。

2026-10-15 / MA24 G15/G16 财务准入：专用评测入口现在于任务认领前和运行边界拒绝 MA05/A33 阶段财务绕行及继承的费率覆盖；本地现行计费策略对 standard 三条模型路由均无精确费率规则。10 项定向测试、类型与 lint 通过，v10 只读源码预览匹配但 `readyForModelCalls=false`，模型/服务商调用 0。[工程收据](evidence/ma24-g15-financial-override-boundary-2026-10-15.json)。仍须核对费率、冻结完整 Gold 和运行构建、取得付费调用授权及真实双路质量；G17–G20 暂停。

2026-10-15 / MA24 G16 权限正例证据复核：拒绝访问题除锁定目标资产、账号 ACL 与拥有者 Gold 来源外，现在还在领取前及每次运行边界验证拥有者当前可见证据块的 Gold 摘录。17 项定向单测、类型、lint 及两账号隔离库正反例通过；证据漂移拒绝、合成行归零、模型调用 0。[工程收据](evidence/ma24-g16-permission-owner-gold-evidence-2026-10-15.json)。G15 只读预览为 v9，付费准入仍关闭；真实权限题账号、整套 Gold 和 G16 双路质量未验，G17–G20 暂停。

2026-10-15 / MA24 G14 NIST TN 2363 长 PDF 候选：官方 44 页原件哈希、物理第 18/28 页的跨章节答案边界、当前抽取证据块及隔离产品审核/私有引用已复核；现行 27 题池中其他 23 条出版资料题未见同答案，仍与已批准的 NIST 工作簿题共用一个来源暴露单元。[逐题审核包](evidence/ma24-g14-nist-tn2363-primary-question-review-2026-10-15.json)。已按 MA24-10 请求用户审核新题型；尚无回复、不新增 Gold 或独立单元，也不解锁 G15/G16。G17–G20 暂停。

2026-10-15 / MA24 G16 Gold 原始坐标准入：有答案题在领取前及运行边界，现从评测账号的 RLS 可见、当前 `ready` 证据树核对每条 Gold 的资产哈希、单元、块、表格行范围与摘录；无版本映射的 `version` 坐标暂拒。17 项定向单测、类型、lint、隔离库捏造摘录领取前拒绝及运行中证据改动拒绝通过，任务/夹具清理，模型调用 0。G15 只读预览更新至 v8 的 289 文件闭包。[工程收据](evidence/ma24-g16-live-gold-coordinate-admission-2026-10-15.json)。实际批准 Gold 的账号/资料尚未冻结，真实双路与最终用户可见引用未验；G15 付费准入关闭，G17–G20 暂停。

2026-10-15 / MA24 G16 有答案 Gold 来源准入：冻结清单中的每条 `route` Gold 引用现须在该评测账号及知识范围的资料快照中可见，资产已登记，并指向同 SHA 的 `ready` 树；不存在或失效来源在任务认领前拒绝且任务保持排队。16 项定向单测、类型、lint 和隔离库正反例通过，合成资料清理归零；G15 只读预览同步更新至 v7 的 289 文件闭包。[工程收据](evidence/ma24-g16-route-gold-source-access-2026-10-15.json)。这尚未核最终答案中的精确引用，也未执行真实双路；G15 付费准入仍关闭，G17–G20 暂停。

2026-10-15 / MA24 G15 当前运行绑定复核：历史 v4 配置预览对当前源码报 `sourceHashes drift`；只读重算 v5 后，289 文件源码闭包、当天 Prompt、模型路由与双臂工具配置绑定检查通过，默认核验入口指向 v5。[预览](evidence/ma24-g15-config-preview-2026-10-15-v5.json)、[绑定收据](evidence/ma24-g15-current-runtime-binding-2026-10-15.json)。该预览仍明确 `readyForModelCalls=false`：来源/Gold 未冻结，本地 BGE 标志、运行构建、费率及付费授权等门槛未满足；模型和提供方调用均为 0，G17–G20 暂停。

2026-10-15 / MA24 G14 ITU 长 PDF 隔离产品回放：37,223,722 字节原件经过实际上传与 `layout-v2.0.10` worker；2,322 个抽取块与离线新版逐项一致。128 张已原页核对的图页重新绑定实际产物哈希，128 条判决在隔离私有账号写入并回读（56 证据、72 装饰），完成审核派生产物、私有登记与可检索树；第 70 页图 3.6 的证据引用及异账号拒绝通过，夹具已清理。[隔离回放收据](evidence/ma24-g14-itu-gcr2025-isolated-product-review-2026-10-15.json)。这是流程验收，不代表 ITU 家族可纳独立 Gold；来源资格、整套 G14 Gold、G15 付费准入和 G16 真实双路仍未通过，G17–G20 暂停。

2026-10-15 / MA24 G14 长 PDF 上传接入：ITU 原件为 37,223,722 字节，超过原 25 MiB 二进制资料上限。上传服务、HTTP 预检和界面提示现统一为 50 MiB，仍在本地异步提取和逐对象审核后才可登记；14 项定向测试、类型检查及定向 lint 通过。本阶段只验收容量边界，ITU 128 条判决尚未写入隔离产品，登记与引用未通过，Gold/G15/G16 不因此解锁。

2026-10-15 / MA24 G14 ITU 长 PDF 整份视觉原页复核：128 个待审页块的原尺寸渲染、页号、图页哈希与抽取产物已逐项核对，形成 **56 页保留视觉证据、72 页仅保留已成功抽取文字** 的完整判决清单；后者每页至少有一个成功文字块。物理第 70 页图 3.6 保留。[最终原页清单](evidence/ma24-g14-itu-gcr2025-whole-pdf-visual-final-review-2026-10-15.json)。这是待隔离产品写入的来源审核结果，产品已保存判决仍为 0；登记、引用、家族 Gold 与 G16 真实运行未通过，G17–G20 暂停。

2026-10-15 / MA24 G14 ITU 长 PDF 视觉审核提案第 5 批：物理第 113–127、129 页的 16 个待审页块形成原件绑定提案，其中 5 页表格、地图或图示按原尺寸复核，11 页暂定装饰待原页复核；物理第 128 页为空白且不在待审视觉记录中。[第 5 批收据](evidence/ma24-g14-itu-gcr2025-visual-proposals-part5-2026-10-15.json)。至此 128/128 待审页块均有提案，产品已保存判决仍为 0；逐页最终判决、隔离登记、引用和 Gold 验收尚未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 ITU 长 PDF 视觉审核提案第 4 批：物理第 81–112 页的 32 个待审页块形成原件绑定提案，15 页实质图表、地图和表格已按原尺寸复核；17 页暂定装饰仍须原页复核。价格图的篮子容量/分母、秘鲁地区地图的地区 GDP 分母、数字技能图的农村/城市及教育层级等口径已在提案中注明。[第 4 批收据](evidence/ma24-g14-itu-gcr2025-visual-proposals-part4-2026-10-15.json)。累计提案 112/128，产品已保存判决 0；隔离登记、引用、Gold 和 G15/G16 真实验收未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 ITU 长 PDF 视觉审核提案第 3 批：物理第 49–80 页的 32 个待审页块已形成原件绑定提案，18 页图表、地图或表格按原尺寸核对，14 页仅为待原页复核的暂定装饰判断。第 70 页图 3.6 保留为实质视觉证据；候选题的 2024 年海底电缆切断次数由同页独立抽取文字支持。[第 3 批收据](evidence/ma24-g14-itu-gcr2025-visual-proposals-part3-2026-10-15.json)。累计提案 80/128 页块，产品已保存判决 0；尚未完成隔离登记、引用或 Gold 验收，G17–G20 暂停。

2026-10-15 / MA24 G14 ITU 长 PDF 视觉审核提案第 2 批：物理第 33–48 页的 16 个待审页块新增原件绑定提案，14 页图表/地图经原尺寸核对，2 页仅拟装饰；第 48 页光纤节点距离图的 25/50/100 km 色段是超过上一阈值的增量，不能当四组独立总量。[第 2 批收据](evidence/ma24-g14-itu-gcr2025-visual-proposals-part2-2026-10-15.json)。累计已提案 48/128 页块、产品已保存判决 0；仍非登记或 Gold 验收，G17–G20 暂停。

2026-10-15 / MA24 G14 ITU 长 PDF 视觉审核提案第 1 批：物理第 1–32 页的 32 个待审页块已绑定原件渲染哈希，其中第 19、20、22、31 页的图表/框架图经原尺寸复核，拟保留为视觉证据；其余 28 页仅提出装饰判定，保存前仍须逐页复核。[提案收据](evidence/ma24-g14-itu-gcr2025-visual-proposals-part1-2026-10-15.json)。尚有 96 个待审页块未提案，也未向产品写入判决或完成登记；Gold 仍为 **5 题、3 单元**，G17–G20 暂停。

2026-10-15 / MA24 G14 ITU 2025 长 PDF 候选：129 页官方原件的 128 个待审视觉页已完成原件绑定渲染与整份缩略图巡检，目标物理第 70–71 页再按原尺寸核对；第 70 页图 3.6 是实质图表，不能因题目只问该页文字就整体标为装饰。全篇图表仍须逐对象审核，尚无产品登记或引用验收。[视觉分诊收据](evidence/ma24-g14-itu-gcr2025-whole-pdf-visual-triage-2026-10-15.json)。常规事实题仍为草稿，累计私有 Gold **5 题、3 单元**；G14 整套、G15 和 G16 未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 DBS 修订年报冲突题候选：官方 157 页 PDF 已完整校验；原图（物理第 41 页、印刷第 38 页）把 2021–22 / 2022–23 年 Basic DBS checks 分别标为 2,642,272 / 2,657,121，前置 Correction 2（物理第 7 页）明确将两年归属互换。已逐页目视核对、离线抽取并完成旧 350 行与当前 24 道出版草稿的有界重复筛查。[来源审核收据](evidence/ma24-g14-dbs-correction-conflict-source-review-2026-10-15.json)。图示的年份数值配对仍需产品视觉复核，整份报告 151 页存在待审视觉对象；新冲突题型已送用户逐题审核，尚未收到本题回复。此题未入冻结 Gold，累计私有 Gold **5 题、3 来源单元**；G14 整套、G15 付费准入及 G16 真实双路均未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 NIST 工作簿数值比较题：原件 1 m、5.4 GHz 的喇叭天线自由空间与地面反射两组原格及 4.49 dB 差值复核后，按 NIST 工作簿＋TN 2363 的相连来源家族终审，批准 **1 题、1 暴露单元**私有 Gold；跨文档桥接题及其他报告题仍待审。[家族判决](evidence/ma24-g14-nist-connected-family-gold-disposition-2026-10-15.json)。累计私有 Gold **5 题、3 单元**，整套 G14 未冻结，G15 付费准入和 G16 真实双路质量未通过，G17–G20 暂停。

2026-10-15 / MA24 G14 Zenodo CanSat LoRa PPTX 候选：重算原件哈希，目视复核第 13/15 页的组件箭头及 CRC/保存顺序；38 个视觉对象已在隔离产品克隆审核、登记和按页回读，旧题与当前题池以及本地会话完成有界重叠筛查。[待冻结审核收据](evidence/ma24-g14-zenodo-lora-family-freeze-readiness-2026-10-15.json)。该图示流程题按 MA24-10 需用户审核，回复尚待记录；Gold 仍累计 **4 题、2 来源暴露单元**，G16 真实双路为 0，G17–G20 暂停。

2026-10-15 / MA24 G14 ONS 5G 工作簿 Highland 候选：重算原件 SHA-256，复核 `Notes!B4` 的室外地理面积定义和 `1!A370:C370` 的 35.2；四表未提供 Highland 住户室内覆盖率。当前题池、旧题及本地会话的有界暴露筛查完成，隔离产品坐标回读已有记录。[待冻结审核收据](evidence/ma24-g14-ons-5g-family-freeze-readiness-2026-10-15.json)。逐题混合答案审核回复仍待记录，因此累计私有 Gold 仍为 **4 题、2 来源暴露单元**；整套 G14、G15 付费准入及 G16 真实双路质量未完成，G17–G20 暂停。

2026-10-15 / MA24 G14 FCC 新闻稿的单题私有 Gold 已按整个 FCC 26-55 发布家族审计并封存，累计 **4 题、2 来源暴露单元**；178 页正式报告的另一题仍为待审草案。[家族判决](evidence/ma24-g14-fcc-family-gold-disposition-2026-10-15.json)。当前仅是部分来源资格验收，整套独立题集、G15 付费准入和 G16 真实双路质量均未完成；G17–G20 暂停。

2026-10-15 / MA24 G16 权限题正反对照门槛：新冻结合同要求同题面、同范围的拥有者正常回答题与无权拒答题绑定不同账号；拥有者的已登记私有资产、同源 ready 树及 Gold 引用必须相符，无权账号不可见。隔离克隆验证 ACL 改共享、目标归档及错 Gold 均阻断，合成记录清理、模型调用 0。[工程收据](evidence/ma24-g16-permission-positive-negative-control-2026-10-15.json)。原 G14 安全夹具还不是正式 Gold，真实模型权限质量未验；G17–G20 暂停。

2026-10-15 / MA24 G16：专用评测入场现要求第四份私有资料快照及其哈希，按账号 RLS 视图在认领前和运行边界复核活动文档、来源资产、树版本与检索发布指针。34 项定向测试、类型/lint 和隔离克隆正反例通过；资料变化在领取前阻断，跨账号私有/共享可见性已核，模型调用 0。[工程收据](evidence/ma24-g16-corpus-acl-snapshot-binding-2026-10-15.json)。否定权限目标存在性、资料块和用户可见引用仍须单独核查；整套 G14、G15 付费准入及 G16 双路质量未完成。G17–G20 暂停。

2026-10-15 G14 GOV.UK 工作簿家族三题的逐题内容确认和来源暴露终审完成，作为一个共享单元批准私有 Gold；两个原件哈希、目标原格及三题题文/Gold 快照结构通过复核。[终审收据](evidence/ma24-g14-govuk-family-gold-disposition-2026-10-15.json)。目前仅 **3 题、1 来源单元**，整套独立测评未冻结；用户可见引用、G15 调用授权和 G16 双路质量仍未验。G17–G20 暂停。

2026-10-15 G16 checkpoint 重放保护补正：专用测评任务只在从未保存过 LangGraph checkpoint 时发起图执行；空消息但已有 checkpoint 的反例也拒绝自动重放。5 项定向测试、类型和 lint 通过。[工程收据](evidence/ma24-g16-empty-checkpoint-replay-guard-2026-10-15.json)。持久库恢复及真实双路质量未验，Gold 仍为 0；G17–G20 暂停。

2026-10-15 G15/G16 入场不再只接受自报的代码配置哈希：当前预览由本机代码重新计算，并与冻结预览的提示词、模型路由、工具臂和源码闭包比较，任务模型配置也须一致。隔离克隆的哈希同步改写反例被拒，当前旧 v4 预览因源码漂移不可用。[收据](evidence/ma24-g16-runtime-semantic-preclaim-2026-10-15.json)。预览仍未就绪，Gold、付费准入和真实双路质量均未验收；G17–G20 暂停。

2026-10-15 G16 已把指定任务和冻结账号的认领与冻结输入、当前租约及隐藏空会话核验接通；迁移 138 移除旧的仅凭任务 ID 入口。快照漂移在领取前拒绝，领取后任务输入漂移以通用原因终止，不产生普通对话消息。隔离克隆正反例和清理复验通过。[克隆收据](evidence/ma24-g16-claimed-task-admission-clone-2026-10-15.json)。不代表付费准入、真实运行或质量验收，G17–G20 暂停。

2026-10-15 G16 的专用评测队列已具备按明确任务 ID 领取的受限数据库入口，一次性克隆正反例通过；不会由普通 worker 自动认领，也不会在租约过期后隐式重领。[克隆收据](evidence/ma24-g16-explicit-evaluation-claim-clone-2026-10-15.json)。迁移 137 尚未应用正式库；冻结资料/Gold、付费准入、真实双路结果及人工质量判决未验，G17–G20 暂停。

2026-10-15 G16 持久测评收据要求模型实际输入中的来源工具消息与保存的来源读数一致；相同 `callId` 和引用摘录不足以通过篡改消息反例。[工程收据](evidence/ma24-g16-model-visible-source-byte-binding-2026-10-15.json)。定向测试、类型及 lint 通过；尚无 Gold 或真实双路质量验收，G17–G20 暂停。

2026-10-15 G14 GOV.UK 家族三题答案确认后，当前原件/草稿/题池哈希与题面复核一致；三题共享两原件组成一个暴露单元。定向文本屏查未见产品源码硬编码，验收脚本已使用来源事实，故仍不满足独立 Gold 冻结证据。[家族当前复核](evidence/ma24-g14-govuk-family-current-freeze-readiness-2026-10-15.json)。正式 Gold 0、真实双路 0；G17–G20 暂停。


2026-10-15 G16 评测任务执行前现核对隐藏且独占的空会话，避免普通历史混入题目上下文。隔离数据库中，历史消息和可见状态反例均被拒，合成记录清理；10 项定向测试、类型/lint 通过。[工程收据](evidence/ma24-g16-empty-hidden-conversation-admission-2026-10-15.json)。真实运行器和独立质量仍未验收，G17–G20 暂停。


2026-10-15 G16 评测入场现验证 Gold 内容结构与清单逐题对应；只改 Gold 和清单哈希仍不能绕过缺失的来源坐标。24 项相关测试、类型/lint 和隔离克隆正反例通过。[工程收据](evidence/ma24-g16-gold-content-admission-2026-10-15.json)。人工 Gold 批准、整套来源独立性、付费准入和真实双路质量仍未完成。G17–G20 暂停。


2026-10-15 G16 入场校验现同时绑定来源题集、Gold 和代码配置三个冻结文件的原始字节哈希；隔离克隆验证 Gold/配置篡改被拒，返回给执行器的仅是题目、账号、路径和知识范围。[工程收据](evidence/ma24-g16-three-snapshot-admission-binding-2026-10-15.json)。字节一致不证明 Gold 内容已审核或付费/质量门槛通过；Gold 0、真实双路 0。G17–G20 暂停。


2026-10-15 G16 在本地隔离数据库验证迁移 136、评测任务隐藏会话与普通任务读取隔离，并验证冻结问题/租约绑定的正反例；合成记录清理，无模型调用。[隔离收据](evidence/ma24-g16-admission-and-history-clone-2026-10-15.json)。这只关闭该局部数据库工程验收；产品数据库迁移、专用运行器、Gold 冻结和真实双路质量仍未完成。G17–G20 暂停。


2026-10-15 G16 专用评测任务新增普通历史隔离：隐藏会话承载运行外键，评测题目和答案不写入普通会话消息；普通任务详情、列表及事件接口不返回评测运行。11 项定向测试、类型和 lint 通过。[工程收据](evidence/ma24-g16-ordinary-history-quarantine-2026-10-15.json)。数据库正向验收与正式迁移、独立 Gold、真实双路答案/引用仍缺，G16 未验收。G17–G20 暂停。


2026-10-15 G15/G16 评测任务已在代码和未部署迁移中与普通主任务区分：主图和资料工具继续可用，普通记忆抽取与 Skill 影子采集不接收专用评测任务；G16 核验拒绝普通任务冒充评测结果。本机回滚事务中启用同一临时影子计划，对普通任务产生 1 条采集，对评测任务为 0；回滚后无计划残留。[工程收据](evidence/ma24-g16-evaluation-run-isolation-2026-10-15.json)。独立 Gold、正式迁移、实际运行器及真实双路答案/引用仍未验收，不能判 G15/G16 完成。G17–G20 暂停。

2026-10-15 G15 旧默认配置预览因缺少源码闭包字段被运行前检查拒绝；已保留旧件并生成 v2 只读预览、修正入口。当前 280 文件及 UTC 日期匹配只证明局部加载配置一致，来源/Gold、运行构建、BGE、费率与调用授权未完成，模型调用 0。[收据](evidence/ma24-g15-default-preview-drift-review-2026-10-15.json)。G17–G20 暂停。

2026-10-15 G14 GOV.UK 三题的 v2 私有草稿已将关键数值格、表格标签和口径摘录与原件及产品抽取块逐项核对。[逐题来源收据](evidence/ma24-g14-govuk-per-case-source-review-2026-10-15.json)。三题仍共用一个暴露单元；Gold 0、真实双路 0，来源独立性、题义终审和用户可见引用验收尚缺。G17–G20 暂停。

2026-10-15 用户已批准 GOV.UK 工作簿家族的跨文档比较和交叉组无答案两类候选进入独立 Gold 逐题审核，[MA24-20](CONFIRMED_PRODUCT_RULES.md) 已登记。两题与 BDUK 单来源题共用一个暴露单元；批准 Gold 仍为 0，整套独立性、真实双路答案和引用质量未通过。[授权收据](evidence/ma24-g14-govuk-new-type-review-authorization-2026-10-15.json)。G17–G20 暂停。

2026-10-15 GOV.UK 两题逐题审核：用户确认跨文档题的 4,852,808 处、80.3%、74.0%、6.3 个百分点及不能推出因果的限定；确认无答案题仅能说该工作簿没有农村且 75 岁以上的联合比例，不能由 75.6% 和 33.1% 推出。两题保留为待冻结 Gold 候选，第三道 BDUK 题未由本次回复审核；整组独立性、来源资格、Gold 冻结与 G16 双路质量仍未验收，批准 Gold 0。[MA24-21](CONFIRMED_PRODUCT_RULES.md)、[逐题收据](evidence/ma24-g14-govuk-two-case-answer-review-2026-10-15.json)。G17–G20 暂停。

2026-10-15 G16 评分正向引用判决现要求每条评审摘录出现在最终回答中；缺失摘录的正向判决被拒。15 项定向测试、类型和 lint 通过。回答中出现摘录仍需人工判断其来源标签、坐标和语义是否正确；Gold、真实双路与最终质量尚未验收。[工程收据](evidence/ma24-g16-visible-excerpt-verdict-gate-2026-10-15.json)。G17–G20 暂停。

2026-10-15 G16 评测任务冻结入口补强：普通控制接口对评测任务只允许取消，拒绝追加指令、暂停和恢复，避免入队后通过现有任务 UI 改动题目上下文。9 项定向测试、类型和 lint 通过；专用准入/执行器、Gold、真实双路答案与引用仍未验收。[工程收据](evidence/ma24-g16-evaluation-task-control-isolation-2026-10-15.json)。G17–G20 暂停。

2026-10-15 G16 持久化引用验收增补：评审坐标所指原文须实际出现在产出最终回复的成功模型请求输入中；仅有同任务资料读取日志不再足以取得引用证据绑定。定向测试、类型和 lint 通过；用户可见引用表达、冻结 Gold、真实双路和质量判决仍待验。[工程收据](evidence/ma24-g16-final-model-source-consumption-gate-2026-10-15.json)。G17–G20 暂停。

2026-10-15 G14 GOV.UK 工作簿跨文档/无答案两种新题型已重核原格与同家族暴露关系，形成[审核包](MA24_G14_GOVUK_FAMILY_REVIEW_PACKET_2026-10-15.md)。当时尚无用户新类型确认；随后已按 MA24-20 获准进入逐题审核。全套独立来源冻结、真实双路回答与精确引用判决仍缺。G17–G20 暂缓。

2026-10-15 G14 NTIA 报告题形成可审核的新类型材料，原件第 8/9 页、答案条件和产品块坐标已再核；当前题池有界筛查未见相同具体问题。新类型 Gold 仍待审核，全套独立性、用户可见引用和真实双路质量没有通过。[审核包](MA24_G14_NEW_TYPE_REVIEW_PACKET_2026-10-15.md)。G17–G20 暂缓。

2026-10-15 G16 评分前引用来源检查已能把评审坐标回指到同一任务保存的检索或原文读取收据，并拒绝电子表格错行。此为持久日志工程验收；最终回复引用表达、资料冻结和真实双路人工判决仍待完成，不能据此判质量通过。[收据](evidence/ma24-g16-persisted-citation-source-gate-2026-10-15.json)。G17–G20 暂缓。

2026-10-15 G16 评分前数据库绑定再补已保存模型 wire 清单检查；篡改或缺失清单、模型路由漂移、返回标识不完整会拒绝。工程测试已过，提供方独立收据、冻结 Gold、真实双路答案与引用验收仍缺，不能据此判 G16 通过。[收据](evidence/ma24-g16-saved-wire-manifest-gate-2026-10-15.json)。G17–G20 暂缓。

2026-10-15 G14 修订型候选证据：ETSI 38.901 相邻两版的 ZOD 参数表引用更正已核原页，形成隔离待审题。它未加入当前独立题组、未获 Gold 批准，也未通过完整来源/产品引用/真实双路质量验收；G17–G20 暂缓。[收据](evidence/ma24-g14-etsi-zod-revision-source-audit-2026-10-15.json)。

2026-10-15 G14 ONS 5G 候选的指标定义与 Highland 原格已通过隔离产品证据回读及跨账号拒读，新建私有待审 Gold 草案；批准 Gold 0。尚未完成完整来源独立性、独立审核、用户可见模型回答与引用验收，G17–G20 暂缓。[收据](evidence/ma24-g14-ons-5g-notes-and-private-gold-draft-2026-10-15.json)。

2026-10-15 G14 候选答案准备：两条 GOV.UK 工作簿题的私有 Gold 草案已核原格与产品块坐标；跨文档题只比较不同统计量，不作因果结论。独立审核、完整来源资格、正式 Gold 冻结及真实模型引用仍未验收，批准 Gold 0；G17–G20 暂缓。[草案收据](evidence/ma24-g14-bduk-two-private-gold-drafts-2026-10-15.json)。

2026-10-15 G16 工程补验：持久模型调用行已完成不等于模型产生可用答案；完成的 Agent 任务现在必须至少对应一条保存的成功模型回答，文本与最终回复一致。定向测试和本地隔离数据库反例通过，未形成真实独立双路或 Gold 质量验收；G17–G20 暂停。[收据](evidence/ma24-g16-successful-model-output-gate-2026-10-15.json)。

2026-10-15 G16 工程验收补充：评分输入中的模型调用 UUID 与持久日志逐项绑定，并核保存的请求哈希、题面、知识范围及新会话条件；定向检查和本地隔离克隆反例通过。此项只证明核验器能拒绝指定漂移；正式独立 Gold 0、真实双路结果 0，资料快照、提供方收据、答案和引用质量尚未验收。G17–G20 未推进。[工程收据](evidence/ma24-g16-model-request-binding-2026-10-15.json)。

2026-10-15 G14 NTIA/NASA《18 GHz Band Report》新增一条原页核对后的短 PDF 草案；本地哈希、有限暴露及题目近邻检查已记录。9 个视觉页未完成产品审核，来源终审、Gold 和用户可见引用仍未通过。[候选收据](evidence/ma24-g14-ntia-18ghz-pdf-candidate-2026-10-15.json)。

同日后续隔离克隆完成 9 个视觉页的逐页判决、私有登记与第 7–9 页目标证据坐标回读；第 7–8 页提议分配表保留为视觉证据，另一账号拒读且发布指针不变。原候选收据记载的是审核前状态。来源使用/整套独立性、Gold、用户可见模型答案及引用、生产运行仍未验收，G17–G20 暂缓。[后续收据](evidence/ma24-g14-ntia-18ghz-visual-review-clone-2026-10-15.json)。

同日来源使用与有限暴露补审支持把 NTIA 报告的带归属短事实题留在私有候选池；候选前所查版本化文本及隔离区外本地文本未见报告特征词。此不证明语义独立、整套来源资格、Gold、模型答案/引用或可再分发原件。[来源收据](evidence/ma24-g14-ntia-18ghz-source-use-and-exposure-2026-10-15.json)。

同日 G14 清单更新：从可重算的旧 22 条草案增加 NTIA 一条，当前为 23 条、13 个暂定家族；主格式 PDF 2、长 PDF 7、PPTX 8、XLSX 6。整题跨文档 2、无答案 1，新增/修订、冲突、权限、注入均为 0。此仅验草案分母和缺口，Gold、实际模型质量和 G16 验收仍为 0。[清单收据](evidence/ma24-g14-current-23-draft-coverage-2026-10-15.json)。

同日 G16 评分器修正：无答案、澄清、拒绝类题目不再因空引用获得“精确引用正确”计分。14 项定向测试、类型和 lint 通过；尚无独立 Gold、双路实际回答与人工质量判决。[工程收据](evidence/ma24-g16-nonroute-citation-credit-gate-2026-10-15.json)。

同日 G14/G16 权限与注入候选：自造一页私有 PDF 的原页、12 个抽取块和隔离库登记已核；拥有者检索/读取成功，第二账号搜索、已知 ID 与证据读取均拒绝。三条题面仅为待审材料，其中权限正负题题面相同而账号不同；现有 G16 冻结/运行合同未绑定账号和资料范围，故不计当前 23 题、未建 Gold，也未验模型抵抗注入或用户可见拒绝。[材料收据](evidence/ma24-g14-security-permission-injection-fixture-2026-10-15.json)。

同日 G16 账号绑定续修：冻结/运行合同 v2 逐题锁定账号 UUID 与知识范围，双路记录错配在判分前拒绝；同题面不同账号的源集检查可通过。15 项定向测试、类型和 lint 通过。真实任务账号、资料快照和提供方收据未绑定，权限/注入模型质量及 G16 总门槛未验。[工程收据](evidence/ma24-g16-account-scope-binding-2026-10-15.json)。

同日 G16 持久任务只读核验入口完成：运行记录增加唯一任务 UUID，评分命令在判分前从数据库验证完成/失败任务的冻结账号、原题、范围、模型、状态、回复和模型日志；未知任务仍阻断质量门槛。17 项定向测试、类型与 lint 通过。由于尚无真实独立双路任务，此入口尚未产生实测通过收据；资料快照、引用、提供方收据和 Gold 不在该核验范围。[工程收据](evidence/ma24-g16-persisted-run-binding-2026-10-15.json)。

同日 G16 本地隔离数据库回读已验证账号、问题及范围绑定，并核实合成数据清理；实际独立双路、授权资料快照和提供方收据未验。[隔离收据](evidence/ma24-g16-persisted-binding-clone-2026-10-15.json)。G14 草案清单现分列 23 条资料题及 3 条合成安全题，共 26 条候选材料；权限与注入草案覆盖增加不代表独立来源或 Gold 获批。[清单收据](evidence/ma24-g14-current-26-draft-security-annex-2026-10-15.json)。

同日 G14 题源闭包重算：13 个暂定发布家族经两条跨文档桥接后为 11 个候选暴露单元；同单元的题目不可跨开发集与独立保留集拆分。合成安全夹具单列。此为冻结约束，尚未通过整套独立性或 Gold 终审。[闭包收据](evidence/ma24-g14-family-closure-2026-10-15.json)。

同日 G14 NTIA 候选完成 1 条隔离 Gold 草案，原页 8、9 与证据块坐标及问题文本核对通过；草案不等于独立审核通过，批准 Gold 数量仍为 0。[草案收据](evidence/ma24-g14-ntia-private-gold-draft-2026-10-15.json)。

同日 G14 Taking Part 无答案题经四页签、原格与抽取行核对形成第 2 条隔离 Gold 草案；两项边际比例不能代替交叉人群统计。独立审核与真实模型行为未验，批准 Gold 仍为 0。[草案收据](evidence/ma24-g14-taking-part-private-no-answer-gold-draft-2026-10-15.json)。

同日 G14 三条合成安全题的隔离 Gold 草案已备，分别覆盖拥有者可读、其他账号拒绝及来源指令注入；拒绝依据来自产品 ACL 隔离验证。当前隔离草案共 5 条，未冻结账号或独立 Gold，质量通过数仍为 0。[安全草案收据](evidence/ma24-g14-private-security-gold-drafts-2026-10-15.json)。

2026-10-15 G14 独立测评材料准备：NIST 报告图 3 与工业无线元数据工作簿组成第 2 条跨文档待审草案，原页/原格及有界近邻筛查已核；当前池 22 草案、Gold 0。共享原件、工作簿登记与用户可见引用均未验收，不能计作独立质量通过。[筛选收据](evidence/ma24-g14-nist-two-source-draft-selection-2026-10-15.json)。

2026-10-15 G14 长 PDF 局部验收：NIST TN 2363 的 11 个视觉对象在隔离克隆完成 8 证据/3 装饰审核、登记和指定块原页坐标回读；另一账号拒绝且发布指针不变。此不证明独立 Gold、实际答案与用户可见引用质量。[产品收据](evidence/ma24-g14-nist-tn2363-visual-review-clone-2026-10-15.json)。

2026-10-15 G15 运行配置的本地静态导入闭包已覆盖 280 个源码/配置文件并参与预览漂移检查；定向测试、类型及 lint 通过，旧预览拒绝。运行构建闭包、独立 Gold、付费准入与真实双路质量尚未验收。[工程收据](evidence/ma24-g15-local-source-closure-2026-10-15.json)。

2026-10-15 G16 评分器已拒绝双路模型 ID 不一致和运行收据 ID 重复；12 项定向测试、类型检查、lint 通过。尚未形成真实双路运行、独立 Gold 或质量验收，且记录 ID 约束不能验证提供方来源。[工程收据](evidence/ma24-g16-run-identity-gate-2026-10-15.json)。

2026-10-15 G14 来源使用边界：BDUK 与 Taking Part 官方 XLSX 可作为有归属、带原格引用的短数值事实题候选；Taking Part 的部门标识不进入题目或答案。两原件的有界本地发现前暴露筛查未见专有内容，当前库精确哈希为 0，但未排除所有语义或未记录暴露；Gold、实际模型引用和整体质量仍未验收。[审计收据](evidence/ma24-g14-govuk-two-xlsx-source-and-exposure-audit-2026-10-15.json)。

2026-10-15 G14 跨文档质量题准备：两份 GOV.UK 工作簿的哈希和原格已重核；选择数值直接重叠较少的修订版进入整套候选审核，旧版退出当前池。当前 21 条仅为草案，发布家族仍为 12 个；跨文档 Gold、两来源用户可见引用及质量验收都未通过。[选择收据](evidence/ma24-g14-govuk-cross-document-family-selection-2026-10-15.json)。

2026-10-15 G16 独立质量评分器已在本地要求来源集、Gold、代码/配置三个实际文件与冻结哈希一致；随后验证 Gold 逐题审核记录，并要求被判为精确引用正确的运行引用覆盖该题全部 Gold 来源坐标。11 项定向测试、类型检查、lint 与合成命令篡改拒绝通过。此为评分器工程检查，尚无独立 Gold、真实双路答案、人工语义判决或生产质量验收。[输入绑定](evidence/ma24-g16-frozen-snapshot-byte-binding-2026-10-15.json)、[来源覆盖](evidence/ma24-g16-gold-source-coverage-gate-2026-10-15.json)。

2026-10-15 G14 无答案题候选：英国 Taking Part 2019/20 Internet 工作簿分表给出 Rural 75.6% 与 75+ 33.1%，不提供联合人群比例；草案要求拒绝编造联合值。封面视觉待审，独立 Gold、产品引用和真实模型行为未验。[候选收据](evidence/ma24-g14-taking-part-internet-xlsx-no-answer-candidate-2026-10-15.json)。

隔离克隆中封面部门标识已完成装饰审核，实际登记后的 `Table 2`/`Table 3` 目标原格可读，另一账号被拒；不代表用户可见引用或真实模型拒答通过。[产品收据](evidence/ma24-g14-taking-part-internet-xlsx-no-answer-candidate-2026-10-15.json)。

2026-10-15 G14 英国政府 BDUK XLSX 候选：原件哈希、33 行单表与现金/权责发生制指标原格已核；仅形成一条历史事实题草案。来源许可、独立性、产品引用及 Gold 均待验收。[候选收据](evidence/ma24-g14-bpi-2018-xlsx-candidate-2026-10-15.json)。

同发布 PDF 第 2 页与表格答案事实重复，第 4 页可核正文 OGL 声明。该 PDF 不另计独立题源；XLSX 原格读取/引用、复用条款和 Gold 仍未验收。[交叉收据](evidence/ma24-g14-bpi-2018-xlsx-candidate-2026-10-15.json)。

隔离恢复库实际上传 worker 对该 XLSX 登记成功，证据块的目标行与附注可经 `readEvidence` 回读，另一账号被拒，合成数据已清理；这只证明产品到证据读取，未证明用户可见回答和精确引用。[产品收据](evidence/ma24-g14-bpi-2018-xlsx-candidate-2026-10-15.json)。

2026-10-15 G16 判分补正：候选路径实际行为类型不匹配阻断总门槛；错误行为被审核为错误也不能因其他得分而掩盖。基线错误仍可作为改进对照。8 项定向测试、类型检查与 ESLint 通过；无独立 Gold 或真实双路质量验收。[工程收据](evidence/ma24-g16-outcome-mismatch-hard-gate-2026-10-15.json)。

MA24 当前 Goal 本轮范围由用户于 2026-10-15 明确限定为“只完成到 G16”；G17–G20 暂不推进。G01–G16 仍须按各自工程、真实质量与运行证据验收，不因本轮范围改变而降低门槛。[规则登记](CONFIRMED_PRODUCT_RULES.md)、[执行台账](MA24_EXECUTION_STATUS_2026-10-13.md)。

2026-10-15 G14 长 PDF 隔离候选：NIST TN 2363 官方 PDF 的本地抽取 33/44 页成功、11 页待视觉审核。原页逐页核对后，8 页含实质图表或表格，不能以图注或扁平文本代替结构；封面标识及第 9 页分隔线可提装饰判决草案。第 18、28 物理页的跨节问答仍是草案。未保存正式视觉判决、未登记资料、未冻结 Gold，也未验证用户可见答案/引用或生产服务。[证据](evidence/ma24-g14-nist-tn2363-long-pdf-candidate-2026-10-15.json)。

同日隔离克隆续验：11 个待审视觉页保存并读回 8 条证据、3 条装饰判决，完成审核后实际登记资料；第 18、28 页跨节正文及第 20、33 页表格证据可按原块和原页坐标读取，另一账号被拒。原件与离线/正式上传产物的抽取块一致；合成数据已清理。该结果仅关闭 G05/G14 的本地工程链路，不关闭来源独立性、Gold、模型答案/引用、正式服务验收。[证据](evidence/ma24-g14-nist-tn2363-review-citation-clone-2026-10-15.json)。

同日 G14 题型重叠补审：NIST 跨节草案与当前其他 19 条草案的本地 BGE 近邻及题义逐项对照，没有同一问题；这只支持进入整套冻结前审计，不代表开发暴露已排除或独立 Gold 获批。[证据](evidence/ma24-g14-nist-cross-candidate-audit-2026-10-15.json)。

同日 G14 本地暴露补审：固定候选前提交、隔离目录外历史文本和当前资料库精确哈希均未检出 NIST 原件或所查独特答案短语。搜索边界以收据为准；整套题源冻结、模型质量、生产引用未通过。[证据](evidence/ma24-g14-nist-bounded-development-exposure-2026-10-15.json)。

同日 G14 NIST 长资料补题：第 33 页干扰源与焊接测量表的两项均值差为 3.276/2.816 ms，图表抖动不能概括为单调上升；第 37 页图 8 的五阶段流程和配置文件开发状态也已核原页。两条新草案的证据块在隔离克隆完成坐标/权限读取，旧题与同轮候选近邻已筛查；仍无模型答案、Gold 或生产引用。[证据](evidence/ma24-g14-nist-additional-long-drafts-2026-10-15.json)。

2026-10-14 G05 XLSX 表格样式兼容：`layout-v2.0.8` 以只读模式读取原单元格，并从原始 OOXML 读取合并范围，避开部分官方文件中 `tableColumn dxfId` 导致的 openpyxl 普通加载异常。合成回归 9 项、图表/图片边界检查通过；ONS 原件 4/4 表和指定原格读取通过，欧盟旧产物 7 块在忽略版本及合并范围顺序后等价。尚未部署，其他第三方 XLSX、实际上传页面、生产引用仍待验收。ONS 文件因用于该修复退出独立测评。[证据](evidence/ma24-g05-xlsx-table-style-readonly-fix-2026-10-14.json)。

2026-10-14 G14 跨证据块检索：`Burgenland` 位于欧盟工作簿数据表，`VHCN` 定义位于说明块；原同块全文查询无命中。有界文档级词项回退在隔离克隆找回该私有文档，同时拒绝不存在的词、错误集合与另一账号，精确单元格引用未退步。自然问句及独立双路径质量、生产服务仍待验收。[证据](evidence/ma24-g14-eu-xlsx-cross-unit-search-2026-10-14.json)。

2026-10-14 G05/G14 XLSX 表块审核：`layout-v2.0.7` 将带缓存公式错误的表块纳入有原坐标的待审对象。欧盟原件在恢复克隆完成上传、候选、四条测试判决、登记与 `Data source` 树引用，5 个关键单元格原坐标吻合，错误缓存未入索引；合成数据已清理。组合查询 `Burgenland VHCN` 未命中，正式审核、产品可见引用、独立 Gold 和生产加载仍待验收。[证据](evidence/ma24-g14-eu-xlsx-reviewed-citation-clone-2026-10-14.json)。

2026-10-14 G14 XLSX 错误缓存：欧盟工作簿的未选择国家 `Report` 页有 4 个 `#VALUE!`，产品旧抽取将其表块标为成功。新增登记与树写入门禁阻止错误缓存作为证据索引，真实隔离产物在 K12 命中。还须实现表块审核排除或纠正并重做实际引用验收；该工作簿来源、Gold、质量均未批准。[证据](evidence/ma24-g14-eu-xlsx-cached-error-gate-2026-10-14.json)。

2026-10-14 G14 IEEE 802.11 概览 PPTX：本地恢复克隆使用正式上传 worker 和审核服务，对与离线候选包同块的 39 个视觉对象保存测试判决；唯一未解决地图使完成审核和资料登记都拒绝，完成收据/发布文档为 0，合成数据清理。仅为工程门禁验收，正式资料审核、可见引用、独立 Gold 和生产启用均未通过。[证据](evidence/ma24-g14-ieee-overview-review-clone-2026-10-14.json)。

2026-10-13 R0 实施补记：[执行状态台账](MA24_EXECUTION_STATUS_2026-10-13.md)记录原 G01–G20 的工程、真实质量和生产运行三维缺口。上传列表 GET 路由按本机 Next 16 文档改为必填 Request；隔离构建包含生成类型通过，候选首页 200、未登录上传 API 401。正式 Web 3018 未切换，产品库的新审核/视觉相关迁移仍缺标记，不将候选构建视为生产验收。机器证据见 [R0 收据](evidence/ma24-r0-runtime-build-2026-10-13.json)。

127–134 在已有隔离克隆中的重复执行收据仍保留；随后用产品库的新备份完整恢复至一次性数据库，验证迁移前目标结构缺失、迁移/回滚及 ACL/RLS 通过。初次备份恢复因 2 条预算记录共同指向缺失账号失败；补禁用无密码占位账号并保留原预算记录后，第二次备份完整恢复通过。产品库尚未执行新迁移，也未切换服务。[恢复证据](evidence/ma24-r0-backup-restore-2026-10-13.json)。

G11 邮箱学习历史核查：169 条 `uncertain` 的本地工作记录均有失败审计与 `unknown` 付费预留，无服务商请求标识；保持禁止自动重试。此次只读取状态/收据元数据，不读取邮件正文，不证明费用是否产生。[收据](evidence/ma24-mail-uncertain-receipts-2026-10-13.json)。

G01 运行版本补验：正式 Web 3018 返回独立 `245ed9cc` 构建的唯一 build manifest；Graph PID 与 `44e8608c` 发布标记吻合；主任务 worker 的父启动器直接指向 `1d1cc962` 工作树。此项核对运行版本，不代表新主路已发布。[证据](evidence/ma24-r0-runtime-provenance-2026-10-13.json)。

2026-10-13 MA24 收尾索引：以 [R0–R7 剩余任务计划](MA24_REMAINING_EXECUTION_PLAN_2026-10-13.md)安排后续工作，保留原 G01–G20 及各阶段证据。工程、自然质量和生产验收分别记状态；旧 300/50 审核已完成，新的独立测评、分域试点及回滚仍待完成。本文新增链接不构成新的验收通过记录。

## MA24-14 剩余工作计划

1A 代码已补主 Agent 资料工具和模型前后/恢复/最终保存来源回校，41 项相关回归与真实开发资料只读检查通过；尚未加载服务。具体范围见剩余计划，独立回答质量未判定。

已按用户要求登记运行链路→本地恢复验收→独立冻结→Codex 引导审核→门槛与小范围启用顺序。新发现主 Agent 搜索/事实及恢复消息尚缺统一来源回校；记忆/Skill 的持续影子与质量验收仍待完成。计划详见 [记录](MA24_REMAINING_PLAN_2026-10-10.md)，不将此前工程通过视为总计划完成。

## 2026-10-10：MODESEL-17 三模式选择器

下拉改为三段式单选，紧凑工具栏和随选项变化的用途说明；使用当前淡紫色主题。三个视口的键盘、输入保留、零任务创建、弹窗及溢出检查通过，类型/lint 通过。生产构建和正式 3018 页面三视口复验完成，10 项静态资源正常，具体证据见 [记录](MODESEL17_MODE_PICKER_2026-10-10.md)。

## 2026-10-10：MA24-13 按序修复

最终：四步工程工作与服务加载已完成；73 项回归、7 项真实数据库安全检查、生产构建、浏览器三个模式及资料入口检查通过，三处健康端点均 200。无新增付费模型调用，真实模型回答质量仍未重新验收，生产无向量主路未切换。详见 [记录](MA24_FOLLOWUP_IMPLEMENTATION_2026-10-10.md)；后续段落为阶段时点状态。

第三步：v3 返回精确完整块和块级坐标；新 development 收据验证全文哈希并分开记录拒绝/澄清/资料不足。26 项相关回归及真实 7 块证据捕获通过，无模型调用，不改写历史评测。服务加载继续进行。

第二步：只读比较按两个对象分别查询，返回字段缺项/冲突及已核实事实，输出前复核来源；41 项相关测试、类型、lint 和开发型号真实数据库读取通过。生成质量尚未重新验收。

权限拒绝/澄清指令与原件工具结构化边界已完成，44 项相关回归通过；旧 Prompt 可恢复，新任务固定 v1.1.0。比较、评测与加载状态见 [阶段记录](MA24_FOLLOWUP_IMPLEMENTATION_2026-10-10.md)。代码通过不等于新的冻结质量评测通过。

## 2026-10-10：产品引用返回修复

完整引用块、系统引用标识脱敏保护、模型调用前及返回前来源回校已实现。26 项回归、类型及 lint 通过，本机只读验证当前来源通过及不存在来源拒绝；没有付费调用、重跑冻结集或生产主路切换。服务尚未重启，浏览器及真实模型验收待完成；跨文档和通用权限拒绝继续待修。见 [实施与验证范围](MA24_EVIDENCE_RETURN_FIX_2026-10-10.md)。

## 2026-10-10：MA24 冻结集答案审核完成

50/50 题、100/100 条人工判决已保存，正式快照与哈希检查通过。v3 / 无向量答案正确为 31/50、36/50，引用判分为 4/50、12/50；总计非退步通过，但跨文档比较退步且无向量权限拒绝失败，生产切换仍阻断。此为历史冻结答案审核，不代表当前本地三通道已验收。范围及后续门槛见 [最终审核记录](MA24_HOLDOUT_FINAL_REVIEW_2026-10-10.md)。

## 2026-10-10：三模式本地业务工具验收

12 组真实 PostgreSQL/RLS 与生产工具/图执行检查通过：账号隔离、只读拦截、草稿版本、调用收据复用、深入模式仍需发信确认，以及模拟超时后备用收据恢复。模型为本地脚本；未触发付费模型、网页、邮箱同步或 SMTP。临时账号和数据全部清理，最终退出码 0。夹具修正与覆盖边界见 [运行记录](AGENT_MODE_RUNTIME_2026-10-10.md)。

## 2026-10-10：本地部署及 MODESEL-14

产品 3018、LangGraph 2024、原数据库及三个正常 worker 已恢复。真实 Chrome/API/数据库通过三模式入队与配置固定验收，夹具清理且未执行模型；LangGraph 路由验证通过。经明确授权，八模型各两轮共 16 次合成调用全部通过，实际使用生产流解析器及模式思考参数，每次上限 1024 token；没有真实业务工具或私有资料。此次授权已用完。详见 [部署及验收边界](AGENT_MODE_RUNTIME_2026-10-10.md)。

## 2026-10-10：三模式运行接入

新任务模式选择、配置固定、服务端工具边界、流式首输出/总超时及有收据的顺序备用已实现。本地模拟服务端和桌面/手机测试通过；真实多轮模型与业务效果尚未验收。MODESEL-13 明确标准模式暂不新增搜索次数/问题数量上限，原工具 Schema 保留。范围、命令和回滚见 [运行记录](AGENT_MODE_RUNTIME_2026-10-10.md)。以下较早“待实现”段落保留为历史证据。

## 2026-10-10：MODESEL-12 Prompt v1 底座

用户批准共用与三模式规则。完成正文原样导出、静态规则选择模块和生成器 `--check`；10 项聚焦测试通过，覆盖默认 standard、非法/原型键模式拒绝、快速规则隔离及共用批准/隐私/不重复执行条款保留。未接入生产模式路由，未验证真实多轮任务或服务端工具权限。批准正文与证据边界见 [Prompt v1](AGENT_MODE_PROMPTS_DRAFT_2026-10-09.md)。

## 2026-10-09：MODESEL-01 设计阶段

MODESEL-11：用户采用快速 15/60 秒、标准 30/120 秒、深入 60/300 秒的初始首输出/请求总时限，后续可调整。文档一致性及 diff 检查完成；尚未实现或验收流式首输出检测、超时取消、迟到结果隔离和备用切换，不用此前短文本连通性测试代替这些验收。

MODESEL-10：明确错误的顺序备用、每模型一次、三路失败保存及已执行工具不重放已获确认。仅同步并检查设计文档；自动切换、重复效果保护和排队/超时行为尚未按新规则实施验收。

MODESEL-09 本地回归：`npm.cmd test -- src/lib/assistant/main/model-sync.test.ts src/lib/assistant/main/graph.test.ts`，2 文件、12 测试通过，覆盖现有模型请求及图执行故障保护；这是现有行为回归，不是尚未实现的自动备用切换测试。

MODESEL-09：八个候选各一次合成工具格式测试，HTTP 200、tool_calls、describe_tool 名称及 JSON 参数均符合要求，产品现有解析器 8/8 通过。无实际业务工具执行；多轮工具回传、全部 Schema、高思考参数及自动备用切换尚未验收。当前代码无新模式备用切换实现。[收据](evidence/mode-tool-contract-2026-10-09.json)。

MODESEL-08：北京时间 15:21 对八个不同主备候选各调用一次，仅合成文本，全部 HTTP 200 且正常完成。Luna/Haiku/Flash/Sonnet/Sol/Kimi/Opus/GLM 均返回 OK 或 OK.，耗时 1.47～5.62 秒。GLM/Kimi 上游为 Relace，Claude 为 Claude Platform on AWS，OpenAI 为 OpenAI，Flash 为 Google。不包含工具调用、长任务、故障切换或私有资料验收，未改变生产路由。[原始供应商收据](evidence/mode-connectivity-2026-10-09.json)。

MODESEL-07：按用户要求将深入研究第二备用候选改为 GLM 5.3，记录确认范围及其他槽位待定状态。仅完成文档 diff 检查，未发起模型调用，未验证 GLM 上游恢复或备用切换。

MODESEL-06：云端统一 OpenRouter、本地 BGE/Qwen 保留已确认；MODESEL-05 的本地范围待定项已关闭。仅同步设计并检查文档 diff，未执行模型调用、迁移或服务验收。

MODESEL-05：允许新增供应商、统一 OpenRouter 已确认。静态核查发现主 Agent 已走 OpenRouter，邮件/外联/意图及 RAG 回答仍有 Moonshot 直连入口；统一网关尚未实现，不声明全部模型已迁移。此次仅同步设计与检查 diff，未执行付费模型调用。本地模型迁移范围待明确。

MODESEL-04：默认标准工作、手动切换快速问答/深入研究、能力不足只提示而不自动升级已确认。设计文档一致性与 diff 检查完成；未修改运行代码，未进行模式 UI 或执行边界验收。

MODESEL-03：标准模式的单事实公开搜索及深入模式的批量爬取/公司调查/评分边界已确认并同步文档；未设定次数、页数或时限。仅完成设计一致性检查，未做运行时边界验收或外部搜索调用。

MODESEL-02：用户确认快速模式的已保存邮件/客户只读查询范围。设计稿及工具矩阵已更新；文档覆盖校验不等于运行时只读边界验收，尚未修改执行路由。

交付简单模式框架、共享/分模式 prompt 草案、104 个实际工具目录和完整 JSON Schema、逐工具默认/按需/禁用建议。目录生成器增加定义漂移检查。注册表序列化及目录检查通过（104 项），矩阵唯一 ID 覆盖 104/104。未调用业务工具或新增模型，未实现/验收模式切换或一主两备故障恢复；具体模型和阈值待共同决定。见 [设计稿](AGENT_MODE_DESIGN_2026-10-09.md)。

MAILCRM 实施已获确认；阶段 1/2 的抽屉与持久化队列代码、数据库迁移及隔离验证记录见 [实施证据](MAILCRM_IMPLEMENTATION_2026-10-08.md)。不代表客户时间线或全部真实邮箱场景验收完成。

后续阶段 3 已交付客户列表/时间线/本地摘要队列与账号 Skill；73 项单测、6 项关键桌面手机交互、数据库隔离验证及构建通过。真实邮箱全范围恢复和全量摘要质量仍需使用验收，逐项边界以实施证据为准。

## 2026-10-08：MAILCRM-01～04 需求与选型

删除对话确认窗口、收发邮件同步、公司沟通时间线 Skill、按国家分类公司与备注上下文已登记。只完成公开项目文档调研与提案，未安装第三方项目、未修改运行功能、未执行浏览器/邮件验收。具体待验证项见 [方案](MAILBOX_CUSTOMER_TIMELINE_PROPOSAL_2026-10-08.md)。

后续实施与验收见 [MAILCRM 实施记录](MAILCRM_IMPLEMENTATION_2026-10-08.md)。2026-10-15 F13 对话删除先通过组件级桌面/手机浏览器，随后补做实际页面到隔离数据库验收。

同日 [F13 候选网页到隔离数据库验收](evidence/ma24-g13-conversation-delete-page-db-clone-2026-10-15.json)补齐：暂停任务阻断、完成后软删除和任务保留均经页面/API/数据库核对。该项不覆盖 G13 其余入口或生产发布。

同日 [F01/F02 邮箱管理抽屉候选网页验收](evidence/ma24-g13-mailbox-drawer-candidate-page-clone-2026-10-15.json)通过空账号三视口的背景、滚动、焦点及草稿保留检查；真实多邮箱数据和生产入口未验。

2026-10-15 [F03 批量授权候选网页到库验收](evidence/ma24-g13-mailbox-batch-page-db-clone-2026-10-15.json)：桌面/手机跨页选中 10 封合成邮件，确认后 10 条学习任务持久排队，刷新可查看进度。实际 worker、真实邮箱和生产未验收。

2026-10-15 [F05/F06 阅读入口候选网页补验](evidence/ma24-g13-mailbox-reader-page-db-clone-2026-10-15.json)：桌面/手机列表及原文的 503 错误与重试通过，80 行合成邮件在收件箱阅读区滚动；桌面刷新失败不保留旧正文。学习候选长原文仍在列表内展开，完整阅读空间及生产验收未通过。

同日 [F06 长原文与矮窗口续修验收](evidence/ma24-g13-long-mail-reader-drawer-clone-2026-10-15.json)：候选网页三视口中，长原文进入阅读抽屉、短原文原位展开；矮窗口原零高度列表恢复可点击，关闭/焦点/滚动均通过。前一条中的阅读空间缺口在候选工程范围已修复，真实邮件与生产验收待办。

同日 [四个合成已连接邮箱补验](evidence/ma24-g13-mailbox-drawer-four-account-clone-2026-10-15.json)覆盖了三视口长内容滚动与账户卡布局；真实 IMAP 邮箱及生产入口仍未验。

> 2026-10-08 运行恢复：主模型真实调用恢复；邮件可显式选用 HTTPS DNS 以处理系统 fake-IP，仍校验公网地址并固定 TLS 目标。17 项聚焦测试通过；目标期间邮件同步仍在 IMAP TLS 握手阶段被重置，邮件简报未验收通过。[运行证据](LOCAL_RUNTIME_RECOVERY_2026-10-08.md)。

> MA24-13：冻结集候选回答采用 Codex 辅助逐题审核，展示答案/精确引用两项建议及原文依据，用户确认后才计入人工判决。首题 `base-43-open` 已核对原件链接、Gold 与当前第 1/3 页原文；建议尚未获用户确认，不计为验收通过。见 [确认规则](CONFIRMED_PRODUCT_RULES.md)。

> **MA14, 2026-09-21:** 当前 MA11 剩余产品流程以本地隔离数据和受控替身模拟验收；暂不设置工作账户真实评分、联系人核验、发信或新知识发布的业务结果门槛。模拟验收须核对权限、版本/哈希、持久化、回执与重复执行，不把合成结果写成真实模型或外发质量。[确认规则](CONFIRMED_PRODUCT_RULES.md)；[执行证据](MAIN_AGENT_ACCEPTANCE.md)。

> MA14 模拟验收结果：原有 80/80 开发任务、40/40 锁定任务及四项关键边界通过；本地克隆再通过正式评分、联系人发布、独立邮件跟进、共享二进制登记与既有知识发布复用检查。二进制向量及跟进文本使用本地替身，所有夹具已清理；真实模型答案、SMTP 与新 release 激活不计入本阶段门槛。[明细](MAIN_AGENT_ACCEPTANCE.md)。

> 2026-09-21 MA11/P2 continuation: the 96-tool Agent registry now includes administrator release preflight and exact-approved atomic activation for an already built shared RAG v3 release. Six focused tests and type checks passed; the configured local source gate reads an existing active 281-asset release with no document blockers. No new release was built or activated. New binary assets still require the existing build, dual-embedding and review workflow. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 MA11/P2 partial continuation: an exact-approved tool can now publish an eligible independently reviewed research score into the formal versioned assessment and company market state. The isolated real PostgreSQL fixture passed publication, replay, owner isolation and stale-revision checks; no live scoring model was called. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 MA11/P2 partial continuation: the Agent can now read owned email candidates, save a specialist shadow contact decision after exact model-disclosure approval, and publish the reviewed result only after a second exact approval with source/version checks. Migration 101 and five focused tests passed; no live specialist call or real contact mutation has been verified. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 MA11/P2 partial continuation: the upload worker now processes every active account under its own RLS context. An exact-approved administrator tool can hash-check and register an extracted binary into the shared document library with its original asset. The response explicitly keeps immutable RAG v3 activation pending. Migration 100, focused tests and type checks passed on an isolated clone; live extraction/embedding and release activation remain open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 MA11/P2 partial continuation: the shared page/Agent service now reads the latest account contact-enrichment run, and account-encrypted UUID follow-up drafts support sent mail without a company link. The catalog has 89 tools. Unit/type checks passed; migration 099, live generation/send and final workflow acceptance remain open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 MA11/P2 partial: the main Agent catalog now has 88 tools after adding 13 existing-page workflow adapters for workspace, development feedback, mailbox review/lifecycle, task reconciliation, administrator Gold review and shared-text knowledge publication. Credentials remain page-only, and remaining shared-binary-knowledge, enrichment-status, formal-score, contact-verification and unassociated-follow-up gaps still block complete workflow coverage. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 MA13: development now prioritizes complete product flows and result quality. Development cost/efficiency ledger updates and automatic expense reports stop from this point. Historical records and raw receipts needed for recovery/idempotency remain; cost analysis is produced only on explicit request. This is a confirmed priority change, not evidence that remaining P2/P5/P6 flows are complete.

> 2026-09-21 P5 partial: the main Agent can request exact-approved manual historical-memory creation/edit through the same service as the page, with revision checks and source-managed facts protected. Four isolated database checks passed (138 total); changed-content embedding and full P5/P6 acceptance remain open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 P2/P5 partial: authenticated members can queue private binary material without an administrator upload token, and the main composer can select already registered accessible originals. Pending files are not treated as attached. Two route assertions, 1,276 regression assertions and 70 authenticated desktop/mobile browser checks passed; real file extraction and Agent consumption are unverified. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 P2 partial: follow-up draft history and generation are independent Agent tools sharing the existing page service. Three new isolated database checks passed with no provider call or send. Unassociated-parent follow-up, live generation and complete P2/P6 release acceptance remain open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 P2 partial: account-owned mailbox candidate reading and exact-approved, content-hash-bound review are callable by the main Agent using existing page services. Five new isolated database checks passed; actual approved embedding and full P2/P6 release acceptance remain open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 P2 partial: the main Agent reads the current draft revision, and draft edit/internal approval share a row-locked, revision-bound service with the existing page. Fifteen isolated database assertions, 1,271 regression assertions and 68 authenticated desktop/mobile browser checks passed; no sending occurred. Other outreach adapters and complete P2/P6 acceptance remain open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 P3 partial: the main Agent can read the same account usage and cost observations as the task-usage page, with unknown costs and overlapping ledgers labeled. Four new isolated database checks passed (134 total); full MA05/P6 acceptance remains open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 P2 partial: the Agent now browses the knowledge library and private revision history, reads upload-job state and can request exact-approved deletion of one owned private document at an observed content hash. Ten isolated database checks passed (130 total); binary upload, shared publishing and release acceptance remain open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 MA06/MA08 partial: standalone outbound mail now appears in the account task feed and detail with no invented company association. Five isolated database assertions passed, bringing the main suite to 120; actual SMTP/reconciliation and release acceptance remain open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 P2 partial: saved formal company assessments and associated mail metadata are now independent main-Agent reads shared with their page services. Eight real PostgreSQL checks passed with owner isolation and no mail body in list output. Complete P2/P6 acceptance is still open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 P5 partial: the main Agent can inventory, deactivate and restore owned versioned memory and manage historical private-memory lifecycle using the same page service. Historical deletion requires central exact approval and a current update revision. A total of 115 isolated database checks passed; the complete unified memory and release gate are still open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 P5 partial: current main-Agent policy context now includes historical shared distribution defaults; account historical preferences/company decisions are searchable with original identity and usage scope. Ninety-three PostgreSQL checks and 1,267 regression assertions passed. Historical write unification, semantic retrieval and complete P5/P6 release acceptance are still open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 P5 partial: new memory versions preserve the actual predecessor and active state for undo after branching or reactivation. Eighty isolated PostgreSQL checks passed; older snapshots retain historical fallback and full P5 acceptance is open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20: MA01-MA09 confirmed; see [main Agent implementation workflow](MAIN_AGENT_WORKFLOW.md). These are new targets, not completed implementation or release evidence.
> Later MA10 supersedes the main-model default with OpenRouter `z-ai/glm-5.3:batch` / `fireworks`. The async batch transport, waiting/recovery state, provider checks and one real public synthetic two-turn main-Agent flow passed; 120-case quality acceptance and release remain pending. [Model route evidence](MAIN_AGENT_MODEL_ROUTE_2026-09-20.md).
> 2026-09-20 P4 partial: public HTTPS and GitHub Skill source import, exact Git commit/blob verification, tenant storage and the management form passed focused, public-network and isolated-database checks. Private connections, browser/MCP and overall P4/P6 acceptance remain pending. [Detailed acceptance](MAIN_AGENT_ACCEPTANCE.md).
> 2026-09-20 P2 partial: administrator fact-review list and precise decision now have independent main-Agent tools using the same page schema and RAG v3 repository. The Agent decision requires exact approval; the existing page's approval path has not been migrated. All 1,260 local regression assertions passed; real knowledge mutations and full P2/P6 acceptance remain pending. [Detailed acceptance](MAIN_AGENT_ACCEPTANCE.md).
> 2026-09-20 P2 follow-up: the Agent can read a company's current revision and update allowed business fields only when that revision still matches under lock. Page and Agent use one field schema; the legacy page's own concurrent-edit guard remains pending. [Detailed acceptance](MAIN_AGENT_ACCEPTANCE.md).
> 2026-09-20 P2 page follow-up: the company edit page now submits its current revision, handles stale 409 without replay and refreshes; the shared service returns the next revision. This closes the immediately preceding page gap, while other write paths and full P2/P6 remain pending. [Detailed acceptance](MAIN_AGENT_ACCEPTANCE.md).
2026-09-17 LG04/LG05: the standalone Agent Server now publishes the existing assistant and lead orchestration as expandable composed LangGraph workflows instead of one-node runner adapters. Local `xray=true` acceptance sees 15 assistant nodes/23 edges and 17 lead nodes/23 edges while production execution retains the existing spend context and PostgreSQL checkpoint graph. Full 1,090 tests, TypeScript, build, lint and 22 browser cases pass; the zero-business-call routing probe passes with no model/search/SMTP/cost. After explicit informed authorization of trace-metadata egress, one zero-cost health workflow uploaded three LangSmith spans (`LangGraph`, `__start__`, `report_ready`); readback proved every input/output object empty and the known probe absent from metadata. Real-business trace adoption and long-term observability cost remain open. [Workflow evidence](STANDALONE_LANGGRAPH_WORKFLOW_2026-09-16.md).
2026-09-15 stage 246 / A32: RAG answer routing now uses an application-managed OpenAI Sol primary (USD0.778240) and at most one same-model `amazon-bedrock/us-east-1` fallback (USD0.378471), with a USD1.156711 combined worst-case reservation and 4,096 output tokens. Fallback requires sanitized router evidence of an upstream 401/403/429/5xx; gateway/account and request-shape failures do not fall back, and SDK/OpenRouter hidden retries remain disabled. A30 public-source/redaction boundaries remain unchanged. Safe failure metadata, no-network SDK fallback tests, public price audit and real-SQL dual-contract checks pass with zero inference; live semantics and billing remain open. [Evidence](A32_CONTROLLED_RAG_FALLBACK_STAGE246_2026-09-15.md).
2026-09-15 stage 245 / A31-A30: grounded RAG answers now select a dedicated OpenAI-only Sol contract rather than the USD27.345252 full-context generic contract. The exact production wire uses `max_tokens=8192`, no temperature/response schema/tools, at most 61,440 bytes and a USD0.901120 conservative ceiling. Only explicitly public-source knowledge enters the redacted external copy; internal/mailbox/unmarked inputs remain local. Public metadata, no-network SDK wire, full tests/typecheck/lint and real-PostgreSQL synthetic reservation/duplicate checks pass with zero provider inference. [Evidence](A31_RAG_ANSWER_CONTRACT_STAGE245_2026-09-15.md).
2026-09-15 stage 244 / A30-A29: public/publicly sourced business evidence is now permitted for external processing, while API keys, personal information and other sensitive content remain prohibited. The Terra candidate packet now creates a redacted external copy; 16 focused tests and TypeScript pass. Two inspected 25,698-byte Terra v2 bodies were sent from the existing checkpoint, with no earlier workflow stages repeated. Both returned zero valid output and unknown tokens/cash, adding USD22.038404 conservative occupancy to USD83.947114. The job remains failed with no handoff or saved company, and identical blind replay is stopped. [Evidence](A30_PUBLIC_EXTERNAL_DISCLOSURE_STAGE244_2026-09-15.md).
2026-09-15 stage 243 / A29: the exact-owner stage override is active. One checkpoint resume emitted two Terra v1 attempts; both produced zero valid output with unknown tokens/cash, adding USD22.038404 conservative occupancy and leaving the task failed. Current endpoint metadata shows the old `temperature` parameter is unsupported by all Terra endpoints. Terra-only `request-bounds-v1.11.0` removes it and uses supported `max_tokens=8192` without changing model, ceiling or data policy; 69 focused tests, TypeScript, lint and real PostgreSQL synthetic contract verification pass. The v2 real retry remains unperformed pending explicit authorization to send this task's workspace evidence to OpenRouter. [Evidence](A29_PAID_REPLAY_ADMISSION_STAGE243_2026-09-15.md).
2026-09-15 stage 242 / A28: the controlled product-layer acceptance is complete. Necessary review failure is a recoverable processing hold rather than a qualified shortfall; it cannot produce handoff or national output, and authorized recovery reuses every completed earlier stage. Handoff readiness and final persistence now share one completed-review predicate. Production task progress exposes pending review with measured zero/unknown semantics. Real PostgreSQL, 149 focused quality tests, 1,059 full tests, TypeScript, lint, generated-doc consistency, production build, production dependency audit (0 vulnerabilities) and 68 production desktop/mobile UI checks pass with zero provider calls. Real Terra semantics, full supplier invoices/cash cost and the original overall acceptance remain unpassed. [Evidence](LAYERED_QUALITY_AND_FAILURE_PROGRESS_STAGE242_2026-09-15.md).
2026-09-14 stage 239 / A28 resume plan: the user deferred complete real-supplier cost acceptance for this local closing pass, allowed new approved requests only within the existing USD50/per-request gates, and selected layered acceptance. The next implementation will verify one controlled full natural-language→quality-review→national SQL→production UI task with deterministic external transport, while labeling real provider semantics, Terra review, invoices and the original overall acceptance separately. No code, paid request or acceptance result is claimed by this resume point. [Resume](RESUME_PRODUCT_ACCEPTANCE_STAGE239_2026-09-14.md).
2026-09-14 stage 238 / A11: the approved S02 request succeeded on the real OpenRouter OpenAI-only endpoint and the isolated target-one graph reached discovery, evidence/correction and primary scoring. Terra secondary review returned no valid output with unknown cost; the duplicate paid request guard safely stopped the job before result save. Conservative occupancy USD39.870306/50 and 29 incomplete bills remain. This validates S02 as one stage, while the full paid business and national UI loop stay open. [Evidence](S02_MINIMAL_LIVE_PARTIAL_STAGE238_2026-09-14.md).
2026-09-14 stage 237 / A27-S02: the user approved the narrow S01 playbook parameter repair and instructed recording/bypassing similar technical acceptance blockers to reach the main product chain. The v2 contract sends `max_tokens=4096` without `temperature`, preserving OpenAI-only Sol, USD10.622880 and A26 USD50/A25 per-call admission. Actual 4,186-byte no-network wire, 1,052 tests/typecheck/lint/build pass; a new isolated live task remains next, with the old 404 reserve untouched. [Evidence](S02_PLAYBOOK_PARAMETER_ACCEPTANCE_STAGE237_2026-09-14.md).
2026-09-14 stage 236 / A10-A13: after the stage234 FX boundary fix, the actual local production build passed 68/68 desktop/mobile UI/HTTP/SQL checks, with fixture and server cleanup and zero paid provider calls or mail. Read-only A26 occupancy stayed USD23.520920/50. This refreshes page evidence only; S02 and real A11 discovery-to-save remain open. [Evidence](A26_POST_FX_CURRENT_BUILD_UI_STAGE236_2026-09-14.md).
2026-09-14 stage 235: the sole current matrix and local-production present-tense table now align with A25 progressive admission, A26 USD50/fixed FX, the stage232 S01 HTTP404 partial run, stage233 68/68 UI and stage234 1,052-test FX regression. Dated older observations remain historical. S02 and the real discovery-to-save A11 chain remain open; no new product or paid call. [Evidence](A26_CURRENT_ACCEPTANCE_TABLE_RECONCILIATION_STAGE235_2026-09-14.md).
2026-09-14 stage 234 / A26-A10: weekly production FX validity now starts at actual retrieval and duplicate official content is rechecked before the stored snapshot expires; the local A26 validation snapshot remains fixed without a new fetch. Full 1,052 tests/typecheck/lint/build pass, zero paid calls or new reserves. S01 HTTP404 and the separately confirmable S02 request change still block real A11. [Evidence](A26_WEEKLY_FX_EXPIRY_EDGE_STAGE234_2026-09-14.md).
2026-09-14 stage 233 / A10-A13: the A26 current local production build passed 68/68 isolated Chrome desktop/mobile checks, with all temporary UI fixtures and port 3030 cleared. No paid provider calls or mail; A26 occupancy stayed USD23.520920/50 and ten incomplete cost reports remain. This closes the current-build UI regression slice, while S02 approval and real A11 discovery/score/save are still open. [Evidence](A26_CURRENT_BUILD_UI_REGRESSION_STAGE233_2026-09-14.md).
2026-09-14 stage 232 / A11: real isolated two-turn intent, plan correction, action confirmation and knowledge retrieval ran under A26. The existing S01 playbook reached OpenRouter and returned HTTP 404 for the current parameter set; no search or qualified company followed. USD23.520920/50 remains occupied, including an unreconciled USD10.622880 S01 reserve; six old and four new incomplete cost reports remain. [S02 proposal](S02_SOL_PLAYBOOK_PARAMETER_PROPOSAL_2026-09-14.md) is awaiting the separate A11 confirmation before product-code changes or any fresh paid attempt. [Evidence](A26_LIVE_PARTIAL_ACCEPTANCE_STAGE232_2026-09-14.md).
2026-09-14 stage 231 / A26: the isolated local validation budget is USD50 with original USD12.324404 occupancy preserved; one stored official ECB version is pinned without a validation expiry, while ordinary product FX refresh is weekly with seven-day validity. All required first-stage single-call tariffs now quote within USD37.675596 remaining. The accidental synthetic no-dispatch reservation was uniquely audited and released via an append-only zero-cost observation; six historical unknown bills remain. Full 1,051 tests/typecheck/lint/build and production dependency audit pass. SearchAPI/Gemini conditional route bounds, real S01 endpoint semantics and the paid business closed loop remain open. [Evidence](A26_WEEKLY_FX_AND_USD50_LOCAL_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 230 / A05-A11: one due official ECB GET again yielded stale Sep 11 data, so the A25 progressive path pauses at required intent/embedding requests. The current matrix's A02/A05/A11 rows now stop treating the missing whole-run quote itself as a start blocker. USD12.324404/30 occupied, six unknown old bills, zero paid calls/jobs; real A11 remains unrun. [Evidence](FX_A25_DUE_RECHECK_STAGE230_2026-09-14.md).
2026-09-14 stage 229 / A25-A11: user-confirmed progressive per-request admission replaces the requirement for a complete task quote before starting, while preserving cumulative USD30, valid single-call ceilings, stale-FX stop and unknown-cost stop. Existing transport/SQL already enforce those single-call controls; the read-only preview now states the current gate. First required Kimi intent and knowledge embedding remain FX-held, so no real A11 loop ran. [Evidence](PROGRESSIVE_BUDGET_ADMISSION_STAGE229_2026-09-14.md).
2026-09-14 stage 228 / A03-A08: the existing 30-day tenant usage API now exposes Tavily provider-credit report, estimate and unknown-attempt aggregates with row coverage. A rollback-only product SQL fixture verifies a mixed current/legacy pair and foreign-user isolation; historical missing provenance remains null. Full 1,048 tests/typecheck/lint/build pass; no paid request. These are API-credit observations, not USD bills or A11 real acceptance. [Evidence](TAVILY_CREDIT_USAGE_SQL_STAGE228_2026-09-14.md).
2026-09-14 stage 227 / A03-A08: Tavily Search/Extract API-credit responses and evidence/correction stage metadata now separate reported credits, rule estimates and retry attempts with unknown credit outcome. Existing USD reserve/report/invoice coverage stays distinct, Search paid wire is unchanged, and old observations are not backfilled. Full 1,048 tests/typecheck/lint/build pass with zero paid calls; live cash matching and A11 remain open. [Evidence](TAVILY_CREDIT_PROVENANCE_STAGE227_2026-09-14.md).
2026-09-14 stage 226 / A01: present-tense status in the Colombia report and sole matrix now points to the latest 1,044-test, product-SQL and 68-check browser evidence while preserving historical snapshots. O05 synthetic product wiring is separate from unverified real model quality. No product rule or paid call changed; A11 and overall acceptance remain open. [Evidence](CURRENT_STATUS_RECONCILIATION_STAGE226_2026-09-14.md).
2026-09-14 stage 225 / A11: official documentation supports per-prompt Gemini 2.5 Flash grounding and the current Interactions parameter forms, but separately reported tool-use prompt tokens have no proven request-total ceiling. The model switch remains research only; no tariff or paid call was admitted. Read-only whole-run bound is still null and USD12.324404/30 remains occupied. [Evidence](A11_GEMINI25_INTERACTIONS_BOUND_AUDIT_2026-09-14.md).
2026-09-14 stage 224 / P06: a combined 151-source/151-finding synthetic Agent graph now survives fallback-phase SQL checkpoint interruption, second-process completion/fallback-final save and third-process zero-call replay. TypeScript, script lint and the full isolated SQL verifier pass with cleanup and zero real paid calls. This does not validate real model semantics, a default fallback fee contract or A11. [Evidence](P06_151_SOURCE_FALLBACK_CROSS_PROCESS_SQL_2026-09-14.md).
2026-09-14 stage 223 / P06: a 151-source/155-finding synthetic Agent graph completes with actual OpenAI-compatible fallback wire sizing, route-specific fingerprints and zero-call in-memory replay. Full 1,044 tests/typecheck/lint pass. The combined large-graph SQL recovery, real model semantics, default fallback tariff and A11 remain unverified. [Evidence](P06_151_SOURCE_FALLBACK_GRAPH_WIRE_2026-09-14.md).
2026-09-14 stage 222 / P06: a 151-source/155-finding synthetic company with an additional long critical role statement remains technical-pending before paid transport if its complete recovery path cannot fit. The fixture is unchanged and 1,044 tests/typecheck/lint pass. This does not close the full large-company scoring, real model or A11 acceptance gaps. [Evidence](P06_WIDE_CRITICAL_PREFLIGHT_BOUNDARY_2026-09-14.md).
2026-09-14 stage 221 / A05-A11: the scheduled official FX retry again yielded only the expired Sep 11 reference; Kimi and Beijing embedding remain FX-held while their price evidence is valid through Sep 20. No paid job ran and the A11 whole-run quote remains null. [Evidence](FX_SCHEDULED_RECHECK_1150_2026-09-14.md).
2026-09-14 stage 220 / A01-A13: the current production build passes 68 real Chrome desktop/mobile checks with isolated fixture cleanup. The current matrix now distinguishes active approved Extract/Terra/Sol judge single-call contracts from older proposal snapshots; the read-only whole-run quote is still null and no paid A11 job ran. [Evidence](CURRENT_BUILD_UI_AND_MATRIX_RECONCILIATION_2026-09-14.md).
2026-09-14 stage 219 / P06: long-singleton chunks are now split using the largest exact primary or approved fallback wire request, with an independent post-plan route check. Synthetic fallback execution and SQL cross-process checkpoint reuse pass; no default fallback tariff or real provider call was activated. [Evidence](P06_SINGLETON_FALLBACK_WIRE_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 218 / P06: the current Agent and real PostgreSQL checkpoints now jointly verify interrupted long-critical scoring across two processes, followed by zero-call replay and fixture cleanup. This is synthetic model evidence; real provider semantics, bills, full 151-source graph and A11 remain open. [Evidence](P06_SINGLETON_AGENT_CROSS_PROCESS_SQL_2026-09-14.md).
2026-09-14 stage 217 / P06: the Agent now preflights worst-case chunk, phase and final wire routes before spending; completed chunks are checkpointed and reused, and derived summaries retain original IDs/hashes without rewriting source snapshots. Synthetic interruption and critical uncertainty pass, as does the independent product SQL checkpoint verifier. Real model semantics and full A11 acceptance remain open. [Evidence](P06_SINGLETON_AGENT_RUNTIME_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 216 / P06: a bounded fact phase that cannot fit now reports the exact original source or corrected statement and citation closure for chunk recovery, including the post-folding choice. This preserves technical-pending behavior and does not yet wire chunk execution or final scoring. [Evidence](P06_OVERSIZED_UNIT_RECOVERY_IDENTITY_2026-09-14.md).
2026-09-14 stage 215 / A05-A11: the due official ECB retry still returned the expired Sep 11 reference, so the confirmed FX paid hold remains. No provider call or customer job ran; the whole-run A11 bound is still absent. [Evidence](FX_SCHEDULED_RECHECK_1050_2026-09-14.md).
2026-09-14 stage 214 / A08: search telemetry now separates provider-returned rows/links, accepted items, normalized companies, unique additions and over-delivery/unusable reasons. Historical cache raw counts remain unknown. Full 1,039 tests/typecheck/build pass with zero paid calls; live discovery quality and A11 whole-run cost remain open. [Evidence](DISCOVERY_PROVIDER_VOLUME_TELEMETRY_2026-09-14.md).
2026-09-14 stage 213 / A23-A24: approved Terra secondary and Sol judge OpenRouter credits contracts are active with exact task-scoped selection, strict JSON/reasoning/output limits and synthetic SQL reservation/replay verification. No real provider call or user task. The Sol judge bound alone exceeds remaining USD17.675596 and the full A11 run has no admissible cost bound; overall acceptance remains open. [Evidence](OPENROUTER_REVIEW_ACTIVE_CONTRACT_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 212 / A22–A24: the user separately approved Tavily basic Extract (USD0.032000, 20 URLs, Sep 21 expiry) and the Terra/Sol conditional review contracts (8,192/USD11.019202; 12,000/USD27.736500) for implementation and no-paid verification only. Extract is now active with strict wire and SQL budget/replay verification; Terra/Sol remain pending implementation. Cumulative USD30, incomplete whole-run bound and real A11 hold remain. [Evidence](TAVILY_EXTRACT_ACTIVE_CONTRACT_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 211 / search admission: Google Places, Exa and Brave over-delivery is now capped at maxResults before downstream candidate processing, with full 1,034-test/typecheck/build verification. This bounds accepted item slots, not unique companies or final qualified leads. Missing/expired tariffs and unknown total-run bound still prevent live A11 acceptance. [Evidence](DISCOVERY_DOWNSTREAM_RESULT_CAP_2026-09-14.md).
Stage 202 A09/A10/A13: current production build passed 68 real Chrome desktop/mobile UI/API/DB checks with isolated synthetic fixture cleanup and unchanged USD30 budget. This validates tested local pages after recovery changes, not live lead generation, actual adoption or trustworthy provider billing. [Evidence](PRODUCTION_UI_REGRESSION_STAGE202_2026-09-14.md).
Stage 200 A06/A11: paid discovery recovery now hashes the effective SearchAPI standard-or-alias credential and endpoint selected for the actual request. Alias-account changes under a blank standard key prevent incompatible cache reuse; normal request behavior and strict tariff hold remain. Full 1,026 tests/typecheck/build pass with no paid call. [Evidence](SEARCHAPI_ALIAS_RECOVERY_IDENTITY_2026-09-14.md).
Stage 198 A06/A11: Gemini discovery's actual request, paid recovery digest and acceptance preview now resolve one trimmed model. A fallback-model change under a blank primary override safely invalidates purchased-work recovery. Full 1,024 tests/typecheck/build and targeted lint pass; this does not admit a new route or close A11's whole-run cost gap. [Evidence](GEMINI_DISCOVERY_MODEL_RECOVERY_IDENTITY_2026-09-14.md).
Stage 197 A02/A11: read-only Google documentation and current-product preflight show that Gemini 3 model-internal search charges cannot be derived from the existing HTTP attempt ceiling. Gemini 2.5 per-prompt grounding is a potential route requiring separate A11 confirmation and exact contract/quality checks. Other tariffs, FX and whole-run cost remain open; no route changed. [Evidence](A11_GEMINI_GROUNDING_BOUND_REVIEW_2026-09-14.md).
Stage 195 A05/A08/A10: a synthetically stale but well-formed ECB response is now counted separately from transport/invalid refresh failure in append-only telemetry. Both still keep native-currency paid admission closed after 72 hours and retry in one hour. Full tests, typecheck, build and focused lint pass; live A11 and real bill remain open. [Evidence](FX_STALE_SOURCE_OBSERVABILITY_2026-09-14.md).
Stage 193 O03/A09/A13: a two-round final-qualified stagnation stop now reports `no-qualified-progress`, while historical `confirmed-exhaustion` remains readable and is shown without claiming market exhaustion. Same-scope continuation stays blocked; full tests and current-build Chrome desktop/mobile 68 checks pass. This is local/synthetic evidence, not A11 live completion. [Evidence](O03_STAGNATION_STOP_REASON_ACCEPTANCE_2026-09-14.md).
Stage 192 A11: the read-only route preview now uses the production default two-HTTP-attempt discovery retry contract, bounding four providers to at most 10 HTTP attempts each over five rounds. Gemini internal searches and complete run cost are still unknown, so paid E2E remains held. [Evidence](A11_DISCOVERY_HTTP_ATTEMPT_CEILING_2026-09-14.md).
Stage 191 A11: the current minimal Distributor route has four steps and a five-round ceiling, now shown per provider by the read-only preview. Conditional/skipped steps do not establish charge count; SearchAPI/Gemini tariffs and retry/server-side limits remain open. This is not live E2E acceptance. [Evidence](A11_DISCOVERY_ROUTE_ACTION_CEILING_2026-09-14.md).
Stage 190 A10/A13: the post-ACL current production build and real Chrome desktop/mobile UI passed 66 checks against local HTTP, with isolated fixture cleanup and no paid calls. This validates the tested pages and API views after migrations 001–075, not A11 live generation or real adoption. [Evidence](PRODUCTION_UI_REGRESSION_STAGE190_2026-09-14.md).
Stage 188 A10/A11: scheduled official ECB refresh produced no validated new FX reference, retained the expired prior snapshot and set the one-hour retry. A single-purpose no-worker command, cached follow-up, nine focused tests and typecheck pass; CNY paid admission and the real A11 loop remain held. [Evidence](FX_SCHEDULED_RECHECK_0749_2026-09-14.md).
Stage 187 A13: the application could directly edit/delete private document revisions after migration replay. Migration 075 makes direct revision access SELECT/INSERT while parent privacy deletion still cascades. Two full replays, 23-table ACL, SQL mutation/cascade and private-isolation verifiers, 1,021 tests and typecheck pass. Live adoption and A11 remain unverified. [Evidence](KNOWLEDGE_REVISION_APPEND_ONLY_ACL_2026-09-14.md).
Stage 186 A08/A13: owner-mutable workflow metrics, model usage, artifact events and workspace audits undermined historical telemetry integrity. Migration 074 narrows these to SELECT/INSERT after complete replays. Two 22-table ACL audits, direct mutation-denial and normal SQL verifiers, 1,021 tests and typecheck pass. Actual user adoption and A11 remain unverified. [Evidence](WORKFLOW_TELEMETRY_AUDIT_APPEND_ONLY_ACL_2026-09-14.md).
Stage 185 A06/A13: full replay had left private-memory audit and search continuation records owner-mutable. Migration 073 restores insert/read-only application contracts; two full replays, 18-table ACL audit, direct mutation-denial probes, 1,021 tests and typecheck pass. This is local integrity evidence, not live A11 completion. [Evidence](MEMORY_AUDIT_SEARCH_CONTINUATION_ACL_2026-09-14.md).
Stage 184 A06/A12: full migration replay exposed a writable recovery-lineage link; migration 072 restored append-only application ACL. Two full replays, product SQL budget/unknown-fee recovery, 16-table ACL audit and 1,021 tests pass. Real provider interruption and A11 remain open. [Evidence](PROCESSING_RECOVERY_APPEND_ONLY_ACL_2026-09-14.md).
Stage 183 A08/A11: Gemini Google Search usage provenance now distinguishes provider-reported, step-derived and unknown counts, including technical failure. Full tests, types and build pass; no Gemini fee bound or real A11 call is admitted. [Evidence](GEMINI_GROUNDING_USAGE_PROVENANCE_2026-09-14.md).
Stage 181 A13: latest product SQL two-user private-knowledge/RAG/mailbox isolation and read-only 79-table owner-keyed RLS audit passed. This is bounded acceptance evidence, not a real generated answer or full A11 closure. [Evidence](PRIVATE_KNOWLEDGE_ISOLATION_RECHECK_2026-09-14.md).
Stage 180 A11: a whole-run conservative preflight must account for possible independent review. Public Terra USD11.019202 plus approved S01 USD10.622880 already exceeds current remaining USD17.675596, while review tariffs and exact provider acceptance remain unverified. No live run. [Evidence](A11_REVIEW_ROUTE_BUDGET_AUDIT_2026-09-14.md).
Stage 179 A11: minimal-business readiness must include the official-evidence Tavily Extract dependency. Current diagnostic explicitly reports missing-strict-contract and cannot declare all tariffs available; the proposed bound remains inactive. [Evidence](A11_EXTRACT_PREFLIGHT_VISIBILITY_2026-09-14.md).
Stage 177 A11: official-evidence enrichment reaches Tavily basic Extract after a successful Search; the active policy still rejects /extract as missing-tariff. A USD0.032000 maximum-20-URL contract is prepared for user review with no paid activation. [Candidate](TAVILY_EXTRACT_TARIFF_PROPOSAL_2026-09-14.md).
Stage 176 O03: search continuation now evaluates the final post-review qualified count. A review downgrade can continue within the existing five-round and health limits; targeted research remains incomplete. Synthetic graph tests pass; real-market yield and A11 remain unverified. [Evidence](O03_POST_REVIEW_TARGET_COMPLETION_2026-09-14.md).

阶段175 / A11：S01合成市场计划请求的两个字段未见于 OpenRouter OpenAI端点公开参数清单；预检区分公开元数据缺口与实际拒绝，继续阻止把单次合同当真实闭环验收。无路由/费率变更、0付费。[证据](S01_PUBLIC_ENDPOINT_PARAMETER_GAP_2026-09-14.md)。

阶段174 / A05、A06、A10：迁移071修正费用观测、费率价证及预算状态9张表的旧宽授权；15张费用/完成检查点真实应用角色权限验收通过，核销与任务限额夹具未受影响。真实账单、整次费用和A11仍缺。[证据](BILLING_LEDGER_ACL_ACCEPTANCE_2026-09-14.md)。

阶段173 / A05、A10：旧授权残留使应用角色可修改追加式FX快照，迁移070收紧为仅新增/读取，刷新状态仍可更新；真实SQL权限和过期门禁通过。ECB在9月14日仍只给9月11日参考日，72小时到期后继续阻止付费预留；整次费用及A11未通过。[证据](BILLING_FX_EXPIRY_AND_APPEND_ONLY_ACL_2026-09-14.md)。

阶段172 / A10、A13：阶段171最新构建本地生产Chrome桌面/手机各33项通过，隔离夹具清理、0真实付费/发信；A11自然语言到合格结果及可信账单仍待。[证据](PRODUCTION_UI_REGRESSION_STAGE172_2026-09-14.md)。

阶段171 / A10、A11：最小验收计划的首轮发现执行器与只读预检共用12结果/路线的确定性计算，Brave/Exa合成请求不再误用目标池2作为请求量；1015项全量与构建通过。其他路线/动态调用及整次费用仍缺，真实付费未启动。[证据](A11_MINIMAL_DISCOVERY_REQUEST_SIZE_PREFLIGHT_2026-09-14.md)。

2026-09-14 当前[本地生产阶段性总览](LOCAL_PRODUCTION_ACCEPTANCE_CURRENT_2026-09-14.md)汇总冻结39/38、O01–O05、费用/恢复/遥测/页面证据及A11缺口；仅实际完整闭环和可信账单通过后才能签整体验收。

阶段169 / A05、A11：SearchAPI官方账户状态只读返回当前月度配额0、剩余额度0，未给账号严格价格/速度等级；产品继续阻止此搜索入口，未新增搜索或付费。它不能填补整次上界，也不表明市场耗尽。[证据](SEARCHAPI_ACCOUNT_READONLY_STATUS_2026-09-14.md)。

阶段167 / A10、A13：阶段166生产构建在真实Chrome桌面/手机各33项、共66项通过，隔离夹具清理、0真实付费/发信；A11自然语言到合格结果及可信账单仍待。[证据](PRODUCTION_UI_REGRESSION_STAGE167_2026-09-14.md)。

阶段166 / B07、B26、A07：分阶段单事实来源摘录超限时，仅折叠已支持且非关键事实的长来源首尾，原完整证据和纠正陈述保留，最终评分获知折叠来源；100,000字符合成正例与关键/冲突/未知/无关联反例、1014项回归及检查点SQL通过。真实语义、不可折叠长陈述、默认备用费率及A11仍待。[证据](P06_PHASE_SINGLETON_EXCERPT_FOLD_2026-09-14.md)。

阶段165 / A10、A13：阶段164评分载荷改动后，`11b59b7`最新生产构建的真实Chrome双视口66项回归通过，隔离夹具清理、0真实付费/发信。A11自然语言到合格结果与可信账单仍待。[证据](PRODUCTION_UI_REGRESSION_STAGE165_2026-09-14.md)。

阶段164 / B07、B25、B26：分阶段最终评分把重复证据引用可逆映射到原来源行，151来源/155事实合成请求的主/备用实际HTTP字节均通过上限，SQL检查点与跨进程恢复回归通过；原证据及费用身份不重写。模型语义、任意长单事实、完整备用图与A11仍未验收。[证据](P06_PHASE_SOURCE_REFERENCE_COMPACTION_2026-09-14.md)。

阶段163 / A10、A13：当前`e597c28`构建在独立本地生产端口通过真实Chrome桌面/手机各33项、共66项；隔离夹具清理、0真实付费/发信。3018旧进程造成的首轮超时为环境冲突；A11真实业务和可信账单闭环仍未验收。[证据](PRODUCTION_UI_REGRESSION_2026-09-14.md)。

阶段162 / A01：唯一验收矩阵主体已从旧阶段131统计对齐至阶段161的1007项/206文件、迁移069及备用路由恢复，并更新A07/A10/A11当前缺口；旧逐阶段证据保留历史语境。只读预算仍USD12.324404/30，整次上界未知，A11仍未验收。[当前矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)。

阶段161 / B25、B26：备用路由按实际模型/请求/付费哈希保存阶段与最终响应，SQL跨进程及126事实产品图合成验收通过；配置变化/费用未知阻止重付费。默认备用严格费率与真实语义、长请求及A11整次闭环仍待，不将无付费图视为生产准入。[证据](P06_FALLBACK_ROUTE_CHECKPOINT_ACCEPTANCE_2026-09-14.md)。

阶段160 / B25、B26：OpenAI兼容提供方的实际付费HTTP请求哈希与费用层一致，模型变更失效；本地拦截和定向回归通过，0外发。备用响应仍未建立独立完成检查点，默认备用费率和A11整次费用上界仍缺。[证据](P06_FALLBACK_PAID_REQUEST_IDENTITY_2026-09-14.md)。

阶段159 / C13、B25、B26：完整图跨进程条件Pro合成验收经产品SQL保存评估1、原事实/证据各151、模型用量5及Flash/Pro最终响应各1；Pro缓存合同复用与跨用户隔离通过。真实付费0，真实模型语义、备用路由和自然语言到合格线索闭环仍待。[证据](P06_PHASED_PRO_GRAPH_SQL_ACCEPTANCE_2026-09-14.md)。

阶段158 / C13、B26、A11：分阶段评分的条件Flash→Pro已接通；4阶段+2最终假请求经PostgreSQL跨进程归零调用恢复，7分非关键变化不升级。只读预检六调用合成示例评分USD8.499366，连同S01计划USD19.122246，超当前剩余USD1.446650；整次上界仍未知，真实闭环和P06语义质量未验收。[证据](P06_PHASED_PRO_ESCALATION_2026-09-14.md)。

阶段157 / B25、B26：最终评分响应追加式迁移069、跨进程零模型复用及已报告完整同哈希费用放行通过；未知/截断/错哈希阻止，完整图与原单次评分回归通过。1005项/206文件、构建、类型/lint及生产依赖审计通过，0真实付费。Pro/备用路由及真实语义、整次费用和A11闭环仍缺。[证据](P06_FINAL_SCORE_RESPONSE_RECOVERY_2026-09-14.md)。

阶段156 / B07、B25、B26：现行图→分阶段评分Agent→PostgreSQL阶段行/评估缓存→产品结果SQL的跨进程合成联通通过，151事实/151来源保留，3阶段加最终评分共4次假模型响应，0真实付费。真实模型摘要/Pro升级/备用路由、全流程自然语言和整次费用预检仍未通过，P06及A11不能标记完成。[证据](P06_PHASED_GRAPH_SQL_ACCEPTANCE_2026-09-14.md)。

阶段155 / A11、B25：分阶段评分整次费用未能证明有界，只读预检显示4阶段夹具连同市场计划保守上界已超当前剩余额度，其他合同与动态调用仍缺；0真实付费，真实闭环未验收。[证据](A11_PHASED_SCORE_WHOLE_RUN_PREFLIGHT_2026-09-14.md)。

阶段154 / B07、B25、B26：超限评分的阶段执行、SQL逐项完成保存、跨进程只补缺项和最终评分已接线；1005项/206文件回归与生产构建通过。真实模型语义、Pro升级、费用完整合同和生产图端到端未验收，P06/A11不能标记整体完成。[证据](P06_PHASE_AGENT_SQL_RECOVERY_2026-09-14.md)。

阶段153 / B07、B26：分阶段输出综合及最终评分请求的纯本地预检通过，150条事实/全部来源及争议陈述保留，长摘要超界停止；阶段Agent、真实摘要语义及最终评分闭环仍未验收。[证据](P06_PHASE_SYNTHESIS_PREFLIGHT_2026-09-14.md)。

阶段152 / B07、B25、B26：新增可核对的阶段付费请求身份和保守恢复门禁，模拟SQL费用行、跨进程/跨租户、1002项/205文件全量回归与生产构建通过，真实费用0。尚缺评分Agent接线、完整综合和真实业务验收，P06/A11不标记完成。[证据](P06_PHASE_PAID_REPLAY_IDENTITY_2026-09-14.md)。

阶段151 / B07、B25、B26：分阶段完成响应的追加式迁移及跨进程SQL隔离验收通过，错误输出/路由写前拒绝，夹具清理无残留。生产Agent尚未接线，未知费用防重放与最终评分未验收，不能标记P06/A11完成。[证据](P06_PHASE_CHECKPOINT_SQL_2026-09-14.md)。

阶段150 / B07、B26：分阶段输出校验拒绝缺项、重复或虚构引用，保留合法逐项结果原序；1000项/205文件全量回归与构建通过。真实阶段模型、持久恢复、费用未知防重放及最终评分尚未接线，P06/A11整体验收未通过。[证据](P06_PHASE_OUTPUT_VALIDATION_2026-09-14.md)。

阶段149 / B07、B26：超大单公司分阶段事实请求规划器的151事实/152证据引用闭合与字节边界通过合成验证。它尚未连接Agent、阶段结果持久化及最终评分，不能据此完成P06或启动A11；989项/204文件全量回归与生产构建通过。[证据](P06_PHASED_FACT_REQUEST_PLANNER_2026-09-14.md)。

阶段148 / B07、B26：受限证据原文折叠与无损字段表组合已接入当前评分请求准备。110条补充事实场景在跨进程产品SQL路径保存111条原证据/111条事实；125/150条仍保持技术未完成，完整P06、真实模型遵从及A11整次付费闭环未通过。987项回归与生产构建通过。[证据](P06_FOLDED_FIELD_TABLE_COMBINATION_2026-09-14.md)。

阶段147 / B07、B26：折叠评分跨进程检查点及产品SQL部分验收通过，56条原始证据/56条事实、冲突原文、评分准备遥测和隔离归属均可核对；旧101/105无损路径复验通过。仍为预置已校正候选和模拟模型响应，任意大单项分阶段、真实模型质量与A11真实付费最小闭环未通过。[证据](P06_FOLDED_EXCERPT_CROSS_PROCESS_SQL_2026-09-14.md)。

阶段146 / B07、B26：单公司无损请求仍超限时，评分请求可显式折叠仅由已支持事实追溯的部分证据原文，保留全部事实、状态和引用，冲突/否定/未知原文及原任务证据不变。55条独有事实合成评分与全冲突拒绝路径通过；150条仍待分阶段处理，真实模型遵从与A11未验收。[证据](P06_SUPPORTED_EXCERPT_FOLD_ACCEPTANCE_2026-09-14.md)。

阶段145 / B07、B26、A11：984项/203文件、生产构建、18项桌面/手机浏览器、lint及生产依赖审计通过。P06不可压缩任意大单公司尚不能分阶段完成评分；只读整次预检 `totalRunBoundUsd=null`，真实闭环未运行、整体验收未通过。[边界与证据](CURRENT_REGRESSION_AND_P06_BOUNDARY_2026-09-14.md)。

阶段144 / B07、B25、B26、O01/O05：初始证据为空的合成候选经现行 `collectLeadEvidence` 处理模拟搜索与提取，各1次，形成稳定官方证据供现行校正、评分 Agent 引用；正结果入产品 SQL 并在生产 Chrome 双视口刷新一致。真实搜索、模型语义、可信费用与 A11 未验收。[证据](CURRENT_EVIDENCE_COLLECTOR_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

阶段143 / B07、B25、B26、O01/O05：现行校正 Agent 对本轮证据形成6条支持事实及 Distributor 主角色，未触发补证搜索；现行评分 Agent 引用校正事实，合成任务经 SQL 保存1家并在本地生产双视口刷新一致。真实模型判断、搜索、账单及 A11 完整闭环未验收。[证据](CURRENT_CORRECTION_AGENT_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

阶段142 / B07、B25、B26、O05：两轮降级计划的合成正结果图改用现行`LeadQualificationAgent`及实际DeepSeek请求序列化处理模拟结构响应；五门禁、无规模事实8/15上限、7条本轮引用、SQL评分缓存与最终保存1家核对通过，生产任务双视口刷新一致。语义响应仍为夹具，真实模型/账单和A11未完成。[证据](CURRENT_SCORE_AGENT_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

阶段141 / A09–A13：实际对话服务以确定性降级处理两轮“2家→1家”哥伦比亚Distributor输入，取消旧提案、确认新提案；合成图暂停恢复后真实SQL保存1家公司，生产Chrome双视口刷新达标，夹具清理完整。意图与业务阶段均未调用真实模型/搜索，不能据此宣称A11实际业务闭环。[证据](ASSISTANT_FALLBACK_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

阶段140 / A10：正结果图验收夹具补全局公司清理；6条本轮专用域名且无引用的历史合成残留已核对删除，更新脚本再次通过并断言残留0。阶段138–139业务接线结论范围不变，A11仍待真实供应商与费用闭环。[证据](POSITIVE_GRAPH_FIXTURE_CLEANUP_2026-09-14.md)。

阶段139 / A10–A12、B07/B25/B26：合成正结果任务评分前停在PostgreSQL检查点，恢复后前置知识/计划/发现/补证/校正各仍1次，SQL保存1家、夹具预留7 micro-USD守恒，越权恢复拒绝；本地生产桌面/手机任务刷新通过。仅同进程控制故障，无真实模型/账单或未知在途请求，不代表A11全链完成。[证据](POSITIVE_GRAPH_SCORING_PAUSE_RECOVERY_2026-09-14.md)。

阶段138 / A09–A11：预置合成哥伦比亚计划经完整图到实际产品SQL保存1家，任务回执幂等、本地生产Chrome桌面/手机显示目标达成并刷新稳定，跨用户读取拒绝；7 micro-USD夹具共享预留全数分配。真实自然语言、服务商搜索/模型与可信账单均未运行，A11仍未完成。[证据](POSITIVE_RESULT_GRAPH_SQL_UI_ACCEPTANCE_2026-09-14.md)。

阶段137 / B07、B26：评分Agent逐家公司检查完整请求；不可压缩超界公司保留技术待恢复，同批可评分公司按原上限和精确缓存契约继续完成。双顺序合成回归、全量984项/203文件及构建/类型/lint/audit通过；图在处理未完成检查点暂停，不等于已发布最终结果。任意大公司分阶段完成、真实模型与A11仍缺。[证据](P06_OVERSIZED_PEER_ISOLATION_2026-09-14.md)。

阶段136 / B07、B26：合成超界评分错误在图的 `score_candidates` 检查点暂停，原已校正候选/证据/额度保留；同检查点模拟恢复后仅评分，发现/补证/校正不重跑。此为 P06 技术暂停边界的验收，不证明不可压缩单项分阶段完成、真实模型质量或 A11 业务闭环。[证据](P06_OVERSIZED_SCORE_GRAPH_CHECKPOINT_2026-09-14.md)。

阶段135 / A09–A10 只读归因：阶段134整次预检中 Kimi/北京 Embedding 的 `expired-tariff` 来自共享 ECB CNY/USD 参考日9月11日已过72小时，静态价格合同仍有效至9月20日；ECB 免费当前源仍为9月11日，不得以重新抓取时间延长有效期。无模型/付费调用，整次预检仍不通过。[澄清](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)。

阶段134 / S01：用户已批准仅将市场计划的 OpenRouter Sol 限定到 OpenAI 标准端点。现行专用合同 `request-bounds-v1.7.0` 对完整请求最多 61,440 字节、输出 4,096 token 按 USD10.622880 保守预留；其他 Sol 请求仍使用原多供应商 USD27.345252 上界。不可用时暂停，缓存身份包含模型与路由；累计 USD30 和整次费用预检照旧。实际 SDK 合成传输、拒绝路径和全量回归见 [S01 验收](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)。真实最小业务闭环仍未完成。

阶段133：P05 条件复核/裁决改为每条有效模型输出立即入私有检查点；同任务恢复复用成功响应、费用未知继续阻止，结构缺项保持未完成。迁移001–066重复执行及真实SQL跨进程/跨户/跨国隔离、合成 Agent 中断恢复、全量测试、构建/类型/lint/audit通过，0真实付费。尚非真实模型图全链或A11。[报告](REVIEW_SUBCALL_CHECKPOINT_ACCEPTANCE_2026-09-14.md)。

阶段132：条件复核当前 Agent 经合成传输捕获 Terra 8192、Sol 裁决12000输出 token 的实际严格 JSON 请求，现行费用门禁分别为 `missing-tariff`、`request-out-of-bounds`；8项定向测试通过，0真实调用/预留。公开候选上界未准入，真实端点与A11仍待验收。[报告](OPENROUTER_REVIEW_ACTUAL_WIRE_PREFLIGHT_2026-09-14.md)。

阶段131：同一隔离任务跨进程检查点恢复后，由当前评分Agent把共享短语请求的模拟输出写进产品SQL；101原证据/105事实、缓存契约及评分遥测核对通过，最终合格和交付0，0真实付费。起点为已校正合成候选，真实模型/搜索/账单与A11完整闭环未验收。[报告](P06_SHARED_PHRASE_CROSS_PROCESS_PRODUCT_SQL_2026-09-14.md)。

阶段130：P06共享短语评分经真实图与产品结果 SQL 保存1条完成评估、101证据快照、105事实和评分遥测/用量各1；夹具资格不满足，最终合格与公司交付0，另一账号不可读，0真实付费。阶段129的两进程恢复与本阶段实际SQL为独立验收，尚非同一条自然语言业务闭环；真实模型、账单及A11仍缺。[报告](P06_SHARED_PHRASE_PRODUCT_SQL_ACCEPTANCE_2026-09-14.md)。

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
2026-09-14 stage 204 / A11: read-only minimal-run preflight identifies 12 requested results per route step and 240 requested slots over the current five-round/four-step ceiling. Brave/Exa may pass excess returned items downstream; actual item and full-run USD ceilings remain unknown. The route, paid admission and acceptance status did not change. [Evidence](A11_REQUESTED_RESULT_SLOTS_PREFLIGHT_2026-09-14.md).
2026-09-14 stage 206 / A11: credential-free official OpenRouter catalog and endpoint rechecks found unchanged Terra review and Sol judge public-price projections. Proposed single-call conservative ceilings are USD11.019202 and USD27.736500, respectively; neither tariff was admitted. The Sol judge candidate alone exceeds the USD17.675596 remaining allowance. Full-run cost remains unknown and live A11 is held. [Evidence](A11_REVIEW_PUBLIC_BOUND_RECHECK_2026-09-14.md).
2026-09-14 stage 207 / A05-A11: one due no-key ECB public reference refresh at 09:49 UTC yielded a stale Sep 11 date. The expired FX hold and current USD30 occupancy remain; next stored retry is 10:49:51 UTC. No paid run, tariff or acceptance status changed. [Evidence](FX_SCHEDULED_RECHECK_0949_2026-09-14.md).
2026-09-14 stage 208 / P06: an exact-wire, Unicode-safe single-item chunk planner and citation validator are implemented and verified. They are not yet connected to product phase execution, tenant-keyed checkpoint or synthesis, so critical/unlinked oversized sources and full P06 semantic acceptance remain open. Full 1,030 tests/typecheck/build passed with zero paid calls. [Evidence](P06_SINGLETON_CHUNK_PREFLIGHT_2026-09-14.md).
2026-09-14 stage 209 / P06: existing append-only phase storage now has a disjoint singleton-chunk checkpoint contract with exact paid fingerprint, tenant/country ownership, route guard and cross-process SQL verification. No schema change or paid call. Agent execution and bounded synthesis are still missing, so P06 and A11 are not accepted. [Evidence](P06_SINGLETON_CHUNK_CHECKPOINT_2026-09-14.md).
2026-09-14 stage 210 / P06: pure singleton assembly now rejects missing, swapped, changed-text or foreign-citation segments and preserves aggregate uncertainty. It is not yet in the production agent or final score. Full 1,031 tests/typecheck/build pass; P06 and A11 remain incomplete. [Evidence](P06_SINGLETON_CHUNK_SYNTHESIS_PREFLIGHT_2026-09-14.md).
2026-09-15 stage 247 / A33: the exact configured owner uses paid-call observation mode during the single-user early stage. Pre-call tariff, request-cost-bound, account/task-budget, frozen-budget and tariff-hold gates do not deny or reserve money; post-call provider cost/usage/latency/outcome telemetry is retained, and absent monetary data remains explicitly unknown rather than zero. Authentication, tenant/privacy disclosure boundaries and concurrent/successful replay protection remain. For this owner only, an OpenRouter-edge 401/403/429/5xx may reach the single A32 Bedrock route; provider-side rejection remains possible. Migration 076, real-PostgreSQL synthetic accounting, 1,080 tests, TypeScript, lint, production build, generated docs and production audit pass with zero provider calls; live cash and semantics remain separately open. [Evidence](A33_OWNER_PAID_OBSERVATION_MODE_STAGE247_2026-09-15.md).
2026-09-15 stage 248 / A34: knowledge-grounded answer generation now uses the trusted Moonshot endpoint and `KIMI_RAG_MODEL` (default `kimi-k3`) instead of OpenRouter Sol/Bedrock. It makes one JSON, non-streaming request with 4,096 completion tokens and no model fallback/retry, while preserving A30 public-only redaction/citations and A33 post-call cost observation. One real public synthetic call returned HTTP 200 with 387 prompt, 340 completion/727 total tokens, 11,152 ms and a valid exact KB citation; provider cash was absent and remains unknown. Thirty-four focused and 1,078 full tests, TypeScript, lint, build, generated-doc consistency and production audit pass; the restarted product returns HTTP 200. [Evidence](A34_KIMI_RAG_ANSWER_STAGE248_2026-09-15.md).

# 2026-09-21 MA15 前端优化范围

本轮已确认删除无动作的全局切换显示与固定 `Global`、完全移除全局市场开发模式、将历史任务移入帮助菜单并在对话内保留当前任务状态、将导航命名为“知识库”、提高知识阅读宽度及全站可读性，并允许在浅色基调内调整 MA11 配色。具体页面清单、阶段和本地模拟验收见 [前端减法计划](FRONTEND_SIMPLIFICATION_PLAN_2026-09-21.md)。此处记录需求确认，实施与验收仍待完成。
# MA23 邮箱与页面布局验收补充（2026-09-23）

1. 邮箱工作台顶部可连接多个不同邮箱地址，分别保存名称与只读/可发信权限；阿里邮箱预填服务器，其他邮箱可填标准 IMAP/SMTP 域名。OAuth 暂不支持。连接前验证 IMAP；可发信还需 SMTP 465 TLS 或 587 STARTTLS 验证。发送 API、队列入口和开发信选择器均不得让只读邮箱发信。
2. 私有学习候选与待审核内容在固定视口的内部列表中按 8 条分页。批量邮件授权最多 5 封且再次确认；候选批量审核最多当前页 8 条，内容版本不一致须拒绝，部分失败要逐条返回。
3. 市场概览右上角只出现单个国家下拉控件；完全收起左侧栏后，非对话工作区取消固定最大宽度并占用接近全屏的可用宽度。
4. 验收证据须区分静态类型/单测/构建、数据库迁移、页面实际交互及真实邮件服务互通；任何一项未执行均不可标为已验收。
5. 产品前端硬规则：长列表和多个板块不得造成整页无限向下延伸；在固定工作区内使用分区、内部滚动和分页。知识库资料页先验收资料/邮箱知识/个人记忆/上传分区，资料及记忆每页 12 条、邮箱知识每页 8 条；其他既有页面逐页审计后才可宣称全站符合。
6. 侧栏“市场与线索 / 客户开发 / 知识库”文字与图标垂直中心一致，桌面与手机均不应出现错位。
7. 资料列表“范围”新增“全部”，包含本人私有知识、共享知识和公共证据库，不包含独立的个人长期记忆；已批准邮箱知识按私有知识文档纳入。混合列表须标记来源、统一排序分页，并维持私有所有权和公共分享状态的权限过滤。
# MA24 长期记忆补充（已确认，分阶段实现）

记忆观察采用 PostgreSQL 不可覆写记录，并同时保存业务有效时间与系统记录时间。可靠来源的结构化观察使用幂等键，保存来源收据；同范围、同主题的矛盾内容进入冲突待处理，用户可见新增通知，并可用追加失效观察撤销。自动业务事实仅供内部工作，正式评分和对外事实仍需既有核验。迁移 109 和服务层已实现记录、冲突、通知及撤销底座；任务自动抽取、完整界面和真实流程验收待完成。Neo4j 已本机部署，Graphiti 投影尚未就绪；本地模型仅通过合成样本契约，不得将图谱当作权威来源。

学习记忆页已按当前有效、历史时间轴、冲突待处理和通知分页展示，并与原有个人记忆分区切换。任务自动学习、Skill 分区和真实样本端到端验收仍是发布门槛。

既有主 Agent 的自动偏好保存现同步生成不可覆写观察，保留用户消息、任务及原版本收据，并按多市场/公司范围隔离。撤销同步影响旧版偏好与新观察；任务经验、业务事实自动抽取及真实任务验收仍待实现。

已完成的主 Agent 任务以账户和 run ID 幂等进入本地自由文本抽取队列；队列不保存正文。模型未就绪时保持排队，正式业务事实不因入队取得对外发布权限。

本地抽取 worker 只连接回环地址且摘要固定的 `qwen3:8b`，使用 JSON Schema、精确来源引文、租约及幂等键；本机真实模型五类合成样本通过，2 条真实任务消息只读测试未抽出偏好且无 Schema 拒绝，仍不足以验收召回质量。部署开关保持关闭。当前自动抽取范围仅为明确的用户偏好，经验和业务事实仍待独立验证。

Graphiti 本机依赖、Neo4j 连接和本地 LLM/嵌入模型预检通过，验证脚本关闭默认遥测。结构化节点/关系的合成写入、分组回读和清理通过；自由文本 episode 尚未通过实体/关系抽取质量门槛。图谱结果回库校验与停机回退仍未接入或验收；不得把本地探针记为图谱投产。

迁移 113 和本地 worker 已接通 outbox 收据、账户 RLS 读取、租约与延期重试；结构化观察通过 Graphiti 本地节点/关系接口投影，稳定 UUID 使重复投递幂等。合成投影、Node/Python 调用及本机数据库回滚探针通过。`ENABLE_MEMORY_GRAPH_PROJECTION=0` 仍保持生产消费关闭；真实 outbox 恢复、图谱回库端到端及停机回退尚待验收。

图谱候选只返回观察 ID，内部检索再次按 PostgreSQL 的账户、双时间、范围、失效与原文检查，业务起始时间缺失的结果显式标为 `unknown`。合成跨账户候选隔离、图谱不可用及陈旧候选回退聚焦测试通过；主 Agent 接线、真实投影重放和投影停机端到端尚未通过。未知业务生效时间的观察不被臆定为当前有效。

本机 Neo4j 服务实际停机期间，内部检索返回 PostgreSQL 路径；恢复服务后 Graphiti/Neo4j 预检通过。此停机验证仅覆盖读取回退，真实 outbox 投影中断恢复与主 Agent 端到端仍待验收。
2026-09-24 / MA24 文本增量补充：迁移 114 允许结构树直接引用 PostgreSQL 不可覆写的文本修订；新写入文本与已批准邮箱知识沿既有保存入口在同一事务中建树并切换当前版本。存量 11 份符合条件的文本已逐份回填。文本证据包含原修订 ID 和 Unicode 字符区间，正式读取重新校验当前哈希、权限和区间原文。旧入口原有 embedding 调用未改，新结构树无新增云端调用。300 题 Gold、50 题锁定集和主路切换仍未验收。
2026-09-24 / MA24 共享资料树补充：活动 v3 release 的 281 份已登记共享资料在本机校验源文件 SHA-256、字节数、活动 release 抽取产物 SHA-256 与块哈希后逐份影子建树；旧 v3 指针与向量保留。树节点沿用 Docling/v3 的页、幻灯片、工作表及块 ID，不表示精确引用质量已验收。新主路仍须 300 题人工 Gold 与 50 题锁定集对照达标后切换。
2026-09-24 / MA24 检索只读对照补充：无向量候选集合加入问题中型号的精确识别、已登记文档实体和活动 v3 块级实体关联，再与标题及全文命中组合，仍最多返回 24 份文档。开发/验证 250 题中需路由 226 题有 210 题找到候选；人工已审 11 题的来源哈希全部进入候选。该诊断不评分答案、页/行精确引用或无答案行为，锁定 50 题未读取。
2026-09-24 / MA24 备用候选补充：迁移 116 与影子会话的 v3 一次性备用候选已本机验证；当前 PostgreSQL 来源/版本/账号校验、撤销和跨账号拒绝通过，旧 v3 chunk 正文不作为引用。真实 WR3000 查询 14 个候选 chunk 对应 4 份有效文档，但新增 0；开发/验证集主路遗漏的 16 道路由题恢复 0，锁定集未读取。没有答案和精确引用质量改进证据，300 题人工 Gold 与 50 题锁定集对照仍是切换门槛。 [证据](MA24_VECTORLESS_MEMORY_ACCEPTANCE_2026-09-24.md)。
2026-09-24 / MA24 历史记忆补充：16 条旧邮件风格内部学习记忆本机幂等回填，16/16 来源和账号核对、未知业务生效时间及通知/outbox 完整性通过，重跑新增 0；旧表保留。修正真实 outbox 探针的租户查询与 Windows Python UTF-8 编码后，一条真实观察通过本机 Graphiti 投影、账号隔离、PostgreSQL 回校与重放拒绝；临时本机 worker 已将 16/16 条观察投影，待处理 0，默认开关仍关闭。旧 Agent/业务记忆样本与真实任务召回仍待验收。 [证据](MA24_VECTORLESS_MEMORY_ACCEPTANCE_2026-09-24.md)。
2026-09-24 / MA24 Gold 审核入口：用户选择在界面自行核对。来源新增原文短引与可选块 ID，同一资料可登记多个位置；无答案且无来源时须记录查证范围。活动共享来源校验、旧记录“已保存/精确来源已核”分离及 250 题精确审核后才解锁 holdout 的门槛已实现。本机审计为 development 已保存 11/190、精确 0/190，validation 0/60，holdout 0/50；没有自动补造人工答案。 [证据](MA24_VECTORLESS_MEMORY_ACCEPTANCE_2026-09-24.md)。
2026-09-24 / MA24 Gold 原文核对：审核界面支持按活动共享原件与单元编号预览当前树原文块并选取块 ID/短引；保存及解锁 holdout 前拒绝未出现在指定页及块内的短引。此检查只证明录入与抽取原文一致，答案和引文语义仍需人工审核。[证据](MA24_VECTORLESS_MEMORY_ACCEPTANCE_2026-09-24.md)。
2026-09-29 / MA24 Gold 辅助审核方式已确认：助手在当前对话逐题生成候选答案和来源，用户逐条选择、评价或修改。未确认的候选不写入人工 Gold；该工作方式不降低精确来源与锁定集门槛。用户明确确认 AP3000 的五题（打开原件、网口、PoE、与 AP3600 比较、部署场景）后均保存为 r2 并回读一致；development 精确来源 5/190，validation 0/60，holdout 0/50。存量 v3 块 ID 兼容修复经本机探针、9 项单测及 ESLint 验证。[逐题证据](MA24_GOLD_ASSISTED_REVIEW_2026-09-29.md)。
后续已逐题保存至第 43 题，来源字段完整计数为 43/190。完整读取并渲染两份原件第 3、4 页后，补齐 AP3600 概述中的 Gigabit PoE Out 证据；用户分别确认第 4、8、9 题修订，均保存为 r3，旧 r2 决定保留在证据记录。第 10 题场景答案与第 11 题 AP6500 原件答案均已明确确认并保存 r2；第 12 至 20 题确认 AP6500/AP11000 的原件、接口、供电和场景，均已保存 r1。接口答案区分 RJ45 与 SFP+，供电答案保留 802.3at/af 与 802.3at 的原件差异；第 20 题明确 AP11000 的场景是根据规格判断，原件相关页未列举特定行业。GS108 五题均已保存 r1；第 23 题按用户明确修改判定不支持 PoE，第 24 题比较 GS108/GS108D 相同接口、供电及功耗，第 25 题的部署判断注明来自规格，PoE 按 MA24-09 判定。第 26、27 题 GS108D V5.0 原件及 8 个物理网口已确认保存 r1，引用第 2 页真实型号、Features 和 Ethernet 块。第 28 题确认按 MA24-09 判定 GS108D 不支持 PoE 输入或输出，已保存 r1 并保留真实供电和协议短引。第 29 题确认两款交换机接口、供电和功耗一致的英文比较答案，已保存 r1 和 6 条来源坐标。第 30 题 GS108D 的部署判断注明来自规格，已保存 r1 和 2 条来源坐标；GS108D 五题均已确认。第 31 题 GS1010PE V2.0 原件答案已确认保存 r1，使用第 4 页真实 Package Content 型号块。第 32 题确认 GS1010PE 共 10 个物理网口（8 个 PoE 输出口加 2 个非 PoE 上联口），已保存 r1 和 2 条来源坐标。第 33 题确认 GS1010PE 的 PoE 输出标准、每口上限及 AC 输入，区分内置 120W 电源与全口输出预算，已保存 r1 和 3 条来源坐标。第 34 题 GS1010PE/HS105 比较已确认保存 r1 和 6 条来源坐标，区分 HS105 自身 DC 输入与适配器 AC 输入；完整六页 HS105 原件无 PoE 声明，按 MA24-09 判定。第 35 题 GS1010PE 部署答案已确认保存 r1 和 6 条来源坐标，保留 Extend 速率、Watchdog 与安装条件；GS1010PE 五题均已确认。第 36、37 题 HS105 V3.0 原件和 5 个 RJ45 口英文答案已确认保存 r1，来源登记第 4 页型号/接口块与第 2 页多速率原文。第 38 题确认 HS105 不支持 PoE 输入或输出的英文答案，已保存 r1 与 3 条供电、适配器和协议来源，按 MA24-09 判定。第 39 题英文比较答案已确认保存 r1，重新核验两份原件的 6 条来源坐标。第 40 题 HS105 的 NAS/高带宽部署英文答案已确认保存 r1 与 4 条来源坐标，保留管理功能、DC 供电与 250 米仅 10Mbps 条件；HS105 五题均已确认。第 41 题 LT400 V2.1 原件答案已确认保存 r1，使用第 1 页真实型号块并核对原件哈希；第 42 题确认 4 个百兆 RJ45 物理口，已保存 r1 和第 3、6 页两条来源坐标，WAN/LAN 不重复计数。第 43 题确认 LT400 不支持 PoE，已保存 r1 和 3 条真实 DC/适配器来源；完整 9 页原件按 MA24-09 判定。来源字段完整计数不等于整体答案质量通过。[更正过程](MA24_GOLD_ASSISTED_REVIEW_2026-09-29.md)。
2026-09-29 / MA24-09 PoE Gold 判定口径已确认：用户原话“未声明是否支持POE就是不支持”。完整核对匹配型号/版本的原件后，未声明 PoE 支持判为不支持；检索遗漏不算原件未声明。GS108 两页原件核对、真实来源短引及按明确修改保存的 Gold 回读通过；生产自动判定和整体质量对照未实现/验收。
2026-09-29 / MA24-10 类型授权已确认：同类 Gold 核对来源后自动采纳，新类型由用户审核。缺少型号的代表题获明确确认后，本机保存 8 条（代表题 1 条、自动采纳变体 7 条），回读一致；重放新增 0。当前审计 development 49/190、validation 2/60、holdout 0/50，均仅证明来源字段/行为备注完整；holdout 未解锁，答案质量对照未通过。[证据](MA24_GOLD_PATTERN_REVIEW_2026-09-29.md)。

后续本阶段新增 96 条：80 条已授权资料题与 16 条边界题（4 条新代表题明确确认、12 条同义变体自动采纳）。最新本机审计 development 141/190、validation 6/60、holdout 0/50，共 147/300；累计 48 条逐题明确确认、99 条类型授权自动采纳。清单来源预检、保存回读、幂等重放及执行器 ESLint 通过，原件版本/参数缺失/可选配置未抹平；无生产切换或质量对照通过声明。[本阶段证据](MA24_GOLD_PATTERN_REVIEW_2026-09-29.md)。
2026-09-24 / MA24 Skill 分区补充：个人长期记忆中的学习视图加入 Skill，按每页 12 条显示账户/全局范围、版本、来源和启用状态；账户所有者可停用并查看历史版本、恢复旧版本。含脚本或依赖的新导入默认停用，Agent 不能自行启用，界面标为待审核。重复成功方法的自动草案、历史回放、影子对照及自动启用仍未实现。
2026-09-24 / MA24 资料引用界面补充：资料列表按活动文档、当前树版本、同文档已登记附件或精确文本修订显示“可检索／待建立索引／来源或版本已失效”、树版本和来源哈希。读者在固定工作区分页浏览结构节点，点选后由服务端重校验权限、当前版本及来源，返回原文与完整坐标；旧检索正文收起供对照。该浏览能力不替代 300 题答案与精确引用验收。
2026-09-24 / MA24 真实上传补充：本地验收脚本用真实 PDF、PPTX、XLSX 各一份建立临时私有上传、抽取并注册，三类均生成当前可检索树并回读带块 ID 的页/幻灯片/工作表坐标；重复登记、跨账号拒绝、来源撤销禁引通过。迁移 115 的租约恢复用真实 PDF 作业验证有效租约不被抢占、过期租约由实际 worker 重领并完成；实际进程崩溃、人工引用精度和 Gold 对照仍待验收。
2026-09-24 / MA24 图谱交付补充：隔离 PostgreSQL 克隆库的合成观察经实际 outbox 消费函数投影本机 Graphiti，随后图谱只返回候选 ID、PostgreSQL 重新校验账户与原文；跨账户和重复交付保护通过。权威库无合格待投影真实观察，本次不声称生产偏好召回已验收。主 Agent 的 OpenRouter 模型会接收工具输出，私有原文的新检索工具暂不进入生产上下文；上线还须符合既定本地隐私及 300/50 Gold 门槛。
2026-09-24 / MA24 PageIndex 参考试验：隔离的 0.2.19 SDK 经本机 Ollama 索引两页合成 PDF，返回 2 节点；无模型 Flash 同样给出 2 个页节点。运行期非回环连接被脚本阻断且计数为 0；缓存公开 tokenizer 是试验前经本地代理准备，不涉及私有内容。其摘要不进入正式引用，产品 PDF/PPTX/XLSX 仍使用现有本地抽取与 PostgreSQL 树，真实质量对照待 Gold 补齐。
2026-09-24 / MA24 Skill 自动启用边界修正：所有导入版本先保存为停用草案；账户级纯指令版本只有带历史回放和影子验收通过标记时才允许 Agent 启用，脚本、依赖和全局版本仍拒绝 Agent 自行启用。当前尚未交付评测器，因此不标记任何新版本自动通过。记忆中心显示待验证/待审核，手动启用仍是用户动作。

2026-09-29 / MA24-10 第三阶段：86 条同类资料题及四种新边界类型的 16 条题已保存并回读，重放新增 0。当前 development 189/190、validation 60/60、holdout 0/50，共 249/300（52 条明确确认、197 条类型授权自动采纳）。全部已保存 Gold 的 494 条坐标匹配当前活动原文，前 43 条决定与阶段快照一致；开放式型号差异题待审核，holdout 未解锁。来源一致不替代回答质量对照。[证据](MA24_GOLD_PATTERN_REVIEW_2026-09-29.md)。

2026-09-30 / MA24-10、MA24-11：用户逐题确认 WR3000/WR6500H 开放比较 Gold，并明确确认冻结既有 v3 检索配置以解锁 50 题。冻结前 250 条开发/验证题重新核验，profile key/hash 回读一致；锁定集 40 条资料及 10 条边界题按已确认类型自动采纳，重放不增加修订。Gold 共 300/300（53 条逐题明确确认、247 条类型授权自动采纳），604 条当前原文坐标匹配，前 43 条旧决定未变。PPTX/XLSX 与新增资料答案引用样本、锁定集 v3/新主路回答与精确引用对照均待验收；不以 Gold 完整性声明主路质量达标。[证据](MA24_GOLD_LOCKED_REVIEW_2026-09-30.md)。

2026-09-30 / MA24 无向量候选只读诊断：全文型号前缀匹配修复开发/验证集 SM10G 四题漏检；全部 270 条 route 中 255 条候选覆盖所有预期文档哈希，锁定集仍为 41/44。剩余 15 条为三类抽象概念问法；此为文档级召回，不是回答正确率或精确引用率。v3 冻结配置未改。[前后收据](MA24_GOLD_LOCKED_REVIEW_2026-09-30.md)。

2026-09-30 / MA24-02 文档集合来源边界：本地文本探针建入有效私有修订与无原始修订的合成树；计数与筛选仅返回有效当前版本。跨账号、来源哈希过期均返回空，删除后的原文仍不可引用。临时资料已清理；TypeScript、ESLint 和聚焦检索单测通过。该安全验证不替代锁定集答案与精确引用对照。[收据](evidence/ma24-document-set-source-boundary-2026-09-30.json)。

2026-09-30 / MA24-03 PPTX/XLSX 补充来源验收：原件 SHA-256 与当前树一致，PPTX 第 12 张幻灯片及 XLSX `Price List` 第 329/330 行分别通过独立原件核对、权限约束的 `readEvidence` 精确短引和坐标核对。中文四字片段回查令漏检 PPTX 题从 0 份候选恢复为包含原件的 9 份；XLSX 保持 2 份候选。300 题开发/验证/holdout 文档级覆盖保持 163/172、51/54、41/44，30 道非路由题没有候选；这不是答案或精确引用正确率验收。[证据](MA24_SUPPLEMENTAL_FORMAT_REVIEW_2026-09-30.md)。

2026-09-30 / MA24-01 冻结集降级检索预检：已冻结 50 题中 44 道路由题的所需原件全部进入无向量候选为 41/44；活动 v3 在没有 Qwen/BGE 查询向量时为 40/44。此预检无外部调用、无生成答案、无精确引用评分，不满足完整 v3 与新主路质量比较门槛；保留生产 v3 指针。[逐题收据](MA24_HOLDOUT_RETRIEVAL_PREFLIGHT_2026-09-30.md)。

2026-09-30 / MA24-04 本地自由文本业务事实：独立本地 Schema 在英文、中文“我司/Our”事实样本各提取 1 条，问题、假设、请求、第三方和未确认政策样本各 0 条；原五类偏好样本保持通过。队列事务给业务事实写入原句来源、`unverified-internal-only` 用途、最高 0.7 置信度，不推断生效时间；通知/outbox 仍由同一观察事务产生。聚焦单测、ESLint、TypeScript 通过；尚未验证真实正例任务和生产消费循环，因此不标记自动学习完成。[收据](evidence/ma24-local-business-fact-extraction-2026-09-30.json)。

2026-09-30 / MA24-01 锁定集答案判分：只读本机判分脚本已绑定 50 题盲测清单、冻结 profile 与 Gold 快照，并要求 v3/无向量每题各一份带收据回答及绑定回答哈希的人工答案和精确引用判决。缺失、重复、漂移与判决后改写拒绝通过；按 base/boundary 和标签出分组。当前无双路径回答及判决，实际探针显示缺 100 份回答、质量门槛未通过，生产主路未切换。[证据](evidence/ma24-holdout-answer-scoring-contract-2026-09-30.json)。

2026-09-30 / MA24-01 本地 BGE 预检：固定 SHA-256 的 BGE-M3 快照在回环服务实际加载，1024 维查询向量通过；44 道需资料的锁定题中，新主路文档候选覆盖 43 道，v3 事实/全文降级覆盖 40 道，v3 加本地 BGE、缺 Qwen 时覆盖 42 道。三组均未生成答案或评分；服务探针后停止，无外部调用，完整 v3 基线与生产切换仍待门槛。[证据](evidence/ma24-holdout-local-bge-preflight-2026-09-30.json)。

2026-09-30 / MA24-04 图谱补充：隔离克隆库的合成已完成任务经本地 `qwen3:8b` 抽取内部业务事实后，outbox 真实投影本机 Graphiti。图查询按账号返回观察 ID，并回 PostgreSQL 校验时间和原文；模拟图不可用时 PostgreSQL 回退返回同一观察。跨账号拒绝、夹具清理和正式事实/评分零写入通过。持续 worker 与自然任务的正样本质量仍未验收。[证据](evidence/ma24-business-memory-graph-clone-e2e-2026-09-30.json)。

2026-09-30 / MA24-12 一次性付费评测授权：用户批准冻结 50 题的双路径对照，最多 50 次 `text-embedding-v4` 查询向量和 100 次 `kimi-k3` 回答，仅用已登记共享资料，总额人民币 100 元硬上限，超限立即停止并保留部分结果。本地已验证专用费率/累计预留上限契约；ECB 2026-09-29 官方汇率免费刷新、冻结盲题单/Profile/Gold 与预算预检通过，当前模型调用 0 次。逐题外发校验、实际调用、答案评分和主路切换均未完成。

2026-09-30 / MA24-12 调用器预审计：逐题断点恢复、付费阶段不重放、单次请求字节数、共享已登记当前原件且可外发校验通过。旧 v3 的 44 道资料题无查询向量审计中，200 次公开原件命中允许进入评测上下文，49 次未标记可外发的目录/培训资料命中被排除；两道题双路径零付费演练完成。仍需实际模型答案、用户或审核人在界面逐条判定准确答案与精确来源后，才能比较质量。

2026-09-30 / MA24-12 两题实跑：2 次 Qwen 查询、4 次 Kimi 回答，保守累计预留 3,830,938 CNY 微元，未获取完整实际账单。首题初版“打开原件”答案过长，原始模型输出本机归档，候选已改为不额外发起模型调用的原件直链；第二题双路径候选均引用原始资料。未据此宣称 50 题质量通过。

2026-09-30 / MA24-12 批量恢复：第 5 题 v3 的 Kimi 请求超时，旧调用未重发，仍按单次最坏费用占用评测 100 元硬上限；其他题继续。主账号 MA05 观察模式使常规账单预留为 0，评测器直接计入每笔原币上限且已验证 5 次 Qwen、10 次 Kimi 合计含缓冲 9,577,345 CNY 微元。9 条回答候选已落盘，失答路径与人工评分待完成。

2026-09-30 / MA24-12 原件直链修正：`BU530C` PDF 第 1 页无可检索文本块，已改用最早可核验的第 2 页原文坐标支持原件直链；原模型答案归档并保留付费收据，正式候选未额外调用模型。实际数据库回读显示两条路径均为本地直链候选、来源页码为 2。

2026-09-30 / MA24-12 中断恢复：人工暂停批量进程后，`base-45-ports:v3` 留下一笔已预留而未结转的付费请求。进程退出、操作锁可用且记录过期后，该笔结转为未知结果并保留最坏费用占用；回读确认状态 `unknown`，没有重放或伪造答案。

2026-09-30 / MA24-12 首次全题运行：冻结 50 题产生 92/100 条候选，50 次 Qwen、81 次 Kimi；8 次 Kimi 未获可用输出。所有 131 笔均计入人民币 100 元上限，最坏费用含 5% 缓冲为 77,617,354 CNY 微元。显式一次恢复入口已通过代码检查，恢复调用和人工判分仍未完成。

2026-09-30 / MA24-12 一次受控恢复：8 条缺口中 7 条取得答案，现 99/100 条候选、50 次 Qwen、89 次 Kimi，最坏费用含缓冲 85,262,026 CNY 微元。唯一剩余 `base-43-explain:v3` 连续两次 Kimi 传输未得答案，均保留收据与占额；第三次定向恢复已将公开证据缩至 4 块，零付费请求审计为 12,503 字节，尚未实际发出。

2026-09-30 / MA24-12 候选齐备：定向恢复后 100/100 条候选，50 次 Qwen、90 次 Kimi，最坏费用含缓冲 86,217,610 CNY 微元，生产主路未切换。冻结判分回读 0 条缺候选、100 条缺人工判决，因此 `complete=false`；预审计有 1 条资料题无引用、5 条非资料题多余引用、7 条畸形 KB 标记。错误候选保留供人工评价，不能因格式错误从质量分母剔除。

2026-09-30 / MA24-12 冻结集人工评分入口：复核中心已在本机显示 50 题的已审核 Gold、两条路径回答与当前原件链接，每条路径必须分别选答案及精确引用正确性，判决绑定候选哈希和登录管理员并记录修订历史。未登录、候选哈希漂移拒绝；桌面和手机视口只读检查通过，原有事实/Gold 界面仍通过。当前尚无人工判决，正式非退步门槛与生产切换未通过。[界面证据](evidence/ma24-holdout-answer-review-ui-2026-09-30.json)。

2026-09-30 / MA24-05 记忆图谱 Agent 影子入口：只读工具显式开关默认为关闭，知识页范围内不可调用；图候选须由 PostgreSQL 重新核对账号、双时间、适用范围及失效关系，故障时回退。权限/开关与调用参数 11 项聚焦测试通过；没有真实任务影子效果证据，不启用生产 Agent，也不将内部记忆作为正式事实。[证据](evidence/ma24-agent-memory-graph-shadow-2026-09-30.json)。

## MA19-02 本地运行复核（2026-10-08）

2026-10-08 前端审查（MA23-03）：清点33个组件文件、51处details、8处aria-expanded，定位邮箱管理引用未定义背景变量，以及8封分页与5封授权限制不一致。用户提供透明重叠和滚轮问题反馈。浏览器控制无可用连接，本轮仅静态审查，方案待确认、功能未修改，不构成视觉或交互验收。[逐项记录](FRONTEND_DISCLOSURE_AUDIT_2026-10-08.md)。

邮件：系统 DNS 下真实 IMAP 登录通过，本机恢复 system 模式；已有成功同步收据为发现 124、导入 100，未宣称全部邮件同步完成。主模型：HTTP 400 与历史无效工具 JSON 已定位；传输副本规范化及图流程 11 项测试通过，不修改原始执行状态。真实模型复跑尚未完成。

worker 代理兼容修复：相同启动链访问本机 LangGraph 从 502 恢复到 200；调度验证通过（4 请求、0 外部模型调用），两处修改脚本 ESLint 通过。后台 worker 已重启，用户中断任务尚未重跑。

默认不依赖 TUN 的规则已确认。恢复后产品 `127.0.0.1:3018` 与 LangGraph `127.0.0.1:2024/ok` 均返回 HTTP 200；PostgreSQL 容器健康，Neo4j 与 Ollama 可达。此记录只证明本地服务可用，不证明所有外部连接已摆脱 TUN，也不表示邮件简报或冻结集质量门槛已完成。当前浏览器控制无可用浏览器，自动打开页面未完成，提供本地页面链接由用户打开。
# MAILUX-02 验收补充（2026-10-08）

MODELDIAG-01：获准的单次合成 GLM/Fireworks 诊断已执行；真实响应证明 Fireworks 上游临时限流（429，Retry-After=5）。已确认具体故障原因，未确认业务恢复；未追加重试或更换路由。

主模型 429：已核实真实回执两次 HTTP 429；新增分类及图提示测试通过，错误原文不泄露，不执行后续工具。网关的实际限流解除仍未验证，不能标为业务恢复完成。

运行时恢复补充：受限环境外网 EACCES 预检可阻断启动；正常权限下公开模型目录 HTTP 200，LangGraph ready。此项仅验证网络和运行时，不等于真实模型回答已成功。

邮箱与知识资料桌面/手机隔离浏览器共 6 项通过；邮件阅读容器占测试视口约 73%，长正文内部滚动、手机列表往返、600px 矮窗口、管理窗口滚动及分页通过。其他页面只有结构审查；记忆多层导航和复核中心介绍压缩仍为建议。证据与范围见 `READING_SPACE_AUDIT_2026-10-08.md`。
# 2026-10-10：邮件/外联 OpenRouter 本地验收

52 项相关单元/API 测试、TypeScript、聚焦 ESLint 和生产构建通过。验证八封已授权邮件入队、缺少授权/错误网关阻断、无旧密钥直连回退、K3 参数和外联引用保留。没有新增真实付费模型调用；不把模拟验证当作真实业务输出验收。详见 [记录](OPENROUTER_KIMI_MIGRATION_2026-10-10.md)。
# 2026-10-10：RAG 回答网关迁移验收

旧版 Kimi 回答迁入 OpenRouter，54 项相关本地测试、类型检查和聚焦 ESLint 通过；公开来源外发边界与嵌入配置保留。冻结集脚本仍锁定旧配置，不修改旧授权重跑。详见 [记录](OPENROUTER_RAG_MIGRATION_2026-10-10.md)。
# 2026-10-10：旧意图分类主备网关验收

74 项本地测试覆盖主备网关调用、鉴权失败停止、结构重试、截断拒绝、失败收据和图执行回归。类型检查与聚焦 lint 通过，无新增付费调用；[详细记录](OPENROUTER_INTENT_MIGRATION_2026-10-10.md)。
# 2026-10-10：旧意图识别停用验收

MODESEL-15：53 项本地测试通过。旧入口仅返回停用提示，配置密钥也不会产生分类调用或下游工具调用；新版模式回归通过，无新增付费调用。[证据](LEGACY_INTENT_DISABLED_2026-10-10.md)。
# 2026-10-10：DeepSeek 业务网关验收

研究/评分/联系人核验适配器迁至 OpenRouter，106 项 provider 与业务回归、类型检查、聚焦 lint 通过。缓存和付费指纹按真实网关请求计算；未新增付费调用。详见 [记录](OPENROUTER_DEEPSEEK_MIGRATION_2026-10-10.md)。

### MA24-01 / MA24-02 / MA24-14 实施状态补充 — 主任务来源及范围（2026-10-10）

主 Agent 来源复核已覆盖模型前后、后续工具、完成保存及 checkpoint 恢复；默认关闭的无向量工具现可按指定账号进入知识页影子流程，范围取自任务保存值，并在每次原文和集合 SQL 中重查。52 项相关回归、类型/Lint 与隔离数据库范围验证通过；此为工程证据，持续服务加载与独立质量验收另记，未切换生产主路。见 [分阶段记录](MA24_REMAINING_PLAN_2026-10-10.md)。
### MA24-07 / MA24-14 实施补充：Skill 自动启用包校验（2026-10-10）

修复脚本识别只覆盖 py/js/mjs 的缺口。自动启用或回滚在读取目标版本时重新检查真实文件与依赖；仅 MD/TXT 指令文件可进入后续自动评测门槛，未知文件类型、无扩展名脚本、PowerShell/批处理/TypeScript、shebang 或显式可执行代码块均需人工审核。历史 validation 写“无脚本”不能绕过检查。人工管理路径保留，已启用历史 Skill 未批量变更。33 项 Skill 回归、TypeScript 和定向 ESLint 通过；重复成功经验生成草案与回放/影子评测器仍未完成，不把此静态检查当作质量验收。
### 2026-10-10 本机加载证据

本轮三个修复提交 `2f240bf`、`a1e94a4`、`b856736` 已经通过本地代理推送至 origin/main。Next 生产构建、52 项知识回归、33 项 Skill 回归、类型与定向 Lint 通过；3018 网页与 2024 LangGraph 已重新加载，HTTP 均为 200，10 项网页静态资源全部成功。主 Agent 队列为空时更新，邮件 worker 未停止，更新后继续处理任务。未新增付费模型调用；独立测评、连续记忆/Skill 影子质量及主路发布仍未完成。[机器收据](evidence/ma24-runtime-guards-2026-10-10.json)。
### MA24-04 / MA24-05 / MA24-14 — 记忆恢复与冲突隔离（2026-10-10）

已实现：队列仅选择活动账号的已完成主 Agent 任务；领取租约后才检查本地模型，过期处理中任务在模型离线/原文过长时也按令牌回队并设置下次时间。失去租约不覆盖新 worker 的结果，存储事务失败可回队，worker 的本地依赖异常不会退出常驻循环。本地 HTTP 禁止跟随重定向。

当前有效记忆和 Graphiti/PostgreSQL 召回共用按“已知时间＋业务时间”判断的冲突隔离：冲突双方不进入普通召回，后发生的冲突不会污染更早已知时间；撤销一方后另一方恢复，旧时间快照仍保留当时冲突。“冲突待处理”不再显示已被更正/撤销消除的争议，原观察和冲突历史不删除。

验收：19 项定向回归、TypeScript、定向 ESLint 通过。`verify-memory-recovery-clone.ts` 使用隔离数据库及 loopback 模型替身，实际终止并重启 worker；过期租约重领后只产生一条观察、一条通知、一条 outbox；取消任务不阻塞队首。业务时间、已知时间、撤销、图谱停机回退和跨账号检查通过，夹具清理完成。替身不是 qwen3 抽取质量证据；自动经验提炼、持续真实本地模型验收及 Skill 回放/影子流程仍待完成，生产开关仍关闭。


### MA24-04 / MA24-07 / MA24-14 — 本地经验与 Skill 候选（2026-10-10）

本地 qwen3:8b 现可抽取用户明确报告的做法与结果，包括失败教训；经验正文保留精确来源句，置信度上限 0.7、业务生效时间未知、来源标记 user-report / successVerified=false。计划性建议、第三方引文、权限绕过不作为经验。这里只新增内部观察，不把用户报告改写成已核实事实或成功证明。

工作器保存经验后，两个不同已完成任务中、相同 memoryKey 和相同原句的正向报告可提名一份停用的账户 Skill 草案。二次报告是本实现的候选提名条件，不是新增用户确认的质量阈值；含失败/否定、冲突、撤销、来源不匹配、范围非全账户或凭据/脚本的报告不提名。草案保留观察/任务/消息 ID 与收据哈希，重放不重复创建，不改动已有 Skill，不自动启用。尚未独立验证成功的候选需先核实来源与适用条件，再做历史回放、错误案例、注入、权限与真实任务影子对照。

证据：8 文件 69 项回归、类型与定向 Lint 通过；真实本机 qwen3:8b 的六项合成契约通过（成功报告 1、中文失败教训 1、计划/引文/绕权限/普通事实各 0），不向数据库写入质量样本。隔离库实际 worker 崩溃恢复、双时间冲突与撤销、两次报告提名、幂等重放、自动启用拒绝均通过。自然任务长期质量、结构化工具收据学习、用户纠正和完整 Skill 评测器仍未完成；生产自动学习开关尚未开启。


### 本机加载与后续顺序（2026-10-10，记忆阶段）

提交 `99df5e3`、`38b0d98` 已通过 127.0.0.1:7892 推送 GitHub；迁移 121 已在隔离库验证并应用本机。生产构建成功，产品 3018 和 LangGraph 2024 已加载，HTTP 均为 200，10 项静态资源正常；邮件 worker 未停止。经验抽取与 Skill 提名代码已就绪但自动学习开关仍关闭。下一步补用户纠正与结构化收据学习、Skill 回放/影子评测器，再开展 Codex 引导的新独立质量审核；不得将本轮 69 项回归和 6 项合成模型契约等同于独立质量通过。[验收收据](evidence/ma24-memory-recovery-experience-2026-10-10.json)。
### MA24-04 / MA24-14 — 显式记忆更正入口（2026-10-10）

学习记忆的当前记录、历史时间轴和冲突页新增更正入口，采用原记录下展开的表单与固定高度分页区域。保存完整新内容和可选原因；保留原观察、来源、范围与业务有效时间，未知时间不推造。服务端从原记录继承类型/范围，并建立 corrects_id、用户更正收据、通知和 outbox；客户端不能指定账号、权限、来源或核验状态。更正后的业务事实仍为内部未核实记忆，不触发发布或 Skill 启用。

同一更正请求幂等；更正与撤销竞争及不同更正竞争仅接受一个版本，旧页面提交返回 409 并保留草稿。被更正的原记录不能再直接撤销；撤销更正记录只使该记录失效，不自动恢复已被替代的内容。旧 agent-memory 镜像保持原管理入口，避免只改观察而遗留旧偏好。更正业务时间的专用界面、对话中自由文本纠正的自动匹配、可靠工具收据学习仍待后续实现，本阶段不宣称这些已完成。

验证：5 文件 29 项测试、TypeScript 和定向 ESLint 通过。隔离数据库验证并发、幂等通知/outbox、跨账号拒绝、范围保留、未知时间、双时间历史、过期图谱候选与撤销。真实组件的本地浏览器合成接口测试覆盖 1366/390/320 宽度、取消不写入、错误保留草稿、保存刷新、焦点与滚动，无外部请求、模型调用或正式账号数据修改。组件测试与数据库测试分别执行，不等于自然任务质量验收。Next 生产构建通过；本轮没有数据库迁移，未切换自动学习或检索主路。
本机产品 3018 已加载本轮更正入口，LangGraph 2024 保持可用，两者 HTTP 200，11 项静态资源检查通过；邮件 worker 未中断。无模型调用，自动学习与检索主路开关不变。验收记录见 docs/evidence/ma24-memory-correction-2026-10-10.json。
### MA24-04 / MA24-05 / MA24-14 — 结构化只读收据学习首批（2026-10-10）

本地记忆 worker 在领取租约后、探测本地模型前，读取当前账号已完成主 Agent 任务的服务器工具收据。首批仅支持 version=1、effect=read 的 knowledge_compare 与 vectorless_aggregate；核对输入哈希、输出 Schema、对象/字段对应关系、集合子集与计数一致性。每批 100 条，按数据库原始时间精度与 ID 继续翻页，不丢弃后续收据。未知工具/版本、部分集合结果及不合契约的收据不参与本批学习。

产生的是历史执行经历：固定模板说明比较方法、当时缺项/冲突计数或当次候选子集数量，保存任务/调用 ID、持久化 JSON 输入输出哈希及执行时间。原文、型号、自由文本指令均不复制为经验；业务生效时间未知。successVerified 与 answerQualityVerified 均为 false，不转正式事实，不进入重复用户报告的 Skill 提名，也不自动启用。后续引用原始业务信息仍须重新验证权限、状态和来源。

观察、通知、outbox 同事务幂等；模型缺失时收据可先保存，自由文本仍排队。重试不重复通知，撤销后不复活。失效租约/跨账号/未完成任务不能写入；收据存储、模型、记忆存储错误分别记录，不把数据库故障统一报成模型故障。本阶段没有回填已 ready 的历史任务，也未实现所有工具的业务事实学习、自由文本纠正自动匹配或 Skill 效果评测。

验收：4 文件 46 项回归、TypeScript、定向 ESLint 通过。隔离数据库执行真实只读比较，模拟本地模型不就绪，验证收据保存/文本排队、哈希、幂等、撤销、账号与租约隔离，未创建 Skill；真实 worker 的终止重启、过期租约及既有冲突/草案门禁复测通过。仅使用本地数据与合成夹具，无实际模型调用或外部请求。持久 worker 未启用，自动学习与检索主路仍关闭；本次后端 worker 模块没有要求重启网页或邮件服务。详见 docs/evidence/ma24-tool-receipt-memory-2026-10-10.json。
### MA24-04 / MA24-14 — 对话中的明确记忆更正（2026-10-10）

已接入已完成主 Agent 任务的首条已保存用户消息。首批严格识别完整指令：更正记忆：“旧内容”改为“新内容”，或 Correct memory: "old content" to "new content"（两段各 3～800 字符）。这是确定性指令解析，不是任意自然语言的语义匹配，也未宣称完成所有自由文本纠正。用户原话/旧正文精确匹配本账号唯一未替代记录，并且记录为当前账户级本地学习或用户更正来源，才自动建立 corrects_id。旧版偏好、市场/公司限定、非当前业务区间、多重匹配、未解决冲突、政策/权限/生效时间修改均不自动替代；第三方引文/代码块不被识别为更正指令。

存储前重查任务、账号、用户角色消息及当前租约；同事务保存新记录、消息 ID/SHA-256/完整更正指令、通知与 outbox，并完成抽取工作。新内容继承原类型、范围、业务时间和内部权限，未知时间不推造；不同于“从现在开始”的有效期变化。匹配不明确或受限的显式指令生成“未自动替换”的学习通知，保留原记录。相同消息重放幂等，撤销后不复活；既有界面更正逻辑复用，旧版记忆原管理入口不变。

验收：6 文件 72 项回归、TypeScript、定向 ESLint 通过。隔离数据库覆盖完整 worker 入口、消息哈希、新旧关系、通知/outbox、重试、撤销、多重匹配、范围、冲突、越权与失效租约；界面更正的双时间和并发数据库探针、结构化收据离线探针均复测通过。无模型或外部请求，生产自动学习仍关闭。本轮没有生产数据回填或服务重启；尚需一般自然语言纠正的本地模型质量验证、自然任务持续学习及 Skill 回放/影子质量验收。收据：docs/evidence/ma24-message-memory-correction-2026-10-10.json。

### MA24-07 / MA24-14 — 本地原生工具协议修复与合成复测（2026-10-10）

修复上轮把整个 assistant 工具消息作为普通结构化 JSON 正文生成的适配。原生图回放改用 Ollama tools / message.tool_calls，传入产品已有的 discover_tools、describe_tool、execute_tool 定义；对象参数与产品字符串参数双向转换，生成稳定且唯一的调用 ID。工具结果按 tool_name 配对。只有实际成功的 describe_tool 收据出现后，本地适配才向模型提供 execute_tool，服务端仍逐项检查工具、描述状态、参数 Schema 与原始收据。未生成虚假的描述成功收据，也未改生产模型的工具提供策略。[协议依据](https://docs.ollama.com/capabilities/tool-calling)。

错误分别记录 local-timeout、local-transport、local-http、local-json、local-incomplete、local-schema；不回显原始错误正文。原生图回放等待上限调整为单次 120 秒，每路最多 8 次，1024 输出 token，不自动重试、不走云回退；旧固定编号回放保持 45 秒。该上限是本地开发执行参数，不修改三种生产模式阈值。配置哈希包含本地等待、生成参数和分阶段工具提供规则。

验证：6 文件 63 项回归、TypeScript、定向 ESLint 通过。本轮真实 qwen3 合成开发共 13 次调用：v2 两路各 1 次，跳过描述被阻断；v3 基线 3 次完成、候选 2 次后 local-timeout；v4 最终两路各 3 次完整完成描述→读取→回答，各绑定同一条收据。两路均答 Synthetic A 为 2 个 RJ45（第 3 页）、B 为 3 个（第 4 页），与合成原文一致。旧失败记录保留，不回改为通过；最终协议检查通过不等于独立质量或真实 Skill 效果通过。验证脚本后续若任一路未完成或未消费原文收据，返回非零退出码。

结果仍待审核，不启用 Skill，不切检索主路，不重启生产服务。本轮仅合成数据、无云模型或真实工具执行。后续仍需审核判分与启用证据门禁、真实任务非退步及正式模型影子验收。证据：docs/evidence/ma24-skill-native-tool-protocol-2026-10-10.json。


### MA24-07 / MA24-14 — 复用主 Agent 图的历史回放适配（2026-10-10）

已新增 skill-graph-replay.ts；本机历史回放命令可显式选择 --main-graph。复用生产 buildMainAgentGraph 的安全边界、模型/工具节点、重复动作保护及停止状态；使用真实 productPrompt、三种知识工具目录与输入输出 Schema。模型按 discover_tools / describe_tool / execute_tool 结构交互，执行器要求先描述、再按 Schema 匹配完全相同的历史参数，仅返回已保存收据。没有生产 dispatchTool、真实工具执行、任务写入或检查点写入。每路最多 8 次模型请求；来源复核沿用上阶段，失效时不能保存为完整评测对。

本地适配将产品的字符串参数/调用 ID 转为 Ollama 历史参数对象/工具名；仍是本地结构化输出适配，不等于原生产供应商模型。结果保存完整消息、工具调用/收据哈希、Prompt/工具 Schema 与配置哈希；标记 productionGraphReused=true、productionAgentEquivalent=false、liveShadow=false、autoEnable=false。未重放账户动态政策、原完整对话和生产模式备用模型，也不宣称完成真实在线影子验收。

验证：6 文件 57 项回归、TypeScript、定向 ESLint 通过；涵盖发现→描述→读取→回答、越权工具阻断、缺少描述/不匹配收据、重复动作停止、来源变化不保存及历史入口选择图执行器。另以真实本机 qwen3 运行一道合成开发题，共 2 次调用：基线路径首轮 model-or-schema-error；候选路径将 knowledge_compare 误作顶层函数，被 invalid-execution-input 阻断。该模型契约检查未通过，失败原样保存，无实际工具或云模型调用。不得将共用图的测试通过写成本地模型多轮通过或质量非退步。下一步需修复/验证本地消息协议适配，并补正式模型影子、审核判分与启用证据门禁。生产服务和开关未变。证据：docs/evidence/ma24-skill-main-graph-replay-2026-10-10.json。


### MA24-07 / MA24-14 — 账户历史收据快照与回放前复核（2026-10-10）

已实现内部历史回放入口 prepareHistoricalSkillReplay / runHistoricalSkillReplay，及操作者本地命令 scripts/run-historical-skill-replay.ts。账户由受信调用方或本机操作者明确指定，不作为 Agent 工具或未认证 HTTP 接口。只接受活动账号拥有的账户级纯指令 Skill 和已完成主 Agent 任务；保存的首条用户消息须与任务 input.content 一致。首批只接受 version=1、completed/read 的 knowledge_search、knowledge_compare、vectorless_read，任务含任何其他工具、非只读/未完成调用或超过 24 条收据即拒绝，不静默省略。

快照绑定 Skill 包/来源、用户消息/任务输入、工具调用 ID、输入/输出哈希及原始收据。使用既有知识证据检查复核当前权限、发布版本、原文与已核实事实；Skill 经验来源同时复核。每次向本地 qwen3 提供上下文前后、每对结果保存前及最终返回前，重新读取并比对快照。来源变化时中断，保留已写的局部结果及中断标记，不能将局部结果作为通过。仅直连本地模型，不使用云回退，不执行真实工具，不修改原任务/Skill/正式评分。

验证：5 文件 56 项回归、TypeScript、定向 ESLint 通过。隔离数据库用合成账号、任务与 Skill 执行真实只读 AP3000/AP3600 比较，验证快照哈希稳定、跨账号拒绝、取消任务拒绝、非只读/参数篡改拒绝、原文收据被改后拒绝及恢复；未改共享原件，夹具清理完成。运行中来源失效不保存答案由服务测试验证。本轮模型调用为 0，未抽取正式账号任务或重启生产服务。

限制：这是历史知识收据的本地固定证据回放，不重放完整对话、动态检索或原生产模型；不支持邮件、无证据的澄清/无答案任务或真实 live-shadow。结果仍标记待审核、autoEnable=false、productionAgentEquivalent=false。尚需正式 Agent 影子适配、审核判分/启用证据存储及独立质量验收。收据：docs/evidence/ma24-skill-replay-snapshot-2026-10-10.json。


### MA24-07 / MA24-14 — Skill 成对收据回放执行器（2026-10-10）

已实现合成开发回放：同一题、模型与工具结果分别运行基线和 Skill 候选，隔题交换执行顺序，分离上下文。模型只能选择固定只读收据编号，工具名称与收据必须匹配；没有真实工具执行回调。未知工具、未知编号、Schema 错误、模型失败及步数耗尽保留为失败/未完成，不改为正确答案。当前实施上限为每路 4 次模型调用、每次 1024 输出 token、45 秒超时；这是开发运行参数，不是新增用户确认的产品阈值。

命令 scripts/run-skill-replay.ts 仅接受合成题，直连本机 qwen3:8b 并核对已登记模型 digest，使用独立直连 dispatcher、禁止 HTTP 重定向，不调用云模型。运行前冻结题目、Skill/来源/收据、Prompt、配置及代码哈希；逐对保存结果到 Git 忽略的 tmp/skill-replay 独立目录。结果始终为待审核、autoEnable=false、productionAgentEquivalent=false，不写正式评分、不更新 Skill 启用状态。尚未接入账户权限复核的真实任务快照导出，不能仅凭手填 runId 将样例升级为真实影子证据。

验证：4 文件 43 项回归、TypeScript 和定向 ESLint 通过。本机真实 qwen3 合成开发验证共 3 轮、14 次调用：前两轮参数对象被模型改写，失败记录保留；改为固定收据编号后，最终两题四路均完成，共 6 次调用。取证题两路均答 2 个 RJ45、第 3 页，未执行原文中的发信注入；权限题两路均拒绝他人私有政策。以上是接口与合成行为观察，未登记人工判分，也不是独立质量、完整提示注入测试或正式 Agent 非退步证据。生产服务及自动学习/检索主路开关未变。后续：真实任务授权快照、正式 Agent 影子适配、审核收据与自动启用证据门禁。详见 docs/evidence/ma24-skill-replay-harness-2026-10-10.json。


### MA24-07 / MA24-14 — Skill 经验来源使用前复核（2026-10-10）

已实现来源门槛：本地重复经验产生的账户 Skill，在启用、发布、回滚和每次读取固定版本时，重新核对账户、包哈希、方法指纹、全部观察/任务/消息 ID 与收据哈希。来源必须仍是当前有效、未更正/撤销、无活动冲突的账户级用户经验，原消息和已完成任务必须存在。失效时拒绝返回内容与重新启用，人工管理同样不能跳过来源失效；停用及历史版本保留。普通导入包的管理路径不变。该检查只证明来源仍可用，不证明经验成功或允许自动启用。

验证：4 文件 40 项回归、TypeScript、定向 ESLint 通过。隔离数据库验证实际候选生成、未评测自动启用拒绝、人工合成启用、任务版本固定、冲突阻断、撤销冲突后恢复、撤销原来源后再次读取/启用/回滚拒绝，以及停用和版本历史保留；夹具已清理。无模型调用、无外部请求，没有更新生产服务或开关。限制：已写入任务上下文的旧 Skill 内容尚未做逐模型轮次清退；本检查在再次读取时生效，不应宣称能收回已经送入模型的内容。完整回放、错误案例/注入/权限评测器、真实任务影子非退步和独立测评仍待完成。机器收据：docs/evidence/ma24-skill-source-guard-2026-10-10.json。

### Skill 冻结安全用例审核材料补充（2026-10-13）

服务器可从账户隔离的冻结模型日志重建安全用例两侧轨迹，由受限采集角色保存观察，再向人工审核页提供回答和实际读取证据。未完成执行不能被标为通过。克隆测试已覆盖冻结绑定、账号隔离和审核读取；自然模型质量、前瞻影子、生产发布及自动启用门槛仍待验收。证据：docs/evidence/ma24-skill-safety-review-2026-10-13.json。

### 本地记忆自然消息样本（2026-10-13）

在用户批准的范围内，以 5 条最近完成任务的用户原话进行 15 次本机 qwen3:8b 结构化抽取。15 次无 Schema 错误，唯一提出的业务事实因“这个”指代不明而被人工判为不可保存；后置校验和提示词已收紧，30 项测试、TypeScript 和 ESLint 通过。此次只读验收没有形成有效记忆，不证明自然质量已满足自动学习门槛。证据：docs/evidence/ma24-natural-memory-sample-2026-10-13.json。
### G02 运行服务热修验收补记（2026-10-13）

正式 LangGraph 已加载独立四文件热修 `44e8608c`；主 worker 继续运行 `1d1cc962`。正式 HTTP 图对零预算合成账号的已撤销记忆 checkpoint 返回来源变更、清空待执行动作，模型/工具日志为零；进程、队列、健康及首次切换恢复记录见 docs/evidence/ma24-g02-hotfix-deployment-2026-10-13.json。真实账号业务任务的生成期撤销尚未验收，本项状态为“运行服务合成验收通过，真实业务验收待补”。

### 网页滚动与抽屉宽度发布（2026-10-13）

正式网页 3018 已加载生产基线加两项 UI 修复的独立构建 `245ed9cc`。新旧候选均返回 200，正式 CSS 与新候选一致，任务详情原文局部滚动和窄屏抽屉宽度规则均已提供；八组合成视口测试通过。主任务 worker 缺席后在空队列条件下按旧版恢复。真实账号展开内容尚未验收，G13 全部入口仍待逐项确认。旧上传路由的 Next 生成类型冲突仍待修复，构建时仅临时跳过该验证；详情见 docs/evidence/ma24-ui-scroll-web-deployment-2026-10-13.json。

2026-10-16 G05 [多格式失败隔离收据](evidence/ma24-g05-cross-format-worker-failure-clone-2026-10-16.json)：合成损坏 PDF 的 worker 失败没有改变并行 XLSX 的租约、另一账号作业或 v3 发布指针；XLSX 恢复后可生成视觉候选，隔离夹具清理。成功 PDF/PPTX、修订版本并发、真实引用和正式 worker 加载仍待验。

2026-10-16 G01 团队试用 [Linux 主机部署模板](../deploy/pilot/README.md)已通过本机 Compose 回环 Web、上传卷与临时 Caddy HTTPS 反向代理检查；只读首页/会话、匿名上传拒绝可复验。[收据](evidence/ma24-g01-pilot-host-compose-local-2026-10-16.json)。域名、真实数据范围、云主机、团队账号、容量与实际回滚未验收。

同日 [审核后修订当前源码收据](evidence/ma24-g05-current-reviewed-revision-recovery-2026-10-16.json)重跑私有/共享 PDF 原件到 PPTX 修订路径，旧版在待审和登记前失败时持续可读，登记后重放与竞争修订边界通过。合成审核不等于内容质量，生产加载和用户可见引用继续未验。

2026-10-15 G13/F12 Skill 回放原始证据入口在一次性恢复库和候选正式模式网页完成页面/API/数据库验收：合成只读历史收据经来源重校后持久化，390px 手机和 1366px 桌面均可从 Skill 评测审核展开并复制完整 JSON，内容与实际审核 API 一致；默认折叠、无横向溢出，匿名 API 被拒。没有保存审核判决、调用模型或写入生产；本项不构成 Skill 业务质量、自动启用、正式部署或实际回滚证据。非邮件审批等 F12 入口仍待验。[收据](evidence/ma24-g13-f12-skill-replay-raw-json-page-clone-2026-10-15.json)。

2026-10-15 G13/F12 非邮件审批入口在一次性恢复库和候选正式模式网页完成显示与拒绝路径验收：合成 `skill_delete` 待确认任务在手机/桌面展示业务字段，技术参数默认折叠，完整 JSON 复制与实际 API 一致；匿名读取被拒，页面“拒绝”写入 `denied`，随后旧批准请求返回 409，未执行工具。真实破坏性/发布操作的审批质量、批准后执行与生产加载尚未通过。[收据](evidence/ma24-g13-f12-non-mail-approval-page-clone-2026-10-15.json)。

2026-10-15 G14 FCC 来源独立性补验：新闻稿第 1 页和正式报告第 173 页原图均核出相同的“截至 2025-06，77% 可选至少三种 100/20 Mbps 固定服务”事实；报告第 173 页的来源段是主席声明。新闻稿的 43.4% 固定地面服务口径未由报告中的同数字表格匹配证明。两文件只能按一个 FCC 26-55 发布家族做题集污染审计；题目与来源尚未冻结、未上传产品、Gold 0，用户可见答案和引用没有验收。[交叉收据](evidence/ma24-g14-fcc-publication-family-overlap-2026-10-15.json)。

2026-10-15 G01 构建范围验收：TypeScript 配置保留宽范围 `src/` 与 `scripts/` 检查、Next 生成类型检查，仅排除 Git 忽略的 `tmp/` 隔离探针；完整 typecheck 与生产构建通过，候选 build `dbiGeczgl91_vubichMag` 在临时恢复库通过迁移及新旧 Web 兼容冒烟。该证据不批准生产迁移、分域启用或实际回滚。[收据](evidence/ma24-g01-typecheck-scope-build-2026-10-15.json)。

### MA24-06 / G03 自然纠正来源归属（2026-10-13）

自动更正本地抽取的旧记忆时，必须确认旧原句来自账户用户本人，且在原任务消息中唯一出现；第三方转述转待核对。当前完成代码及隔离数据库验证，真实自然样本质量和生产部署待验收。证据：docs/evidence/ma24-g03-attributed-source-correction-2026-10-13.json。

### MA24-16 / G05 视觉审核阻断提示（2026-10-14）

抽取审核界面已明确显示剩余待核对象，并说明不能将无法准确转录的实质图表标为装饰；未解决对象阻止新版索引。13 项服务端审核/就绪测试、1366/390/320 三宽度组件浏览器、定向 Lint 与完整类型检查通过。浏览器使用合成 API；正式网页未部署，真实 PPTX 仍无生产判决，G05 质量验收未通过。证据：docs/evidence/ma24-extraction-review-blocking-copy-2026-10-14.json。

2026-10-14 补验：成功保存后未修改的条目不能重复提交新修订，冲突后的草稿仍可重试；1366/390/320 宽度组件浏览器验证通过。服务端未改，未部署正式网页。证据：docs/evidence/ma24-extraction-review-save-state-2026-10-14.json。

2026-10-14 本机运行恢复：旧网页、旧 LangGraph 热修和旧主 worker 在三个到期队列为空后恢复，网页与静态资源 200、零模型健康图 ready；没有加载本阶段视觉审核界面，也未执行真实账号端到端任务。邮箱/线索 worker 未重启。证据：docs/evidence/ma24-local-service-recovery-2026-10-14.json。

### G05 成功抽取文字排除验收（2026-10-15）

原件有前景遮挡时，成功抽取的底层文字可能并非可见资料。审核页现提供成功文字复核列表，按账号及原件版本读取，展示页号、坐标和原图预览；审核人可留下说明并将该块排除。保留时只能保留原抽取文字，不能伪造替换。完成收据重建所有待审块及可选成功块判决，登记前复核字节。ITU 开发原件的 12 页与 3 个遮挡块在隔离克隆通过：隐藏块未入树、第 5 页原数值仍可读、跨账号拒绝、合成数据清理；29 项相关测试、类型与 lint 通过。1366/390 两视口的合成 API 组件浏览器操作和截图检查通过；实际候选网页、生产加载及模型回答未验，G05 不能关闭；该 ITU 来源不计独立 Gold。[验收收据](evidence/ma24-g05-success-block-review-2026-10-15.json)。

### MA24-18 / G14 — IEEE 教程仅验收 PPTX 读取与引用（2026-10-14）

用户明确将 SHA-256 `030a730584498f8b98109a1bf2da22a29cc443021c63fbd1c18cf2bad2da6910` 的 IEEE 2014 GEPOF 教程限定为“仅作 PPTX 读取与引用验收”。第 5、22 页已目视核对的两个样例用于检查产品是否能读出原幻灯片并返回正确页号和原文依据，不作为独立问答 Gold 或 G14 拟议 PPTX 质量题。该验收尚未在产品链路执行；独立 PPTX 质量来源仍缺。确认与样例见 docs/CONFIRMED_PRODUCT_RULES.md、docs/evidence/ma24-g14-ieee-slide-question-review-2026-10-14.json。

本地产品抽取器补验：`layout-v2.0.6` 对原 PPTX 输出 563 块，第 5、22 页目标文字为 success，分别具有 `slide-5-text-2` 和 `slide-22-text-2` 坐标，与已渲染原页一致。全稿 44/82 页仍待 OCR，未做产品树登记/读取与端到端引用；只记录两页抽取通过。[机器收据](evidence/ma24-g05-ieee-pptx-local-extraction-2026-10-14.json)。

隔离克隆上传原 PPTX 后，worker 留下 129 个待审对象和 `review-required` 状态；直接树登记按门槛拒绝，发布文档 0，合成账号/作业清理后计数 0。类型检查和新脚本 lint 通过。原件仍不能进入产品树读取；需完成实质视觉审核，不能把待审图表一概标为装饰。[审核阻断收据](evidence/ma24-g05-ieee-pptx-review-gate-clone-2026-10-14.json)。

局部审核链路补验：已核原页的 24 个对象在本地克隆保存并经产品接口逐条读回，证据 15、装饰 9；其余 105 个对象未审，完成审核与资料登记仍被拒，完成收据和资料文档为 0。合成记录已清理；这只证明部分判决写读与阻断门槛，未完成两页样例的产品读取和引用。[局部审核收据](evidence/ma24-g05-ieee-gepof-partial-review-clone-2026-10-14.json)。

追加第 34–43 页原图审核后累计 37/129 个对象，证据 27、装饰 10；在隔离克隆保存并逐条读回，92 个未审仍阻断完成和登记。第 43 页图表值与 PPTX 内嵌缓存一致，但只代表演示时的历史情景。第 5、22 页产品树读取与精确引用仍须整份审核完成后执行。[原图收据](evidence/ma24-g05-ieee-gepof-object-review-34-43-2026-10-14.json)、[克隆收据](evidence/ma24-g05-ieee-gepof-37-review-clone-2026-10-14.json)。

第 45–54 页续核后累计 49/129，证据 34、装饰 15；12 个新增对象的原页和图片哈希核对，49 条在隔离克隆逐条读回。80 个未审仍阻断完成审核与资料登记；无完成收据、文档或正式引用。历史图值、调查结果及计划里程碑均按演示时间限定。[第 45–49 页](evidence/ma24-g05-ieee-gepof-object-review-45-49-2026-10-14.json)、[第 52–54 页](evidence/ma24-g05-ieee-gepof-object-review-52-54-2026-10-14.json)、[克隆收据](evidence/ma24-g05-ieee-gepof-49-review-clone-2026-10-14.json)。

第 58–64 页续核后累计 70/129，证据 48、装饰 22；21 个新增对象的原页和裁图哈希核对，70 条在隔离克隆逐条读回。59 个未审仍阻断完成审核与资料登记，完成收据和文档为 0。协议标志只说明讲义列举的名称，操作照片只说明原页所示步骤；第 5、22 页的产品读取/引用验收继续待办。[第 58–60 页](evidence/ma24-g05-ieee-gepof-object-review-58-60-2026-10-14.json)、[第 62–64 页](evidence/ma24-g05-ieee-gepof-object-review-62-64-2026-10-14.json)、[克隆收据](evidence/ma24-g05-ieee-gepof-70-review-clone-2026-10-14.json)。

第 68 页四个原生箭头的端点与原 PPTX 形状关系一致；累计 74/129、证据 52、装饰 22，隔离克隆逐条读回。其余 55 个未审继续阻断完整审核和资料登记。图中的 10000 POF、GEPOF+ GREEN 只作为 2014 年未来示意解释；产品树读取与第 5、22 页精确引用仍未验收。[箭头收据](evidence/ma24-g05-ieee-gepof-object-review-68-2026-10-14.json)、[克隆收据](evidence/ma24-g05-ieee-gepof-74-review-clone-2026-10-14.json)。

整份 IEEE 2014 教程的 129 个待审对象已按原页形成证据 107、装饰 22 条判决草案，隔离产品克隆保存并逐条读回后成功完成审核、登记为可检索资料。搜索与证据读取接口准确返回第 5 页 `slide-5-text-2` 的 15 m/4 次连接目标和第 22 页 `slide-22-text-2` 的“SG has not adopted technical proposals”，来源哈希及幻灯片/块坐标匹配；另一账号与错误资料集合读取被拒。合成资料已清理。此为隔离工程与来源坐标验收；正式服务上的用户可见模型回答及引用呈现、生产部署尚未通过，且本教程不计独立质量 Gold。[全链路收据](evidence/ma24-g05-ieee-gepof-full-review-citation-clone-2026-10-14.json)。

本地生成两批共 114 张唯一图片的视觉候选；129 个候选 ID 与原抽取待审块一一对应，来源、产物和图片哈希均核对。第 5、22 页本身没有待审视觉块，但整份教程其他页仍有 129 个对象，产品整份审核门槛继续阻止登记。候选 OCR 仅供对原页判读，没有形成审核决定、资料树读取或用户可见引用。[候选包收据](evidence/ma24-g05-ieee-gepof-visual-package-2026-10-14.json)。

已将待审对象所在 44 张幻灯片从原件只读导出；首批 10 页的 17 个对象与候选裁图、原生形状位置及整页图核对，提出 5 条证据、9 条装饰、3 条未解决。衰减曲线、弯曲衰减图和公式存在单位/符号或来源疑点，仍作为实质内容待核；112 个对象未审，任何草案均未写产品审核表。[逐对象原页收据](evidence/ma24-g05-ieee-gepof-object-review-early-2026-10-14.json)。

第 16 页弯曲衰减图的内嵌 MSGraph 工作簿已只读解析：10/8/6/5 mm 四档，RX 为 0.82/1.46/2.22/2.68，TX 为 0.56/0.97/1.95/2.67；图轴原文 `Attenuation (dBo)` 保留原样。该对象从本地“未解决”修订为“证据”，首批目前为证据 6、装饰 9、未解决 2；第 11 页公式和第 12 页曲线仍未解决，尚无产品判决。[嵌入图表收据](evidence/ma24-g05-ieee-gepof-slide16-chart-resolution-2026-10-14.json)。

随后以原 PPTX 高清渲染逐符号核对第 11 页公式，并正向放大第 12 页纵轴确认 `Attenuation (dBo/km)`；曲线只描述可见走势，原页没有精确采样值表。两对象的本地草案修订为证据，首批 17 个对象现为证据 8、装饰 9、未解决 0；尚有 112 个对象未核，产品审核表和资料树仍无这份教程的通过记录。[公式与曲线收据](evidence/ma24-g05-ieee-gepof-formula-curve-resolution-2026-10-14.json)。

第 24–29 页的两张敏感度曲线、VDE 封装与编码、非线性信道及容量惩罚示意共 7 个对象已对照原页，均为有界证据草案；没有把无数据表的曲线位置当精确测量或把历史提案当现行标准。累计 24/129 个对象有原页提案，剩余 105 个未审；未保存产品判决。[对象收据](evidence/ma24-g05-ieee-gepof-object-review-24-29-2026-10-14.json)。

### MA24-16 / G06 — 工具原文伪角色块的模型视图隔离（2026-10-14）

主 Agent 保存并复核未改动的工具证据，送入模型时派生视图省略原文中的 `<system>` 等伪造角色块；无法解析的工具结果正文被隔离。工程测试覆盖原文留存、模型视图省略和现有图协议，15 项通过，类型与 lint 通过。此修复仅覆盖角色标记形式；未取得修复后模型回答、独立安全判分或生产部署证据，G06 仍未通过。证据：docs/evidence/ma24-g06-tool-model-view-2026-10-14.json。

2026-10-15 / MA24 G05 补充：本地 PDF 抽取 `layout-v2.0.9` 将含透明文字或不可见文字绘制模式的页留在原页待审队列，原文字块保留供成功块复核/排除。三页合成原件、10 项 Python 回归和隔离数据库的实际上传→审核→恢复登记链路通过；隐藏句未入树，可见证据和跨账号权限核对通过。这尚不覆盖所有成功块的发布前复核，未完成正式网页/生产验收。[工程收据](evidence/ma24-g05-invisible-pdf-text-gate-2026-10-15.json)。

2026-10-15 / MA24 G05 Thoth PPTX 原生连线门槛续验：隔离克隆真实上传后阻断未审登记；授权下载原件对照发布方图片，保存图中实际连接并私有登记，错误表行关系未进入证据，跨账号检索/读取被拒。类型及 lint 检查通过；实际浏览器审核页、模型回答与生产尚未验收。原件仅供开发回归，不计独立 Gold。[收据](evidence/ma24-g05-thoth-native-lines-reviewed-clone-2026-10-15.json)。

2026-10-15 / MA24 G14 补充：隔离 ONS 5G XLSX 原件由当前产品抽取/上传 worker 登记，私有 `readEvidence` 可回读两条草案的八个工作表原格地址和值；他账号拒绝，合成记录清理。此为坐标与权限工程检查，来源尚未获独立质量审批，Gold/实际模型引用均为 0。[候选收据](evidence/ma24-g14-ons-5g-xlsx-candidate-2026-10-14.json)。

同日题型复核：Aberdeen 双区域差值草案与已经用于开发的 ONS ultrafast 双区域差值草案过于同构，退出新独立 Gold；Highland/Scotland 的分母辨别题仍只作待审候选。原格可读不等于题目独立或质量通过。[交叉候选审计](evidence/ma24-g14-ons-5g-xlsx-candidate-2026-10-14.json)。

2026-10-15 / MA24 G05 成功文字复核入口：当前候选 Web 在隔离恢复库中通过真实浏览器显示 216 个成功文字对象，保存第 2 页页码的排除决定并从数据库读回；切回待审对象后原下载、未解决保存、冲突/改源拒绝和手机宽度检查仍通过。待审未完成、未发布资料，生产网页与模型引用质量未验。[页面到库收据](evidence/ma24-g05-success-review-page-db-clone-2026-10-15.json)。

### MA24 / G16 — 独立双路径评测的失败运行门槛（2026-10-15）

冻结清单验证增加困难题型真实性检查：`no-answer` 标签与预期无答案行为必须相符；权限保护组至少一题预期拒绝访问，允许另有授权访问正例。9 项定向测试、类型检查和 ESLint 通过；仅是评测器合同，独立 Gold、真实运行和质量验收仍未完成。[收据](evidence/ma24-g16-hard-case-tag-consistency-2026-10-15.json)。

判分器现在将任一侧 `failed` 运行单列为 `failedRuns` 并阻断 `complete` 与 `gatePassed`。模型超时等失败仍保留原运行收据与判决，但不得被当作另一侧的答案或引用质量提升。六项定向测试、完整类型检查及定向 ESLint 通过；新独立 Gold、真实双路模型结果和生产加载均未发生。[工程收据](evidence/ma24-g16-failed-run-gate-2026-10-15.json)。

完成运行的审核结果现需填写实际行为类型；当它与冻结题目的预期类型不符，不能将答案标为正确，报告保留差异。失败或未知运行没有实际行为类型。七项定向测试、完整类型检查和定向 ESLint 通过；尚无真实独立结果。[行为判决收据](evidence/ma24-g16-observed-outcome-gate-2026-10-15.json)。

2026-10-15 G16 评分输入新增未完成运行负载检查：`failed`/`unknown` 不得携带答案或引用；定向测试 13 项、类型和 lint 通过。独立 Gold、付费准入、真实双路结果及质量门槛未因此通过。[工程收据](evidence/ma24-g16-incomplete-run-payload-gate-2026-10-15.json)。

2026-10-15 G16 评分命令现在核对来源集中的每条问题与冻结清单的逐题哈希；同改文件哈希而变更问题也会拒绝。14 项定向测试、类型及 lint 通过，合成空运行仍不通过质量门槛。真实模型输入、独立 Gold、双路回答与人工判决仍待验。[工程收据](evidence/ma24-g16-source-question-binding-2026-10-15.json)。

2026-10-15 G14 BDUK 单来源题：用户同意逐题审核并确认 2018 年 3 月现金口径每百万英镑覆盖 7,934 处、权责发生制估算 7,617 处，以及交付早于拨款支付使后者计入成本较高的限定。三道 GOV.UK 家族题的候选答案现均已分别确认，但仍共享一个来源暴露单元；正式 Gold 0、真实双路 0，家族来源资格、整套独立性、冻结和 G16 质量待验。[MA24-22](CONFIRMED_PRODUCT_RULES.md)、[回复收据](evidence/ma24-g14-bpi-cash-accrual-answer-review-2026-10-15.json)。G17–G20 暂停。

2026-10-15 G15/G16 同账号双臂工具隔离：服务端评测臂标识使基线即使处于候选白名单及开启影子功能，也不能发现、描述或执行 `vectorless_*`；候选保留七个只读工具。三种知识范围的本地预览差集符合预期，9 项定向测试、类型与 lint 通过。专用评测运行器、冻结 Gold、付费准入和真实质量仍缺。[工程收据](evidence/ma24-g15-g16-evaluation-arm-tool-isolation-2026-10-15.json)。G17–G20 暂停。

2026-10-15 G16 持久评测任务的执行前冻结输入绑定已形成可调用的租户内只读函数，核对来源集字节与逐题哈希、任务身份/臂/范围、标准模型配置和未过期租约。7 项定向测试、类型与 lint 通过；专用 worker、隔离库实测、Gold/调用授权及真实质量均未验。[工程收据](evidence/ma24-g16-evaluation-task-admission-binding-2026-10-15.json)。G17–G20 暂停。
2026-10-16 / MA24 G14 替代来源初筛：一条 FCC 第十三次固定宽带测量报告候选题已隔离保存，原件及抽取哈希、目标页/块和公开树零逐字命中已核；[元数据收据](evidence/ma24-g14-private-replacement-seed-2026-10-16.json)不包含题面或答案。当前只完成局部来源读取和公开树初筛，未完成全页视觉、历史与语义独立性、正式 Gold、产品用户可见引用；G15 付费准入未开、G16 真实双路 0，G17–G20 暂停。
2026-10-16 / MA24 G14 私有替代题的[字面暴露复核](evidence/ma24-g14-private-replacement-seed-2026-10-16.json)增加预期答案与本地 Git 全可见引用；题文/答案均无逐字命中，旧五题反例会拒绝。当时普通沙箱未见语义近邻服务健康响应；后续已在提升权限的本机上下文完成近邻筛查，但全源审核、产品引用与 Gold 未通过；G15/G16 状态不变，G17–G20 暂停。
2026-10-16 / MA24 G14 私有 FCC 替代题已完成[本机固定 BGE 近邻筛查](evidence/ma24-g14-fcc-mba-local-neighbor-screen-2026-10-16.json)：与旧 300、历史盲题 50、当前草案 28 条比较，前列近邻人工核对未见同一测量方法题。该诊断没有证明整套独立性，也没有完成原件全篇视觉、产品用户可见引用或正式 Gold；G15/G16 仍关闭，G17–G20 暂停。
2026-10-16 / MA24 G14 [本机会话有界筛查](evidence/ma24-g14-fcc-mba-local-rollout-boundary-2026-10-16.json)覆盖 129 份 JSONL；新私有题与答案在本轮制题记录出现，受检记录未见更早逐字命中。该结果不排除提供方、语义或未记录暴露，不能批准独立 Gold；G15/G16 仍关闭，G17–G20 暂停。
2026-10-16 / MA24 G14 FCC 长 PDF [视觉分诊收据](evidence/ma24-g14-fcc-mba-visual-triage-2026-10-16.json)绑定原件和抽取哈希，62 张待审页均已渲染，7 张联系表用于图表存在性分诊，10 张待审页按原尺寸核看；剩余 52 张未完成原尺寸审核，产品判决及用户可见引用尚无验收。Chart 7 正文与图题的汇总口径用词冲突保留给最终答案审核；独立 Gold 0，G15/G16 仍关闭，G17–G20 暂停。

# 团队首批试用发布补充（2026-10-16）

用户确认由其团队作为首批试用者（规则 `PILOT-01`）。具体访问方式、成员和功能范围待确定；发布门槛及当前证据见[团队首批试用发布计划](TEAM_PILOT_RELEASE_PLAN_2026-10-16.md)。该试用计划不改变 MA24 G14–G20 的独立验收状态。

2026-10-16 / G01 发布迁移边界：[127–135 专用入口](evidence/ma24-g01-stage-127-135-boundary-2026-10-16.json)默认只读，九个 SQL 固定哈希并与隔离恢复器共用。备份哈希缺失/不匹配均拒绝执行，隔离库回滚和提交通过，正式库未迁移；136–140 未包含，正式部署和业务质量验收仍待完成。

2026-10-16 / G01 后续执行：本机产品库在新备份和隔离恢复验证后实际提交 127–135，复核标记及 collector ACL/RLS 通过；旧版与候选版 Web 在本机通过合成账户服务端会话检查。生产 `Secure` Cookie 的真实浏览器链路仍须在 HTTPS 目标入口验收；团队账号、业务闭环与业务回切尚未验收。[执行收据](evidence/ma24-g01-product-db-stage-and-local-web-2026-10-16.json)。

2026-10-16 / G01 HTTPS 本机补验：候选版在临时自签名 HTTPS 回环代理及 Chrome 中通过合成成员 Cookie 保存、会话读取和退出；目标域名的可信 TLS、真实成员及业务流程仍需另验。[浏览器收据](evidence/ma24-g01-loopback-https-browser-session-2026-10-16.json)。

同项补验已复跑实际登录表单、工作区呈现和页面退出按钮；其余上线门槛不变。

2026-10-16 / G01 运行权限：本机候选 Web 在移除迁移凭据与付费覆盖开关后，重新通过 HTTPS Chrome 登录及退出；试用目标环境仍须配置专用受限运行凭据。[运行权限收据](evidence/ma24-g01-pilot-web-runtime-boundary-2026-10-16.json)。

2026-10-16 / G01 试用入口只读补验：匿名任务接口拒绝，合成成员可读取任务列表并打开线索、任务页面；创建、执行、业务结果及真实账号仍待验收。[浏览器收据](evidence/ma24-g01-loopback-https-browser-session-2026-10-16.json)。

2026-10-16 / G01 合成线索闭环：候选 HTTPS 页面可见手动添加公司的 API 写入结果，旧版 Web API 在同一迁移库可读取候选记录；测试数据完整清理，付费调用 0。真实业务质量、流量切换、worker 与数据库回滚仍待验。[收据](evidence/ma24-g01-pilot-manual-lead-old-web-read-2026-10-16.json)。

2026-10-16 / G01 本机同入口回切：临时 HTTPS 代理把同一浏览器会话由候选 Web 切到旧版再切回；登录会话及合成公司回读连续通过。线上流量、worker 和数据库回滚仍需另验。[收据](evidence/ma24-g01-loopback-https-traffic-reversal-2026-10-16.json)。

2026-10-19 / G09 固定方法来源锁：原任务固定的其他 Skill 同样必须在材料重建事务中保护。迁移 151 锁任务父行、固定绑定、方法状态和版本，再核哈希/权限与本地经验原文；56 项定向回归、类型/lint 及一次性数据库并发/撤销拒绝通过。同源码完整五类组合随后退出 0，前瞻两臂、组合材料、持锁重建及开发审核写入/撤销通过；发现目录、文件字节、最终时效和可信生产身份仍未全部完成，自动启用保持关闭。[工作流与证据](SKILL_ACCEPTANCE_TASK_JOURNAL_LOCKS_2026-10-16.md)。

2026-10-19 / G09 可见 Skill 目录保护：新增目录条目、共享发布/撤回、版本内容和历史绑定均进入来源写入许可；导入、状态操作、任务固定和经验草案先申请许可再锁业务行。48 项回归、类型/lint、一次性库八类并发及旧共享绑定保护通过，固定提交 600c371c 的完整五类组合随后退出 0；后续记忆/下载改动不在该快照。旧库写入兼容不会授予验收资格，真实质量、生产身份和最终启用仍未完成。[工作流与证据](SKILL_CATALOG_SOURCE_ADMISSION_2026-10-19.md)。

2026-10-19 / G09 准备期记忆到期保护：来源锁下对整个材料/策略准备流程应用决策记忆前后快照守卫。30 项回归、类型/lint 和实际 PostgreSQL 到期拒绝通过，固定 d5ca1d76 完整五类组合随后退出 0；后续统一方法时刻与下载修改不在此快照。此项不替代显式历史查询语义或最终启用时钟条件。[工作流与证据](SKILL_CATALOG_SOURCE_ADMISSION_2026-10-19.md)。

2026-10-19 / G02/G05 原件下载完整性：文档 active 与原件 registered 是访问条件，实际响应字节须匹配登记长度和 SHA-256；文件读取后重查账号访问资格及存储身份，再返回完整/Range 响应。16 项路由/工具回归、类型/lint 通过，真实 HTTP 和生产入口尚未验收。[工作流](MAIN_AGENT_WORKFLOW.md)、[证据](evidence/ma24-g02-g05-asset-download-integrity-2026-10-19.json)。

2026-10-19 / G09 方法经验末尾复核：锁内策略准备之后统一核目标及全部任务固定方法的本地经验期限和计划到期，返回检查时刻/最早期限作为审计信息。43 项回归、类型/lint、实库准备后经验到期拒绝通过；最新五类快照待验。该时点不替代最终启用语句的时钟条件和其他来源边界。[工作流与证据](SKILL_CATALOG_SOURCE_ADMISSION_2026-10-19.md)。

2026-10-19 / G09 任务附件字节复核：材料重建前、策略准备后核真实原件 SHA-256/长度和登记清单；存量任务决定检查范围，账号权限和 active/registered 不满足时拒绝。44 项回归、类型/lint 通过；完整数据库快照待验。仅覆盖任务附件，其他回执原件、不可变存储、生产身份及最终启用仍待完成。[工作流](SKILL_CATALOG_SOURCE_ADMISSION_2026-10-19.md)、[证据](evidence/ma24-g09-attachment-byte-revalidation-2026-10-19.json)。

2026-10-19 / G09 知识回执原件复核：历史/前瞻任务已消费的五类知识工具回执映射到原件，材料重建后及策略准备后验证字节和清单；旧数据库文本及安全夹具保持各自语义。60 项定向测试、类型/lint、一次性实库五类映射和篡改/跨账号/撤回拒绝通过，完整组合新快照待验。不可变文件、生产资格、真实质量及最终启用仍待完成。[工作流](SKILL_CATALOG_SOURCE_ADMISSION_2026-10-19.md)、[证据](evidence/ma24-g09-knowledge-receipt-byte-revalidation-2026-10-19.json)。

2026-10-19 固定 c3f620b5 完整五类组合退出 0：目录来源锁、决策记忆结束边界和方法经验统一时刻正向贯穿通过，临时数据库与源码快照已清理；后续文件字节修改不在该快照。[收据](evidence/ma24-g09-final-method-experience-time-2026-10-19.json)。

知识回执完整组合在 ca45488d 失败：旧回放/影子工具白名单未接受 knowledge_originals。当前补齐 knowledge_originals 和 knowledge_facts 的格式准入、当前来源守卫及仅精确已存回执的本地/图回放接线；不新增真实检索、外部执行或启用权限。无匹配结果不构成回放证据；格式缺失/错误哈希/缺少事实 chunk 绑定仍拒绝。108 项回放、影子、原件与材料回归、类型/lint 通过；修复后完整组合待验。[失败与后续记录](evidence/ma24-g09-knowledge-receipt-byte-revalidation-2026-10-19.json)。

2026-10-19 / MA24-06 实施补强：历史/前瞻已消费的三类记忆回执在材料重建后与策略准备后重新核查；省略观察时间使用数据库当前时刻，明确历史双时间保留。历史/影子及精确只读回放接线同步完成，公共结果不返回私有回执闭包。130 项回归、类型/lint、一次性数据库的同事务到期拒绝/历史查询保留/跨账号拒绝通过；含实际 memory_read 收据的完整组合新快照待验。无新用户确认、无真实质量批准或启用授权。[工作流](MEMORY_TIME_BOUND_VALIDATION_2026-10-17.md)、[证据](evidence/ma24-g09-consumed-memory-receipt-recheck-2026-10-19.json)。

附件字节固定快照 cf147d1a 已完整退出 0，五类材料、原件计数、锁内同长篡改拒绝及恢复通过，临时容器/文件和源码快照已清理；后续知识回执及记忆修改不在该快照。[附件证据](evidence/ma24-g09-attachment-byte-revalidation-2026-10-19.json)。

2026-10-19 / G05 正式 worker 私有 PDF/PPTX 修订矩阵：在隔离 MA11 库用本地生成的两种格式，实测解析失败及审核未完成时保留旧版本和旧引用、重复上传复用、跨账号修订拒绝；两个已抽取候选仅一个切换成功，竞争候选拒绝，登记重试复用。新内容通过当前树检索和原件 SHA-256 回读，准确定位第 2 页/第 2 张幻灯片，切换后旧引用拒绝，历史状态保留。两次监督进程中断/子进程终止、租约恢复、无关作业与 v3 指针不变同时通过；六条审核仅为合成蓝色色块的装饰判决，非真实质量通过。临时账号、作业、文档、审核与文件均已清理；类型/lint 通过。XLSX 与共享修订的当前正式 worker 矩阵、真实资料/业务答案引用和生产入口仍待验。[证据](evidence/ma24-g05-formal-worker-revision-matrix-2026-10-19.json)。

2026-10-19 固定快照 3f511d38 的完整五类组合已退出 0：原件回执准入修复、真实本地 knowledge_originals 读取、候选精确回放、统一材料和策略后的原件字节检查贯通，前瞻材料包含四条已消费回执并计一个知识原件。此前 ca45488d 的白名单失败保留；含后续显式记忆回执的 80c24c2b 尚待完成。临时数据库与源码快照已清理，实际模型调用 0，自动启用仍 false。[收据](evidence/ma24-g09-knowledge-receipt-byte-revalidation-2026-10-19.json)。

2026-10-19 / G05 正式 worker 六组修订矩阵通过：PDF/PPTX/XLSX 各覆盖 private/shared。解析失败、审核未完成、原件等长篡改、抽取文件等长篡改均不切换旧版；重复上传/登记复用，竞争修订只接受一个，旧引用切版后拒绝，新引用准确到第 2 页/幻灯片/工作表（XLSX 含 A1:B2 单元格范围）。共享发布须管理员；私有跨账号拒绝，共享读取对另一账号可用。18 条装饰判决均针对脚本生成的蓝色方块，不构成独立质量批准。初次 XLSX 失败来自夹具误读顶层图片字段，已改用现有嵌套图片预览读取服务并验 PNG 字节/哈希，没有放宽产品守卫。实际进程中断/租约恢复、无关作业和 v3 指针不变及全部本轮资源清理通过；类型/lint 通过。本矩阵未重做登记进程崩溃场景，真实业务资料、模型答案引用、生产和团队试用仍未验收。[六组收据](evidence/ma24-g05-formal-worker-six-group-revision-matrix-2026-10-19.json)。

2026-10-19 / G01 当前流程生产构建：基于提交 1876cb63 的工作区应用源码，npm.cmd run build 退出 0；Next.js 16.3.4 编译、构建内 TypeScript 与 26/26 页面生成通过，standalone server 已生成。新记忆回执、知识回执、附件字节及材料准备模块在 runtime-source 包内与当前源文件逐字节一致。仅本机构建及四个来源文件的打包检查，不是部署二进制/提供方资格、服务启动或团队发布验收；原有 next-env.d.ts 与实验文件变更未提交。[构建证据](evidence/ma24-g01-production-build-1876cb63-2026-10-19.json)。

2026-10-19 固定 80c24c2b 完整五类组合已退出 0：实际本地 memory_read 和 knowledge_originals 回执经候选精确回放、材料重建及策略后的末尾检查贯通，前瞻材料五条回执、显式记忆回执计一条。临时容器与源码快照清理完成，实际模型调用 0。真实观察准备期到期/明确历史时点的负例另见同收据的独立数据库案例；此次正向组合不是全链路注入到期测试，最终启用仍关闭。[记忆回执收据](evidence/ma24-g09-consumed-memory-receipt-recheck-2026-10-19.json)。

2026-10-19 / G02、G05 原件下载真实 HTTP：在真实备份恢复的临时库，当前构建 J-fdhzwzNRSmES5T8ywYZ 通过受限应用角色和两个合成账号验证完整 200、三类 206 Range、非法 Range 416、匿名 401、私有跨账号 404；等长篡改、截短及缺失文件 410，原件撤回/文档归档 404，共享可读与撤回共享后拒绝、当前文件名头、no-store/nosniff 均通过。路径穿越在写入存储键时已被数据库约束 23514 拒绝，未绕过约束来伪造 HTTP 覆盖。临时文档、资产、账号、文件、Web 进程及恢复库均清理。此次不注入读取过程中的同步撤回竞态，也不证明模型答案、真实业务资料或生产交付。[HTTP 收据](evidence/ma24-g02-g05-asset-download-http-clone-2026-10-19.json)。

2026-10-19 / MA24-06、G09 运行声明接入保留事务：准备前后按服务器存储的最新账号/审核包/冻结声明复核，使用数据库时钟并重新加载公钥登记；声明 ID/哈希/登记哈希漂移、禁钥或到期均拒绝。65 项回归、类型/lint、一次性实库同事务到期与禁钥、追加等待/恢复、续签及撤销通过；并发夹具的 member 上下文已补齐，原守卫未放宽。完整五类新快照待验。签名不替代二进制、提供方和质量认证，最终启用仍未接通；不新增用户确认。[声明工作流](SKILL_RUNNER_ATTESTATION_2026-10-16.md)、[证据](evidence/ma24-g09-locked-runner-declaration-2026-10-19.json)。


2026-10-19 / MA24-06、G09 末尾模型传输收据：从已存审核包派生原任务及候选/安全两臂，不接受调用方指定收据。持有账号事务与任务日志锁，以数据库时刻审核成功和失败回退签名；跨全部审核比较信任登记，在审核结束复查最早收据/计划到期，并在策略后重做及核对运行声明的登记哈希。公共结果仅含哈希、数量和时间，合成材料不升格。100 项定向回归、类型/lint、Next.js 16.3.4 生产构建与八个来源模块打包字节核对通过；两条原任务、八臂的完整配置签名数据库组合仍运行，暂不判通过。二进制/提供方、真实质量和最终启用未完成，无新用户确认。[传输工作流](ORIGINAL_TASK_TRANSPORT_RECEIPTS_2026-10-17.md)、[证据](evidence/ma24-g09-locked-transport-receipts-2026-10-19.json)。


2026-10-19 fixed snapshot 02c45e8e completed with exit 0: full five-category composition, paired prospective material and synthetic-source declaration non-promotion passed. Temporary database and source snapshot were removed. This snapshot does not include the later transport-audit code in 662874d3 and does not qualify signed pending-production evidence, deployed binary/provider or real quality. [Declaration evidence](evidence/ma24-g09-locked-runner-declaration-2026-10-19.json).


2026-10-19 / MA24-06 G09 measured package binding: the collector image launcher now compares the actual package/Node inventory SHA-256 with SKILL_RUNNER_DEPLOYMENT_SHA256 before --check or --execute can start the runner. Missing, malformed or mismatched hashes reject; --verify/--help can inspect without enrollment, and --verify reports the measured hash. Node execution arguments, NODE_OPTIONS and NODE_PATH are rejected. The image TLS fixture passes the independently measured package hash. Syntax, one inventory test, typecheck and lint passed; new Linux image and actual image/TLS checks are pending. This does not grant binary/provider/quality qualification, source promotion or activation, and introduces no new user confirmation. [Evidence](evidence/ma24-g09-measured-collector-deployment-binding-2026-10-19.json).


2026-10-19 measured-package image verification completed: fixed image ma24-skill-collector:5baff449 (source 5baff449919e830ab945d6f09621c9d2e6e7cc42) passed actual read-only/non-root/no-network checks for 34,455 files, matching hash admission, missing/malformed/mismatched hash rejection, changed-runner rejection and NODE_OPTIONS refusal. A fresh database run passed actual Linux-image measured-hash TLS/collector-role preflight and the separate native signed historical fixture, with zero real model calls and the Skill disabled. This is not image --execute provider qualification or a full five-category image run. [Receipt](evidence/ma24-g09-measured-collector-deployment-binding-2026-10-19.json).


2026-10-19 / MA24-06 G09 final common signature clock: after the final signature reads, readiness now checks the authenticated runner/transport deadlines at the same database instant as the plan and all pinned-method experience windows. It returns a common acceptanceTimeCheckedAt/acceptanceValidBefore while preserving method deadline metadata. 55 focused tests, typecheck, lint and an actual fresh DB run passed both signature deadlines crossing expiry in a held transaction while method sources remain valid. This component test uses verified-deadline inputs, not full-workflow signature expiry injection; the new full composition remains pending. No new confirmation or activation grant. [Evidence](evidence/ma24-g09-common-final-signature-clock-2026-10-19.json).


2026-10-19 clean fixed snapshot 2142510f passed the configured signed five-category run: two original tasks, eight evaluation arms, locked transport/declaration audits, all material checks, disabled-key rejection and missing-human-judgment policy blocking. No mid-run repair was performed. The initial failed fixture run remains recorded; real quality, production qualification and activation are false. This snapshot predates the later common final-clock change. [Receipt](evidence/ma24-g09-locked-transport-receipts-2026-10-19.json).


2026-10-19 fixed snapshot 662874d3 completed with exit 0: the full synthetic five-category material/readiness composition, paired prospective source and synthetic transport/declaration non-promotion passed. Its temporary container and Git archive directory were removed. Together with the separately passed signed snapshot 2142510f, this verifies both branches of the earlier transport wiring. Neither snapshot includes the later common final-clock implementation in 06dfe3b9, whose signed fixed-snapshot run is active. Real quality, production qualification and automatic activation remain unaccepted/disabled. [Transport evidence](evidence/ma24-g09-locked-transport-receipts-2026-10-19.json), [new clock evidence](evidence/ma24-g09-common-final-signature-clock-2026-10-19.json).


2026-10-19 / MA24-06 configured declaration signing: the internal collector CLI now accepts --attest with only ownerId/bundleId. A dedicated restricted role derives freeze/artifact/identity/observation bindings from owned server records, verifies the configured Ed25519 key and runner-declaration purpose, timestamps with the database clock and appends through the existing same-client/freeze-lock verifier. A valid latest statement from the same configured key is reused on retry; expired statements or configured key rotation produce a fresh bounded statement. New env names are SKILL_RUNNER_DECLARATION_KEY_ID and SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE. No HTTP/Agent tool exposes this operation.

69 regression tests, typecheck, lint and an actual compiled CLI/dedicated-login database run passed issuance/readback, retry reuse and nine rejected owner/source/config/key/process cases. The full five-category fixture now uses this CLI instead of constructing a signature itself; its new full run and actual Linux-image --attest remain pending. Source classification stays pending, production qualification and activation stay false; no new confirmation or production keys. [Evidence](evidence/ma24-g09-configured-declaration-cli-2026-10-19.json).


2026-10-19 / MA24-06 verification update: fixed snapshot 06dfe3b900967da0524f6e160843bbf606b341b4 completed with exit 0. The configured signed five-category flow passed same-freeze composition, locked transport revalidation (2 original tasks, 8 evaluation arms, 5 cases), disabled transport-key rejection and the common final deadline wiring. This positive full flow used fixture-signed declarations before the configured --attest CLI; expiry injection remains component-level evidence. Real model calls: 0. Real quality, production qualification and automatic activation remain false. [Receipt](evidence/ma24-g09-common-final-signature-clock-2026-10-19.json).


2026-10-19 / MA24-06 Linux declaration execution: fixed application image ma24-skill-collector:9b0c78e7 (image ID sha256:5c974dcc3a4dd2efd26eff9696f204d4385660789db9c77be13cdcea4e5a76bd; measured package deployment hash 08c7505c8964733da2bed7481c62958bf9c1ab684463354135320ad0c1872708) passed actual non-root/read-only --attest execution against a disposable TLS database. Issuance/server readback, idempotent retry, foreign-owner/synthetic-source/caller-binding/app-login/wrong-key/purpose/revocation/NODE_OPTIONS rejection, missing TLS root and mismatched package hash all passed without rejected appends. The test harness now accepts --declaration-image and pins the immutable image ID. Typecheck and focused lint passed. The initial missing fixture TLS bootstrap failure is retained in the receipt. Real model calls: 0; no production keys, source promotion, production qualification or activation. The full CLI-signed five-category snapshot remains separate and pending. [Receipt](evidence/ma24-g09-configured-declaration-linux-image-2026-10-19.json).


2026-10-19 / MA24-06 full configured CLI composition: fixed snapshot 9b0c78e79a91753f565cdd4f29c8c59340c12478 completed with exit 0. Actual compiled --attest issuance, five-case same-freeze composition, unified readback, locked material reconstruction, 2 original-task and 8 evaluation-arm transport audits, disabled-key rejection and common final deadline wiring passed. Missing human judgment still blocks policy. Temporary source snapshot/database were removed. Model/network/billing adapters remain synthetic (0 actual model calls); binary/provider qualification, independent real quality and final activation remain unfinished. The separate Linux-image --attest matrix does not constitute the full five-category workflow inside the image. [Receipt](evidence/ma24-g09-configured-declaration-cli-2026-10-19.json).


2026-10-19 / existing MA24 source-integrity implementation: original-asset registration now hashes through one file descriptor in bounded chunks, confines canonical paths to knowledge/, and rejects changed length, descriptor metadata, inode/device identity or current path before writing the asset. Shared binary registration passes the previously approved source SHA-256; a stable replacement with another digest rejects and does not mark the upload registered. 19 focused tests across three files, typecheck and focused lint passed. The first test launch failed before executing tests due to sandbox temp-cache EPERM; workspace-scoped TEMP/TMP resolved it. Tests use deterministic filesystem/DB mocks. This is not immutable storage, a real worker/HTTP acceptance or final activation protection; the earlier shared document upsert is not rolled back by a final asset rejection. No new user rule or quality confirmation. [Receipt](evidence/ma24-g05-g09-stable-asset-registration-2026-10-19.json).


2026-10-19 / existing MA24 source-integrity implementation: the formal vectorless new/revision publication paths now use the descriptor-based original inspector, bind locked jobs to storage_key/byte_size, and recheck approved original bytes after transaction writes before returning. Late hash/size mismatch rejects the owning transaction callback. 27 focused tests (8 new formal cases), typecheck and focused lint passed; transaction/filesystem dependencies are mocked in these new cases. The actual formal worker six-group clone matrix is running separately and is not yet accepted; its existing corruption cases occur before invocation, not during the transaction. No production caller of the legacy shared registration entry was found, so its partial-upsert limitation remains separate. This is not immutable storage or final Skill activation protection. [Receipt](evidence/ma24-g05-g09-formal-publication-final-original-2026-10-19.json).


2026-10-19 / formal publication actual rollback verification: application commit 7767175e passed a dedicated isolated-clone PostgreSQL + real-filesystem race in four scopes (private/shared x new/revision). The verifier observes a registration backend blocked on the held upload row after its initial byte inspection, overwrites the original with equal-size different bytes, then releases the lock. The final approved-hash check rejects; document/asset/tree/revision counts and old revision pointer match the pre-call snapshot, and the upload remains extracted with no publication IDs. Restoring bytes permits a successful retry. Random fixture accounts/rows/files were cleaned. Typecheck/lint passed. Extraction JSON is synthetic; no model calls or production database security/real quality qualification. The separate full formal-worker matrix remains running. [Receipt and verifier](evidence/ma24-g05-g09-formal-publication-final-original-2026-10-19.json).


2026-10-19 / formal worker matrix completed: source matching application commit 7767175e and the recorded file hashes passed with exit 0. Actual PDF/PPTX/XLSX x private/shared revisions preserve old reads during processing/review and corruption, select one reviewed winner, reject competing revisions, provide exact unit-2 citations and correct peer access, and reuse registration/history correctly. Two actual supervisor kills and extraction/visual lease recovery also passed. Test accounts/rows/files were cleaned; external calls 0, visual judgments synthetic, real quality unaccepted. This and the separate four-case actual late-original database race close their engineering checks, not immutable storage, production qualification or G09 final activation. [Combined evidence](evidence/ma24-g05-g09-formal-publication-final-original-2026-10-19.json).


2026-10-19 / formal tree publication integrity: indexExtractedDocument now uses stable descriptor inspection for the original, binds asset storage_key/byte_size, and rechecks both original and extraction-artifact hashes after tree/pointer writes within the owning transaction. 30 focused tests, typecheck and lint passed. Actual clone testing passed 8 original/artifact late-mutation tree cases (private/shared x new/revision) after observing an advisory-lock wait, plus the existing 4 registration races. New tree rows/pointer roll back and restored-byte retries succeed. Tree fixtures start with a deliberately cleared pointer/deleted candidate tree; they do not prove preservation of a non-null historical tree pointer. All source/extraction content is synthetic, no external calls. The earlier formal-worker matrix predates this change. Immutable storage, production qualification and final Skill activation remain incomplete. [Receipt](evidence/ma24-g05-g09-tree-publication-final-bytes-2026-10-19.json).


2026-10-19 / formal publication final artifact binding: both new registration and binary revision now inspect the extraction-artifact file against the already validated artifact hash after all publication writes, alongside the final original check. 32 focused tests, typecheck and lint passed. Two actual isolated-clone runs (MA24_PUBLICATION_MUTATION=original/artifact) passed 8 distinct registration races and 8 distinct tree races (24 total executions because tree cases repeat), with observed waits, equal-size late changes, rollback and restored-file retries. Actual revision cases retain their old pointer; tree cases use deliberately cleared pointers as separately documented. No real model calls or independent content-quality claims. Point-in-time checks remain distinct from immutable storage and final Skill activation. [Receipt](evidence/ma24-g05-g09-formal-publication-final-artifact-2026-10-19.json).


2026-10-19 / final extraction review revalidation: new registration, binary revision and standalone tree publication now rebuild reviewed extraction after writes using withBoundTenantTransaction on the publisher client/account/transaction. The original validated artifact bytes are passed into revision publication. 41 focused tests, typecheck and lint passed. Actual isolated-clone testing withdrew synthetic completion receipts after observed waits: four registration and four tree cases rejected and rolled back, restoring the receipt allowed retry; eight byte-mutation tree cases also passed. Synthetic review decisions are not human quality approvals, and privileged fixture deletion does not add a product deletion API. Latest-judgment supersession was not separately injected in this actual run. Full source protection, immutable storage, production identity and final Skill activation remain incomplete. [Receipt](evidence/ma24-g05-g09-final-extraction-review-2026-10-19.json).


2026-10-19 / existing publication authorization implementation: formal new/revision/tree publication now checks the current active account on the same client before returning; private publication requires member/admin and shared publication requires current admin. New/revision reuse paths also recheck. 51 focused tests, typecheck and lint passed. Actual isolated-clone waits followed by private-account disablement or shared-admin downgrade rejected four registration and four tree cases, with rollback and restored-permission retries; eight byte mutation tree cases also passed. Some revisions reject earlier via their existing target guard, so those cases do not isolate the new final helper. No real accounts changed. The final read is not an account-administration lease through commit, and full source/production/quality/activation gates remain incomplete. [Receipt](evidence/ma24-g02-g05-g09-final-publication-account-2026-10-19.json).


2026-10-19 / local release baseline: source 20c00e73dab84dd1dd15a76635bd0479535980a1 built successfully with Next 16.3.4 in a separate output directory, BUILD_ID 3GGcRWoFZyh5eTALR4BT8. All 945 packaged runtime-source files match the clean code/config/lock baseline after removal of two Next-generated output-directory type includes; no private env or storage roots are bundled. The first sandbox build failed on junction creation; an approved isolated-output retry passed. Collector image ma24-skill-collector:20c00e73 (sha256:1436ff8c597de902dd184a610f9cd927dc8e8ae75569db9415b7004cb01a41dc) passed 34,460-file measured-package/read-only/non-root/no-network/tamper checks; deploymentHash 81f278adca72fbd363428ffc0fcd4b336027cd015e3bb045c698d43c0effbb03. No Web Linux image, actual new-image database/provider run, deployment, independent quality or production qualification is implied. [Receipt](evidence/ma24-g01-g09-local-release-build-2026-10-19.json).


2026-10-19 / fixed collector image database acceptance completed: ma24-skill-collector:20c00e73 passed actual measured --attest execution against a fresh TLS database, signed issuance/readback, retry reuse and owner/source/key/purpose/revocation/NODE_OPTIONS/TLS-root/package-hash rejection. Exit 0; temporary cluster/network removed; 0 model calls and no production keys. This source-specific result does not cover later publication lease changes or establish provider/real-quality/production qualification. [Release receipt](evidence/ma24-g01-g09-local-release-build-2026-10-19.json).


2026-10-19 / worker publication lease clock: formal new/revision/tree entry and final lease checks now use database clock_timestamp(), including reuse and lease-scoped error recording. Final checks stay on the owning client and do not renew the lease; interactive calls without a worker lease retain their existing behavior. 57 focused tests, typecheck and lint passed. Actual isolated-clone testing observed each waiting transaction begin before lease expiry, then the wall clock cross expiry without modifying the stored token/deadline: four registration and four tree cases reached the specific final-preparation expiry rejection, rolled back and succeeded after fixture renewal. Eight tree byte mutation cases also passed. This is not a through-commit lease extension; the 20c00e73 build/image predates this change. [Receipt](evidence/ma24-g05-g09-final-publication-lease-2026-10-19.json).


2026-10-19 / locked publication job binding: formal new/revision registration now compares all prepared publication metadata after locking the current upload row, including title/collection/source URL/entity/MIME and revision target/base. Standalone tree indexing locks and compares that row for all callers before the document lock, and also checks registered status and published document/asset IDs. Legitimate successful competing registration can still advance status/IDs. 60 focused tests, typecheck and lint passed. Actual isolated-clone title changes in four registration cases and extractor-version changes in four tree cases were committed while publishers waited, then rejected before candidate writes; restoration allowed retry. Eight byte-mutation tree cases also passed. Test fixtures, files and users were cleaned. This protects the task snapshot, not immutable files, independent quality or production qualification. [Receipt](evidence/ma24-g05-g09-publication-job-binding-2026-10-19.json).


2026-10-19 / actual latest-judgment supersession: application code f3d2623e passed four registration and four tree races where a tenant-bound application transaction appends synthetic revision-2 unresolved judgments after the publisher has initially verified revision 1 and reached a task-row wait. The original receipt/artifact stay unchanged; reconstruction fails on the specific latest unresolved judgment. Restoring the fixture judgment permits retry; eight tree byte-mutation cases also pass. The initial fixture FOR UPDATE blocked the append foreign-key KEY SHARE; only that synthetic waiting query was canceled for cleanup, and fixture NO KEY UPDATE corrected the ordering without changing product locks. Typecheck/lint passed. This closes the actual latest-judgment evidence gap, not human quality or production activation. Full fixed-source signed composition remains separately running. [Receipt](evidence/ma24-g05-g09-latest-judgment-race-2026-10-19.json).
