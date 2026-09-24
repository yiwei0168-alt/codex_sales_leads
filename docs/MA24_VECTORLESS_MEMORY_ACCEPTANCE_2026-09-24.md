# MA24 长期记忆与无向量 RAG：实施与验收记录

2026-09-24 历史记忆回填：本机旧库有 16 条活动 `user_outreach_memory`，均为 `email-style`、`internal-learning`；旧 `agent_memory` 和版本均为 0。逐条保留原 ID、来源、状态、用途、市场及渠道角色到双时间观察的来源收据，业务生效时间保留未知；原表不删除。首次回填产生 16 条私有观察、16 条通知、16 条图谱 outbox，来源/正文/账号对照错配 0；第二次运行新增 0。商业外发表述与正式评分权限没有从旧记忆继承。图谱默认投影开关仍关闭。

真实 outbox 探针修正了无租户上下文查询导致的假阴性；首次投影暴露 Windows Python 默认编码下的 `UnicodeEncodeError`，保留 outbox 待重试。图谱投影与检索子进程设置 `PYTHONUTF8=1` 后，一条真实历史观察通过本机 Graphiti/Neo4j 投影、账号分组候选、PostgreSQL 权限/时间/原文回校、跨账号拒绝和重复投影拒绝，外部调用 0。随后仅在本次本机进程临时启用 worker，将 16/16 条历史观察 outbox 投影完毕，待处理 0、失败收据清除；仓库默认开关仍关闭。此验证不代表真实任务召回质量。

2026-09-24 v3 备用候选补充：迁移 116 为影子检索会话增加一次性 `v3-candidate` 收据。主路搜索后才可调用备用，旧 v3 只返回候选文档 ID；候选必须通过 PostgreSQL 当前树版本、来源哈希、注册状态和账号权限复核，引用仍须通过 `readEvidence` 回读原文。旧 chunk 正文不作为证据或返回给会话。真实 `WR3000` 查询产生 14 个 v3 chunk、4 份复核通过文档，但均已在主路 9 份候选内，新增 0 份；重复调用被拦截。合成私有文档的跨账号候选与撤销后候选均被拒绝。开发/验证集中主路未命中的 16 道路由题，v3 无新候选，恢复 0/16；锁定 50 题未读取。这验证候选补充的边界，不构成答案或引用质量提升证据，生产主路仍为 v3。

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
2026-09-24 共享资料影子回填证据：活动 v3 release 的 281 份共享文档、281 个附件、3,062 个 v3 chunk 经本机 dry-run 识别；首份试点和其余 280 份批量回填均成功，0 失败、0 外部调用，重复 dry-run 为 0。只读查询 `WR3000` 得 9 份候选，抽样 Datasheet 有 6 个页面节点并成功回读含页号与 v3 块 ID 的抽取内容。读路径现在按树版本、同文档附件、注册状态和来源哈希校验；合成上传回归仍通过。抽取块粒度不等于人工确认的精确原文引用，Gold 仍为 11/300、锁定集 0/50；禁止把本回填当作主路切换证据。
2026-09-24 候选诊断：`diagnose-vectorless-corpus.ts` 在本机只读运行开发/验证 250 题，跳过锁定 50 题，无外部调用。初始整句全文检索为 0/250；型号与文档/块级实体关联后，route 210/226 有候选，clarify 0/12、insufficient-evidence 0/8、deny 0/4 有候选，已人工审过的 11/11 题来源 SHA-256 进入候选集合。剩余 route 16 题未命中，其中 4 题属 base-33 型号，12 题为抽象边界问法。来源哈希命中不是答案正确或精确页/行引用验收；Gold 仍为 11/300。
2026-09-24 Skill 界面与权限证据：含脚本包默认停用、Agent 不能自行启用的 2 项聚焦单测通过；记忆中心 Skill 分页在 1366×900 与 390×844 两个隔离浏览器视口通过，整页未因新增分区无限下滑。TypeScript 和局部 ESLint 通过。此为界面与导入边界证据，不能证明自动 Skill 草案、回放、影子模式或自动启用质量已经验收。
2026-09-24 资料树读者证据：`verify-knowledge-library-tree-local.ts` 从真实 WR3000 共享资料列表读到 searchable、当前树版本和来源哈希；树路由聚焦单测验证分页与跨文档证据 404。桌面 1366×900、手机 390×844 浏览器隔离测试打开页节点和原文块并显示完整坐标，固定工作区未无限下滑。TypeScript、局部 ESLint 与相关单测通过。此结果证明读路径和 UI，不证明回答引用精度或新主路质量。

