# MA24 G01–G13 当前剩余门槛（2026-10-16）

## 当前结论（2026-10-19，按固定源码快照分别核验）

最新固定 Web 镜像为 `ma24-pilot-web:3b44c10c`，构建及全新 156/TLS 数据库实际登录/隔离/快照 HTTP 通过，包含近期原件来源锁。HTTPS 浏览器、扩展 UI 和备份仍按各自旧版收据保留；该提交完整签名组合已启动但尚无终态，不标通过。[候选收据](evidence/ma24-g01-current-candidate-3b44c10c-2026-10-19.json)。

G09 原件入口已自行验证账号事务并取得来源 admission；70 项回归和实际克隆身份拒绝/四类写入阻塞与提交后拒读通过。完整材料组合与生产/启用仍未完成，镜像仍早于此次改动。[来源锁证据](IMMUTABLE_SNAPSHOT_SOURCE_ADMISSION_2026-10-19.md)。

G09 附件/知识原件验收读取已与下载的快照优先规则一致；68 项回归及十一组实际克隆通过，覆盖文件篡改/丢失后同一原文清单和既有权限/撤销拒绝。不将快照标记为文件系统只读，不授予完整来源/生产/启用资格；本次代码晚于 3c17a4f0 镜像。[验收范围](IMMUTABLE_ASSET_SNAPSHOT_2026-10-19.md)。

固定 `3c17a4f0` 的 156 全新库最终补验已退出 0：实际快照 HTTP 及同实例/跨实例非空原文字节摘要、捕获函数和非空邮箱恢复通过，临时容器/网络清理。验收脚本一次变量名失败已排除并修复重跑；没有新生产或质量批准。[最终收据](evidence/ma24-g09-immutable-snapshot-compiled-http-2026-10-19.json)。

固定 `3c17a4f0` 镜像已补实际原件快照下载 HTTP：全新 156 库、真实登录、无文件原文下载、Range、权限与撤销边界通过；同实例非空快照恢复摘要通过。此轮未复验 HTTPS 浏览器、十成员或扩展 UI，不取代各自旧版收据；跨实例快照字节对比按最终收据记录。[范围](IMMUTABLE_ASSET_SNAPSHOT_2026-10-19.md)。

原件下载入口已接通已有快照读取，缺快照仍校验文件，返回前重新检查当前权限及登记。21 项源代码路由/范围测试及类型/lint 通过，编译镜像 HTTP 尚未补验。实际模型仅引用附件 ID 和工具元数据，不存在待切换的二进制模型附件接口。[下载范围](IMMUTABLE_ASSET_SNAPSHOT_2026-10-19.md)。

原件快照已进一步接入 G09 附件/知识原件回执重建和 readiness 最终清单核对：65 项定向测试、实际克隆十组场景通过。没有快照的资产明确零覆盖；不绕过文件检查，不自动捕获，不授予完整来源或启用资格。[接线范围](IMMUTABLE_ASSET_SNAPSHOT_2026-10-19.md)。

G09 显式原件快照基础已实现并通过九组隔离数据库场景：文件捕获/幂等、错误哈希长度、普通写入、跨账号、共享转私有、篡改、归档/登记变化、撤销和孤立快照边界。仅为内部存储基础；未接入最终来源重建和启用事务，保留清理机制与生产仍未完成。[当前范围](IMMUTABLE_ASSET_SNAPSHOT_2026-10-19.md)。

新采集器 `3f5c1556` 的实际运行入口已验：34,470 文件包核对、匹配登记入场、错误登记/篡改/Node 参数注入拒绝，以及四种不合格运行配置在私有任务处理前拒绝通过。[镜像入口证据](evidence/ma24-g09-collector-runtime-image-2026-10-19.json)。同镜像实际 TLS 声明签发/回读、重试及拒绝矩阵也已退出 0，临时资源清理；均为临时测试密钥和合成材料，生产和自动启用未批准。[签发证据](evidence/ma24-g09-collector-runtime-declaration-2026-10-19.json)。

