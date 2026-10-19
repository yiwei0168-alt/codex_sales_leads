# 原始任务的模型传输收据

历史基线任务先于评测冻结执行，不能拿绑定冻结的评测收据替代其原始请求证明。新增独立 `task-model-transport-v1` 成功收据格式，绑定账号、任务、调用 ID、mode 调用键、存储输入哈希、部署与签发进程，以及请求清单和规范化响应。

验证器从服务器配置的公钥登记表读取密钥，要求显式 `task-model-transport` 用途；既有运行声明和评测传输用途不能代替它。当前密钥必须启用且未过期。签名中的开始/结束时间必须位于服务器提供的真实存储调用窗口内，且任务创建早于调用；200 状态、固定 HTTPS 源、实际模型/提供方/生成 ID、请求/响应哈希和 Ed25519 签名均需匹配。期待绑定和时间必须来自当前账号的持久记录，不能接受 HTTP 调用方自行声明。

[验收](evidence/ma24-g09-original-task-transport-verifier-2026-10-17.json)：48 项原始收据/既有评测传输/运行声明回归及类型/lint 通过，含用途隔离、绑定篡改、错误请求/答案、撤销、过期、超出调用窗口和无签名拒绝。仅使用合成临时密钥。

上述验证组件阶段之后，已实现可选的原始任务成功请求签发工厂与 mode 持久执行接线。服务器通过已创建的调用 ID 读取当前账号、运行中任务及 started 模型调用，核对存储输入哈希和时间；调用前后重新检查数据库记录、公钥登记和计费上下文。每个工厂闭包只允许调用一次，观察固定 OpenRouter HTTPS 端点的实际发送边界及 HTTP 200，再对请求清单和规范化响应签名。原有代理路由在观察回调内部选择，外层注入传输保持该回调。

配置项为 `TASK_MODEL_TRANSPORT_KEY_ID`、`TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE`、`TASK_MODEL_TRANSPORT_COLLECTOR_ID`、`TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256`；登记公钥须有独立用途。任一配置存在即进入签发路径，配置不全会拒绝，不静默降为无签名。全部未配置时保留既有普通任务行为，不获得可信来源资格。成功结果的收据进入既有持久化输出；恢复已有成功结果时复用输出，不重发请求。进程环境限制不等于部署二进制认证。

[签发接线验收](evidence/ma24-g09-original-task-transport-signing-2026-10-17.json)：47 项定向测试及类型/lint 通过。测试保留真实代理路由包装，模拟底层网络、模型 RPC 和数据库；图执行测试核对传给保存函数的输出及恢复行为，并非实际 SQL 入库证明。

后续已补 `task-model-transport-failure-v1` 失败签发与验证器，沿用独立 task 用途和真实存储调用时间窗口。仅观察到请求后、符合既有可回退分类且 HTTP 状态匹配的失败可签名；前后重新检查当前调用、登记表与计费上下文，取消或检查失败保留原错误且不签名。验证器核对存储请求哈希、路由/effort、工具清单、无模型响应的失败清单、原因、状态及签名。图执行在保存 unavailable 结果时携带收据，再由既有顺序回退逻辑请求下一路由。

[失败签发证据](evidence/ma24-g09-original-task-failure-signing-2026-10-17.json)：90 项定向测试与类型/lint 通过，覆盖合成 HTTP 503、连接拒绝、超时及取消/撤销/未知结果不签名。数据库与底层网络仍为模拟，先保存再回退只验证函数调用顺序，尚非实际 SQL 持久化证明。

另已新增 `verifyOwnedTaskModelTransports` 独立审核组件，只接受任务 ID，从当前账号完成的 main-agent 任务读取所有 model/main_model 日志，拒绝 legacy/batch、未完成和空日志。按已存决策分组核对路由从 0 连续、共同请求/配置、时间顺序、每个可回退失败签名和最终成功签名；重建成功请求清单，拒绝重复成功 generation，结束时重读日志和登记表。它不接受调用方提供日志或收据。43 项定向测试与类型/lint 通过；日志测试模拟数据库与签名验证器，密码学另由请求/收据测试覆盖，尚未实际 SQL 贯穿。[组件证据](evidence/ma24-g09-original-task-journal-audit-2026-10-17.json)。

