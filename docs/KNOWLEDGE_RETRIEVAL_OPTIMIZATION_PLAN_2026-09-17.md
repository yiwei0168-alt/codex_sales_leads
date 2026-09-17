# 通用知识问答与资料访问优化：审查结论及实施交接计划

日期：2026-09-17。审查代码基线：`2bd5b19`。状态：**仅完成审查与计划；以下产品改造、数据纠错、重新入库和性能目标均未实施、未验收。**

用户明确说明：“这里WR3000仅仅是一个例子，审查类似问题并一并生成优化方案。给出实际的计划和步骤，后续我会让成本更优的sol或者Terra模型按照plan优化代码”。本计划覆盖通用路径，不允许通过 WR3000 专用分支、硬编码答案或仅替换提示词宣称完成。

## 1. 给接手实施模型的执行说明

1. 从本文件的阶段 P0 开始，按依赖顺序推进。先读取 `AGENTS.md`、`docs/CONFIRMED_PRODUCT_RULES.md` 中 KQ01/C14/A30/A33/A34/LG02/LG04/LG05，以及本阶段列出的实际源码。重新检查 Git 状态；不要假定代码仍停留在审查基线。
2. Sol/Terra 是后续代码实施者的模型选择，**不意味着将产品运行时的 Kimi 意图/回答模型或 Qwen embedding 切换为 Sol/Terra**。
3. 默认保留 C14 的一次 Kimi 轻量意图识别；简单资料请求/规格查询在识别后走本地处理，跳过查询 embedding 和回答生成。全面绕过意图模型不是本计划默认实施项，见第 5 节。
4. 每阶段完成实现、对应回归、差异检查、效率记录和工作流文档更新后，做一个聚焦提交并推送 `origin/main`。保留现有未跟踪实验产物，不使用 `git add .`。阶段没有通过时不得把状态写成完成。
5. 修改 Next.js 代码前阅读本机对应指南：`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`、`01-app/02-guides/authentication.md`；涉及客户端组件再读 `01-app/01-getting-started/05-server-and-client-components.md`。路径均相对 `node_modules/next/dist/docs/`。
6. 常规验收使用模拟供应商和隔离 SQL/UI 数据；执行任何旧 `verify` 或导入脚本前先阅读脚本，不能依据命令名称判断是否免费或只读。当前 `products:verify`、`company:verify`、`industry:verify` 会调用真实 embedding；`products:ingest` 会写库并删除重建部分数据。
7. 实施时先完成可重复的离线基线与回归，真实供应商质量/耗时评估单独标记。缺少服务商账单时写未知，不从 token 自行冒充实际现金费用；不把缓存命中率写成用户采用率。

## 2. 审查范围与证据边界

本次读取了助手意图与 LangGraph 图、直接知识问答 API、通用 RAG、产品目录和 PDF/PPTX 导入、公司/行业导入、知识库 UI、线索知识上下文、开发策略知识仓库、邮箱批准入库及引用/费用跟踪代码。数据库检查使用应用角色、当前 owner scope 和只读事务；共享文档统计不等于对所有片段逐条人工验真。没有读取其他用户的私有消息，没有重新执行用户失败请求，没有新建模型/搜索/SMTP 业务调用。

### 2.1 数据库与本地清单快照

| 范围 | active/shared 文档 | 片段 | 有向量片段 | 无 source_url 文档 |
|---|---:|---:|---:|---:|
| 产品 | 272 | 1,727 | 1,727 | 272 |
| 公司 | 4 | 86 | 86 | 4 |
| 行业 | 7 | 234 | 234 | 7 |
| 合计 | 283 | 2,047 | 2,047 | 283 |

- 产品文档包括 197 份 datasheet、61 份分类目录、14 份参考资料。只有 197 份 datasheet 和 9 份公司/行业导入文档具有 `metadata.sourceFile`；其余来源需从清单、原始上传或维护记录恢复，不能猜路径。
- 数据库有 293 个产品、63 个类别、3,054 条结构化事实，属性键共 19 类。33 个型号只有 identity 类事实，23 个产品描述为空。
- 原始产品清单有 270 个产品，均有描述；另有 24 份 datasheet 未匹配到清单型号，导入脚本据文件名补充了部分产品。不能把 293 与 270 的差额认定为丢失记录。
- 本地清单登记的 197 份原始 datasheet 和对应处理文件均存在；本次按现有 PDF/PPTX/XLSX 扫描口径未发现清单外原文件。197 份中有 1 份处理文本比登记页数少 1 页；尚未确认是空白页、图片页还是提取遗漏。
- 公司 1 份文档/1 个片段、行业 3 份文档/4 个片段包含 `Visual-only or no extractable text` 占位提示。它们已有向量，说明“100% 已向量化”不能代表内容提取完整。
- 9 个 `product_id` 对应多份 datasheet：AP1200、AP1300、AP3000、FS105D、FS108D、LT400、LT500、LT700、RE1200。其中可能有同版本重复、不同版本或 Unknown，不能统一取文件名最大值当最新硬件规格。
- 有 1 份文档关联 AP3000_P/AP3000 两个型号，`product_id` 仅为 AP3000_P。现有精确 productId 过滤会先排除它，后面的 relatedModels 关联无法补救。

### 2.2 可复现缺陷清单

等级含义：P1 为会造成错答、重要漏答或证据/权限问题的优先修正项；P2 为效率、完整性与运维项。等级是本次审查建议。

