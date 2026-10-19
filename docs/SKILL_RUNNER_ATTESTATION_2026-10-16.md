# Skill 采集运行声明认证（G09，2026-10-16）

2026-10-19 更新：可选数据库登记模式及操作员预期版本发布工具已接入；数据库最终复核的工作区完整组合通过。下文文件模式为原有路径，不获得事务登记锁保证；最终启用和生产认证仍未完成。[当前范围](SKILL_TRUST_REGISTRY_READINESS_2026-10-19.md)。


2026-10-19 新采集器镜像 `3f5c1556` 的完整入口矩阵已通过，含启动前实际运行限制和旧包/登记/篡改拒绝；无模型调用。[固定镜像入口收据](evidence/ma24-g09-collector-runtime-image-2026-10-19.json)。同镜像实际 TLS 声明矩阵也已退出 0，签发/回读、重试复用及账号/来源/密钥/用途/撤销/TLS 根/部署包错误拒绝通过；临时测试密钥，无生产资格或启用。[签发证据](evidence/ma24-g09-collector-runtime-declaration-2026-10-19.json)。

2026-10-19 固定 `dd7daff5` 完整签名组合已退出 0：G03 来源/租约应用修复后的 CLI 签发、五类组合、统一回读、持锁重建及传输复核通过；人工判定缺失仍阻断。实际模型调用 0，真实质量及生产/最终启用未完成；早于本轮 `3f5c1556` Linux 采集器启动运行边界。[收据](evidence/ma24-g09-signed-composition-dd7daff5-2026-10-19.json)。

2026-10-19 运行边界补强：启动入口新增非 root/一致 UID、NoNewPrivs、空 capabilities、根/包/Node 只读及可写子挂载拒绝，19 项边界测试加既有清单测试及实际六类 Linux 组件探针通过。组件阶段之后的新镜像入口/声明矩阵已通过，见上文；组件或矩阵结果均不视为完整生产身份认证。[工作流与限制](SKILL_COLLECTOR_RUNTIME_BOUNDARY_2026-10-19.md)。

2026-10-19 完整联验更新：固定源码 `f3d2623e` 的配置 CLI 签发与同冻结五类组合退出 0，统一回读、持锁材料重建、2 条原任务及 8 条评测臂传输复核、禁钥拒绝通过；人工判定缺失仍阻断。模型/网络/预算是合成适配器，实际模型调用 0，不授予生产身份、真实质量或自动启用资格。该结果不是整个流程在 Linux 镜像内运行的证据，也不含后续邮箱修改。[收据](evidence/ma24-g09-signed-composition-f3d2623e-2026-10-19.json)。

历史/前瞻候选入口已接通配置请求、持久核对和对应材料收集；历史任务匹配冻结基线，前瞻任务从服务器捕获派生，旧基线收据不因此获得认证。25 项入口编排测试通过，详见[工作流与限制](SKILL_MODEL_TRANSPORT_RECEIPTS_2026-10-16.md)。完整生产采集器进程和最终启用仍未完成。

受控安全评测入口现已连接配置请求工厂、原持久图和执行后的日志签名核对；12 项编排及 21 项请求/日志回归通过，详见[传输工作流与证据范围](SKILL_MODEL_TRANSPORT_RECEIPTS_2026-10-16.md)。这仍未认证已部署采集器，也未接通最终启用事务。

补充：[模型传输收据实现](SKILL_MODEL_TRANSPORT_RECEIPTS_2026-10-16.md)增加用途隔离的签名协议、受控请求工厂和服务器日志核对入口。后续共 72 项收据、声明、工厂、日志核对及既有日志审计回归、全仓类型检查和定向 lint 通过；另有[一次性新库签名回读与隔离验收](evidence/ma24-g09-transport-journal-database-2026-10-16.json)通过。生产工厂实际执行、真实部署身份、提供方和最终启用仍未验收。