后续[实际数据库验证](evidence/ma24-g09-original-task-journal-database-2026-10-17.json)已通过：一次性 pgvector/pg16 集群通过 135 后仅补本工作包 146，未应用延后迁移 136–140。临时密钥构造两条合成失败/成功收据，通过真实 `beginCall`、`completeCall` 应用角色接口入库，再由当前账号审核组件实际验证 Ed25519 签名。恢复读取复用结果，跨账号、登记撤销、持久签名篡改、路由缺口均拒绝；原有评测传输日志回归同时通过。首轮夹具 SQL 复用 UUID/text 参数失败，修正独立参数后完整命令退出 0。类型/lint 通过，临时集群正常清理。此测试没有执行请求工厂或真实提供方。

随后在普通 Node 编译子进程中执行了签发工厂准入：生产环境限制下读取实际运行任务/started 调用、存储输入及时间、临时私钥和独立用途登记，返回请求闭包；跨账号、错误任务和缺失计费上下文均拒绝。完整一次性数据库命令与原有签名日志回归通过，类型/lint 通过。只执行工厂准入，没有调用返回的闭包，也没有签发真实提供方请求；编译测试程序不代表部署二进制认证。[准入证据](evidence/ma24-g09-original-task-compiled-admission-2026-10-17.json)。

现已将原始签名审核接至 `runConfiguredSkillRecordedCandidate` 的每次来源绑定：历史与前瞻任务在候选请求工厂创建前、候选执行后、候选收据验证后都重新审核原始日志/签名，并比较审核结果哈希。既有 `prepareRecordedSkillCandidateSnapshot` → `loadRecordedTaskChain` 的初始上下文、决策/工具链及闭合重建保留；新门禁补原始传输证据，不替代这些检查。输出单独返回原始审核哈希。58 项定向回归、类型/lint 及采集器构建通过，编排测试使用模拟依赖；完整入口实际 SQL 执行尚未验证。[接线证据](evidence/ma24-g09-original-task-runner-gate-2026-10-17.json)。

失败闭包现已补实际 SQL 贯穿：普通 Node 编译子进程执行真实工厂和 `requestModeModel`，以构建时明确替换的 fetch 返回合成 HTTP 503；仅网络路由和 `budgetedFetch` 换为透传测试适配器。工厂完成前后数据库/信任/计费上下文复核并生成签名，子进程通过真实 `completeCall` 保存 unavailable 结果，父进程恢复读取并用真实 Ed25519 验证器审核完整失败→成功日志。成功端仍是构造签名，未执行成功请求闭包。完整数据库命令、类型/lint 通过，无外部模型调用，不验证生产网络或计费。[闭包证据](evidence/ma24-g09-original-task-closure-database-2026-10-17.json)。

成功闭包随后也已贯穿实际 SQL：两条尝试分别在普通 Node 编译子进程执行签发工厂，失败端消费合成 503，成功端由真实 SSE 解析器消费合成 200 流（内容、stop、DONE），经真实成功签发逻辑生成收据并保存。测试不再手工构造任一结果签名；父进程恢复回读并审核完整失败→成功签名链，跨账号/撤销/篡改/路由缺口回归继续通过。完整数据库命令、类型/lint 通过。仍明确替换网络及预算适配器，不代表生产网络、预算执行或模型质量。[成功闭包证据](evidence/ma24-g09-original-task-success-closure-database-2026-10-17.json)。

计费绑定补强：原工厂仅检查操作 ID 为 UUID，现要求 `currentSpendContext.operationId === context.runId`，与主图现有 `withProductSpend(..., runId)` 绑定一致。工厂准入、闭包调用、网络发送和响应后均拒绝同账号其他任务的计费范围。44 项定向回归、类型/lint 及实际数据库失败/成功闭包回归通过；错误任务夹具已调整为匹配错误任务的计费范围，继续验证 SQL 归属拒绝。仍使用合成网络/预算适配器，不代表生产计费已验。[绑定证据](evidence/ma24-g09-task-billing-binding-2026-10-17.json)。

签名夹具已进一步采用真实产品初始上下文：`initialTaskMessages`、当前 `loadDecisionMemory` 注入、账号用户消息及任务最终 reply。实际新数据库同时通过签名审核、`loadRecordedTaskChain` 的原始来源/决策/日志闭合重建以及 `replayRecordedGraphTrace`；修改用户原文或最终 reply 均被拒绝，恢复后再次重建通过。类型/lint 及完整数据库回归通过。范围为 quick 模式单决策、两条回退尝试、无工具调用，不外推多决策工具链或完整候选执行入口。[上下文证据](evidence/ma24-g09-signed-task-context-database-2026-10-17.json)。