| ID | 等级 | 证据及源码定位 | 通用影响 / 目标阶段 |
|---|---|---|---|
| F01 | P2 | `assistant/intent-agent.ts:planAssistantRequest` 默认一次 Kimi 轻量识别；`rag/service.ts` 对问答一律 embedding→检索→生成，无事实直答 | 简单数字/是否支持问题承担完整远程链路；P5 |
| F02 | P1 | `assistant/types.ts` 无打开资料/规格查询动作；`ingest-product-catalog.ts` 未传 sourceUrl；283 份共享文档 source_url 为空 | 任意型号、公司资料、培训资料均缺可靠原文件访问；P2/P5 |
| F03 | P1 | `product-facts.ts` 从目录 description 正则提取，未从 datasheet 表格提取数量/预算/尺寸；全库无这些规格属性 | 路由器、交换机、AP、CPE、配件都受影响；P3/P4 |
| F04 | P1 | 对真实提取函数输入 `1 x 2.5G RJ45 Port` 得到 `cellular_generation=5G`；库中 AP3000、HS105 等已有 verified 的该类记录 | 网络速率与蜂窝代际混淆，不能直接信任历史 verified；P1/P4 |
| F05 | P1 | 合成输入 `SFP+ port` 仅提取 SFP；`No PoE support. Does not support WPA3.` 仍提取 PoE/WPA3；`802.3af/at ... 120W` 仅识别 af，无功率预算 | 标点边界、否定、缩写组合、条件与单位解析不足；P1/P4 |
| F06 | P1 | DB 实测 `WR3000有几个网口` 被解析成单一词项，带空格版为型号 AND 中文整段；关键词/目录/事实匹配均 0；英文 `WR3000 Ethernet ports` 仅命中 1 个片段，事实 0 | 同义词/中英文不是可靠可用的精确召回通道；P4/P6 |
| F07 | P1 | `assistant/graph.ts` 仅传 question/maxChunks=8，无型号/属性筛选；`rag/repository.ts` 又只按 d.product_id 等值过滤 | 无筛选会串型号；加简单筛选又会漏多型号资料；P2/P5/P6 |
| F08 | P1 | `rag/repository.ts` 非向量前30候选的其他通道分数上限低于默认0.35；`service.ts` 按同一阈值删除 | 关键词/结构化精确命中不能独立保留；P6 |
| F09 | P1 | 结构化事实可仅因 category 相同挂到另一个片段；`corroborated=signals.length>=2` | 多通道命中不是独立证据，更不证明当前型号/属性；P1/P6 |
| F10 | P1 | `service.ts` 只提取 UUID 形状引用；不在上下文中的 UUID 可令 citedIds 非空且产品数组 every 在空集上为 true；conflicting 目前只加警告 | grounded 标识可能虚高；必须校验引用集合、支持状态和冲突；P1 |
| F11 | P1 | PDF 仅 page.extract_text，字段/值顺序分离；短片段跨标题合并丢 heading；合成 Alpha/Beta 用例实测复现 | 同类规格表、PPTX 表格、短政策条款易失去对应关系；P3 |
| F12 | P2 | `upsertKnowledgeDocument` 只比较内容哈希+visibility，直接跳过 metadata/sourceType/model/chunker 变化；正文有变化时全量 embedding、删旧 chunk | 修元数据不生效；改切片算法不触发重建；引用 ID 失效且重算成本高；P2/P3/P7 |
| F13 | P1 | `external-disclosure.ts` 仅允许明确 public 来源；库中公司/行业/目录等类型不自动允许外发；查询 embedding 在过滤前发生 | “可见/已入库/可外发”被混淆；私有或内部知识需本地使用路径，不能改标签来绕过；P2/P5/P6 |
| F14 | P2 | `api/rag/query` 在 Next 内直接 answerWithRag；`getMissingRagConfig` 同时要求 embedding 与回答密钥 | 只改助手将漏知识页；本地资料/事实查询不应被无关模型密钥阻塞；P5 |
| F15 | P2 | `leads/workflow/rag-context.ts` 复用 hybridSearch，并对片段截1800字符；outreach 专库复用 chunker、simple全文检索并截1200字符 | 修改共用代码会影响线索计划与策略材料，需完整证据窗口和独立回归；P3/P6 |
| F16 | P2 | RAG 日志写入位于生成成功之后，空召回/外发拒绝/异常不写该查询日志；查询无成功结果缓存 | 很难定位漏答与耗时；重复问题重复调用；P0/P7 |
| F17 | P2 | `products:verify` 英文问题手动指定型号与术语、仅判断非空/多信号；公司/行业脚本硬编码文档数3/6，实库4/7 | 测试不代表真实自然语言效果，语料增长可能误报失败；P0/P8 |
| F18 | P2 | UI 上传是 File.text() 后 JSON，现有入口是文本导入；公司/行业提取器使用固定文件名单并静默跳过缺失文件 | 没有通用二进制上传/抽取作业合同；不应只改 accept 就宣称支持PDF；P2/P3/P8 |

F04/F05 为真实函数的合成反例；F04 还核对了已存数据。F10 为控制流审查确认的校验缺口，本次未模拟供应商产生该回答。未获得用户那次失败的完整检索/耗时记录，因此不能断言其唯一根因或给出当前 P95。当前默认值不等于已核实所有运行环境变量。

WR3000 仅作一个证据：V2.0 的7个向量片段包括第3页 `4× Gigabit Ethernet Ports`，第4页含 WAN/LAN 字段和分离的值；没有“该规格全文完全未入库”。后续验收必须包含其他型号与其他领域。

## 3. 目标行为与适用边界