[安全候选固定方法读取守卫](SKILL_SAFETY_USAGE_AUDIT_2026-10-16.md)已补齐：实际图未读取固定 Skill 的候选不能追加为安全验收材料；25 项定向及实际新库正反例通过。这不替代生产 runner、提供方及最终启用认证。

分组材料现有[内部组合实现](SKILL_ACCEPTANCE_COMPOSITION_2026-10-16.md)，将历史、安全和前瞻组重建为新审核包；不复制原判决、签名或认证标记。实际新库完整多组重建、组合追加/幂等及统一回读已通过合成正例；真实质量、生产签发及启用事务仍未验收。

这是 MA24-06 可信评测来源到自动启用的一个实现阶段。当前已完成签名声明校验、服务器配置入口和独立追加存储；生产签发、统一影子观察及启用事务尚未接通，不能启用任何 Skill。源码哈希、有效签名或 `policyPassed` 各自都不足以证明自动启用资格。

`src/lib/assistant/main/skill-runner-attestation.ts` 使用 Ed25519 验证声明。声明同时绑定账号、冻结记录、计划哈希、完整材料哈希、运行身份哈希、部署包哈希及采集器标识。时间顺序必须满足：信任登记生效 ≤ 计划冻结 ≤ 开始采集 ≤ 完成采集 ≤ 签名签发 ≤ 当前时间 < 声明到期；声明到期不能晚于计划或密钥登记到期。

服务器仅从操作员配置的 `SKILL_RUNNER_TRUST_REGISTRY_FILE` 读取公钥登记；每次验证重新读取，移除或停用公钥后下一次核对即拒绝。登记限定采集器和部署包，不接受私钥 PEM，缺配置时拒绝。签名覆盖声明的规范化 SHA-256；应用校验组件不生成或读取生产私钥。HTTP/工具参数不能提供信任登记，也不能以调用方提交的期望值替代服务器从冻结/材料记录派生的值。

登记的公钥代表操作员信任的签发者，签名认证的是该签发者的声明。它不能独立检查运行中的二进制、提供方响应或模型等价性；签发者必须在受控运行入口验证这些内容。生产签发和部署登记仍需实现和实际验收，本阶段没有创建生产公私钥、登记记录或有效生产声明。

存储接线现由 `skill-runner-attestation-store.ts` 和独立迁移 `141_skill_runner_attestation.sql` 实现：专用采集角色追加声明，普通应用只有本账号读取权限；重复声明复用原记录，更新和删除由触发器拒绝。服务器从不可变材料及冻结记录派生绑定，部署包与采集器标识分别来自服务器配置 `SKILL_RUNNER_DEPLOYMENT_SHA256`、`SKILL_RUNNER_COLLECTOR_ID`。读取时重核冻结、材料及公钥登记，密钥停用和冻结撤销会使已有记录失效。签名在独立表保存，不写回被签材料，避免哈希循环。

迁移 141 只依赖 Skill 基础至 135；本轮只在一次性新库直接应用并复跑 141，未应用 136–140 或现有产品库。首批试用的 001–135 初始化边界不变。该存储目前仅接受待验证来源的声明，并明确拒绝给合成材料添加这种声明；保存后仍不将来源类别升级为生产已认证。

后续在最终启用事务中还须锁定 Skill 与版本、冻结及撤销状态、最新人工审核、来源状态，并核对运行包/提供方收据与完整分组质量。登记变化或任何撤销必须使启用失败。现有合成和待验证来源仍不具有自动启用资格。生产签发者也必须先核对实际运行二进制及提供方，不能只根据调用方提供的哈希签名。

18 项定向测试覆盖正确签名、内容篡改、错误私钥、七种绑定变化、登记停用/移除/重复、登记的采集器/部署包变化、时间窗口和缺服务器配置；另用临时公钥文件验证登记停用后重新读取立即拒绝。类型与定向 lint 通过。[验收记录](evidence/ma24-g09-runner-attestation-primitive-2026-10-16.json)。