多决策描述转换已补：签名夹具现为两次决策、三条尝试（首路失败、回退后请求 `describe_tool(mail_read)`、携带描述结果最终回答）。工具描述由实际 `dispatchTool` 生成，流式工具调用由真实解析器合并；三条收据均由真实签发工厂生成并经实际 SQL 保存。日志签名、原始上下文、完整任务链及图回放全部通过，既有恢复和拒绝回归继续通过，类型/lint 通过。这是工具元数据场景，不包含业务源读取或完整候选入口执行。[转换证据](evidence/ma24-g09-signed-tool-transition-database-2026-10-17.json)。

业务读取转换也已补实际联验：夹具扩展为三次决策、四条签名尝试，先描述 `customer_timeline`，再经真实 `dispatchTool`/应用执行接口读取账号客户列表，携带实际保存的只读收据进入最终回答。资料为一次性库内单个合成客户，工具输入由产品正常归一化；任务闭合校验确认消费一条真实读取收据。签名、任务链、图回放和恢复通过，篡改持久读取收据被重建拒绝，既有原文/答案、账号、撤销、签名和路由边界回归通过，类型/lint 通过。此测试没有执行完整受控候选入口或真实模型。[业务读取证据](evidence/ma24-g09-signed-business-read-database-2026-10-17.json)。

签名任务到候选快照的桥接已实际验证：调用 `prepareSkillAcceptanceBaseline` 生成含三次成功决策的基线投影，再调用 `prepareRecordedSkillCandidateSnapshot`，确认候选仍停用、保留一条读取收据且任务输入/模型配置哈希与基线一致。原签名、任务链、图回放及拒绝回归继续通过，类型/lint 通过。最终夹具已改为 standard 模式并完整重跑；quick 模式不开放 Skill 工具，不用于后续候选实际读取 Skill 的正例。这仍只是快照构建，尚未执行完整候选模型与收集入口。[快照证据](evidence/ma24-g09-signed-candidate-snapshot-database-2026-10-17.json)。

完整候选执行联验曾实际暴露 `Skill model outcome conflict`：模型可省略 usage，内存结果含 `usage: undefined`，JSON 入库省略它，原日志哈希因而与存储对象不一致。`skill-model-journal` 现对校验后的输入/结果按实际 JSON 表示归一化后再计算哈希和保存，未修改全局 digest 或历史记录。40 项定向回归、类型/lint 通过，覆盖缺失可选元数据的保存和恢复。完整候选数据库重跑尚在进行，不能据此记录完整入口通过。[修复证据](evidence/ma24-g09-model-journal-json-normalization-2026-10-17.json)。

完整历史候选入口随后通过实际新数据库联验：以普通 Node 编译的真实 `skill-collector-runner --execute` 运行 historical 作业，冻结真实当前源码/上下文身份和原任务基线，使用独立受限 collector 登录。候选经配置工厂签发模型结果、读取候选 Skill、复用原客户列表收据，完成持久日志审核与 `collectHistoricalSkillAcceptance` 收集；入口前后原始签名复核均执行，Skill 仍停用。网络/SSE、预算和代理适配器为构建时测试替身；诊断只增加失败时静态错误分类，不改变成功逻辑。类型/lint 与数据库回归通过。其余四类冻结题仅占位未执行，不能当作完整五类验收、前瞻入口、真实质量或生产认证。[历史完整入口证据](evidence/ma24-g09-configured-signed-candidate-database-2026-10-17.json)。

完整前瞻入口也已通过实际数据库联验：以新 campaign 在任务插入前登记并冻结计划，再插入 queued 新任务、由真实触发器捕获 start_context 后启动原流程。三决策原任务的签名和业务读取链完成后，真实编译 collector 使用 prospective jobId 执行，服务端派生 runId 并校验登记/冻结/捕获/启动/完成的时间顺序，完成候选签发、受限日志保存、审核及前瞻证据收集。未把已完成历史任务补标为前瞻。类型/lint 通过，Skill 仍停用；其他四类题只占位未执行，网络/预算仍为测试适配器。[前瞻完整入口证据](evidence/ma24-g09-configured-prospective-database-2026-10-17.json)。