| 用户需求 | 目标路径 | 模型预算（正常成功路径） |
|---|---|---|
| 打开/下载/查看某资料原件 | 轻量意图→文档/实体/版本解析→权限检查→原文件链接或候选 | 最多一次既有轻量意图；embedding=0，回答生成=0 |
| 单项明确事实：数量、速率、功率、尺寸、协议等 | 轻量意图→实体+属性→已验证事实→模板回答+来源 | 同上；缺可靠事实才进入检索分支 |
| 多个明确字段或产品规格对比 | 分别取字段，按型号/版本形成来源明确的表格；缺项明确标记 | 有完整事实时不生成；不得把缺项补成否定 |
| 公司、行业、政策的明确条款/定义 | 精确定位已验证条款或定义→本地原文短摘录+出处 | 可本地完成则不生成；保留适用市场/日期/组织 |
| 原理解释、场景适配、推荐、跨材料综合 | 约束内混合检索→证据筛选→一次既有回答模型 | 按需要一次查询embedding、一次回答生成；既有特殊策略另记 |
| “它”“刚才那个”“那新版呢” | 使用经验证的最近实体上下文；有歧义返回候选/澄清 | 不靠无条件字符串猜测，也不新增第二次规划 |
| 内部/私有材料不能外发 | 权限内本地查找、引用原文或打开资料；解释生成能力边界 | 不向外部embedding/生成/trace发送受限正文 |
| 无证据/版本冲突/来源失效 | 区分无文档、提取不全、未命中、冲突、禁止外发、服务失败 | 不把所有问题归为“知识库没有信息”；不自动发起外网搜索 |

保留原搜索任务确认、预算/费用观察、邮箱审批与发送边界。资料打开动作返回可点击链接，不自动打开任意窗口，不把“发给客户”“修改预算”当读取动作。任何模型推荐的工具/链接都需服务器校验。

## 4. 建议实现合同（以下是实施设计，尚未存在）

### 4.1 共用请求/结果合同

- 新增 `src/lib/knowledge/`：承载请求解析、文档与实体定位、事实读取、决策与知识子图；保留 `rag/` 的检索/生成适配层，逐阶段接入，不整体替换业务。
- `KnowledgeRequest`：原问题、`action = open-document | fact-query | compare-facts | explain`、实体候选及已解析ID、属性键、文档种类、显式版本/市场/日期、用户限定 collections、上下文实体、入口。userId 只来自已认证服务端；不要让模型决定权限。
- 轻量意图输出只负责 action/实体提及/属性候选等最小字段。保留原文，不让重写丢掉数量词、否定、版本、用途。事实解析器再按注册表校验，不直接相信模型给出的型号/属性/链接。
- `KnowledgeResult`：`kind = document-links | fact-answer | generated-answer | clarification | insufficient-evidence | unavailable`，`reasonCode`、answer、受控文档链接、citations、scope/version、`provenance/disclosure`、timings、usage。
- 兼容现有 `RagAnswer` 基础字段，新增字段 optional，旧消息仍可渲染；原有 `grounded` 由严格证据验证派生。文件链接结果以 `kind` 表示，不用 grounded=true 冒充已验证语义答案。
- UI 不把融合 score×100 展示成“答案正确概率”。区分检索相关度、已核实事实、有冲突、未充分溯源。

### 4.2 文档与原文件

- 新增受控 `knowledge_asset` 注册表：稳定 UUID、documentId、存储相对键、源文件SHA256、MIME、字节数、版本/地区/语言、来源性质、是否可外发、登记状态；继承文档 owner/visibility ACL。
- 新增实体与文档的多对多关系，支持同一文档关联多个产品、同一产品多份资料。产品型号、包装变体、硬件版本、固件版本、文档版本分别保存；不能把 `_P` 后缀或空格任意删除。
- 原件接口建议 `GET /api/knowledge/assets/[assetId]`：会话验证→ACL→固定根目录内真实路径校验→文件响应。客户端只持 assetId，不接收任意本地路径。防 `..`、绝对路径、Windows UNC、符号链接/重解析点逃逸和 MIME 混淆。
- PDF 可 inline，支持浏览器 Range 读取；PPTX/XLSX 返回下载；文本提供原文查看。响应使用安全文件名、`nosniff` 和私有缓存策略。页码定位加 `#page=N`，不伪造官方 URL。
- 用户提供 URL 与证明内容公开是两件事；保留来源审查状态。没有原文件时明确给“已保存文本”，不能标“原始PDF”。资料不是公开信息也仍可按用户权限在本地查看。

### 4.3 版本化提取、事实与索引

- 新增来源修订/解析产物记录，保存源哈希、抽取器/术语表版本及页面/表格定位；现有 `knowledge_document_revision` 保持追加式历史与既有ACL，不直接用它向非owner提供共享历史正文。
- 新增 `knowledge_fact`（或等价关系表）：document/source revision、generation、entity、entityVersion、market/effectiveDates、attributeKey、typedValue、unit、qualifiers、polarity、evidence location/hash、extractorVersion、`candidate | verified | conflicting | rejected`。
- 私有事实必须通过文档 ACL 隔离，不能写入当前所有用户可读的 `product_fact`。现有 `product_fact` 保留兼容，迁移后新直答只读新证据合同；旧 verified 不自动继承为新 verified。
- 新增 `knowledge_index_generation`，状态 building/validated/active/failed；chunk 关联 generation/source revision，文档持有活动代指针。按文档或冻结语料批次原子切换，失败保留旧索引；查询一次固定活动代，不能拼接两个代的事实。
- 现有 `(document_id,chunk_index)` 唯一约束需要迁移为代内唯一；迁移必须保留历史 chunk ID 及历史引用。旧引用可在有权限时定位原修订，标记非当前版本；权限撤销/删除后禁止从历史引用恢复正文。
- source metadata/ACL 改动与 embedding 文本变动分开：前者更新目录与缓存版本，不触发无关向量化；后者按 chunk hash+embedding model/dimensions 重用未变化向量。embedding 模型即使维数相同也不能混用空间。

