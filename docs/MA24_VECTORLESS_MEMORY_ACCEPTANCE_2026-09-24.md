# MA24 长期记忆与无向量 RAG：实施与验收记录

## 冻结的旧路径

现有活动 v3 release 和 `knowledge_release_pointer_v3` 保持不变；本阶段不删除旧 chunk、向量或个人记忆。既有 [v3 激活记录](KNOWLEDGE_RAG_V3_ACTIVATION_2026-09-19.md)报告 Gold 仅 11/300，holdout 0/50 且锁定。活动 release 说明完整性门槛已通过，不说明答案与精确来源质量已验收。冻结的 [300 题设计](KNOWLEDGE_RAG_V3_R0_BASELINE_2026-09-18.md)保留 development 190、validation 60、holdout 50；PDF、PPTX、XLSX、跨文档、冲突、无答案须分别记录答案与来源坐标对照。本阶段没有人工补造 Gold。

2026-09-24 本机只读复核：活动 release 为 `rag-v3-shadow-2026-09-18`，ID `889a1b5b-9b45-4695-a9b1-e2f2415a028f`，激活时间 `2026-09-18T16:03:31.838Z`。`WR3000` v3 查询前三候选文档分别为 Cudy Wi-Fi Router Product Catalog（`c0930e07-2a17-473d-a2d8-3fb65db9e7a5`）、Cudy Product Catalogue（`993bc2cf-5dde-4d88-950e-5c4f5b947bcb`）及 WR3000 Datasheet V2.0（`2a2bbe72-9e86-40eb-8fdb-7cd07ceefba1`）。这是候选冻结，不是答案/引用质量判断；该查询输出的 `sourceLocation` 为 null，精确原文坐标仍待 Gold 人工补齐。

## 本阶段实际交付

- 迁移 106 增加逐文档版本、树节点、当前指针、双时间记忆观察与图谱 outbox。版本由 documentId + source SHA-256 + extractorVersion 唯一标识。当前指针只在事务内完整建树后切换。
- `indexExtractedDocument` 只接受已注册且来源/产物哈希一致的本地上传产物。其权限与来源失效检查针对 PostgreSQL 当前状态；PDF 页、PPTX 幻灯片、XLSX 工作表及原文块保留坐标。
- `searchDocuments`、`browseTree`、`readEvidence`、`aggregateDocumentSet` 提供只读的无向量接口。摘要不进入答案引用；`readEvidence` 只返回仍为当前版本且来源已注册的原文。
- 记忆观察不可覆写，业务时间未知以 NULL 保存，outbox 与观察同事务写入。自动抽取、Graphiti 投影和 Skill 自动启用尚未连接。

2026-09-24 增量接入：迁移 107 允许账号所有者写入自己的私有树，管理员仍负责共享树。二进制上传 worker 在本地抽取成功后自动登记私有资料并建树；共享资料保持管理员明确登记。新路径不调用 embedding。上传列表显示可检索状态、当前树版本与来源哈希。旧 v3 指针没有改变。合成 PDF 从注册到检索、重复登记、原文块坐标、跨账号拒绝和撤销后禁引均通过；此证据不代表真实复杂 PDF/PPTX/XLSX 的质量验收。

浏览器隔离回归在 1366×900 与 390×844 两个视口通过，上传分区显示“可检索”和当前版本，整页未因新增状态向下无限延伸。

无向量只读对照会话：迁移 108 记录搜索、树导航、原文读取、确定性筛选/计数和预算触顶收据；每会话仅一次候选搜索，最多 24 份候选、8 次导航、8 组证据。到达预算后返回部分结果、仍未查的候选文档 ID 和候选集外的剩余数量。本机合成资料验证了会话内候选限制、原文收据、确定性筛选/计数及第 9 次导航和第 9 组证据被阻止。主 Agent 尚未接入这条会话，不能声称生产回答已走新主路。

## 后续发布门槛

2026-09-24 记忆底座续进：迁移 109 增加观察幂等键、同主题冲突和用户通知记录，写入与 outbox 同事务；服务层提供历史时间轴、通知与冲突查询，用户撤销追加失效观察，不覆盖旧记录。相同来源重放不产生第二条通知或图谱任务，跨账户撤销目标被拒绝。迁移与 3 项聚焦单测、类型检查通过；真实任务自动抽取、页面通知/撤销和 Graphiti 投影尚未接入。Neo4j 5.26 仅在本机回环端口部署，实际 Cypher `RETURN 1` 成功；独立 `docker-compose.neo4j.yml` 使用未跟踪的本地 `NEO4J_AUTH`，避免现有 PostgreSQL Compose 依赖图谱凭据。Graphiti Python 依赖在本机代理下未完成安装，不把图谱运行状态记为通过；不能静默改用云端模型。