固定 `dd7daff5` 的完整 G09 签名组合已成功退出：同冻结五类、实际 compiled CLI 声明签发、统一回读/持锁重建、2 原任务及 8 评测臂传输复核和禁钥拒绝通过；缺失人工判定仍阻断，实际模型调用 0。此快照含 G03 应用修复，但早于 `3f5c1556` 的采集器启动运行边界；不是新 Linux 镜像内完整组合的证明。[固定版本收据](evidence/ma24-g09-signed-composition-dd7daff5-2026-10-19.json)。

最新本机 Linux 候选 `dd7daff5` 已构建并通过 955 运行源码文件比对、迁移 155 全新库 HTTPS/十合成账号/非空邮箱跨实例恢复，临时资源已清理。[候选证据](evidence/ma24-g01-current-candidate-dd7daff5-2026-10-19.json)。该源码的完整签名组合通过范围见上文，不因此授予生产资格或自动启用。

G03 本地实际模型补验通过：全新合成账号经本机固定 Qwen3 两次真实 chat 请求完成偏好抽取、自然纠正、通知/outbox 幂等、ready 复用、撤销不复活旧偏好及另一账号不可见；正式事实/政策计数不变。仅一条英文合成输入的服务函数流程，不是自然业务样本、完整 Worker/图谱或独立质量验收。[模型与流程证据](evidence/ma24-g03-real-local-model-flow-2026-10-19.json)。

G09 固定 `25f5acd3` 完整签名组合已退出 0：同冻结五类、CLI 签发、统一回读/持锁重建及传输复核通过，缺失人工判定仍阻断，实际模型调用 0。该版本包含挂载诊断，不含后续迁移 154/G03 来源锁；生产、真实质量及最终启用仍未完成。[收据](evidence/ma24-g09-signed-composition-25f5acd3-2026-10-19.json)。

当前本机 Linux 候选 `25f5acd3` 已通过固定源码构建、951 个运行源码文件比对，以及迁移 153 全新库的 HTTPS/十合成账号隔离/非空邮箱备份跨实例恢复联合验收。临时资源已清理。十套扩展 UI 仍按较早 `4a1ee07f` 独立收据保留；本轮未重做这些场景，也未验证生产、真实质量、资料卷/数据库联合恢复或目标主机。[候选收据](evidence/ma24-g01-current-candidate-25f5acd3-2026-10-19.json)。

当前 G13 合成页面联验已扩展至固定 4a1ee07f 的十套：四套邮箱及附件、任务/版本历史、管理区、JSON、非邮件审批拒绝，HTTPS/153 新库退出 0；类型/lint、回环信任边界检查通过。真实资料/邮箱、模型或 Worker 执行、批准后外部操作和生产仍未完成，未部署。[收据](evidence/ma24-g13-current-extended-ui-2026-10-19.json)。

完整 G09 签名组合已通过至 `45d5e9b3`，包含近期 G03/G04/G12 修改，退出 0；缺失人工判定仍阻断，实际模型调用 0。该快照早于 4a1ee07f 首页首帧修复，生产身份、真实质量、不可变来源及最终启用仍未完成。[收据](evidence/ma24-g09-signed-composition-45d5e9b3-2026-10-19.json)。

当前 G13 邮箱四套合成页面联验已通过至固定 4a1ee07f：首次 e36ac0f5 的 React 418 保留为失败，稳定问候首帧后的新镜像构建、949 运行源码导出比对、HTTPS/153 抽屉/批量/同步/阅读区重验退出 0；类型/lint、手机截图检查通过。真实邮箱、模型处理、其他 G13 流程及生产仍待验，未部署。[记录](evidence/ma24-g13-current-mailbox-ui-2026-10-19.json)。

完整签名联验已通过至 `e2891a90`（退出 0）：原件身份检查、CLI 签发、同冻结五类材料、统一回读/锁内重建及 2 条原任务、8 条评测臂传输复核通过；缺失人工判定仍阻断。后续 G03/G04/G12 不在该快照，模型/网络/预算合成，实际模型调用 0；生产、真实质量和最终启用仍未关闭。[收据](evidence/ma24-g09-signed-composition-e2891a90-2026-10-19.json)。