### 4.4 语义预处理与关系

- 版本化 `config/knowledge/attribute-registry.v1.json`：标准属性、中英文别名、值类型、单位、适用类别、冲突规则、允许的精确计算。`config/knowledge/entity-aliases.v1.json` 只放已验证别名；真实私有实体存库，不提交私有资料。
- 第一批规格覆盖：以太网物理接口总数、LAN/WAN数量及可切换角色、接口速率集合、RJ45/SFP/SFP+/USB类型、PoE输入/输出/标准/总预算/单口功率、Wi-Fi代际/频段/分频段速率、蜂窝代际/LTE类别/SIM数量、协议与client/server/passthrough角色、尺寸/重量/电源。
- 公司/行业扩展独立属性与术语域，例如渠道角色定义、政策条款及适用条件；不把产品的规则硬套到公司能力，也不把“经批准营销表述”当客观事实。
- `5G蜂窝`、`5 GHz Wi-Fi`、`2.5 Gbps以太网` 独立；SFP与SFP+独立；端口转发与物理端口独立；PoE受电与供电独立；VPN passthrough 不等于 VPN server 支持。
- 数量关系可做可追溯计算：仅在同型号/版本且物理接口集合互斥时求和；组合/共享口不能相加重复计数。每个派生事实保存所依赖事实ID、规则版本和计算表达式。
- 模型生成的检索别名、候选问法或关系只进入辅助索引/待验证层，不写成源事实。简单模板批量生成本地问法；复杂页面是否需一次性辅助提取由 P3 的覆盖率报告决定，复用既有获准供应商，不新增未经评估的在线依赖。

## 5. 意图与 LangGraph 的明确方案

默认方案贯彻 C14：助手在 `plan_request` 中仍执行一次轻量 Kimi，增加结构化 knowledge action 输出；明确知识任务不升级复杂规划模型。型号/属性匹配、文件定位和事实格式化由本地节点完成。

新增共用 `knowledge_business_flow` 子图：

```text
normalize_knowledge_request → resolve_entity_and_scope
  ├─ 歧义 → clarify_knowledge_request
  ├─ 打开资料 → resolve_document → publish_document_links
  └─ 查知识 → lookup_verified_facts
               ├─ 足够 → validate_evidence → format_fact_answer
               └─ 不足 → retrieve_lexical_evidence
                          ├─ 足够 → validate_evidence → format_extract
                          └─ 允许且必要 → embed_query → retrieve_hybrid_evidence
                                          → assemble_evidence → validate_evidence
                                            ├─ 简单且已验证 → format_fact_answer
                                            ├─ 需要解释且可外发 → generate_grounded_answer
                                            └─ 不足/冲突/受限 → explain_evidence_limit
```

- 上述节点在独立 LangGraph 运行。`assistant_workflow` 挂载该子图；不把全部流程继续藏在一个 `retrieve_internal_knowledge` 内。
- 建议增加独立 `knowledge_workflow` 根图，供现有 `/api/rag/query` 调用同一子图，保留现有HTTP路由和响应兼容。该入口只允许知识行为，保留用户的 collections/filter，不建立对话、不创建销售动作、不触发外部搜索。原3个图ID不改名；新增图需同步 `langgraph.json`、server/client、注册检查和xray测试。
- 助手已完成意图识别时复用 plan，不在知识子图再问一次模型。直接知识页可执行一次同合同轻量知识分类。文件GET、UI中已选择明确assetId的打开操作不需要意图模型。
- 混合研究复用检索与证据结果，避免内部先长篇回答、综合时再次生成同样内容；引入新的本地私有摘录后，必须在 `assistant/synthesis.ts` 再次检查 provenance/disclosure，不能把本地受限答案送到外部综合模型。
- 线索流程复用“检索证据”能力，不调用面向用户的事实回答/轻量意图；开发策略保留自身专库、私有记忆和模板优先级。修共用切片/检索不能改变邮件批准/发送语义。
- LG05 输入/输出隐藏不变；trace metadata 只用节点/状态/耗时/数量/原因类别。错误正文、问题、证据原文和敏感属性不得塞入 metadata 绕过隐藏。
- **后续可选增强，默认不实现**：对明确的型号+文件/属性指令，在轻量意图之前添加本地直达。它改变 C14“不改成确定性优先”的范围，只有用户后续明确接受这一例外才启用；当前执行者不得因追求1秒端到端而悄悄打开。

## 6. 分阶段实施步骤与验收

所有新增文件/表/命令在本节均为待实现建议；先检查仓库是否已有等价实现，优先复用。迁移编号在执行时取下一个未占用编号，本次基线最后为076，不硬编码覆盖未来077。

### P0 — 建立跨语料基线和评测工具

修改/新增：`scripts/audit-knowledge-corpus.ts`、`scripts/evaluate-knowledge.ts`、`src/lib/knowledge/evaluation/`、`package.json`；同步本计划执行记录与效率账本。

1. 审计器默认只读：使用现有DB连接/TLS/应用角色和ACL，不输出密钥/用户正文；输出文档→修订→页面→片段→向量→事实的数量与缺口、来源文件存在性、版本重复、孤立关联、历史verified可疑类型。
2. 建立两种输入：可提交的合成fixture和本地Git忽略的真实语料评测清单。真实PDF、完整知识文本、私有golden answers不得提交；可提交来源哈希、聚合数、许可明确的最小反例。
3. 冻结第7节评测集、source hashes和标签依据，标明正例/负例/歧义/版本/权限。gold必须由原件核对，不能用当前提取器的输出作为唯一标准。
4. 评测器分开执行实体解析、事实提取、召回、答案/引用、调用数、耗时。支持 `--offline` 默认禁外部；`--live` 必须显式启用且限样本、按现有费用策略记录。
5. 新增计划命令 `knowledge:audit`、`knowledge:eval`。文档中始终标明这些命令从本阶段完成后才存在。可复用本次SQL口径，但不要硬编码总文档数283为通过条件。