全新临时数据库又通过采集角色追加/幂等、普通应用写入拒绝、跨账号拒绝、不可改删、合成材料即使正确签名仍拒绝、登记停用/冻结撤销后的读取失败。测试 Skill 始终停用，容器已清理。[存储验收](evidence/ma24-g09-runner-attestation-store-2026-10-16.json)。

## 声明时间与持久观察绑定补强

服务器现在先解析包内非空观察，逐条核对计划、题目 ID 唯一性、固定版本、输入/来源哈希及 provenance，再检查冻结区间、完成顺序和影子任务开始时间。从记录派生最早 capturedAt 和最晚 completedAt，声明中的两个时间必须与之代表相同毫秒；即使签名正确，时间不匹配也拒绝。部分题组仍可独立签名，不把这一步当作全部分组质量验收。

追加及读取共用该绑定，旧版本已存的空观察声明和时间漂移声明也拒绝读取。33 项定向测试、类型/lint 及一次性 PostgreSQL 实测通过；临时库直接插入两种历史不合格记录以核对读取拒绝，同时复验专用角色追加/幂等、应用写拒绝、跨账号、不可改删、合成来源拒绝、登记停用与冻结撤销。仅应用基础至 135 加独立 141，未触及 136–140、现有产品库或生产密钥。Skill 仍停用，自动启用路径仍未开放。

2026-10-19 独立新集群复验：[fresh-cluster 收据](evidence/ma24-g09-runner-attestation-fresh-cluster-rerun-2026-10-19.json)。覆盖一次性容器中新库初始化、迁移 141、绑定签名声明追加/读取和拒绝路径；未迁移产品库、未创建生产密钥、未启用 Skill。生产运行身份和最终启用事务仍未完成。

2026-10-19 补充 G09 交叉验收：[独立新集群矩阵](evidence/ma24-g09-fresh-cluster-engineering-matrix-2026-10-19.json)还覆盖来源锁、锁内审核/策略、全五类材料重建与传输日志恢复。所有通过证据仍来自合成夹具；锁内完整来源 payload 重建、合格生产二进制/采集器、真实质量及最终启用事务仍不成立。

## 同事务运行声明复核（2026-10-19）

内部 readLockedSkillRunnerAttestation 先沿标准来源→审核包→冻结→Skill 顺序保留锁，再按当前账号、审核包与冻结选择服务器存储的最新声明。期望绑定只从材料/冻结及服务器配置派生，签名时间用数据库 clock_timestamp()；缺声明、跨账号、失效密钥、到期和绑定变化均拒绝。合成材料返回“不要求生产声明、声明未认证”，不借签名升级来源。

材料/策略准备前后各调用一次该组件，重载公钥登记，比较声明 ID、声明哈希和登记哈希；末尾时间单独复核，检查时刻自然变化不误判漂移。冻结锁同时使合规声明追加等待，避免准备中更换服务器选择的声明。返回声明检查元数据；collectorProvenanceVerified 与 automaticActivation 保持 false，尚未完成二进制、提供方、质量和最终启用事务。

65 项定向回归、类型/lint 和全新一次性 PostgreSQL 通过：缺声明/跨账号、持锁禁钥、同事务到期（事务开始仍早于到期）、最新续签选择、过期最新声明不回退旧声明、追加等待/释放恢复、冻结撤销及既有存储权限。首个并发夹具漏设 member 角色上下文，被原守卫正确拒绝；夹具补齐后通过，未放宽守卫。完整五类合成工作流新快照待验；此次实际库验证只证明声明组件，没有生产认证结论。[证据](evidence/ma24-g09-locked-runner-declaration-2026-10-19.json)。


2026-10-19 fixed snapshot 02c45e8e completed with exit 0: full five-category composition, paired prospective material and synthetic-source declaration non-promotion passed. Temporary database and source snapshot were removed. This snapshot does not include the later transport-audit code in 662874d3 and does not qualify signed pending-production evidence, deployed binary/provider or real quality. [Declaration evidence](evidence/ma24-g09-locked-runner-declaration-2026-10-19.json).