配置安全入口也已补实际数据库联验：`safety-ambiguous`、`safety-source-injection`、`safety-cross-account` 各执行 baseline/candidate 两臂，均通过真实编译 collector 的安全入口、配置签发工厂、受限持久日志和传输审核。候选实际读取固定 Skill，注入题两臂消费合成攻击收据；最后实际 `collectSkillSafetyAcceptance` 收集三题并统一回读，人工判定为空、Skill 仍停用。完整命令退出 0，类型/lint 通过，临时容器清理。网络、预算与模型响应明确为测试适配器，脚本化回答不证明真实安全质量；本冻结中的 replay/shadow 仅占位，未证明同冻结五类组合。[三类安全入口证据](evidence/ma24-g09-configured-safety-database-2026-10-17.json)。

同冻结五类联合工程联验已通过：先完成签名历史任务并准备三类安全来源，再将其与尚未执行的新前瞻任务登记在同一计划；前瞻捕获后分别执行三个配置采集入口。两条原任务的公开临时信任密钥同时保留，复用同一个合成客户列表以免新建客户改变历史来源。三个组件包组合成五题包，统一回读和 `evaluateLockedSkillAcceptanceReadiness` 的五题持锁重建通过；知识/记忆准入及客户列表来源锁成立，缺少人工判定阻断策略，Skill 仍停用。实际新库安装 135 后精确补 144–149，未应用延后 136–140；类型/lint 通过，实际模型调用 0。仅一类真实本地业务读取，不能外推全部资料源、完整撤销语义、真实质量或生产身份。通用 harness 的 completeComposition 标志对应另一命令，本次以独立 configuredSameFreezeFiveCategoriesVerified 断言为准。[五类证据](evidence/ma24-g09-configured-five-category-database-2026-10-17.json)。

尚未登记生产密钥或执行生产签发。上述联合工程链路不授予生产资格；legacy/batch 覆盖、完整可变来源撤销保护、部署认证、真实质量和最终启用事务仍待完成。旧无签名日志不因此取得资格。单次签名成功不证明整个任务、部署二进制、真实质量或最终启用；自动启用仍关闭。


## 2026-10-19 - Retained-transaction transport audit

`revalidateLockedSkillTransportReceipts` derives deduplicated original tasks and evaluation arms from the stored artifact. Historical/prospective baselines use original task journals; all three safety categories require both arms. It retains the account-bound transaction, standard source/bundle/freeze/Skill lock order and task journal locks. Every signed failed fallback and successful response uses database wall time. The audit reloads and compares server registry hashes and checks the earliest signed receipt/plan expiry again at its end.

Readiness repeats this audit after policy preparation and compares stable audit hashes, then checks the final runner declaration against the same registry. Public results expose counts, hashes and times, without task/evaluation IDs or private prompts/receipts. Synthetic artifacts explicitly return not-required/not-revalidated. These preparation points do not grant a registry lease, deployed binary/provider qualification, complete provenance, independent quality acceptance or activation.

100 focused tests, typecheck, lint, current Next.js production build and byte equality of eight packaged runtime modules passed. The actual configured signed five-category database run is still running. Its fixture explicitly enrolls the latest temporary signing key for runner-declaration and signs the actual composed artifact; it does not bypass the missing-declaration guard. [Evidence](evidence/ma24-g09-locked-transport-receipts-2026-10-19.json).


2026-10-19 fixture setup correction: the combined signed transport fixture now explicitly applies migration 141 before the declaration check. The in-flight disposable database lacked this table; the same existing migration was applied only to that named temporary container and the table presence was verified. Application sources and validation guards were unchanged. This repaired in-flight run is recorded separately from an uninterrupted execution of the corrected bootstrap. [Receipt](evidence/ma24-g09-locked-transport-receipts-2026-10-19.json).


2026-10-19 signed-integration result: exit 1 is preserved. After the explicitly recorded temporary migration-141 setup repair, readiness returned with two original tasks, eight evaluation arms, signed receipt revalidation and matching runner/transport registry hashes. Disabling the enrolled key correctly raised `Task failure trust unavailable`; the fixture expected a different error text. Its assertion now matches that exact existing error. Later assertions were not reached. A fresh corrected-bootstrap rerun is required; this first run is not recorded as passed. Application guards were unchanged. [Evidence](evidence/ma24-g09-locked-transport-receipts-2026-10-19.json).


2026-10-19 clean fixed snapshot 2142510f passed the configured signed five-category run: two original tasks, eight evaluation arms, locked transport/declaration audits, all material checks, disabled-key rejection and missing-human-judgment policy blocking. No mid-run repair was performed. The initial failed fixture run remains recorded; real quality, production qualification and activation are false. This snapshot predates the later common final-clock change. [Receipt](evidence/ma24-g09-locked-transport-receipts-2026-10-19.json).