验收：当前错误在回归用例中可复现；只读审计不改业务数据；缺失原件/私有不可见资料不被当可评测成功样本；保存基线及来源哈希。完成后才进入修复，避免只调整到WR样本通过。

### P1 — 先收紧证据与事实校验

修改：`src/lib/rag/product-facts.ts`、`service.ts`、`repository.ts`、对应测试；新增 `src/lib/knowledge/evidence-validation.ts`。

1. 修复数字/单位边界、SFP+、标准组合和否定解析；无法可靠解析的复合句输出候选/未知，不强行 verified。明确实义类型与极性；不能只靠追加正则覆盖某几个型号。
2. 引用必须实际存在于本次提供且当前用户有权访问的证据集合。缺失/伪造UUID、仅格式正确的UUID、引用集合为空、冲突事实均不能产生 grounded=true。
3. “命中同类别”“同一原文的两个检索通道”“仅匹配产品身份”不得作为某属性已验证的依据。缩小结构化事实与文档/型号的关联，保留类别级材料的相关性标签。
4. 产出旧事实审计报告和待重算ID；这一步不全表清空、不触发付费重嵌入。旧错误事实在新快答中隔离；P4/P7按来源修订重建并保留审计痕迹。

验收：四类提取反例全部通过；未知引用/冲突/错型号测试全部拒绝为verified；原正例保持通过；明确这是防错阶段，不能宣布全库事实已纠正。

### P2 — 建立文件目录、实体关系与可追溯来源

修改：新增DB迁移、`src/lib/knowledge/document-repository.ts`、`entity-resolver.ts`、`src/app/api/knowledge/assets/[assetId]/route.ts`；产品/公司/行业导入脚本、`rag/types.ts`、`knowledge-library.tsx`。

1. 实现第4节asset、实体与多文档关系；先登记已有原件和哈希，不重新向量化。恢复61份分类目录与14份参考材料丢失的sourceFile；仅允许从已有manifest明确映射。
2. 完成原件GET/Range与鉴权，并提供可显示的文档类型/版本/页码。现有引用卡片和知识库列表支持同源asset链接；资料不存在时给可操作错误。
3. 规范文档发现：公司/行业不静默忽略新文件或缺失文件；使用受控manifest注册和清单差异报告。保留现有命名文件的身份，不自动把新文件批准为共享/公开。
4. 更新上传合同说明。已有文本上传可原样保留；要支持PDF/PPTX/XLSX二进制时增加独立受控上传+异步提取job，旧JSON入口继续兼容，不能用 File.text() 读取二进制后入库。上传授权、大小/格式校验与原文保存先完成，作业解析由P3提供。
5. 将 metadata-only 更新从 content hash 跳过逻辑中分离，测试 sourceType/sourceFile/version/visibility 变化确实保存，并使相关缓存失效。

验收：至少覆盖PDF、PPTX、XLSX、文本四类真实或合成资产；登录用户可打开有权限原件；跨租户、伪造assetId、路径逃逸、删除后的旧链接均失败；多版本给候选；多型号文档可被每个真实关联型号找到；无embedding调用。

### P3 — 结构化提取与切片v2

修改：`scripts/extract-product-knowledge.py`、`extract-company-knowledge.py`、`extract-industry-knowledge.py`，新增共用提取模块；`rag/chunker.ts`（保留v1兼容入口）、`types.ts`、`repository.ts`、版本化产物/索引迁移。

1. 先输出可检查的中间格式：document/asset、page/slide/sheet、section、blockType、table row/column、text、bbox（可得时）、extractorVersion、质量状态。对正文和表格分别处理；不要只输出一条扁平字符串。
2. PDF先评估已装 pypdf 的layout/坐标抽取能力，用多型号真实表格校验行列恢复。若不满足，选一个本地版式解析器并记录版本/依赖/对比结果；不要同时引入多个框架。图片页使用本地OCR或排入复核；未处理页标pending，不能填“无内容”后算成功。
3. PPTX保留表格表头、分组元素及幻灯片编号；XLSX保留sheet/行列/合并表头和单位，不能将Excel第三列描述视为所有规格的唯一来源。
4. `chunkDocumentV2` 按块类型切：规格表按完整行组，保留表头/单位/脚注/型号列；解释正文按章节段落；政策条款不把短标题内容归并到上一条。跨页表格连接必须有标题/列结构证据，不能凭相邻页就拼接。
5. 小检索单元关联父表/父章节；每块保存来源定位和版本。向量用语义完整的文本，保留原文；单位/别名生成的规范文本放独立字段，不改写源证据。
6. 初始正文切片候选预算300/500/800 tokens，以P0评测决定最终值；表格完整性优先，超预算按行组拆分并重复表头。使用所选embedding适配器可解释的token/输入限制，不能把不同tokenizer估计当精确计费。
7. 仅生成候选产物/影子索引。实现第4.3节代内唯一约束、追加修订和活动代指针；不删除现有有效片段。

验收：合成跨标题/跨页/合并单元格/型号对照/脚注/否定/扫描页测试；真实抽样不少于30份资料，覆盖产品/公司/行业及PDF/PPTX/XLSX；每页可计数为成功/空白/待OCR/失败之一。对原件做可视核对，不能只比较两个解析器文本。原图库仍可用。

