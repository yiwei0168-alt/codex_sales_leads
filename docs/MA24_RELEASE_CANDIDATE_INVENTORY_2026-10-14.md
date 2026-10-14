# MA24 候选发布范围与最小依赖（2026-10-14）

本清单初版依据[当前运行盘点](evidence/ma24-r0-runtime-release-inventory-2026-10-14.json)、[迁移预检](evidence/ma24-release-migration-preflight-2026-10-14.json)与各已发布提交到候选 `d19e9010` 的文件差异；下方补充记录后续候选 build `JL8ySlDPL7j1x5xDRlO8A` 的隔离验收。它是 R0 发布准备清单，不是发布批准、业务质量结论或部署收据。验收仍按[执行台账](MA24_EXECUTION_STATUS_2026-10-13.md)的工程、真实质量和生产三列分别记。

**当前固定候选（2026-10-14 21:09 北京时间）。** 完整构建提交 `052f6b4c`，build ID `_zjhGHUAx7YAftOEXlsef`，build manifest SHA-256 `6c37a5ede35e3045e5db68a229cd8248a022c07091f7a94af9acfc64eae0769aa`；本地忽略目录 `.next-releases/ma24-g01-052f6b4c` 保存了 1530 文件、279540174 字节的构建副本，并核对了 build ID 与 manifest 哈希。[固定候选收据](evidence/ma24-g01-integrated-release-candidate-2026-10-14.json)同时记录八个迁移文件哈希和旧服务回切指针。3018 仍提供旧 Web build `QfoyXprIZIVgSWxFSZ-1K` 的 manifest，不提供当前候选的 manifest；Graph 源码没有进程内哈希证明。127–134 的七个目标标记仍缺席，旧备份校验通过但预检时已约 28.1 小时。五类数据库队列的只读快照无排队或运行项，但切换前须重取。BGE 8765 已恢复监听，其集成质量未验。此固定候选是可追溯的本机构建，不能作为发布批准；新备份、逐域质量门槛、迁移台账、生产冒烟和实际回滚仍未完成。

**2026-10-14 复核。** [只读预检收据](evidence/ma24-r0-release-preflight-refresh-2026-10-14.json)绑定源码提交 `7ccc139c`，记录了 127–134 八个迁移文件 SHA-256。产品库九个前置标记仍在、七个目标标记仍缺席；旧备份校验通过但已约 23 小时，发布前必须新建备份。Web 和 Graph 端口仍在，BGE 8765 无监听；邮箱、线索、本地记忆、图谱投影、知识及 Skill 影子 worker 均未运行。此复核未取队列计数或进程环境开关，也未改变运行服务。

**构建后变更。** `layout-v2.0.8` 的 XLSX 读取修复发生在上述固定构建之后；该 build 仍可追溯，但已不包含最新抽取器。含此修复的发布候选须重新完成构建、固定哈希及隔离验证，不能沿用 `_zjhGHUAx7YAftOEXlsef` 充当新功能已加载证据。[修复收据](evidence/ma24-g05-xlsx-table-style-readonly-fix-2026-10-14.json)。

**现行本地候选。** 源码提交 `0d7d9c4c` 已重新完整构建，build ID `m7KFQXMQKtBL1X-v4EJoV`、内部 build manifest SHA-256 `b785ae906a1305fe7850ee3a4829a8b26c2a5031c70911e0de2a6b82b07afe59`，本地忽略目录 `.next-releases/ma24-g01-0d7d9c4c` 保存 1538 文件、281328466 字节并复核 ID/哈希。该构建包含 `layout-v2.0.8`；3018 的旧 Web manifest 仍为 200，新候选为 404。产品库迁移与备份门槛未变，见[新候选收据](evidence/ma24-g01-integrated-release-candidate-v2-2026-10-14.json)。旧候选仅保留历史回切/比对记录，不再代表当前源码。

**2026-10-15 源码变更。** G05 的成功块排除路径和 `layout-v2.0.9` 不可见 PDF 文字待审门槛已在上述 `0d7d9c4c` 构建之后提交；因此该构建仍可追溯，但不能作为这些变更的发布包或运行证据。新候选须重新构建、固定哈希，并按资料审核路径复验。[局部抽取收据](evidence/ma24-g05-invisible-pdf-text-gate-2026-10-15.json)。

**最新本地候选（2026-10-15）。** `a75bafd8` 的完整 Next 生产构建通过，build ID `eIvmmxRUHfVhWKs48wg29`，manifest SHA-256 `074bafd056801c8e7c0eb667e32ebe1399748e93ffb3e39f5a3d1a8f6624f0c3`；已复制并核对忽略目录 `.next-releases/ma24-g01-a75bafd8`（1546 文件）。此候选包含成功块审核和 `layout-v2.0.9`；透明文字的隔离上传→审核→登记链路通过。3018 上旧 build manifest 为 200，候选为 404；127–134 迁移仍未应用，旧备份需切换前更新。五类队列只读快照无待办或运行项，但切换时须重查。候选未部署，分域质量、试点和实际回滚未通过。[构建与预检收据](evidence/ma24-g01-integrated-release-candidate-v3-2026-10-15.json)。