较早固定 `e36ac0f5` 的 Web 构建/来源比对及 HTTPS/153 十合成账号隔离仍单独保留。当前 4a1ee07f 的来源/邮箱页面收据见上文，未将旧镜像十账号验证扩称为新镜像的十账号实测。下文更早镜像状态均为历史，未部署、未验完整真实业务。[收据](evidence/ma24-g01-current-linux-web-2026-10-19.json)。

最新完整联验：固定 `f3d2623e` 已退出 0，CLI 实际签发、同冻结五类材料、统一回读、持锁重建、2 条原任务/8 条评测臂传输复核与禁钥拒绝通过，缺失人工判定仍阻断。该快照包含知识发布租约与任务绑定修复，不包含后续邮箱补强；合成模型/网络/预算、真实调用 0，生产资格、真实质量、完整来源保护及最终自动启用仍未完成。[收据](evidence/ma24-g09-signed-composition-f3d2623e-2026-10-19.json)。

执行范围仍为 G01–G13；G14–G20 暂缓，完整 Goal 未完成。下方按阶段保留的记录描述当时状态；其中“待重跑”“仍待接线”等历史表述，应结合其后的验收收据判断，不能单独作为当前结论。

- 配置签发的历史、三类安全、前瞻五类材料已在同一冻结下完成实际数据库组合、统一回读与持锁重建；该次通过范围包含精确迁移 144–149，模型/网络/预算为合成适配器。[通过证据](evidence/ma24-g09-configured-five-category-database-2026-10-17.json)。
- 迁移 150 的前瞻 campaign/job 锁已通过独立并发数据库验证并接入重建；包含此锁的完整五类回归已退出 0，组合、统一回读和持锁重建通过，缺少人工判定仍阻断策略。[当前范围](evidence/ma24-g09-prospective-source-locks-2026-10-17.json)。
- G09 仍缺完整可变来源撤销保护、生产采集器/提供方资格、真实质量判决及最终启用事务；自动启用保持关闭。下表的其他真实业务和生产门槛也未因合成联验关闭。
- 固定 `c3f620b5`、`cf147d1a`、`3f511d38` 及最新 `80c24c2b` 的完整五类组合均已退出 0：分别补齐方法经验时刻、附件字节、知识回执原件及显式记忆回执接线。最新快照含实际原件/记忆读取、五条前瞻回执和策略后的字节/记忆复核；较早 ca45488d 的白名单失败保留为历史。所有结论仍限合成任务与隔离工程验收，未授予生产资格、人工质量批准或自动启用。
- G01 首批入口已改为公司 LAN/VPN 内网访问，无需以备案域名作为该内网方案的前置项；Caddy 内部 CA 与内网 IP 绑定模板已准备。用户提供目标 LAN IP `192.168.0.170`，但目标主机地址固定/冲突、内部 DNS、防火墙和证书信任分发尚未验收，当前没有线上交付证据。[部署实施单](TEAM_PILOT_NEW_HOSTING_2026-10-16.md)。
- 固定 `9b0c78e7` 的 CLI 签发完整五类组合已退出 0，包含传输收据复核及统一末尾到期时刻检查；同版本采集器镜像另通过只读、非 root 的签发矩阵。两项均使用合成业务内容和临时测试密钥，不构成生产身份或真实质量验收。[签发及完整组合](evidence/ma24-g09-configured-declaration-cli-2026-10-19.json)、[镜像矩阵](evidence/ma24-g09-configured-declaration-linux-image-2026-10-19.json)。
- Web Linux 镜像仍早于当前源码；固定 `20c00e73` 已完成独立目录的本地 Web 构建与 945 个运行源码文件比对，同源采集器镜像通过包哈希、防篡改及实际 TLS 数据库签发矩阵。该版本尚无提供方/真实质量/生产认证，也不包含后续发布租约修改。最终发布仍需冻结最终源码并在目标环境验收。[本地构建证据](evidence/ma24-g01-g09-local-release-build-2026-10-19.json)。
- 用户后续明确“本次任务暂时不上线到内网，继续其他未完成任务”；当前不执行部署、端口开放或团队邀请。上面的内网条件作为将来恢复上线时的清单，不作为当前代码推进的阻塞。