### P4 — 通用属性、语义别名与可验证事实

修改：新增 `config/knowledge/` 属性注册表、`src/lib/knowledge/fact-extractor.ts`、`fact-repository.ts`、`query-normalizer.ts`，对应DB迁移；扩展产品导入，接入公司/行业定义和条款。

1. 实现第4.4节属性注册表，至少覆盖路由器、交换机/PoE、AP、Mesh、4G/5G CPE、USB/SFP配件六组；不得在查询函数中写具体型号答案。
2. 从P3结构化表格与正文提取typed facts，保存原始数量/单位/角色及来源。判断显式否定、条件、版本/地区差异；缺失是unknown，不是false或0。
3. 先检查来源与属性绑定，再决定verified；规则输出、辅助模型输出、人工核对分别记录方法。历史identity=verified不能替代所问规格的验证。
4. 已验证别名和一跳关系用于检索扩展；未知术语低置信度候选不得污染正式词典。中文/英文/缩写、全半角/乘号归一化保留原值；型号最长匹配及合法边界不得匹配出错误系列。
5. 将目录与datasheet的差异作为多源断言保存；数字相同可证据合并，不同则conflicting。不同硬件版本分别存，不强制选一条覆盖全部。
6. 生成通用模板化问题作为可选辅助索引；不使用全量在线LLM逐块生成问答。仅未被本地规则可靠处理且允许外发的资料可做一次性辅助抽取，并缓存/复核。

验收：AP3000/HS105的2.5G误读不进入新verified；GS1010PE接口/PoE预算、LT700 SIM、WU650 USB版本、RE1200接口等真实样本逐项回到原件；公司/行业至少各有定义/条款样本。测试还须覆盖未知型号、包装变体、多版本、角色互斥和无证据。不要把这些样本值硬编码进产品逻辑。

### P5 — 分流与快速本地回答接入所有用户入口

修改：`assistant/intent-agent.ts`、`types.ts`、`graph.ts`、`service.ts`；新增 `knowledge/graph.ts`、`request.ts`、`response.ts`；`src/langgraph/server.ts`、`lib/langgraph/client.ts`、`langgraph.json`；`api/rag/query/route.ts`、`rag/config.ts`、`assistant-home.tsx`、`knowledge-base.tsx`。

1. 按第4/5节扩展轻量意图schema/prompt、等价fallback提示与结构校验。明确知识问题不因所问属性多就升级复杂规划；继承多轮实体但保留歧义。
2. 挂载知识子图，实现资料打开与已验证事实模板化回答。数量/单位/条件/版本/页码从事实与来源取值；对比表按字段标缺项。
3. 直接知识页经新增独立根图执行同一知识子图；SDK边界保留禁重试POST及失败显式返回。助手已有plan时只调用一次意图；知识页禁止变成销售任务入口。
4. 缺少模型密钥只阻塞确实需要相应能力的节点；文档GET与本地事实读取不依赖embedding/回答配置。自然语言入口若仍需C14分类而缺意图配置，按既有降级合同显式标记，不偷偷宣称已正常分类。
5. 更新结果保存与UI：doc links/citations/version/reasonCode 在刷新后保留；超时/冲突/未提取/外发受限分别展示。不要仅返回含markdown链接的字符串让现有纯文本渲染器漏掉链接。
6. 改造混合综合的disclosure传播：本地私有摘录可返回本人，但不得因它属于 internalResult 而送入外部综合模型；必要时只综合公开证据并单独展示本地引用。

验收：完整产品HTTP→独立LangGraph→SQL→UI；资料打开与事实直答在模拟成功意图后embedding/answer generation调用数均为0；复杂解释仍走原回答供应商；xray显示实际分支；两个入口对同一作用域给一致结果；原销售/预算/邮件行为不变。

### P6 — 修复混合检索及上下文组装

修改：`rag/repository.ts`、`service.ts`、`openai-provider.ts`、`knowledge/query-normalizer.ts`/`evidence-validation.ts`；`leads/workflow/rag-context.ts`、`outreach/knowledge-repository.ts`及相关测试。

1. 先ACL与scope过滤，再独立召回：实体/属性精确facts、扩展术语全文、向量。全文/事实不能因没有embedding被初始eligible排除；只有向量通道要求有效且同代embedding。
2. 型号/版本用精确关联约束；别名/属性做受控OR扩展，保留实体AND属性语义。用户限定collections/市场不因召回少被静默放宽；原线索的无国家资料fallback须继续显式标记“通用材料”。
3. 候选先各取30合并，按实体/属性/版本一致性与文档段落多样性重排，最后组装不超过既有预算的证据包。修复非向量结果永远过不了0.35的问题；新rankingScore与事实confidence独立。
4. 只为需要语义兜底的请求算一次query embedding；首轮命中本地事实/原文时不调用。重用成功向量做一次受控查询扩展，不反复让LLM改写再检索。
5. 找到子片段后补父表/邻接段；按问句相关事实选择证据窗口，避免统一取前260/1200/1800字符截掉答案或否定条件。父片段补取继续校验ACL/版本并遵守总token预算。
6. 外部回答前检查公开来源、脱敏和证据完整性；内部资料占满top-k时应在允许外发的集合内补取公开候选，或走本地引用分支，不能声称知识不存在。
7. 检查EXPLAIN与索引利用、检索p50/p95；没有性能证据不预先换向量数据库或重型reranker。outreach保持原优先级/私有记忆用途；只修相关查询规范化/截断，不扩张邮件事实来源。

验收：keyword-only/fact-only/null-vector、中文同义词、不同型号同类别、多型号文档、版本冲突、低分精确事实与长上下文尾部证据全部有回归。线索RAG和outreach选材仍符合原边界。