2026-09-24 真实新文件上传补充：`knowledge:verify-tree-real-uploads-local` 在本机 PostgreSQL 上将现有 93,637 B PDF、89,844 B PPTX、42,001 B XLSX 各复制为一个临时私有上传作业，调用现有 Python 本地解析器，再逐份登记、建树并回读。分别得到 60/255/1 个抽取块；每类均找到页、幻灯片或工作表节点及含块 ID 的原文坐标，重复登记复用同一版本，跨账号读取被拒，撤销附件后原证据不可引用。脚本在 `finally` 中清理测试作业、文档和上传副本；原始样本未修改。测试过程没有 embedding 或外部调用。该验证覆盖真实容器与登记路径，不代表页/行引用人工精度或 300/50 Gold 已验收。

2026-09-24 worker 重启恢复补充：迁移 115 给上传作业增加租约令牌和到期时间；本地 worker 只领取待处理或租约已过期的运行作业，并以令牌及有效期约束抽取结果写回，每次尝试写独立解析产物文件。真实 PDF 探针先模拟仍有效的运行租约并验证 worker 不领取，再将租约置为过期并由实际 worker 重新领取，最后达到“可检索”、回读原文和重复登记复用。该探针没有实际杀死进程，仍未覆盖持久故障、旧版回退和质量门槛。

2026-09-24 图谱 outbox 端到端补充：本机 `verify-graphiti-local.py` 预检 Graphiti、Neo4j 和固定本地模型通过。权威库的 `verify-memory-graph-real-outbox-local.ts` 返回 `eligible=false`，没有待投影的合格真实观察，因此未伪称真实数据已验收。`verify-memory-graph-clone-outbox-local.ts` 在现有隔离 PostgreSQL 克隆库补齐迁移后创建合成偏好，实际调用 outbox 消费函数并投影到本机 Graphiti；图候选回读、跨账户隔离、PostgreSQL 原文/时间回校、已交付收据和重复消费拒绝通过，`attemptCount=1`、外部调用 0。探针按观察 ID 清理克隆库记录和图节点。生产真实观察、主 Agent 召回及长时运行仍待验收。

2026-09-24 PageIndex 隔离试验：参考 [PageIndex 开源仓库](https://github.com/VectifyAI/PageIndex)与[本地 SDK 配置](https://docs.pageindex.ai/sdk/client)，在 Git 忽略的 `.venv-pageindex-local` 安装 `pageindex==0.2.19`，只对脚本即时生成的两页合成 PDF 试验。`verify-pageindex-isolated-local.py` 将所有运行期非回环网络连接阻断，使用本机 `qwen3:8b` 和回环 Ollama OpenAI 兼容端点；两个公开 tiktoken 文件先经本地代理下载至隔离环境，并按 SHA-256 校验。完整 SDK 索引成功，`get_document_structure` 返回 2 个节点；LLM-free Flash 也返回 2 个页节点；运行期阻断目标与外部连接均为 0，临时 PDF/索引随脚本清理。首次缺少公开 tokenizer 缓存时 SDK 摘要失败且被网络护栏阻断，缓存补齐后通过。PageIndex 的页级结构仅作导航参考，未写入 PostgreSQL、未处理私有资料，也不能作为正式引用或质量对照。PPTX/XLSX 继续走本产品树。

复现隔离试验需先在 `.venv-pageindex-local` 安装精确 `pageindex==0.2.19`，并将公开 `cl100k_base.tiktoken`、`o200k_base.tiktoken` 经本地代理下载到脚本预检的两个缓存文件名；脚本会拒绝哈希不符的缓存。其余生产服务不依赖该虚拟环境。

2026-09-24 Skill 门槛修正：此前纯指令 Skill 导入会立即启用、Agent 可在没有回放/影子证据时启用，违反 MA24-06。现在所有新导入版本先停用，更新版本也停用；非人工 `skill_manage` 仅允许账户级、无脚本/依赖且 `validation.autoEnable=passed` 的版本启用或回滚。现阶段没有评测器写入通过标记，所以自动启用保持关闭。记忆中心给停用纯指令草案显示“待验证”，脚本/依赖显示“待审核”，按钮区分“手动启用”。`skill-activation.test.ts` 4 项、TypeScript 与局部 ESLint 通过；历史任务回放、提示注入、影子质量和真正的自动启用仍未验收。