## 阶段记录与逐项门槛

2026-10-19 G09 受控采集器运行边界组件通过：启动入口在包核对及 runner 派生前要求非 root 一致 UID、NoNewPrivs、空 capabilities 和根/包/Node 只读，无可写包子挂载。20 项测试和实际 Linux 六类组件探针通过；新镜像完整入口和声明矩阵待执行，仍不构成生产认证或不可变来源证明。[范围](SKILL_COLLECTOR_RUNTIME_BOUNDARY_2026-10-19.md)。

2026-10-19 G03 自然纠正直接旧原文保护：旧观察为本地抽取且原句归属检查通过时，复用 154 锁住旧任务/消息/完整原文至当前纠正提交；旧原文等待期间变化拒绝、持锁后编辑等待。81 项测试及实际克隆新增两例旧原文并发（原八例仍通过）、既有纠正回归通过。非递归历史链证明，未部署；当前镜像/签名快照仍早于代码。[验收范围](evidence/ma24-g03-natural-origin-lock-2026-10-19.json)。

2026-10-19 G03 当前纠正指令及回执来源保护：纠正复用 154 的任务/首条消息原文锁，工具学习新增 155 的账号/任务/回执锁及 FK 插入围栏。75 项测试、实际克隆八类锁前拒绝/锁内等待、既有纠正/回执/租约/admission 回归，以及全新 155 库和恢复后函数检查通过。自然纠正的旧观察原始消息未新增完整行保护，仍有独立追溯边界；未部署，当前镜像与签名快照早于代码。[工作流与证据](LOCAL_MEMORY_SECONDARY_SOURCE_LOCKS_2026-10-19.md)。

2026-10-19 G03 纠正/回执租约：初始五分钟检查与最终 ready/续租均使用数据库墙钟；过期或 token 变化时抛错回滚，不能续活。73 项测试、实际克隆两类函数的临近到期+2.2 秒延迟/新鲜租约四个正反例、原纠正及回执回归通过。编排重试单独由单测验证，未声称整 Worker/新持有者接管或全任务原子性；最新镜像/生产仍待验。[收据](evidence/ma24-g03-correction-receipt-lease-2026-10-19.json)。

2026-10-19 G03 锁顺序兼容：普通观察、纠正、撤销及旧版保存/撤销现于记忆键/目标/行锁前获取来源 admission；旧版嵌套撤销提前取得全局保护，避免后续升级。79 项测试、实际隔离库五类“等待 admission → 来源持锁者同键写入 → 释放后完成”序列，以及原七类来源/纠正回归通过。仅说明指定并发序列，不声称所有死锁或生产容量已验；最新代码尚未重建镜像/完整签名快照。[工作流与证据](MEMORY_WRITE_ADMISSION_ORDER_2026-10-19.md)。

2026-10-19 G03 普通抽取提交期来源锁已接入：迁移 154，模型调用结束后按 job → admission → account → conversation → run → message 顺序锁定并复核，直至存储提交。33 项测试及实际克隆七类并发/既有纠正回归通过；全新 154 库及备份恢复通过。新代码须先装 154，尚未部署，固定镜像和完整签名快照仍早于此改动；真实质量与整任务原子性未声明完成。[工作流与限制](LOCAL_MEMORY_SOURCE_LOCKS_2026-10-19.md)。