### P7 — 缓存、遥测与可回退重建

修改：`knowledge/cache.ts`、`rag/repository.ts`、`openai-provider.ts`、`lib/operation-metrics.ts`、`tracked-operation.ts`及导入脚本；新增 `scripts/reindex-knowledge.ts`。

1. 缓存分层：查询归一化、成功embedding、确定性事实结果、证据包；首版不缓存任意生成答案。键至少含user/ACL scope、请求/filters、实体版本、active generation、属性/别名版本、embedding模型/维数；命中时仍核权限。
2. 并发相同成功查询合并；失败/超时/费用未知结果不缓存成成功，也不自动付费重放。可选的短期空结果缓存必须随新资料/活动代切换失效。
3. 每个节点记录输入量、候选数/有效量、进入下游量、证据命中/引用量、token/API credits/已知成本、latency、retries、reasonCode、cacheHit；父子费用账本不能相加重复计费。没有供应商调用时对应token/credits为0，现金仅指供应商本次新增费用，不等于基础设施成本。
4. 为全部终态记录结果摘要，含未命中/歧义/受限/异常；不依赖生成成功才写log。关联requestId/operationId/generation以便定位，保持trace只传元数据。
5. 重建命令默认 `--dry-run`，列出变化文档、需重算片段/事实、可复用向量、预计请求数量与未知费用。支持batch/checkpoint/resume，数据库事务内不得长时间等待外部模型。
6. 先迁移六类产品+公司/行业代表样本，在新代上影子对比，P8质量通过后再扩大到可见全部语料。每批核对源数量/页面状态/片段/事实/可见性；旧代保持可恢复，不直接调用旧脚本全表delete进行迁移。
7. 失败回滚活动代及特性配置，保留新代失败证据和原件；旧模型调用/未知费用不被回滚抹去。若回滚到含已知错误事实的旧索引，禁用事实直答并明确低置信度，不能重新暴露已知错误为verified。

验收：内容未变/仅元数据变/局部内容变/模型变/权限撤销/多用户/并发/中断恢复逐项测试；第二次同请求不用重做可复用调用；新资料入库后旧空结果不生效；影子失败不影响活动索引；历史引用可追溯且守ACL。

### P8 — 全面回归、代表性实测和发布交接

1. 执行第7节评测，给每个类别单独报告。不得用总体准确率掩盖某类别全部拒答，或降低gold标准让重构过关。
2. 修订 `scripts/verify-product-rag.ts`、`verify-company-rag.ts`、`verify-industry-rag.ts`：断言语义与证据，不以固定文档数为通过条件；添加离线/真实模式并明确真实调用。
3. 扩展隔离式 `scripts/verify-authenticated-ui.ts` 或新增专用知识验收脚本；Playwright现有 `tests/browser/dialogs.spec.ts` 是组件级检查，不能替代登录产品HTTP/SQL闭环。
4. 两视口1366×900、390×844覆盖资料选择/打开、简答、对比、复杂解释、版本澄清、受限资料、本地加载/错误、刷新后引用、文件404/权限撤销；同时覆盖旧销售任务与邮箱审批不退化。
5. 离线通过后才做有记录的代表性供应商抽样，分别报告轻量意图、embedding、生成、LangGraph传输和UI端到端时间，保留费用未知项。模型/搜索/SMTP禁网的测试不能被写成真实语义或账单通过。
6. 更新 `docs/ARCHITECTURE.md`、`STANDALONE_LANGGRAPH_WORKFLOW_2026-09-16.md`、`LANGGRAPH_LEAD_WORKFLOW.md`、确认规则与效率账本；在本计划末尾填写每阶段commit、检查结果、语料代、剩余问题，完成后聚焦提交推送。