2026-10-19 / MA24-06 G09 measured package binding: the collector image launcher now compares the actual package/Node inventory SHA-256 with SKILL_RUNNER_DEPLOYMENT_SHA256 before --check or --execute can start the runner. Missing, malformed or mismatched hashes reject; --verify/--help can inspect without enrollment, and --verify reports the measured hash. Node execution arguments, NODE_OPTIONS and NODE_PATH are rejected. The image TLS fixture passes the independently measured package hash. Syntax, one inventory test, typecheck and lint passed; new Linux image and actual image/TLS checks are pending. This does not grant binary/provider/quality qualification, source promotion or activation, and introduces no new user confirmation. [Evidence](evidence/ma24-g09-measured-collector-deployment-binding-2026-10-19.json).

### 运行包哈希口径

新 launcher 的 `deploymentHash` 是 `JSON.stringify(actualInventory)` 的 UTF-8 字节的 SHA-256，其中 `actualInventory` 为实际 `skill-collector-package-v1` 清单，包含 Node 可执行文件与包内文件。它不是单个 `runner.cjs` 哈希，也不是 Docker 镜像 ID。对固定镜像以只读、无网络方式执行 `--verify` 可取得该值；未提供预期值时，输出的 `deploymentEnrollmentVerified` 为 false。

执行 `--check`/`--execute` 前，操作员配置的 `SKILL_RUNNER_DEPLOYMENT_SHA256` 必须等于该实测值，签名公钥登记中的 `deploymentHash` 也须沿用同一口径。旧的任意声明值不能用于新 launcher。公钥登记、受控镜像启动、运行期及提供方认证仍各自需要证据；配置匹配本身不产生生产资格或启用许可。本次没有创建或登记生产密钥，也没有启动团队服务。


2026-10-19 measured-package image verification completed: fixed image ma24-skill-collector:5baff449 (source 5baff449919e830ab945d6f09621c9d2e6e7cc42) passed actual read-only/non-root/no-network checks for 34,455 files, matching hash admission, missing/malformed/mismatched hash rejection, changed-runner rejection and NODE_OPTIONS refusal. A fresh database run passed actual Linux-image measured-hash TLS/collector-role preflight and the separate native signed historical fixture, with zero real model calls and the Skill disabled. This is not image --execute provider qualification or a full five-category image run. [Receipt](evidence/ma24-g09-measured-collector-deployment-binding-2026-10-19.json).


2026-10-19 / MA24-06 G09 final common signature clock: after the final signature reads, readiness now checks the authenticated runner/transport deadlines at the same database instant as the plan and all pinned-method experience windows. It returns a common acceptanceTimeCheckedAt/acceptanceValidBefore while preserving method deadline metadata. 55 focused tests, typecheck, lint and an actual fresh DB run passed both signature deadlines crossing expiry in a held transaction while method sources remain valid. This component test uses verified-deadline inputs, not full-workflow signature expiry injection; the new full composition remains pending. No new confirmation or activation grant. [Evidence](evidence/ma24-g09-common-final-signature-clock-2026-10-19.json).


2026-10-19 / MA24-06 configured declaration signing: the internal collector CLI now accepts --attest with only ownerId/bundleId. A dedicated restricted role derives freeze/artifact/identity/observation bindings from owned server records, verifies the configured Ed25519 key and runner-declaration purpose, timestamps with the database clock and appends through the existing same-client/freeze-lock verifier. A valid latest statement from the same configured key is reused on retry; expired statements or configured key rotation produce a fresh bounded statement. New env names are SKILL_RUNNER_DECLARATION_KEY_ID and SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE. No HTTP/Agent tool exposes this operation.

69 regression tests, typecheck, lint and an actual compiled CLI/dedicated-login database run passed issuance/readback, retry reuse and nine rejected owner/source/config/key/process cases. The full five-category fixture now uses this CLI instead of constructing a signature itself; its new full run and actual Linux-image --attest remain pending. Source classification stays pending, production qualification and activation stay false; no new confirmation or production keys. [Evidence](evidence/ma24-g09-configured-declaration-cli-2026-10-19.json).