2026-10-19 G09 原件挂载保护组件：附件及知识工具原件核对新增当前进程只读挂载字段，按打开描述符的 mount ID 核对 Linux 挂载选项，准备前后状态变化拒绝。75 项回归及实际 Linux ro/rw bind mount 正反例通过，真实写入分别被拒绝/允许。此项不排除宿主机或其他挂载的写入，不是不可变存储或租约证明；来源撤销/生产身份/最终启用保持未完成，当前源码完整签名组合另待验。[边界与工作流](SKILL_KNOWLEDGE_MOUNT_PROTECTION_2026-10-19.md)。

2026-10-19 G01 非空邮箱恢复补验通过：迁移 153 全新合成库的一封加密邮件、禁用连接、UID 游标、任务及批次绑定经备份和跨实例恢复，五表完整行一致；原临时密钥解密、错误密钥/跨账号解密拒绝，以及两账号五表 RLS 可见范围通过。首轮夹具缺少必填显示名称的失败保留，修正后退出 0。未启动邮箱 Worker/提供方；独立密钥备份、恢复后 Web、文件卷/数据库联合恢复及生产仍待验。[收据](evidence/ma24-g01-nonempty-mailbox-restore-2026-10-19.json)。

2026-10-19 G01 当前结构备份恢复：备份工具增加显式 `--current-schema`，核对数据与 `pg_dump` 使用同一导出快照；固定 Web `4a1ee07f`、全新迁移 153 数据库的备份、同实例恢复、跨实例恢复及两成员可见范围检查退出 0。邮箱表为空，尚未证明非空邮件/密钥恢复、恢复后的 Web 或资料卷与数据库一致恢复；没有部署。[验收范围](evidence/ma24-g01-current-schema-backup-2026-10-19.json)。

2026-10-19 G12 流式边界补强通过：拒绝分块身份漂移及 finish 后的有效增量，保留用量帧；57 项回归、类型/lint、三模式 12 组本机 SSE/隔离实库的持久失败、未知开始阻断、成功复用通过。外部调用 0，真实提供方、完整业务任务/质量和生产加载继续待办。[证据](evidence/ma24-g12-stream-identity-recovery-2026-10-19.json)。

2026-10-19 G04 本地图谱序列验收通过：新合成账号在实际 Graphiti/Neo4j/固定本地嵌入模型完成两次投影、纠正与历史时点、撤销不复活、PostgreSQL 降级和账号隔离；活跃账号/租约门禁及 Worker 查询失败退避已补齐，10 项测试、类型/lint 通过。Worker 续跑是模块夹具证据，真实用户连续抽取、质量与生产仍未完成。[收据](evidence/ma24-g04-local-graph-sequence-2026-10-19.json)。

2026-10-19 G03 普通记忆抽取来源复核通过：写入事务前后检查当前账号/任务/首条原文，漂移回滚并待重试；租约墙钟窗口补核。32 项单测、类型/lint、隔离库四类来源变化拒绝及恢复重试、既有消息纠正矩阵通过。模型响应合成，普通存储事务不等于整个抽取任务原子性，提交全程来源锁和真实质量仍未关闭。[证据](evidence/ma24-g03-local-memory-source-recheck-2026-10-19.json)。

2026-10-19 G09 原件身份校验：附件及知识原件回执复用已有稳定读取检查，拒绝描述符读取后当前路径被替换。67 项回归、类型/lint 通过，两个入口的真实文件替换交错验证通过（DB 元数据为夹具）；固定 f3d2623e 完整组合早于此修改，新快照待验。此项不关闭不可变存储、生产认证或最终启用缺口。[证据](evidence/ma24-g09-source-file-identity-2026-10-19.json)。

2026-10-19 G11 后台中断恢复工程验收通过：迁移 153 绑定批次/队列租约，恢复同任务旧批次并从已提交计数续跑。35 项回归、类型/lint、隔离库实际终止 Worker、真实队列重新领取、三封合成邮件加密去重与最终统计恢复通过；IMAP 读取适配器合成，真实日期/全分页/网络恢复、客户归属和生产仍待验。历史未绑定批次不自动回收，新源码要求先安装 153；本次未部署。[收据](evidence/ma24-g11-mailbox-worker-recovery-2026-10-19.json)。