最终发布检查（在项目根目录；PowerShell优先npm.cmd）：

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:browser
npm.cmd run langgraph:check
npm.cmd run docs:lead-workflow:check
```

另外运行已审读的 `langgraph:verify-routing`、隔离知识SQL/UI验收、新增 `knowledge:audit` / `knowledge:eval -- --offline`。路由探测要求独立服务已启动；不得因此重启或覆盖用户正在执行的业务。认证/数据库夹具脚本虽不付费但会写临时数据，应使用隔离目标或脚本自有可核对夹具，并校验清理范围。

## 7. 评测集与验收阈值

以下数量/目标为本计划建议，不伪写成用户已逐项确认值。P0允许依据真实语料调整，但必须在改代码前冻结并记录原因。

### 7.1 冻结样本

- 基础160条：60单项事实、20原文件请求、20多轮/型号/版本澄清、20多属性/跨型号对比、20公司/行业条款与解释、20未知/冲突/缺来源问题。
- 另加40条边界回归：权限/缓存污染、伪造引用、否定/条件、2.5G/5G/5GHz、SFP+、VPN角色、组合接口/PoE角色、跨页/扫描页、超时/并发/中断。
- 不少于30个型号、12个实际类别，覆盖六大产品组；WR3000及近似变体在基础集中不超过10%。同一模型/源文档的问题按组分配开发/验证/留出集，避免改写问句跨集合泄漏；建议80/40/40，冻结来源哈希。
- 至少中英文两种表达，同一属性覆盖日常口语/专业名词/缩写；增加有无空格、拼写别名、后缀、多个实体及上下文代词。私有样本仅本地保存，合成权限fixture随测试代码提交。

### 7.2 通过标准

| 项目 | 发布标准 |
|---|---|
| 精确事实直答 | 冻结集中已回答项精确值/单位/版本/条件正确率100%；具有完整已验证事实的可答项直答覆盖率≥90%，避免全拒答刷正确率 |
| 文档打开 | 有权限且原件存在的已登记文件100%可打开/下载；指定版本正确；不存在不编造链接 |
| 路由 | 基础集总体正确率≥95%；打开文档/确定事实分支不得触发生成或外部搜索；歧义不猜实体 |
| 检索 | 可回答且证据已入库样本的 evidence Recall@8≥95%，同时报告按类别、语言和版本的指标；不能以出现型号替代命中所问属性 |
| 安全与证据 | 错型号/版本、伪造引用、冲突verified、跨租户访问、受限正文外发40边界集零违规 |
| 内容覆盖 | 所有登记源文件及页/slide/sheet都有处理状态；已验证关键表格字段无静默丢失；未完成OCR单独计缺口 |
| 性能 | 默认C14模式下分别测意图时间；意图完成后的文件/已验证事实路径，本机热态P95目标≤1秒（含LangGraph相关传输时明确口径）。完整事实问答P95较冻结旧路径目标下降≥50%；未达标须说明瓶颈，不减少正确性校验 |
| 调用/成本 | 确定事实/文件：每次正常路径最多1次轻量意图、0次embedding、0次回答生成；同输入成功缓存按键复用；总费用以实际报告为准 |
| 复杂问答 | 事实正确性/引用有效性不低于冻结基线，按类型报告；延迟若上升须有质量收益证据与明确记录 |

离线语义标注、mock路由、真实检索与供应商端到端必须分别报告。真实性能采样至少30次热态请求（跨类别分层）并单列冷启动/缓存命中；请求量/成本/超时和未完成样本全部纳入报告，不只统计成功快样本。成本允许范围沿用用户当前授权，不能从测试脚本推导新的无限授权。

## 8. 常见实施陷阱与明确排除项

- 不全库换embedding或增大top-k来掩盖词法/实体/表格错误；已有向量不等于没有源数据问题。
- 不把3,054条旧verified直接接到快速答案；必须先排除错误类型、建立来源/版本并重建。
- 不用全文检索命中数、多个通道数、来源权威等级直接替代属性级证据验证。
- 不把内部资料改成public、把private改成shared来提高回答率；新增本地提取结果不能绕过混合综合的外发边界。
- 不在Next.js保留新的独立回答runner并让助手与知识页各自实现一套；也不让线索/邮件流程为简单共用工具调用新增意图模型。
- 不把未存在的原始文件链接、型号版本和PDF页码交给模型编造。版本时间不能用文件mtime冒充生效时间。
- 不先全量删除再重嵌入；不能因cache/reindex把仍在使用的历史引用、租户隔离或追加式审计破坏。
- 本轮不新增Neo4j、全库GraphRAG、远程OCR服务、运行时重型reranker或无上限agent循环。待本计划评测证明必要性再单独提出。
- 当前任务仅审查/计划；本文件存在不代表后续代码/规则例外已经授权实施或任何验收已完成。

## 9. 本次审查验证与后续记录

已执行：共享语料只读SQL统计、原文件/清单存在性核对、5个离线函数探针（4事实提取+1短标题切片）。探针均用于复现缺陷，不计为修复后通过。曾一次受限Windows用户信息读取失败，随后经权限机制在沙箱外完成同类只读探针；没有文件/数据库业务写入。

已有回归命令：

```powershell
npm.cmd test -- src/lib/rag src/lib/assistant/intent-agent.test.ts src/lib/assistant/intent.test.ts src/lib/assistant/graph.test.ts src/lib/assistant/synthesis.test.ts src/lib/langgraph/client.test.ts src/langgraph/server.test.ts
```

结果：12文件/58测试通过，Vitest耗时3.83秒。该结果不覆盖本次新增反例，不代表通用规格问答已正确。当前用户失败请求的真实耗时分解与最终供应商费用仍未知。本次只做文档交接，不运行全量build/UI或重建库。

| 阶段 | 状态 | 提交/验收/语料代 |
|---|---|---|
| 审查与计划 | 已完成审查，文档交接 | 基线2bd5b19；58已有测试通过；无业务改造 |
| P0 | 已实施并通过离线/只读验收 | 200条冻结请求；语料SHA `bbafb762…f436`；[证据](KNOWLEDGE_RETRIEVAL_P0_BASELINE_2026-09-17.md) |
| P1 | 已实施并通过离线/只读验收 | 通用提取4类反例、引用/冲突/错型号拒绝；64条旧事实候选仅审计未改写；[证据](KNOWLEDGE_RETRIEVAL_P1_EVIDENCE_2026-09-17.md) |
| P2 | 待实施 | — |
| P3 | 待实施 | — |
| P4 | 待实施 | — |
| P5 | 待实施 | — |
| P6 | 待实施 | — |
| P7 | 待实施 | — |
| P8 | 待实施 | — |

## 10. 方法参考

审查结论以本仓库代码/只读数据/合成探针为证；下列资料仅支持设计方法，不替代项目实测。

- [PostgreSQL全文查询控制](https://www.postgresql.org/docs/current/textsearch-controls.html)：websearch_to_tsquery未加引号的文本生成AND词项；应显式设计实体/属性/同义词查询，而不是将整句当作语义理解。
- [pypdf文本提取](https://pypdf.readthedocs.io/en/stable/user/extract-text.html)：支持layout/visitor；PDF表格缺乏天然语义结构，pypdf本身不执行OCR，layout输出也不能直接当正确表格。
- [LangChain文本切分](https://docs.langchain.com/oss/javascript/integrations/splitters)：按文档结构保持语义单元；本项目可复用现有工具实现，不因该参考强制添加新依赖。