**2026-10-15 G13 测试构建。** 源码 `28dc7a8d` 的根目录 `.next` 完整构建通过，build ID `SYTDOFazJ7rlat8Kz_ESL`、manifest SHA-256 `23d829176841037b60ed1a20627ff096e6e6b964c54e989e7431a87d0464b109`；它包含 F13 删除确认修正，并通过[隔离网页到库验收](evidence/ma24-g13-conversation-delete-page-db-clone-2026-10-15.json)。该根目录测试构建未固定为新的发布快照，也未替代上方的可回切快照；3018、生产迁移和发布状态未因此改变。

**G05 页面到库补验。** 同一候选 build 在隔离恢复库的实际浏览器成功文字视图保存并回读排除决定；手机/桌面布局已检查。旧 Web 仍可列出候选创建的作业，但未验证它继续处理该成功块审核；正式服务尚未切换。[页面收据](evidence/ma24-g05-success-review-page-db-clone-2026-10-15.json)。

| 功能域 | 候选需要一起核对的运行单元 | 数据库与本地依赖 | 当前缺口及回滚入口 |
| --- | --- | --- | --- |
| G02–G04 来源撤销、自然记忆与图谱 | LangGraph、主 worker；自然抽取还需本地记忆 worker，投影还需图谱 worker | 既有 109–113 阶段、Ollama、Neo4j/Graphiti；本地两个开关须经质量验收才启用 | 当前仅旧 Graph/主 worker 在跑；本地记忆和投影 worker 未跑。服务回滚版本分别为 `44e8608c`、`1d1cc962`；自然样本和连续链路尚未通过 |
| G05 增量资料与视觉审核 | Web 上传/审核 API 与页面、知识 worker、Python 抽取及视觉队列 | 125 修订字段已见；127–129 待迁移；完整索引还依赖 BGE，当前 8765 无服务 | 旧 Web `245ed9cc` 可回切；旧版资料指针必须保持可查。隔离版页面到库的未解决路径已通过；人工视觉判决、BGE 与生产发布未通过 |
| G06–G10 Skill 安全、影子和验收 | Web 审核 API/页面、LangGraph、主 worker、独立证据 collector/相关 worker | 123–124、126 的九个关键前置标记已见；130–134 待迁移 | 不得据工程证据自动启用 Skill；安全评测、真实影子、人工判决和事务内启停/回滚仍待验收。旧 Web/Graph/主 worker 是服务回切入口 |
| G11–G13 邮箱、客户、模式和前端 | Web、邮箱 worker、线索 worker 及相关 UI | 既有 118–120 阶段；真实账号授权与邮件队列状态 | 邮箱和线索 worker 未跑；上次审计有 169 条历史邮件学习结果为 uncertain，本次未重新计数，不自动重试。需实际页面到库、自然摘要与恢复验收 |

候选与旧运行版本的差异横跨上述域，不能把根目录 HEAD 当作已经加载的生产版本。Web 当前仍返回旧 build manifest；Graph/主 worker 的 PID 与上次恢复记录连续，但 Graph 缺少进程内源码哈希端点。本次只读盘点未重测主路径业务质量。

**迁移边界。** 已发布 Web/Graph/主 worker 到候选的 Git 差异均包含迁移文件 126–134；产品库只读预检确认 123–126 的九个前置标记均存在，127–134 的七个目标标记均不存在。标记检查不代替完整 DDL 比对。`db:migrate` 会从 001 起重放全部文件，不能作为本轮 127–134 的直接执行命令。隔离恢复库已有 127–134 事务回滚、提交及关键 ACL/RLS 收据；产品库需发布前新备份和适用迁移台账。

**回滚边界。** 在同一个完成 127–134 的临时恢复库上，[旧 Web 与候选 Web 冒烟](evidence/ma24-r0-web-rollback-clone-2026-10-14.json)已通过临时账号登录、匿名拒绝和空资料列表；候选版还通过 Skill 验收空列表。由于备份不含原有 ACL，冒烟前仅在临时库复制了相关接口所需、源库应用角色实际拥有的权限。此范围未覆盖真实上传/审核、Graph、worker、业务写入或正式切换后的回滚。数据库恢复会影响备份之后的写入，不能把备份存在视为已验证的无损回滚。发布包仍要记录新旧服务指针、迁移文件 SHA-256、迁移前备份、队列/开关快照、每域冒烟及回切判据，再进入分域试点。

**资料审核补充。** 随后的[独立页面到库验收](evidence/ma24-g05-review-page-db-clone-2026-10-14.json)在另一临时恢复库上传公开 PPTX、运行本地抽取并从候选 `/knowledge` 下载相同原件、保存一条合成“未解决”决定；修订冲突、原件失效、翻页、刷新和移动端宽度均通过，未完成审核或改动 v3 资料指针。重启旧版 Web 后，合成账号仍能列出候选版创建的作业；未验证旧版原件下载或后续审核。此收据把上段“未覆盖真实上传/审核”的范围向前推进到隔离的合成审核路径，不代表人工内容判决或生产发布。

**Skill 验收入口补充。** 新候选 Web build `JL8ySlDPL7j1x5xDRlO8A` 含[同源保存修复和页面到库收据](evidence/ma24-g10-skill-review-page-db-clone-2026-10-14.json)：合成审核包可从浏览器读取、保存、刷新和撤销，Skill 未启用。同一 build 的[公开 PPTX 资料审核复跑](evidence/ma24-g05-review-page-db-clone-2026-10-14.json)也已通过隔离页面到库路径；两项均未部署产品服务，安全、视觉内容与实时影子材料的真实质量门槛仍未通过。