2026-10-19 G11 同步并发补强已通过：启动同步与断开/删除共享连接行锁，导入核对当前连接和同账号/连接的运行任务。22 项定向回归、类型/lint、隔离库实际等待后禁用拒绝、并发入场与游标检查通过；实际导入夹具为空消息，真实 IMAP 日期/全分页/断线恢复、客户归属与 worker 运行仍未关闭。[证据](evidence/ma24-g11-mailbox-sync-admission-2026-10-19.json)。

2026-10-19 G09 方法经验末尾时刻复核：在材料和策略之后，以单个数据库当前时刻核目标及全部固定方法的本地经验期限，并核计划到期。43 项回归、类型/lint、实库“目标有效但另一固定方法经验准备后到期”拒绝通过；不可变观察守卫保留。最新源码五类快照待验；返回时刻不是启用许可，最终事务及其余来源时效仍待完成。[证据](evidence/ma24-g09-final-method-experience-time-2026-10-19.json)。

2026-10-19 G02/G05 原件下载补强：已拒绝 inactive 文档、等长字节篡改、stat/read 间文件变化和读取期间权限撤回；返回前复查登记身份，保留正常 Range 语义。16 项路由/工具测试、类型/lint 通过，文件/DB/会话使用夹具，真实 HTTP 及生产验收未完成。[证据](evidence/ma24-g02-g05-asset-download-integrity-2026-10-19.json)。

2026-10-19 G09 准备结束时的决策记忆复核：来源锁内以既有记忆守卫包住材料与策略计算，准备期间自然到期或开始生效导致快照变化时拒绝返回结果。30 项回归、类型/lint 及实际 PostgreSQL 准备期到期拒绝通过；固定 d5ca1d76 完整五类组合随后退出 0。该快照不含后续统一方法时刻和原件下载修改，也不是最终启用提交点保证。[证据](evidence/ma24-g09-final-decision-memory-snapshot-2026-10-19.json)。