2026-10-19 / MA24-06 verification update: fixed snapshot 06dfe3b900967da0524f6e160843bbf606b341b4 completed with exit 0. The configured signed five-category flow passed same-freeze composition, locked transport revalidation (2 original tasks, 8 evaluation arms, 5 cases), disabled transport-key rejection and the common final deadline wiring. This positive full flow used fixture-signed declarations before the configured --attest CLI; expiry injection remains component-level evidence. Real model calls: 0. Real quality, production qualification and automatic activation remain false. [Receipt](evidence/ma24-g09-common-final-signature-clock-2026-10-19.json).


2026-10-19 / MA24-06 Linux declaration execution: fixed application image ma24-skill-collector:9b0c78e7 (image ID sha256:5c974dcc3a4dd2efd26eff9696f204d4385660789db9c77be13cdcea4e5a76bd; measured package deployment hash 08c7505c8964733da2bed7481c62958bf9c1ab684463354135320ad0c1872708) passed actual non-root/read-only --attest execution against a disposable TLS database. Issuance/server readback, idempotent retry, foreign-owner/synthetic-source/caller-binding/app-login/wrong-key/purpose/revocation/NODE_OPTIONS rejection, missing TLS root and mismatched package hash all passed without rejected appends. The test harness now accepts --declaration-image and pins the immutable image ID. Typecheck and focused lint passed. The initial missing fixture TLS bootstrap failure is retained in the receipt. Real model calls: 0; no production keys, source promotion, production qualification or activation. The full CLI-signed five-category snapshot remains separate and pending. [Receipt](evidence/ma24-g09-configured-declaration-linux-image-2026-10-19.json).


2026-10-19 / MA24-06 full configured CLI composition: fixed snapshot 9b0c78e79a91753f565cdd4f29c8c59340c12478 completed with exit 0. Actual compiled --attest issuance, five-case same-freeze composition, unified readback, locked material reconstruction, 2 original-task and 8 evaluation-arm transport audits, disabled-key rejection and common final deadline wiring passed. Missing human judgment still blocks policy. Temporary source snapshot/database were removed. Model/network/billing adapters remain synthetic (0 actual model calls); binary/provider qualification, independent real quality and final activation remain unfinished. The separate Linux-image --attest matrix does not constitute the full five-category workflow inside the image. [Receipt](evidence/ma24-g09-configured-declaration-cli-2026-10-19.json).


2026-10-19 / local release baseline: source 20c00e73dab84dd1dd15a76635bd0479535980a1 built successfully with Next 16.3.4 in a separate output directory, BUILD_ID 3GGcRWoFZyh5eTALR4BT8. All 945 packaged runtime-source files match the clean code/config/lock baseline after removal of two Next-generated output-directory type includes; no private env or storage roots are bundled. The first sandbox build failed on junction creation; an approved isolated-output retry passed. Collector image ma24-skill-collector:20c00e73 (sha256:1436ff8c597de902dd184a610f9cd927dc8e8ae75569db9415b7004cb01a41dc) passed 34,460-file measured-package/read-only/non-root/no-network/tamper checks; deploymentHash 81f278adca72fbd363428ffc0fcd4b336027cd015e3bb045c698d43c0effbb03. No Web Linux image, actual new-image database/provider run, deployment, independent quality or production qualification is implied. [Receipt](evidence/ma24-g01-g09-local-release-build-2026-10-19.json).


2026-10-19 / fixed collector image database acceptance completed: ma24-skill-collector:20c00e73 passed actual measured --attest execution against a fresh TLS database, signed issuance/readback, retry reuse and owner/source/key/purpose/revocation/NODE_OPTIONS/TLS-root/package-hash rejection. Exit 0; temporary cluster/network removed; 0 model calls and no production keys. This source-specific result does not cover later publication lease changes or establish provider/real-quality/production qualification. [Release receipt](evidence/ma24-g01-g09-local-release-build-2026-10-19.json).