同日补充实际 PostgreSQL 回滚事务探针：`verify-temporal-memory-local.ts` 验证同一收据重放只产生 1 条观察、1 条 outbox 和 1 条通知；同主题不同内容产生冲突；追加撤销保留旧记录；未知撤销目标被拒绝，事务回滚后无测试数据。聚焦单测与类型检查再次通过。此探针尚不代表真实任务自动抽取或跨账户完整端到端验收。

学习记忆页现与原有个人记忆分区切换，内部按当前有效、历史时间轴、冲突待处理和学习通知分页；撤销使用账户会话与 PostgreSQL RLS，并追加不可覆写的失效观察。`knowledge-base-sections.spec.ts` 桌面及手机隔离浏览器测试通过，无整页无限下滑。当前视图依赖观察记录，尚未接入任务自动抽取；Skill 分区、真实记忆样本和跨账户浏览器验收仍待完成。

自动偏好接线：迁移 110 给不可覆写观察增加多市场与多公司范围；现有主 Agent `preference_save` 成功保存版本时，在同一事务中追加来源为任务 ID、用户消息 ID 与原版本的观察、通知和 outbox。自动偏好更新以更正关系连接上一观察，不把版本更新误报为矛盾；正式政策仍走原审批，不作自动观察。学习记忆撤销联动旧版 Agent 记忆；如果旧系统恢复前一版本，新观察追加来源明确的恢复项。8 项聚焦测试、类型检查、Lint 和本机数据库回滚事务探针通过，探针含多市场去重及跨账户读取拒绝。自由文本任务经验与业务事实抽取、真实主 Agent 任务端到端及 Graphiti 投影尚未通过。

迁移 111 在 PostgreSQL 增加按账户和 run ID 唯一的本地抽取队列。只有主 Agent 最终状态为 `completed` 才在结算事务内入队；邮件运行、失败和暂停不入队。队列表仅保存任务收据，不复制私有正文。3 项分支测试、迁移与类型检查通过；本地 `qwen3:8b` 尚未安装，因此队列不消费，也不切换云端。Graphiti 核心 Python 包与 Neo4j 驱动已安装到未跟踪隔离环境，但其余依赖下载未完成；不能宣称 Graphiti 已可运行。

迁移 112 增加队列租约和下次尝试时间；本地 worker 只允许 HTTP 回环端点，先探测精确 `qwen3:8b` 模型，随后用 JSON Schema 请求至多三条明确的用户偏好。每条输出必须含原消息中的精确引文和偏好线索；指令覆盖内容被拒绝。模型未就绪、来源过长或 Schema/模型失败时保留队列，记录原因并延后重试；观察、通知、outbox 与 job 完成同事务，重复处理使用幂等键。`ENABLE_LOCAL_MEMORY_EXTRACTION` 默认 0，真实 8B 模型及样本契约未通过前不启动。模拟模型 5 项、任务入队 3 项测试，TypeScript、Lint、迁移、本机 PostgreSQL 回滚事务（含跨账户队列读取拒绝）通过。真实自由文本效果、工具收据经验/业务事实抽取和 Graphiti 投影仍未验收。

新主路当前处于影子底座阶段。还需完成所有入口的逐文档增量处理、任务收据与 8 组证据/8 次导航预算、v3 候选回读、Graphiti 本机部署与 PostgreSQL 回退、记忆通知/撤销、Skill 影子测试及固定分页 UI。300 题人工答案与精确来源 Gold 和锁定 50 题未完成前不得切换生产主路。切换要求锁定集答案和引用正确数均不低于 v3，且长文档、跨文档、新增资料有可复核改善，正式事实和无答案题不得退步。权限泄漏或未确认正式事实发布阻断上线。

本机真实模型契约补充：独立 `docker-compose.ollama.yml` 以回环端口运行 Ollama 0.12.9，Docker volume 保存 `qwen3:8b` 本地模型，不向 Git 提交模型文件。`/api/tags` 返回模型摘要 `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`；worker 除精确模型名外还校验此摘要，不匹配时任务保持排队。真实模型通过 JSON Schema 与精确引文探针：英文偏好 1 条、中文偏好 1 条、临时请求 0 条、业务事实 0 条、指令覆盖 0 条。2 条现有已完成主 Agent 真实用户消息的只读抽取均为空，Schema 拒绝 0、持久化 0；这仅验证输入输出契约，不能证明真实偏好召回质量。提示词已要求完整句子引文，温度为 0；非明确偏好及指令覆盖候选被丢弃。`ENABLE_LOCAL_MEMORY_EXTRACTION=0` 保持关闭。Graphiti 依赖与投影、真实任务正样本、业务事实抽取及图谱停机回退尚未验收。