2026-10-19 G09 Skill 目录来源保护：迁移 152 已保护目录新增、共享发布/撤回、版本及历史绑定变化；产品写入在方法行锁前取得来源锁，旧库写入兼容但不能进入新验收。48 项回归、类型/lint、一次性数据库八类并发及旧共享绑定场景通过；固定提交 600c371c 的完整五类组合随后退出 0。该快照不含后续记忆守卫与原件下载改动，最终时效、全部原件字节、可信生产来源和最终启用事务仍待完成。[工作流](SKILL_CATALOG_SOURCE_ADMISSION_2026-10-19.md)、[证据](evidence/ma24-g09-skill-catalog-source-admission-2026-10-19.json)。

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
| G01 发布基线 | 固定 Linux 镜像、本机 HTTPS、10 合成成员隔离、两版 Web 回切、数据库跨集群恢复及上传卷恢复均有局部收据 | 用户已选公司 LAN/VPN、IP 192.168.0.170，后续明确本次暂不上线；最终冻结包、目标主机 HTTPS/证书信任、异地副本、资料与数据库一致恢复及资源观察未验 | 本次继续本地固定包及隔离验收，不以云账号或备案域名为前置；恢复上线后在目标主机核包摘要、成员业务、备份恢复和回切 |
| G02 来源撤销 | 真实图、旧 checkpoint、隔离模型及局部 HTTP；当前构建的登记原件下载通过认证、Range、篡改和请求间撤回的真实 HTTP 验证 ([收据](evidence/ma24-g02-g05-asset-download-http-clone-2026-10-19.json)) | 当前服务上真实账号有界任务的生成期撤销、后续工具阻断和最终保存核对 | 获授权的专门来源/账号任务及撤销前后收据；新付费请求另列具体清单 |
| G03 纠正与双时间 | 来源归属和自然纠正局部修复、隔离恢复证据 | 真实偏好/经历/业务事实与纠正样本不足；当前候选完整链路、通知/撤销/历史时间和本地 worker 试点未验 | 对照原句与更正内容的自然样本判决，以及当前 worker 的持久记录 |
| G04 记忆图谱 | outbox、租约、故障恢复及 PostgreSQL 降级局部工程证据 | 当前版本获准真实样本的连续抽取、投影、时间/权限回校、撤销召回未验 | 连续消费及图谱停机/恢复的同一批来源收据 |
| G05 Incremental knowledge | Formal workers pass PDF/PPTX/XLSX × private/shared revision matrix: failure/hold/tamper keeps old reads, one winner, exact unit 2 citations, history/retry and peer access match visibility ([six-group matrix](evidence/ma24-g05-formal-worker-six-group-revision-matrix-2026-10-19.json)) | Real-user sources, independent visual/content judgment, actual business answer citations and production worker remain unverified; this matrix does not repeat registration-process crash checks | Review approved real sources and actual answer citations; retain separate registration-recovery evidence and perform target deployment acceptance when resumed |
| G06 安全 | 已定位旧歧义与注入失败，工具模型视图等边界已有修复 | 修复后固定协议的真实模型回答、独立安全判分不足；既有本地超时不能判通过 | 有明确请求范围的有效模型回答及答案/引用/权限/注入人工判决；相同超时配置不重复试跑 |
| G07 真实回放 | 服务器持久收据与只读回放适配已实现；历史资格审计已有排除结果 | 尚无满足当前来源、Skill 相关性及完整收据要求的真实任务 | 同账号有效的完整只读任务或精确收据限定的子任务，固定版本回放和独立审核 |
| G08 前瞻影子 | 任务前登记/捕获、签名原流程/候选、统一材料及受限持久化已有合成数据库贯通证据；未将历史任务改标前瞻 | 真实任务的原流程/候选结果、可信生产身份及真实质量仍未验收 | 在既有授权范围内取得任务前登记到执行、持久收据及审核的真实完整链 |
| G09 自动启用 | 冻结、存储、政策计算、同事务来源锁、运行声明及模型传输收据复核已接通；固定 9b0c78e7 的实际 CLI 签发完整五类组合和独立 Linux 镜像签发矩阵通过，统一末尾时刻复核通过 | **代码未完成**：完整来源撤销及文件存储保护、可信生产 runner/collector 来源类别及认证、最终启用事务尚未接通；真实质量未验收 | 受控运行包/提供方认证、不可变来源及完整安全/回放/影子材料、最新人工审核；隔离正反例实际启用/拒绝/停用后再做有界试点 |
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


2026-10-19 fixture setup correction: the combined signed transport fixture now explicitly applies migration 141 before the declaration check. The in-flight disposable database lacked this table; the same existing migration was applied only to that named temporary container and the table presence was verified. Application sources and validation guards were unchanged. This repaired in-flight run is recorded separately from an uninterrupted execution of the corrected bootstrap. [Receipt](evidence/ma24-g09-locked-transport-receipts-2026-10-19.json).


2026-10-19 fixed snapshot 02c45e8e completed with exit 0: full five-category composition, paired prospective material and synthetic-source declaration non-promotion passed. Temporary database and source snapshot were removed. This snapshot does not include the later transport-audit code in 662874d3 and does not qualify signed pending-production evidence, deployed binary/provider or real quality. [Declaration evidence](evidence/ma24-g09-locked-runner-declaration-2026-10-19.json).


2026-10-19 signed-integration result: exit 1 is preserved. After the explicitly recorded temporary migration-141 setup repair, readiness returned with two original tasks, eight evaluation arms, signed receipt revalidation and matching runner/transport registry hashes. Disabling the enrolled key correctly raised `Task failure trust unavailable`; the fixture expected a different error text. Its assertion now matches that exact existing error. Later assertions were not reached. A fresh corrected-bootstrap rerun is required; this first run is not recorded as passed. Application guards were unchanged. [Evidence](evidence/ma24-g09-locked-transport-receipts-2026-10-19.json).


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