Graphiti 本机预检补充：隔离环境已安装 Graphiti 0.30.2 的依赖及其运行时缺失的 `httpx`，`pip check` 无冲突；Ollama 中另有本地 `nomic-embed-text`。`verify-graphiti-local.py` 在导入 Graphiti 前设置 `GRAPHITI_TELEMETRY_ENABLED=false`，仅使用回环地址的 Neo4j、qwen3 与嵌入模型。只读预检返回 Graphiti 可导入、Neo4j 可连接、模型摘要匹配。首次合成 episode 写入成功，但返回实体 0、关系 0；第二次更明确的虚构关系样本在数分钟后仍无最终结果，已中止，合成分组残留节点数为 0。故 Graphiti 抽取质量、时延、outbox 投影和回库校验均未通过；不读取生产记忆投影。

结构化路径补充：`verify-graphiti-local.py --direct` 使用 Graphiti 的 `EntityNode`/`EntityEdge` 保存接口及本地嵌入模型，合成账户和观察各写 1 个节点、写 1 条 `OBSERVED` 关系，并按 UUID 回读账户分组及事实文本，结果通过；清理后合成分组节点为 0。这验证结构化投影机制可用，不代表 PostgreSQL outbox 已消费，也不代表图谱候选已回库校验。

图谱 outbox 接线补充：迁移 113 添加租约令牌、租约时间和下次尝试时间；worker 收据只带账户与观察 ID，随后在账户 RLS 下读取原观察。Python 投影器仅使用本地 Graphiti 节点/关系接口、回环 Neo4j 和固定摘要的 `nomic-embed-text`，在导入前关闭遥测；账户与观察节点、`OBSERVED` 边采用稳定 UUID，失败不标记送达。`verify-memory-graph-projection-local.py` 连续投影同一合成观察两次后仅有 1 条边，分组清理成功；Node→Python 实际调用重放也仅留 1 条边，测试后清理为 0。本机 PostgreSQL 回滚探针验证 outbox 收据、租约排他及跨账户拒绝，3 项聚焦单测和类型/Lint 检查通过。`ENABLE_MEMORY_GRAPH_PROJECTION=0` 维持关闭；真实 outbox 消费、进程崩溃恢复、图谱候选回库校验和 Neo4j 停机回退尚未验收。

图谱候选回读补充：本机合成观察经 Node→Python 调用链查询只输出观察 UUID，其他账户分组返回空；`searchMemoryWithGraph` 按 PostgreSQL RLS 重新校验账户、业务生效/系统已知时间、市场/公司范围、失效关系和原文命中，最多返回 12 条。缺少业务起始时间的观察返回 `business_validity=unknown`，不伪称当前有效。Neo4j 报错或候选已失效时走 PostgreSQL 原文搜索。4 项聚焦测试通过，含图谱失败与陈旧候选回退；这是内部接口的合成验证，主 Agent 尚未接入，真实投影停机端到端与回答质量仍待验收。

实际服务停机补充：通过独立 Compose 仅停止本机 Neo4j，`verify-memory-graph-fallback-local.ts` 返回 `graphUnavailable=true,postgresFallback=true`；`finally` 恢复容器后 `verify-graphiti-local.py` 再次返回 Neo4j 已连接、模型摘要匹配、遥测关闭。未清理其他容器或数据。该探针验证只读路径的实际故障回退，不覆盖 worker 投影中断后的重放或真实回答质量。

## 验证记录

2026-09-24：`tsc --noEmit` 通过；`node node_modules/vitest/vitest.mjs run src/lib/knowledge/vectorless.test.ts` 的 4 项安全/抽取用例通过；所改 TypeScript 文件 ESLint 通过；`npm run db:migrate` 在修复既有迁移 105 的可重复执行性后完整通过到迁移 106。数据库只读核查显示 4/4 新表启用并强制 RLS，当时树版本 0，人工 Gold 11/300、holdout 0/50。随后迁移 107 和 13 项相关测试通过，`verify-vectorless-upload-local.ts` 的本机合成端到端通过并清理测试资料；真实资料仍未进入新树。未运行的门槛不得记为通过。
2026-09-24 文本增量证据：迁移 114 通过；`verify-vectorless-text-local.ts` 验证 Unicode 精确区间、当前修订回读、跨账号拒绝、更新后旧节点禁引和删除后禁引；原二进制上传探针回归通过。存量本机回填 dry-run 11 份，apply 11 份成功、0 失败，重复 dry-run 为 0，过程无新增外部调用。TypeScript 与局部 ESLint 通过。此证据不证明新文本实际旧 embedding 通道没有历史外发，也不替代真实文件引用质量、300/50 Gold 或主 Agent 切换验收。
