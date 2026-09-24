# 用户确认规则登记表

> **MA24 — 2026-09-24 长期记忆与 RAG 重构（已确认，分阶段实现）。** 以下规则来自本轮确认的执行计划；确认本身不代表实现或验收。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA24-01 | RAG 以无向量的文档集合筛选、结构树导航和原文读取为新主路；现有 pgvector/v3 只作补充候选与回滚。主路切换前保留 v3 活动指针和数据。v3“双向量齐备才能激活”只适用于 v3 release，不作为新主路逐文档可检索门槛。 | 逐文档树、全文检索及内部读取函数已实现；281 份活动 v3 共享资料已影子建树，型号实体与全文组合收窄候选。生产主路未切换。 | 开发/验证集 250 题只读候选诊断：需路由 226 题中 210 题有候选，已审 11 题的来源哈希均进入候选；答案和精确引用未评分。300 题人工 Gold 与 50 题锁定集对照仍未完成，不能宣称质量通过。 |
| MA24-02 | 现有资料入口逐份增量处理，以 documentId、来源 SHA-256、extractorVersion 定位工作；同内容重传不重复建索引。只有原文、坐标、权限、索引检查完整才原子切换当前可检索版本；失败保留旧版。默认最多 24 份候选文档、8 组证据、8 次导航，超限返回部分结果及未查范围。 | 二进制上传已接入本地抽取后逐文档原子建树；私有自动登记，共享仍经管理员批准；上传 worker 增加过期租约重领及令牌写回保护；影子检索会话已限制 24/8/8 并保存步骤收据。新写入文本及已批准邮箱知识在旧写入事务中建立本地树；存量 11 份文本及 281 份活动 v3 共享资料已逐份回填。主 Agent 生产接线待实现。 | 合成 PDF 的登记、重放、检索、跨账号拒绝、撤销后禁引及预算上限通过；文本精确区间、更新与删除后禁引通过；281 份 v3 共享资料源文件与抽取产物哈希核验后影子建树，重复运行零待办。真实 PDF/PPTX/XLSX 新文件本地上传、建树、重复登记、跨账号和撤销禁引通过；真实 PDF 作业的有效租约不被抢占、过期租约由实际 worker 重领通过。实际进程崩溃、人工引用精度与回答质量待验收。 |
| MA24-03 | PDF/PPTX/XLSX 使用已有本地抽取坐标构树；文本及已批准邮箱知识沿原入口接入。节点摘要只导航，正式引用必须回读原文及稳定坐标并校验当前版本/权限/来源。私有默认本地处理，不新增私有资料云端外发。DOCX 等未支持二进制格式不计入本阶段。 | 二进制资料注册和树索引无需 embedding；现有 281 份共享资料复用活动 v3 本地抽取块，保留页/幻灯片/工作表及 v3 块 ID。文本和已批准邮箱知识沿既有入口生成树，引用回读当前哈希和精确字符区间。PageIndex 0.2.19 已在隔离虚拟环境用合成 PDF 与本地模型试跑，未进入生产索引；旧文本入口原有 embedding 调用未改。 | 合成 PDF 原文坐标、权限和撤销禁引通过；本机文本 Unicode 区间回读通过；真实 WR3000 资料可浏览页面并回读抽取块。真实 PDF/PPTX/XLSX 新文件各一份取得页/幻灯片/工作表块坐标。PageIndex 本机完整 SDK 与无模型 Flash 对同一合成 PDF 均返回 2 个页节点，运行期外部连接为 0；完整原文块粒度与复杂文件引用精度待验收。 |
| MA24-04 | 长期记忆保留账户/市场/公司范围、类型、来源收据、入库时间、业务生效起止、置信度、权限及更正/失效关系；两种时间分别查询。历史缺失生效时间保持未知。任务/纠正/可靠收据自动提取并通知、可撤销；自动业务事实只作内部记忆，不能自动发布政策、正式评分或对外表述。 | 不可覆写观察、双时间查询、事务 outbox、幂等写入、同主题冲突记录、通知记录、分页查询及追加式撤销界面已实现。既有主 Agent 的自动偏好保存现同事务镜像为带来源观察，保留多市场/公司范围；旧版与新观察撤销联动。其他任务经验/业务事实自动抽取和旧数据回填未完成。 | 本机回滚事务、跨账户观察读取、聚焦单测通过；真实任务自动学习和完整端到端验收待执行。 |
| MA24-05 | Graphiti/Neo4j 在本机部署，PostgreSQL 始终是权威库；图谱由事务 outbox 投影，可延迟/重建，查询必须回库校验。不可用时回退 PostgreSQL。自由文本先用本地 qwen3:8b 做 Schema/真实样本测试，不可用则排队，不静默改云模型。 | outbox 租约、账户隔离读取和仅本机 Graphiti 结构化投影 worker 已实现，默认关闭；Neo4j、qwen3:8b、nomic-embed-text 与 Graphiti 0.30.2 已本机部署。内部图谱候选查询只返回观察 ID，再由 PostgreSQL 校验账户、双时间、范围、失效与原文；图谱失败或候选失效时回退 PostgreSQL。主 Agent 尚未接入。 | 迁移 113、本机回滚事务的租约/跨账户探针、合成 Graphiti 写入/重放去重、跨账户候选隔离和 Node/Python 调用链通过；本机 Neo4j 实际停机时读取回退 PostgreSQL，重启后连接恢复。隔离 PostgreSQL 克隆库合成观察的真实 outbox 消费→Graphiti→候选→PostgreSQL 回校及重放拒绝通过；权威库无合格待投影真实观察。真实 qwen3 五类合成样本契约通过，但仅 2 条真实任务消息只读测试。自由文本 Graphiti episode、生产真实观察及主 Agent 偏好召回待验收。 |
| MA24-06 | 重复成功的方法先形成带触发条件、范围和来源的 Skill 草案，完成历史回放、错误、提示注入、权限和影子测试。仅账户级、纯指令、无新权限且效果不低于原流程时自动启用；脚本、跨账户发布、发信和权限扩大须人工批准。 | 既有 Skill 版本固定、停用和回滚保留；所有新导入版本先作为停用草案，当前版本切换也停用。Agent 仅可在账户级纯指令版本带回放与影子验收通过标记时自行启用；脚本、依赖、全局版本仍需人工操作。自动草案、回放与影子评测尚未实现，因此暂时没有自动启用。 | 聚焦权限单测验证纯指令草案默认停用、未验收时 Agent 启用被拒、通过标记路径及脚本/全局拒绝；界面分页此前通过，待验证状态与手动启用文案已更新。实际自动启用质量和真实任务安全门槛待验收。 |
| MA24-07 | 资料页显示逐文档处理状态、版本、来源和引用；个人记忆保留独立分区。记忆中心按当前有效、历史时间轴、冲突待处理、Skill 分区，固定工作区与分页，沿用深色视觉体系。 | 资料列表按当前树版本和来源状态显示可检索状态、版本与来源哈希；读者可分页浏览页/幻灯片/工作表节点并回读当前原文和完整坐标。个人记忆与资料列表分区，学习记忆提供当前、历史、冲突、通知及 Skill 视图；Skill 每页 12 条并支持停用与纯指令历史版本恢复。 | 本机真实共享资料列表探针、树路由跨文档拒绝及桌面/手机隔离浏览器视口通过；真实复杂文件的引用精度、真实 Skill 与完整布局仍待验收。 |

[MA24 分阶段验收记录](MA24_VECTORLESS_MEMORY_ACCEPTANCE_2026-09-24.md)。

> MA24-01、MA24-02 实施/验收状态补充（2026-09-24）：迁移 116 与影子检索会话已实现旧 v3 一次性备用候选及步骤收据；候选仅含文档 ID，须经当前 PostgreSQL 树版本、来源和账号权限复核，引用仍回读当前原文。真实 WR3000 补充 0 份新文档，开发/验证集主路遗漏的 16 道路由题恢复 0 道；跨账号与撤销来源均被拒绝。该结果不满足答案或精确引用质量门槛，生产主路未切换，300 题 Gold 与锁定 50 题仍待人工核对和对照。

> **MA23 — 2026-09-23 邮箱工作台与布局（已确认）。** 用户要求：连接邮箱收缩到顶部栏，不固定为阿里邮箱和只读；支持其他及多个邮箱、逐邮箱自定义名称与只读/可发信；私有学习候选与待审核内容可批量审核，页面固定不向下无限滚动、内容分页；市场概览去除“全部国家”外层多余国家框；左侧边栏完全收起时主页面接近占满宽度。用户另行确认本次“其他邮箱”先支持标准 IMAP/SMTP，不包括 OAuth。

> **MA23 追加确认（同日）。** 用户要求侧栏“市场与线索 / 客户开发 / 知识库”的图标与文字对齐，并按使用逻辑调整“知识库 → 资料”；“不允许无限向下滑动”是产品前端设计的硬性要求。该规则适用于产品前端所有页面；本阶段先把正在修改的邮箱与资料工作区做成固定高度、内部滚动与分页，其他既有页面仍须按此规则继续审计，不能据此宣称全站已验收。

> **MA23 范围追加确认（同日）。** 用户要求“知识库 → 资料 → 资料列表 → 范围”增加“全部，包含所有知识”，并确认“全部”只汇总三类资料（我的私有知识、共享知识、公共证据库），不把独立管理的个人长期记忆混入资料列表。已批准邮箱知识作为私有知识文档包含在“我的私有知识”中。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA23-01 | “客户开发 → 邮箱”中将连接/管理邮箱收纳到顶部栏；同一账号可连接多个不同地址，逐邮箱设置自定义名称与“只读/可发信”。本次其他邮箱采用标准 IMAP/SMTP + 客户端专用密码，OAuth 不在本次范围。 | 顶部弹层、多邮箱列表、通用服务器配置、逐邮箱权限、加密凭据和 SMTP 验证已实现；旧账号默认只读，主动选择可发信时重新验证 SMTP，无 SMTP 配置须重新连接。 | 迁移 105、全量单测、构建及桌面/手机隔离浏览器检查通过；真实第三方邮箱互通和发信未验收。 |
| MA23-02 | 私有学习候选及待审核内容支持选择当前页后批量处理；邮箱工作台固定在视口内，列表内部滚动并分页，不让页面无限向下延长。 | 服务端分页学习队列/候选列表、批量候选审核、现有最多 5 封明确授权的邮件学习批次、固定高度双页签布局已实现。 | 相关单测与桌面/手机隔离浏览器用例通过；真实 Kimi 学习未触发。 |
| MA23-03 | “市场与线索 → 市场概览”右上角只保留“全部国家”下拉选择，不再显示外层多余“国家”框。 | 通用工具栏国家筛选改为单个可访问下拉框。 | 类型/Lint/构建通过；实际市场概览页面视觉验收未执行。 |
| MA23-04 | 左侧边栏整体隐藏时，主页面使用全部或接近全部可用宽度，避免两侧大片留白。 | 隐藏状态下取消工作区最大宽度，保留自适应小边距；对话首页原有全宽处理不变。 | 浏览器隔离布局用例验证邮箱工作区宽度，其他业务页面尚未逐页视觉验收。 |
| MA23-05 | 产品前端不允许因无限列表/堆叠板块而使整页持续向下延长；长内容必须在有限工作区中使用分区、内部滚动和明确分页。这是全产品设计硬约束。 | 本阶段已在邮箱、知识库资料工作区实施；其他既有页面尚未逐页审计，状态为部分实现。 | 邮箱、资料桌面/手机隔离浏览器用例通过；全站验收未完成。 |
| MA23-06 | 左侧栏“市场与线索”“客户开发”“知识库”三项文字与左侧图标垂直对齐。 | 统一导航网格列宽与文字居中，不使用逐项位移。 | 桌面浏览器三项中心偏差均不超过 2px；手机布局通过。 |
| MA23-07 | “知识库 → 资料”按使用逻辑组织，避免资料列表、邮箱知识、个人记忆和上传连续纵向堆叠。 | 资料列表/邮箱知识/个人记忆用分区切换，上传为独立分区；资料与记忆每页 12 条、邮箱知识每页 8 条，工作区固定高度并内部滚动。 | 分页服务测试及桌面/手机隔离浏览器用例通过；真实资料长文本和上传流程未重测。 |
| MA23-08 | “知识库 → 资料 → 资料列表 → 范围”增加“全部”，统一列出当前用户私有知识、共享知识和公共证据库；个人长期记忆不混入。 | 服务端按所有权/共享/公共证据权限合并查询、搜索与分页；前端标注来源，阅读按原始范围取文，私有资料可管理、共享和证据只读。 | 实际数据库联合 SQL 执行成功、服务测试与隔离浏览器选项测试通过；真实多类型混合数据页面未验收。 |

[MA23 验收记录](MA23_MAILBOX_LAYOUT_ACCEPTANCE_2026-09-23.md)。

> **MA22 — 2026-09-23 邮箱同步范围（已确认）。** 用户要求：“把每次同步量降到100封，并且日期缩小到近半年”。本次将“近半年”实现为默认最近 180 天；该具体换算属于实现选择，用户原话未指定天数。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA22-01 | 当前账号的邮箱页面和主 Agent `mail_sync`：每次同步最多 100 封；未指定日期时默认为最近半年（实现为 180 天）。手动指定 `from` / `through` 的历史范围仍可使用，单次 100 封上限仍生效。 | 已收紧输入 Schema 与服务端上限，并更新页面提交与文案、Agent 工具描述。 | 聚焦边界测试 3 项、类型检查与定向 Lint 通过；真实 IMAP 同步未验收。 |

> **MA21 — 2026-09-22 对话历史操作与当前项提示（已确认）。** 用户要求在每条对话历史右侧提供展开操作，至少包含删除该对话和查看技术流水，并参考 ChatGPT 的历史菜单交互；当前对话以透明浅紫色选中效果突出。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA21-01 | 对话历史每条右侧提供展开菜单，包含删除该对话、查看技术流水；当前对话以半透明浅紫色标识。 | 已实现右侧更多菜单、只读技术流水弹窗和 `rgba(226,214,255,.72)` 当前项；重命名、删除二次确认、进行中任务禁删及保留审计为实现边界。 | 桌面与手机隔离浏览器用例、本地迁移与隔离数据库检查通过；见 MA21 验收记录。 |

[MA21 acceptance evidence](MA21_CONVERSATION_HISTORY_ACCEPTANCE_2026-09-22.md).

> **MA20 — 2026-09-22 对话内任务呈现与确认减法（已确认）。** 用户明确要求：执行记录不放在对话顶部，不强制展示业务流程；必要的简短状态或继续确认放在相应用户对话记录下方，顺着对话向下滚动；交互中减少不必要的确认次数。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA20-01 | 主对话界面不在消息顶部常驻执行记录；必要状态、异常和待确认内容跟随发起该任务的用户消息，技术事件按需展开。 | 已按保存的 `runId` 定位任务卡；完成任务默认不占消息流，旧无关联任务在消息末尾兜底。 | 桌面/手机隔离浏览器用例通过；真实长期任务交互未重跑。 |
| MA20-02 | 减少无需用户决策的交互确认，保留真正需要授权的发送、删除、正式发布等动作。具体免确认环节按现有读写与费用边界实施，不把泛泛的“减少”解释为取消全部付费或数据外发门禁。 | 普通公开 `web_search` 与单渠道搜索改为只读工具；取消旧线索卡上的第二次浏览器确认；主 Agent 避免为同一精确批准重复请求计划确认。 | 工具分类单测、类型检查、定向 Lint、生产构建通过；真实供应商调用未重跑。 |

[MA20 acceptance evidence](MA20_CONVERSATION_APPROVAL_ACCEPTANCE_2026-09-22.md).

> **MA19 — 2026-09-22 外部 HTTP API 网络路径（已确认）。** 用户明确要求：“除了GLM,Kimi,Deepseek,阿里云百炼兼容接口以及非HTTP API和需要按需条件连接的，其他都改为经过本地代理连接”。MA18 的模型专属分流仍作为历史决策保留；本规则扩展固定外部 API 的代理范围。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA19-01 | 产品运行时固定外部 HTTP API 中，GLM、Kimi、DeepSeek 和阿里云百炼兼容接口保持直连；其余连接经本机代理。非 HTTP API 及需要按需条件连接的公开网页、Skill 来源、可选联系人与观测服务不纳入本次改路由。OpenRouter 按实际模型区分：`z-ai/glm-*`、`deepseek/*`、`moonshotai/*` 直连，其他模型及无法确定模型的网关请求走代理。Gemini 使用 `GEMINI_PROXY_URL`，其余固定搜索、证据及 OpenRouter API 使用 `MODEL_PROXY_URL`；代理缺失或无效时不得静默直连。 | 已实现统一传输层、固定搜索/证据服务和历史 Batch 回执分流；本地代理地址仍只在未跟踪环境文件中。 | 77 项相关单测、TypeScript、定向 Lint、diff 检查通过；未进行付费调用或各提供方真实连通性重测。 |

[MA19 acceptance evidence](MA19_API_NETWORK_ROUTE_ACCEPTANCE_2026-09-22.md).

> **MA18 — 2026-09-22 模型网络路径（已确认）。** 用户明确要求：“默认调用GLM模型是直连，调用Gemini、Claude、Openai模型时通过代理。”本规则适用于产品运行时模型调用；OpenRouter 网关的请求按所选模型区分，不因共用网关而统一走一条路径。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA18-01 | 产品运行时调用 GLM 模型直连；调用 Gemini、Claude、OpenAI 模型通过本机代理。OpenRouter 上 `z-ai/glm-*` 走直连，`anthropic/*` 与 `openai/*` 走代理；Gemini Google API 走代理。要求代理的请求在代理缺失或无效时不得静默直连。其他提供方及只读元数据请求不改变路径。 | 已实现产品付费请求的模型分流及历史 Batch 收据读取路径；本地代理端口由未跟踪环境文件配置。 | 路由与完整单测、类型/Lint、Sol/GLM 只读端点、密钥及服务健康检查通过；付费 Sol 推理未执行。 |

[MA18 acceptance evidence](MA18_MODEL_NETWORK_ROUTE_ACCEPTANCE_2026-09-22.md).

> **MA17 — 2026-09-22 主 Agent 交互模型路由（已确认）。** 用户明确要求“换成 GLM 5.3 模型，不使用 batch 模型”。工具定义直接提供与小模型预选工具是讨论中的备选方案，尚未确认实施选择。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA17-01 | 新创建的主 Agent 对话任务使用 OpenRouter `z-ai/glm-5.3` 的同步聊天调用，不使用 `:batch`；本地已配置的提供方仍为 `fireworks`。既有运行按创建时保存的模型配置继续，不能因切换默认值重发或改写已提交批次。 | 默认模型、示例配置与本地非密钥配置已切换；异步 Batch 代码保留用于既有任务。 | 无付费同步协议测试、全量单测、类型/Lint/生产构建、服务和资源健康检查通过；真实同步回答质量及延迟需单独实测。 |

[MA17 acceptance evidence](MA17_GLM_SYNC_ACCEPTANCE_2026-09-22.md).

> **MA16 — 2026-09-21 主 Agent 统一对话入口（已确认）。** 用户确认“现在所有的对话入口都应该是主agent”，并明确“知识问答也走主 Agent”。下表分别记录确认、实现和验收，历史 MA11 配置控制与旧 Kimi/RAG 入口保留在版本历史中，不视作当前产品入口。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA16-01 | 新对话、历史对话继续提问和知识库“知识问答”均进入同一主 Agent；管理员和普通账户一致，不依赖 `MAIN_AGENT_ROLLOUT`。历史对话仍按账户所有权恢复，首次发送才创建新记录。 | 消息 API 统一入队持久化主 Agent；旧同步 Kimi 分支和 rollout 开关已移除。 | 本地生产 API/数据库入队与历史续接、全量测试/类型/Lint/构建、单实例 worker 启动通过；真实模型结果未在本轮验收。 |
| MA16-02 | 知识问答选中的行业／公司／产品范围随任务保存并约束检索；答案、来源、进度和异常在对应对话中显示，刷新后可恢复。旧专用问答入口不再执行旧图。 | 知识页提交主 Agent 任务后打开对话；检索工具使用保存的范围，限定可见工具为知识搜索／状态；旧 `/api/rag/query` 兼容请求也入队主 Agent 并返回任务。 | 六组隔离浏览器交接、范围强制单测与本地生产兼容 API 通过；答案质量和真实模型回执未在本轮验收。 |


[MA16 acceptance evidence](MA16_MAIN_AGENT_ENTRY_ACCEPTANCE_2026-09-21.md).

> **MA15 — 2026-09-21 前端精简与半透明紫色视觉改造（已确认）。** 本轮确认覆盖此前 MA15 未确认提案；历史决定保留在 Git。稳定子规则见下表，范围包括前端、路由、全局模式 API/Agent 和数据库历史兼容。确认不等于实现或验收。

| ID | 确认的精确规则与范围 | 实现状态 | 验收状态 |
| --- | --- | --- | --- |
| MA15-01 | 画布 #F5F4F8；正文表面白色 96%–100%；导航 rgba(239,232,255,.80) 与 12px 模糊；主要操作 #7653D6；正文 #29233A、次级 #655F75；线 rgba(102,80,153,.18)。正文/输入 16px、导航 15px、辅助 14px、元数据至少 13px、行高 1.6；桌面控件至少 40px、移动至少 44px。成功/警告/错误独立色；无持续闪动。 | 已实现统一变量、详细页字级与应用布局 | 六组布局/截图及对比度检查通过，缩放边界见验收记录 |
| MA15-02 | 侧栏仅一个新对话、市场与线索、客户开发、知识库、对话历史、帮助、账户与设置；桌面宽 248px 可收起，小于 960px 抽屉。市场三个页签共用国家；客户开发为机会/开发信/邮箱，公司和国家随 URL 保留，邮箱连接/学习为账户范围。帮助含任务记录/使用说明，账户含信息/Agent 设置/退出。删除伪全局切换、重复头像、快照及装饰英文小标题。 | 已实现导航和功能页 URL | 六组浏览器导航/URL/移动焦点回归通过 |
| MA15-03 | 无常驻对话导航，功能页返回当前/最近对话，没有则新对话；首条消息才创建记录；草稿在应用内存保留，消息/凭据不入 URL；旧市场/任务/对话深链接继续有效；刷新仅当前页，保存失败可重试。实时线索入口更名查看已保存线索。 | 已实现并修复快速国家切换竞态、失效历史返回 | 六组新对话/历史/跨页草稿/刷新/后退通过 |
| MA15-04 | 知识库默认资料列表，资料/知识问答/权限审核三个页签；上传按需打开、进度留在资料区；宽阅读有返回，去掉固定管线；容器最大 1440px、长正文约 800–880px、表格自身横滚；问答单列、答案优先、引用可展开。 | 已实现默认资料、全文读取、按需上传、问答引用折叠及角色审核 | 类型/Lint、全文账户隔离及长正文/表格六组回归通过 |
| MA15-05 | 对话合并重复页头；批准卡直接显示最终业务动作、收件人/正文/附件/删除对象；工具参数、事件/原始回执可展开，保留来源与真实状态；客户开发无公司时有选择入口。 | 已实现公司选择入口和批准业务字段/原始详情 | 真实批准 API、暂停状态保留、模拟断线恢复及六组布局通过 |
| MA15-06 | 全局市场 mode 从 DTO/页面/写入服务/可发现工具中删除；旧写请求明确能力已移除，旧待执行调用返回废弃错误。旧列允许空、无默认、新记录不写；历史任务/审计保留。新路径记忆只用明确业务目标，缺失留空。 | DTO/UI/服务/工具目录已移除，迁移 103 已在本地应用 | 21 项相关单测、类型检查、工作区和审计隔离脚本通过；历史值保留、新记录为空 |
| MA15-07 | 四阶段聚焦提交与推送；隔离本地验收 1366×768、1440×900、390×844，100%/125% 缩放；路由/恢复/权限/批准/键盘/触控/对比/溢出/隔离/单测/类型/Lint/构建/资源检查；重建前停旧服务，启动后单实例。 | 四阶段实现与验证完成 | 构建/静态资源/单测/相关隔离通过；原生缩放及旧 RAG 脚本边界见验收记录 |

完整证据及未覆盖边界见 [MA15 验收记录](MA15_UI_ACCEPTANCE_2026-09-21.md)。


> **MA14 — 2026-09-21 confirmed acceptance scope.** 用户原话：“暂不设置真实业务结果验收，用本地数据模拟验收”。适用范围为当前 MA11 主 Agent 剩余产品流程的阶段验收：暂不要求工作账户产生真实评分、联系人核验、发信或新知识发布等业务结果，改用本地隔离数据、合成产物和受控外部效果替身验证实际服务、工具、权限、持久化、回执、缺项与重复执行边界。不得把模拟输出称为真实模型质量、真实外发或工作账户发布；既有八条 GLM Batch 记录和历史门槛证据保留。确认状态：已确认；实现状态：本地模拟路径已接入；模拟验收状态：本地克隆的评分、联系人、跟进、二进制登记及既有知识发布边界已通过，80/40 历史回放保持通过，详见 [工作流](MAIN_AGENT_WORKFLOW.md) 和 [验收记录](MAIN_AGENT_ACCEPTANCE.md)。

> 2026-09-21 MA11 implementation follow-up: the existing shared RAG v3 release preflight and atomic activation are now exposed as administrator Agent tools with exact approval, an observed release ID and manifest hash. The executable catalog has 96 tools. The configured local source currently has an active 281-asset release; this stage did not build or activate a new release. This is implementation and read-only gate evidence under MA11, not a new confirmation or full product acceptance.

> 2026-09-21 MA13 confirmation: from this decision onward, development stops tracking cost and maintaining the efficiency ledger, and no expense report is generated automatically. Product-flow completion and result quality become the primary engineering and compute priorities. Historical records remain historical evidence; implementation and acceptance are separate.

> 2026-09-21 MA11 implementation follow-up: the executable catalog now contains 94 tools after adding persisted contact-enrichment reading, exact-approved shared binary registration, staged contact verification and standalone formal score publication, and extending account-owned follow-up drafts. This is implementation evidence, not a new rule or complete workflow acceptance; active RAG v3 release and live quality gaps stay explicit in the capability matrix.

> 2026-09-21 MA11 confirmation: this milestone verifies the main Agent architecture and existing product workflows. It supersedes MA09's **current P6 acceptance and release scope only**; MA09 remains in history. Implementation and acceptance evidence are tracked separately in [the workflow](MAIN_AGENT_WORKFLOW.md) and [acceptance log](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-21 MA12 confirmation: the user explicitly authorized the eight MA11 private-data model verification tasks described in the approval question. This is authorization for the stated verification transfer, not evidence that any Batch was submitted or completed.

> 2026-09-21 MA05/MA09 implementation follow-up: the main Agent and existing task-usage page now share a read-only 30-day account usage service. It reports operational, HTTP reservation and workflow/model observations as overlapping ledgers, preserving unknown bills and unknown customer adoption. Four new isolated PostgreSQL checks passed (134 total); complete cost/release acceptance remains pending. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 MA02/MA06 implementation follow-up: the Agent can browse private/shared/public-evidence library items, read private document revisions and upload-job states, and request exact-approved deletion of one owned private document bound to its current content hash. The legacy page and Agent now share the library/revision/deletion service; the page still uses its previous confirmation flow. Ten new isolated database checks passed (130 total); full P2/P6 acceptance remains pending. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 MA06/MA08 implementation follow-up: task list and task detail now retain standalone outbound mail with no company or market link, showing a null company instead of inventing one. Five new isolated database checks passed (120 total); no SMTP send occurred. This closes a visibility defect, not the remaining mail/recovery or release acceptance. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 MA02 implementation follow-up: the main Agent can read a saved formal company assessment with its scoring policy version and list that company's linked mail metadata through the same owner-scoped services used by the existing pages. Reading does not publish a score or disclose the mail body. Eight isolated PostgreSQL fixture checks passed; P2/P6 acceptance remains open. [Evidence](MAIN_AGENT_ACCEPTANCE.md).

> 2026-09-20 MA07 implementation follow-up: account-owned versioned memories can be inventoried, deactivated and restored with version/update-revision checks; historical private outreach memories can be archived/restored and deleted through their existing audited service with an update-revision check. Main-Agent historical deletion has a destructive effect and requires exact central approval; model input cannot supply the server confirmation flag. Twenty-two new isolated database checks passed (115 total). Account business decisions and global policies use separate exact-approval tools, with global changes restricted to administrators. This is partial lifecycle coverage; full MA07/P5 acceptance remains open.

> 2026-09-20 MA07 implementation update: the main Agent now reads active historical shared distribution policies as scoped defaults and can search account historical preferences/company decisions with original provenance and usage restrictions. This does not create new mandatory policies or assert historical human confirmation. Ninety-three isolated database checks and 1,267 regression assertions passed; complete P5/P6 acceptance remains pending. [Evidence](MAIN_AGENT_ACCEPTANCE.md).


## MA - Main Agent product rules (confirmed 2026-09-20)

MA07 undo-lineage follow-up (implementation, not a new rule): newly saved memory versions record their actual predecessor and its active state. Undo after a previous undo restores that state, rather than reviving a discarded intervening version; history and original sources remain stored. Older versions without predecessor metadata retain the historical sequential fallback because their original branch state cannot be reconstructed reliably. Eighty isolated database checks passed, including ten new branch/inactive/stale-notification checks; this is not full P5 acceptance.

Latest explicit decision, MA10 (2026-09-20): user said “改用Openrouter网关的GLM 5.3(batch)模型”. Main-model default is now OpenRouter `z-ai/glm-5.3:batch`; the official current batch endpoint is Fireworks (`fireworks`). This supersedes **only MA01's Sol default**, not specialist model routes, scoring, permissions or the administrator's ability to configure future defaults. The user-authorized alternative-model diagnostics use public synthetic inputs. Batch transport/configuration implementation and real result acceptance are pending at this confirmation checkpoint. OpenRouter's batch protocol has a 24-hour completion window and applies account data policy; it accepts `provider.only` but rejects synchronous provider preferences. The existing rule and prior failed probes remain historical evidence, not a reason to keep the old default.

MA10 implementation update: the code default, example configuration and local non-secret main-model/provider configuration now select GLM/Fireworks. Migration 097 and the durable batch transport/poller are implemented. The real two-item public batch passed text and exact tool-argument checks (199 input / 22 output tokens, reported US$0.00018314, 680 seconds). Unit/database recovery checks passed. A separate real public synthetic main-Agent flow completed both discovery and final synthesis turns after exact-ID recovery, using 6,948 input / 668 output tokens at reported US$0.00632807; private inputs and sends were zero. The P0–P6 release gates remain pending. See [route evidence](MAIN_AGENT_MODEL_ROUTE_2026-09-20.md).

MA05 implementation follow-up (not a new rule): in observation mode, an owned paid call can record a later verified cost observation even if the account has never created a legacy budget row. Isolated PostgreSQL verification passed; the remaining MA05 acceptance and release gates are still pending.

MA04 implementation follow-up (not a new rule): the standard digest-pinned Docker sandbox image now builds and passes real isolated Python and Node script tests. Playwright, external browser control and remaining Skill import modes are still pending; this is not P4 acceptance.

MA04 source-import follow-up (not a new rule): public HTTPS `SKILL.md` URLs and public GitHub repository directories now use a bounded, DNS-pinned fetcher; Git refs resolve to commit SHA and each downloaded blob is verified before immutable version storage. Existing account/global scope and publication confirmation apply. Private or non-GitHub repositories, browser and MCP are still pending, so P4 remains incomplete.

MA02 implementation follow-up (not a new rule): existing administrator fact-review list and exact verify/retain/reject/correct decision are now discoverable as separate tools. The Agent tool and legacy page share input schemas and the same RAG v3 review repository; the decision is administrator-only and goes through exact execution approval. This does not activate a release, settle the other knowledge administration routes, change scoring, or constitute P2/P6 acceptance.

MA02/MA08 company-state implementation follow-up (not a new rule): `company_read` now returns the saved market-state revision; `company_state_update` validates selected editable fields and checks that revision while holding the company row lock. A concurrent edit causes a stale-result error before any update. The legacy page shares field validation and service but does not yet submit its own expected revision, so this is only Agent-side concurrency protection, not full P2/P5 acceptance.

MA02/MA08 page follow-up (not a new rule): the existing company editing page now receives the market-state revision, submits it with each patch, and refreshes without blind replay on HTTP 409. The shared service returns the next revision after a successful write. This supersedes the immediately preceding implementation gap for the page; other company write paths and full P2/P5 acceptance remain unverified.

Source: the complete P0-P6 plan supplied by the user for implementation. Confirmation is NOT implementation or acceptance evidence. Historical rules remain below; only the explicit supersessions in this table apply. See [implementation workflow](MAIN_AGENT_WORKFLOW.md).

MA06/MA08 implementation update: original mail-page final confirmation now persists exact approval before enqueueing deterministic LangGraph delivery. Per-leaf locked instruction checks and safe-boundary restart are implemented. 70 isolated database assertions and 1,239 local regression assertions passed; actual SMTP acceptance remains pending.

Implementation update (2026-09-20): MA01/MA03/MA08 have an opt-in persistent main-loop foundation; MA02 has 49 registered tools, still partial coverage; MA05/MA06 have shared observation mode, exact single-action approval and unassociated attachment mail foundations. MA04 now has supplied-package Skill import, scope/version pinning and a network-disabled Docker runner; its image build failed and real sandbox execution remains unverified. MA07 has versioned preferences/policies, deterministic scope loading and undo. MA08 adds one-time/interval/weekly timezone schedules with non-overlap; these and the management UI passed synthetic database/browser checks. These are **partial implementations**, not phase acceptance. MCP/API/browser takeover, URL/Git import, unified historical memory, full business-tool coverage and remaining phase gates are pending. MA09 release gate is not met: the real configured main-model route returned HTTP 403. Detailed local/DB/provider evidence is in [acceptance log](MAIN_AGENT_ACCEPTANCE.md).

| ID | Exact confirmed behavior and scope | Supersession | Implementation / acceptance |
|---|---|---|---|
| MA01 | Open-ended product main Agent; no business-scenario allowlist. Quality-first unified main model defaults to OpenRouter `openai/gpt-5.6-sol`, administrator configurable. Remove lightweight intent classification, complexity escalation and regex reclassification from the main path. LangGraph remains the sole business orchestration runtime. | Replaces fixed top-level intent branches; preserves LG runtime and redacted trace boundaries. Specialist models may remain. | Confirmed; pending implementation and acceptance |
| MA02 | Discover and independently compose all business capabilities in any order, inheriting current account permissions. Simplify unnecessary specialist gates. Complete legacy workflows remain optional tools. Preserve formal scoring standards, versions, arithmetic, citations and source contracts; research is not formally qualified output. Do not rebuild/replace RAG v3 data. | Replaces mandatory workflow prerequisites, not quality/scoring contracts. | Confirmed; partially implemented (53 adapters including administrator fact review and versioned company edit); full capability and release acceptance pending |
| MA03 | Necessary private policies, documents and mail for the current task may enter the administrator-designated configured main model. Credentials never enter prompts. Deny provider data collection by default; no silent unconfigured recipient fallback. Web/external data scope remains separate, with enforced account isolation. | Replaces A30 private-data prohibition ONLY for necessary context to the designated main model; no blanket authorization for other sites/providers. | Confirmed; pending implementation and acceptance |
| MA04 | Skills support instructions, templates, references and isolated scripts; Git, specified URL, uploaded package or supplied instructions. Admin-published Skills are global; member Skills are account-only. Persist source/hash/version/dependencies, update/rollback/disable; pin running versions. Support MCP/API, Gemini web search and isolated browser. Default Docker Linux with Node/Python/Playwright; unavailable sandbox must never fall back to host execution. | New capabilities; no relaxation of tenant, credential or sending boundaries. | Confirmed; pending implementation/acceptance; Docker access not yet verified |
| MA05 | No fixed first-release large-spend amount threshold. AI judges scale, batches, duration, retries and uncertainty, then asks confirmation. Only quote rough amounts/ranges with uncertainty when asked. Missing/stale rates, missing/stale FX and insufficient legacy budgets become warnings/confirmation/records, not automatic ordinary-business denials. Unknown is null, not zero; preserve original currency, estimates and actual bills separately. At most one automatic retry of the same model failure; unknown text-call bills do not freeze all work. Unknown side effects require reconciliation. Keep emergency disable and actual provider rate/balance errors. | Replaces product financial hard admission in A02/A06/A09/A10/A11/A12/A26 and A33 owner-only scope. Preserves historical costs and local acceptance records; does not authorize arbitrary customer mail. | Confirmed; pending implementation and acceptance |
| MA06 | Central risk hook covers built-in/specialist/MCP/Skill/browser operations. Confirm external sending/publishing, important deletion, global mandatory policy/Skill and new connection permissions. Approval binds account/task/action/object/parameter digest/version, supports rejection/revocation/expiry. Single or exact batch mail approval binds final recipients/body/attachments per item; changed items alone invalidate; unknown receipts never auto-resend. Company/market linkage optional for custom mail, without fabricated business state. | Replaces mandatory candidate-company linkage; preserves sending audit and safety. | Confirmed; pending implementation and acceptance |
| MA07 | Unified memory: stable preferences may auto-save with notification and undo; business policies require explicit instruction/confirmation. Company decisions retain source/scope. Load policy deterministically by account/market/company/effective time; semantic retrieval only for relevant experiences. Global defaults may be personalized; explicitly mandatory admin policy overrides personal Skills. | Expands outreach-only memory; inferred facts or external commitments are not policies. | Confirmed; pending implementation and acceptance |
| MA08 | Durable generic tasks and LangGraph PostgreSQL Threads survive page close/reload/disconnect/restart. Lease claiming, persist calls before advancing, never repeat completed calls. Instructions apply at safe boundaries; no-progress saves and explains. States queued/running/waiting_user/paused/partial/completed/failed/cancelled. Scheduling only by explicit user request; account timezone, fallback Asia/Shanghai; non-overlap, no catch-up of every missed recurrence. Every future mail still needs exact content approval. | Extends lead-only persistence; cancellation affects unexecuted work, preserving costs/sends. | Confirmed; pending implementation and acceptance |
| MA09 | P0-P6 stages each require verification, workflow/efficiency docs, focused commit and origin/main push. At least 120 cases: 80 development, 40 locked acceptance; locked E2E >=95%, all boundary/permission tests pass; zero cross-account leaks, unapproved sends, fabricated receipts or duplicate sends. Only human-confirmed Gold; existing locked holdout never tunes implementation. Frozen evidence and real tools measured separately. Admin trial then account rollout then default switch; config rollback retains history. Mark overall complete only after all stages. | New release gates; historic simulated/partial passes do not count as new real acceptance. | Confirmed; pending implementation and acceptance |
| MA11 | Current milestone: verify a main Agent that invokes **existing** product business workflows. Keep existing pages, formal scoring, RAG v3 and account permissions. Put new MCP, network browser and private Git connections in a later phase. `/` is a new-conversation entry; `/c/[id]` opens an owned conversation. One sidebar holds new conversation, history and existing feature entry points; the chat shows durable task progress, sources, artifacts, partial results, true waiting state and exact action approvals. Use saved event cursors for recovery and show GLM Batch queue/execution with elapsed time, without fake token streaming. Use the specified light palette: canvas `#F7F9FB`, message `#FFFFFF`, text `#192A35`, secondary `#60727D`, divider `#DDE5E9`, accent `#176D75`. Preserve **80 development + 40 locked** cases from accessible saved evidence; only record/version/receipt-verifiable outcomes are automatic checks, only 11 reviewed RAG Gold support applicable fact-quality judgments, and neither unreviewed Gold nor the old holdout is an answer key. Replay 120 cases against isolated Graph/worker/tool/persistence with controlled external-send substitutes; report replay separately from actual planning. Run 8 representative tasks through configured GLM Batch and separately report model tool choice, result, cost and latency. Current locked gate: **at least 38/40** architecture/workflow checks, with every cross-account, unapproved external send, fabricated receipt and duplicate-send boundary passing. Report answer quality separately. Keep main entry configuration controlled; passing this milestone does not authorize full account rollout. Every stage records workflow efficiency and verified evidence, then commits and pushes `origin/main`. | Supersedes MA09's P6 gate and release scope **for this milestone**. MA09's original 95%/rollout terms remain historical, not achieved evidence. | Confirmed 2026-09-21; partial UI and lead workflow implemented; deterministic 120 replay passed; eight first model decisions saved under MA12; two read tools executed, final results and overall acceptance pending |
| MA12 | For **the eight MA11 verification tasks**, authorize private account knowledge, mail, drafts and resulting tool outputs to be sent to the configured **OpenRouter / Fireworks GLM Batch** model. The authorization is limited to these eight model-verification tasks and their necessary continuation turns. | Resolves the prior approval block for this exact destination and payload scope. Does not authorize SMTP sending, publishing, deletion, new destinations or full work-account rollout; MA11 acceptance remains separate. | Confirmed 2026-09-21; eight first model decisions saved, final results and acceptance pending |
| MA13 | From now on, do not track development-stage cost or maintain the development efficiency ledger, and do not automatically generate expense reports. Put the main objective and compute effort into completing product workflows and improving result quality. Preserve historical records. Keep only raw operational/provider receipt fields required for durable recovery, duplicate-effect prevention and explicit reconciliation; do not aggregate them into a cost report unless the user explicitly asks. | Supersedes MA09/MA11 stage-efficiency-ledger requirements, D05's permanent development-cost objective, and any standing requirement to automatically summarize expense metrics. It does not weaken permissions, exact approvals, task receipts, idempotency or account isolation, and does not erase historical ledgers. | Confirmed 2026-09-21; working agreement and MA12 verifier updated; broader product-flow and quality work continues |


### KQ04 — RAG v3 全量重建与质量闭环（2026-09-18 起，用户确认架构、复核处置与隔离上线；v3 已激活，Gold/事实复核继续）

用户确认以下六项产品规则及精确值：1）保留 LangGraph、Next.js、PostgreSQL/pgvector、现有 ACL 与成本门禁；2）正文解析采用本地 Docling，默认不外发正文；3）从数据库全部 `registered` 资产构建影子 release，通过完整性、质量、ACL 与 embedding 门禁后用短事务原子切换；4）双模型索引固定为阿里云百炼 `text-embedding-v4` 1,536 维和本地 `BAAI/bge-m3` 1,024 维，两个向量空间不得混合比较；5）无显式属性的双型号比较默认输出“关键差异摘要＋完整共同属性表”，缺失值明确标记未知，冲突、版本不一致和待复核分别显示；6）确定性规则可以自动验证，OCR、冲突和低置信度事实必须进入人工复核。RAGFlow 不进入生产依赖，只可作为未来隔离基准候选。

适用范围是全部当前已登记 PDF、PPTX、XLSX、文本、公司和行业资料，以及生产知识查询、原文件访问、事实、比较、复杂解释、引用、缓存和管理诊断；不得为 WR3000、WR6500H 或其他单一型号硬编码答案。v3 未通过全部门禁前继续由现有 release 服务；旧 v1/v2 保留为回滚证据，不在 v3 激活后参与生产查询。双模型架构确认不构成新的阿里云付费调用授权；任何全量 Qwen 正文外发和费用仍须 dry-run 后单独确认。BGE 与 Docling 首次模型下载单列来源、revision、SHA 与基础设施成本，运行时正文不得发送到下载源。

实施状态不得与确认或验收混写：R0 已补充 300 条分层路由/边界合同、50 个真实目录型号种子、唯一一条“WR3000和WR6500H的区别”回归、比较同义词及默认 profile 解析、零付费只读诊断；250/250 基础动作和实体解析通过。R1 已固定隔离依赖和 943,416,223-byte 本地模型工件集，30/30 代表资料完成本地解析，423 个 unit 生成 577 个 chunk；视觉渲染确认最初 29 个无文本候选均含有效内容。通用 extractor v3.0.3 将其标为 `review-required`，本地二次 RapidOCR 已从 26/29 unit 恢复 9,068 字符候选证据并恢复 P5 端口回归，三项未恢复的是装饰封面/logo；这些候选不得自动 verified。另有 23 个约 500-token 边界 chunk，复杂表格/阅读顺序的完整逐页验收与用户人工结论仍未完成，因此 R1 门禁尚未通过、不得启动全库 embedding。R2 已实际迁移 v3 schema、双维 HNSW、11 表强制 RLS、纯完整性门禁和原子激活函数；数据库 manifest 覆盖 281 个 registered 逻辑资产并按哈希去重为 221 个物理源，全量本地抽取已经以可恢复 checkpoint 启动，但尚未完成、尚未创建 release。事实答案/来源坐标的人工 gold 当前为 0，50 条边界中仍有 30 条解析差异；真实检索、回答、引用、Recall@8、事实重建、双向量生成、运行时切换、UI 与原子激活均未验收。当前真实诊断仍得到 WR3000/WR6500H 事实 0、旧词法 0、活动结构化词法 0；该证据只冻结失败，不代表已修复数据层。

2026-09-18 用户进一步明确“确认并继续”：固定试点中已由本地 OCR 恢复文字的 **26 个精确单元**，仅允许以 `candidate` 证据和 `review-required` 单元状态进入**未激活的影子 release**；它们不得自动成为 `verified` 事实、不得进入 verified-fact 快路径。固定试点中 **3 个精确单元**（`Cudy Profile Company.pdf` 第 1 页，以及两份行业 PPTX 的第 1 张 logo/封面）人工确认为“装饰性封面、无需正文”，记录为带人工决定的 `blank`，不得合成正文。该确认只匹配版本化清单中的 source SHA-256 与 unit 坐标；文件变化、未来封面或新 OCR 项均不继承结论。逐单元精确值见 `config/knowledge/docling-review-decisions.v3.json`。实施状态：规则和机读决策清单已记录；写入 v3 release、复核记录及激活门禁尚未完成，因此该确认不构成 R1/R2 或生产激活验收。

2026-09-18 实施进展（不是新增用户确认）：全量本地抽取已覆盖 281/281 个 registered 逻辑资产、221 个登记源路径（220 份唯一内容工件），产生 1,820 个逻辑 source unit 和 3,008 个 release chunk；building release `889a1b5b-9b45-4695-a9b1-e2f2415a028f` 已创建且活动指针仍为 0。未确认 OCR candidate 被入库门禁全部拦截（0 条泄漏），当前仅原已确认的 26 个单元产生 29 个 candidate chunk。全量视觉复核另形成 33 个 candidate、13 个装饰页的**建议**，记录于 `config/knowledge/docling-review-recommendations.v3.json`，其状态明确为 `recommendation-only-not-human-confirmed`，不得写入确认规则或自动继承。事实层已写入 3,000 条审计记录；WR3000/WR6500H 均已出现可追溯 v3 事实，但冲突复核、300 条人工答案 gold、Recall@8、Qwen 完整性和原子激活仍未验收。Qwen dry-run 为 3,008 个 chunk、28 个可复用旧向量、2,980 个新付费输入、约 484,344 tokens/298 请求、现金费用未知；该统计不构成付费授权，未执行 Qwen 调用。本地 BGE 已达到 3,008/3,008、缺失 0，API 现金成本为 0，CPU/RAM/电力与基础设施成本未知。隔离真实 UI 链路已通过双视口、原件 ACL 和 30 次热路径验证，但不替代剩余质量门禁。详见 [R2 全量抽取与影子 release 证据](KNOWLEDGE_RAG_V3_R2_FULL_EXTRACTION_2026-09-18.md)。

2026-09-18 用户再次明确回复“确认，继续”，同时确认两项精确边界：1）接受 `config/knowledge/docling-review-recommendations.v3.json` 内按 source SHA-256 与 unit 坐标固定的 33 个 `candidate` 和 13 个 `decorative-no-body` 决定；它们与此前 26/3 决定合并为 59 个 candidate、16 个装饰页，仍不得由未来或变化文件继承，candidate 仍不得进入 verified-fact 快路径；2）授权将当前 shadow release 中 2,980 个无法按内容哈希复用的 canonical chunk 正文发送到阿里云百炼 `text-embedding-v4`，预计约 484,344 tokens、298 个十项请求，现金费用未知。授权范围不包括其他供应商、回答模型、不同 release 的新增正文或绕过失败/完整性/ACL/费用记录门禁；28 个完全一致的旧向量优先复用。实施与验收状态须在真实写入后另记，本确认本身不代表 Qwen 成功、账单已知或 release 可激活。

上述确认实施状态：59/16 精确决定已重放，全量 extraction 为 1,684 success、17 blank、59 review-required，0 failed；影子入库现为 3,062 chunks、83 candidate chunks、0 unit open review、0 unaccepted candidate chunks。本地 BGE 已补齐 3,062/3,062。事实重建为 3,053 条（1,180 verified、870 candidate、1,003 conflicting），产生 1,808 个事实复核项。最终 canonical corpus 的 Qwen dry-run 为 28 条可复用、3,034 条需新调用、约 497,611 tokens；为不扩大原确认，执行器新增硬上限，只计划 2,980 条、约 487,099 tokens、298 请求并保留其余 54 条。首次沙箱内请求在 16 ms DNS `ENOTFOUND` 阶段失败，0 供应商生成向量；保守预留经精确本地无外发证据追加为 `verified-unbilled` 后释放。沙箱外执行审批随后拒绝，未产生第二次请求。因此当前 Qwen 为 28/3,062（全部复用），仍不得激活。

2026-09-18 用户对最终外发风险说明回复“确认”，明确授权将 v3 影子 release 中尚未向量化的 **3,034 个 canonical chunk 正文**发送至**阿里云百炼北京端点**，使用 `text-embedding-v4` 生成 1,536 维向量；范围包含当前已登记并进入该影子 release 的产品 datasheet、公司、行业及培训资料正文，预计约 **497,611 tokens、304 个请求**，现金费用未知且可能产生实际费用，并授权在沙箱外联网执行。该授权覆盖复核后新增的 54 条，取代此前 2,980 条执行上限；不包含其他 release、供应商或回答模型，也不放宽 ACL、完整性、失败停止、账本与原子激活门禁。实施成功、实际 tokens、请求数、费用和下游采用仍须执行后另记。

最终 Qwen 授权实施状态：沙箱外批处理成功生成 3,034/3,034 个新向量，连同 28 个内容哈希一致的复用向量达到 Qwen 3,062/3,062；BGE 同为 3,062/3,062，双向量缺失均为 0。Qwen 运行 `cbe5af40-82b2-4356-ad3e-8faf9b381660` 实际记录 581,005 输入 tokens、304 请求、157,515 ms 累计调用延迟、0 重试、3,034 valid vectors；现金费用仍未知，304 个 HTTP 账本条目均有有效输出但未返回可核销现金金额，保守预留总额 USD1.949248 不是实际账单。发现百炼原始 usage 只给 `total_tokens` 时逐调用账本未记 input tokens，适配器已补充该安全 fallback 并新增回归测试；本次真实总 tokens 仍由 embedding run 完整保存。release 仍为 `building`、活动指针 0，因 1,808 个事实复核项和人工答案/来源 gold 等门禁未完成而不得激活。

KQ04 事实冲突实现修正：冲突身份现在严格包含实体、文档版本、市场和属性；注册表类型为 `*-set` 的属性再包含具体集合成员。因此不同版本/市场显示为版本差异而非冲突，`frequency_band`、`poe_standard`、`vpn_role`、`ethernet_speed`、`cellular_generation` 和 `policy_condition` 等合法多值集合不会互相冲突，同一版本/市场/集合成员的极性矛盾仍保留。设备尺寸与包装尺寸分别登记为 `dimensions` 和 `package_dimensions`，避免把包装规格当成设备冲突。通用重建后 3,053 条事实为 1,953 verified、1,091 candidate、9 conflicting，open fact review 从 1,808 降为 1,029；其中 1,020 条低置信度和 9 条真实冲突均未被自动确认，release 仍为 `building`、活动指针为 0。
2026-09-18 用户回复“好的，按照你的建议实现”，确认 KQ04 管理端复核中心的精确落点与边界：入口位于现有“知识库 & RAG”页面的 RAG v3 release 状态卡之后；包含“事实复核”和“Gold 审核”两个页签；事实复核显示原文、型号、版本、页/slide/sheet/表格坐标并支持确认、保留 candidate、拒绝和纠正；Gold 覆盖 300 条问题并记录正确答案、正确来源及坐标；development/validation 完成并冻结检索配置前不得打开 holdout；所有决定记录审核人、时间、备注和版本，且普通成员不可读写共享审核。实施状态：migration 088、管理员 API、双栏工作台、Gold 版本记录和激活硬门禁已实现并通过真实数据库及桌面/移动浏览器验收；实际审核仍为事实 0/1,029、Gold 0/300、holdout 锁定，因此不构成 release 激活确认。[证据](KNOWLEDGE_RAG_V3_R6_REVIEW_CENTER_2026-09-18.md)

2026-09-19 用户在收到精确变更提案后回复“允许”，确认 KQ04 隔离上线规则：完整 v3 manifest、全部文档/OCR 终态、双向量完整和 ACL 仍是不可绕过的激活门禁；open fact review 不再阻止 release 激活，但必须在事实快路径及混合检索的结构化事实通道中硬隔离，不能进入确定性回答；Gold 可在上线后继续审核，holdout 保持锁定且不得用于调参或宣称质量验收。该规则只替代 2026-09-18 复核中心确认中的“全部事实复核与 300 条 Gold 完成后才可激活”部分，其余审核、版本、权限和证据要求不变。实施状态：migration 089 已应用，release `rag-v3-shadow-2026-09-18` 已原子激活，活动指针 1；281/281 资产、Qwen/BGE 3,062/3,062、文档 review 0，1,029 个未决事实隔离，Gold 11/300、holdout 0/50 锁定。[证据](KNOWLEDGE_RAG_V3_ACTIVATION_2026-09-19.md)

### KQ01 — 知识问答与资料访问按通用问题分阶段优化（2026-09-17，用户明确范围与实施授权；P0–P8已实施并完成本地发布验收）

用户先提出简单规格查询应在检索后简单处理、打开 datasheet 应返回原文件链接，并要求审查意图、检索、语义预处理与切片；随后明确：“这里WR3000仅仅是一个例子，审查类似问题并一并生成优化方案。给出实际的计划和步骤，后续我会让成本更优的sol或者Terra模型按照plan优化代码”。本轮又明确：“读取 docs/KNOWLEDGE_RETRIEVAL_OPTIMIZATION_PLAN_2026-09-17.md，从 P0 开始按阶段实施。每阶段验证、更新记录并提交推送；不要针对 WR3000硬编码”。确切范围为通用知识请求、原文件访问、不同型号/版本/属性、公司与行业材料，以及共用检索/切片的关联入口；禁止把某个型号的特判当作通用优化完成。Sol/Terra 指后续实施者模型，不构成产品运行时供应商切换确认。

已形成并执行[通用知识优化实施交接计划](KNOWLEDGE_RETRIEVAL_OPTIMIZATION_PLAN_2026-09-17.md)。P0–P8已完成评测、证据边界、受控原件、结构化语料代、verified 事实合同、共享知识图、检索修复、版本绑定缓存/遥测/回退命令及本地发布回归，详见[P8发布证据](KNOWLEDGE_RETRIEVAL_P8_RELEASE_2026-09-17.md)。用户随后明确回复“开始”，授权启动 v2 向量生成及验证通过后的原子激活；在配置、预算和供应商资格问题依次解决后，10,871个切片向量已完整写入，冻结离线评测、知识/RAG测试和类型检查通过，generation `3917a242-724e-4e36-a1da-04c496a9df2d` 已原子激活。历史事实未删除；复杂 live 生成质量、供应商现金账单和实际用户采用仍未知，不能把离线门禁写成这些边界已通过。计划默认保留 C14 的轻量意图识别；完全本地优先意图的例外尚未确认。A30/A33/A34及LG02/LG04/LG05继续有效。

P2此前明确延期的PDF/PPTX/XLSX受控上传与异步提取job现已补齐：原件按用户隔离保存，HTTP不等待解析，本地worker生成待审产物且不自动公开、索引或向量化；文本JSON入口保持兼容。迁移082、29项知识/API测试、TypeScript、生产构建和真实44页PDF本地提取均通过，详见[P2证据](KNOWLEDGE_RETRIEVAL_P2_EVIDENCE_2026-09-17.md)。

### KQ02 — 允许十个知识库切片发送至阿里云百炼生成向量（2026-09-17，用户明确确认；已执行并验证）

用户明确确认：“我明确允许将这10个知识库切片正文发送到阿里云百炼生成向量，并接受可能产生的费用”。确切范围仅为本次十个切片、阿里云百炼 `text-embedding-v4`、1536维向量及其可能费用；不自动扩展为剩余语料或其他供应商/模型。执行结果为10个输入、10个有效且写入的向量、1次embedding调用、1,567输入tokens、847ms供应商调用延迟、零重试；现金费用仍未知。影子代保持validated且未激活，剩余10,861个向量需要另行明确授权。详见[十项批次证据](KNOWLEDGE_RETRIEVAL_V2_EMBEDDING_BATCH_2026-09-17.md)。

### KQ03 — 允许剩余10,861个知识库切片发送至阿里云百炼（2026-09-17，用户明确确认；已完成并激活）

用户明确确认：“我允许将剩余10861个知识库切片正文发送到阿里云百炼，并接受可能产生的费用”。范围不含其他供应商或模型，也不取消预算、费用、证据与失败停止门禁。首轮成功写入2,650个新向量后收到百炼 `403 AccessDenied.Unpurchased` 并停止；用户随后确认“已充值成功，继续”。恢复探针10项成功，之后剩余8,201项全部成功，连同KQ02共10,871/10,871个向量可用、缺失0。恢复阶段新增1,917,640输入tokens、566,031ms、822次embedding调用、零重试；完整性、冻结离线评测、知识/RAG测试和类型检查通过后，generation `3917a242-724e-4e36-a1da-04c496a9df2d` 已原子激活。现金费用仍以百炼账单为准，复杂live生成质量与用户采用未知。详见[全量执行证据](KNOWLEDGE_RETRIEVAL_V2_FULL_EMBEDDING_ATTEMPT_2026-09-17.md)。

### LG05 — 允许 LangGraph 向 LangSmith 发送脱敏 trace（2026-09-17，用户明确确认；已配置并通过云端脱敏验收）

用户先确认“允许LangGraph trace”，在获知即使隐藏正文仍会外发节点名、父子关系、分支、时间、状态和错误类别等元数据后，又明确回复：“我允许 LangGraph 服务向 LangSmith 发送上述 trace 元数据，输入和输出正文继续隐藏。”范围为本机独立 LangGraph Agent Server 的 `runtime_health`、`assistant_workflow` 和 `lead_workflow` 运行轨迹，可向用户已配置密钥对应的 LangSmith 工作区发送上述元数据，并归入 `network-channel-copilot-local` 项目。为继续满足 A30，强制 `LANGSMITH_HIDE_INPUTS=true` 与 `LANGSMITH_HIDE_OUTPUTS=true`：不向 trace 后端发送用户消息、提示词、对话历史、知识正文、公司证据、业务状态正文或最终答案正文；API 密钥、凭据和本地环境变量值始终不得作为 trace 数据或提交内容。该确认不授权关闭输入／输出隐藏，也不授权新的 SMTP、模型或搜索调用。

Git 忽略的本地配置与无密钥示例配置均已显式启用 tracing 并设置隐藏开关。服务以相同回环监听方式在获准网络环境重启后，只运行一次零模型／零搜索健康图；LangSmith 回查得到 `LangGraph`、`__start__`、`report_ready` 三个 span，三者 inputs／outputs 均为空对象，且已知探针正文未出现在 metadata。云 trace 上传和脱敏边界通过；真实业务 trace 的用户采用、业务内容安全抽样与长期费用仍未知。

### LG04 — 全部既有产品编排节点成为 LangGraph／LangSmith 可展开业务图（2026-09-17，用户明确确认；已实现并通过零外部业务调用验收）

用户原话：“深度改造，把所有产品节点都搬到LangGraph上，要能在LangSmith上编排完整业务流程”。范围是当前产品已经存在的两条生产编排链，而不是把普通 CRUD、页面渲染或单次数据库读取虚构成工作流节点：`assistant_workflow` 必须公开输入校验、意图规划、预算响应、产品动作响应、线索计划响应、普通／澄清响应、内部知识检索、混合检索的内部与外部分支、证据综合和结果发布；`lead_workflow` 必须公开输入校验、知识检索、市场计划、候选发现、证据收集、证据校正、角色路由、评分、未完成处理恢复、异常复核、交接摘要、持久化和结果发布，并保留已保存证据恢复分支。两条图必须由独立 LangGraph 服务注册为可展开的组合图，LangSmith Studio 通过 `xray`／subgraph 看到真实节点与条件边，产品仍只通过官方 SDK 调用服务，不回退到 Next.js 进程。

改造不得复制或绕开现有业务执行：助手成本上下文、线索租户／动作／计划身份校验、费用观察、暂停、防重放、恢复及 PostgreSQL `langgraph` checkpoint 继续由同一生产业务图执行；兼容导出的 `runAssistantWorkflow`／`runLeadWorkflow` 仅供既有内部测试和工具调用，独立服务不再把它们注册成单节点黑盒。普通 API、DTO、数据库结构、权限和供应商合同不变；本确认不授权新的模型、搜索、SMTP、付费调用或云部署；云 trace 后由 LG05 单独授权。当前实现的本地 Agent Server `xray=true` 已返回助手 15 个可见节点／23 条边和线索 17 个可见节点／23 条边；1,090 项测试、TypeScript、生产构建、lint 和 22 项浏览器用例通过（另有 2 项按设计跳过）。Studio 页面刷新后的用户采用与真实业务质量仍未知，不能用图结构通过替代。

### LG03 — 使用 LangGraph Studio 查看本地图与运行轨迹（2026-09-16，用户明确确认；本地连接配置已实现）

用户在“LangGraph Studio 或本地静态图”两种方案中明确回复“我选1”。范围为允许托管于 `https://smith.langchain.com` 的 LangGraph Studio 页面从浏览器直连本机 `http://127.0.0.1:2024`，查看三个已注册图、节点关系、本地运行状态与调试信息；独立服务仍只监听回环地址，不开放局域网或公网。`LANGSMITH_TRACING` 默认设为 `false`，不因接入 Studio 自动上传执行 trace；用户未来显式启用云追踪时才覆盖该默认值。此确认不授权模型、搜索、SMTP、付费调用或云部署。配置加载、精确来源 CORS 预检、本地信息接口和定向回归已经通过；第一次 Studio 页面连接的 `Failed to fetch` 已在用户把所需 key 写入 Git 忽略的本地环境文件并重启服务后排除。密钥值不得写入规则、日志或提交；LG04 另行约束 Studio 中完整业务图的可见性。
### A34 — RAG 回答底层模型切换为 Kimi（2026-09-15，用户明确确认；已实施并通过公开合成实测）

用户原话：“把这一步使用的底层模型换成Kimi”。“这一步”承接刚定位的知识库检索成功、回答生成失败环节，因此范围仅为知识库检索后的 grounded answer，不改变 Qwen embedding、知识检索/排序、Gemini 外部网页检索、混合答案综合、线索评分复核、开发策略或邮箱模型。实现使用现有 Moonshot 受信任直连端点和 `KIMI_RAG_MODEL`（默认 `kimi-k3`），单次非流式 JSON 回答，`kimi-k3` 使用 `max_completion_tokens=4096`，无 OpenRouter、Bedrock、第二模型、SDK 自动重试或应用层备用。A30 的公开来源与敏感信息脱敏边界、引用要求及不足时明确说明继续执行；A33 当前用户观察模式不做金额预留，响应未给现金金额时保持费用未知。一次真实公开合成调用返回 HTTP 200、有效引用回答，证明密钥/地域/请求线形可用；这不等于真实用户知识问题的语义质量或现金账单已完成验收。[阶段证据](A34_KIMI_RAG_ANSWER_STAGE248_2026-09-15.md)。

### A33 — 单人自用早期阶段采用付费观察模式（2026-09-15，用户明确确认；已实施，真实费用审查待积累）

用户原话：“当前阶段产品仅我本人自用，所以暂时批准所有付费调用，不设拦截。”随后进一步建议：“产品前期暂时不设置费率门禁等限制条件……只记录最终产生的费用，不提前预算和限制，使用一段时间后统一审查费用记录，研究不合理环节。”范围是当前产品早期阶段及配置的精确当前用户。调用前不以缺少/过期费率、请求超出已审核费用合同、缺少/耗尽/冻结用户预算、任务预算或费率暂停为由拒绝，也不做金额预留；有已审核费率仍仅作为观察元数据，不作为准入条件。调用后记录服务商可提供的实际费用、token/API credits、延迟、重试、有效/下游使用量和丢弃原因；即时金额不可得时必须记为“费用未知”，不得记零或伪造上界，待积累一段时间后统一审查不合理环节。该授权不绕过登录认证、租户隔离、A30 敏感信息外发限制、请求本身的安全校验、相同请求并发以及已有成功输出防重复，也不能绕过供应商自身额度、认证、风控或 allowlist。A32 对普通用户仍只在确认上游尝试后回退；A33 精确用户在 OpenRouter 边缘 401/403/429/5xx 时也可尝试一次已批准的同模型 Bedrock 路由，仍无第三次调用。确认不等于真实服务商调用成功、语义质量或账单验收。[阶段证据](A33_OWNER_PAID_OBSERVATION_MODE_STAGE247_2026-09-15.md)。


### LG02 — 产品只通过独立 LangGraph 服务执行编排（2026-09-16，用户明确确认；已实现并通过无付费跨进程验收）

用户原话：“让产品改为通过LangGraph而不是仍旧调用内部runner”。范围为生产助手消息编排与已认领销售线索任务编排：Next.js/worker 必须通过官方 LangGraph SDK 调用 `LANGGRAPH_API_URL`（本地默认 `http://127.0.0.1:2024`）的 `assistant_workflow` / `lead_workflow`；产品入口不得直接导入或调用进程内 `runAssistantWorkflow` / `runLeadWorkflow`。SDK 对编排 POST 禁止自动重试，服务不可用、超时或响应缺失时明确失败，不静默回退到产品进程；助手默认超时 300,000 ms、线索默认 7,200,000 ms，可由环境变量在限定范围内覆盖。确认不授权新的模型、搜索、邮件或付费调用。最初独立服务内部复用两个受控 runner 的实现已由后续 LG04 深化为可展开的组合业务图，同时保留原租户、预算、费用、防重放、恢复和 PostgreSQL checkpoint 语义；LG02 的产品跨进程边界与失败策略未被取代。实现已通过三次零外部调用 HTTP 路由探测、68 项隔离式登录 UI/HTTP/SQL 验收以及全量自动化检查；实际用户采用仍未知。

### LG01 — LangGraph 独立本地运行（2026-09-16，用户明确确认；已实现并通过无外部调用验收）

用户原话：“我想独立运行LangGraph”。确切范围：LangGraph 作为独立本地 Agent Server 监听 `127.0.0.1:2024`，现有 Next.js 产品继续独立运行于 `127.0.0.1:3000`；服务导出现有助手编排、现有销售线索编排及一个零外部调用健康图。助手与线索适配图必须委托既有受控 runner，不复制或绕开租户、权限、预算、费用、防重放、恢复、PostgreSQL checkpoint 和业务语义。环境变量继续从 Git 忽略的根目录 `.env.local` 读取，不提交密钥。本阶段仅为本机开发运行，不监听 `0.0.0.0`、不开放局域网/公网、不新增云部署或生产认证承诺；Next.js 改走独立 HTTP 调用不在本阶段范围。确认不等于实现或验收，状态和边界见[独立 LangGraph 编排服务](STANDALONE_LANGGRAPH_WORKFLOW_2026-09-16.md)。

### UI-D12 — 全站“深色情报中枢”表现层（2026-09-16，用户明确确认；已实现并通过验收）

本规则对应实施计划中拟定的 `D12`；由于登记表已有稳定规则 `D12`，为避免覆盖历史决定，使用不冲突的稳定 ID `UI-D12`。确切视觉值：Night `#081018`、Slate `#111C27`、Fog `#DDE7EF`、Signal `#31D6A0`、Action `#4E8DFF`；警告和错误分别使用独立高对比琥珀与红色。范围为登录页、全站应用外壳、九个导航视图、独立任务页、公司详情抽屉、证据弹窗、预算提案以及错误/空/加载状态。深色主题是默认视觉，不提供用户可见的浅色切换入口；本地系统中文字体栈，不新增远程字体、Tailwind、组件库或运行时依赖；正文默认及移动端不低于 14px，辅助信息不低于 11px，数值使用等宽数字。

实现边界：保留全部 API、DTO、数据库、路由、权限、状态管理、事件处理、成本门禁和业务语义；只允许调整表现层结构、class、`data-label`、ARIA 与 CSS。唯一新增交互状态是非持久化、不发业务请求的移动导航开关。旧 `globals.css` / `ipados.css` 保留为回退基线，独立作用域主题层最后加载。桌面保留左侧导航和顶部上下文栏；移动端使用菜单按钮和可关闭抽屉，支持焦点约束、Escape、遮罩关闭与焦点恢复。表格在移动端卡片化；渠道画布和机会看板可作为明确的横向滚动区域。信号轨仅表达当前导航、流程进度和关系状态；不使用装饰性渐变、普遍全大写 eyebrow、统一圆角卡片或重复阴影。确认本身不是实现或测试证据；实现与验收结果记录在 [深色情报中枢 UI 工作流](DEEP_INTELLIGENCE_UI_WORKFLOW_2026-09-16.md)。

### A32 — RAG 同模型单次受控备用（2026-09-15，用户明确确认；已实施，无付费验收通过）

用户在收到完整建议后明确回复“同意”。确认范围为 AI 销售助理 RAG 回答：OpenAI `gpt-5.6-sol` 为主线路；仅当脱敏路由元数据确认上游已尝试且状态为 401/403/429/5xx 时，允许同一模型经 `amazon-bedrock/us-east-1` 进行一次应用层备用；网关自身认证/额度/allowlist 错误及 400/402/408/413/422 不回退，备用失败后不作第三次调用。两条线路分别预留、核销及防重放，均关闭 SDK 与 OpenRouter 内部自动回退；最大请求 61,440 bytes、最大输出 4,096 tokens，主线路 USD0.778240、备用 USD0.378471、单次主加备用合计最坏预留 USD1.156711。继续执行 A30 的公开来源与敏感信息边界、`data_collection=deny`，不开放 Azure、其他模型、工具或联网能力。账本只保存 HTTP 状态、安全错误码、受限供应商标识与哈希请求 ID，不保存提示词、知识正文、原始 ID 或错误正文。确认不等于真实供应商语义/账单验收；A31 已发生的 USD0.901120 未知预留不释放。[阶段证据](A32_CONTROLLED_RAG_FALLBACK_STAGE246_2026-09-15.md)。

### A31 — 为 RAG 建立独立回答合同（2026-09-15，用户明确确认；已实施，无付费验收通过）

用户原话：“为RAG建立独立合同”。范围是 AI 销售助理内部知识检索后的 OpenRouter Sol 引用回答，不再借用市场计划／裁决合同；embedding、混合网页检索、市场计划、复核、裁决和邮件合同不变。实施值由实际 SDK 线形与公开端点证据确定，并非用户逐项指定：OpenAI-only、无 fallback、`data_collection=deny`、两条纯文本消息、自由文本非流式回答、61,440 请求 bytes、65,536 计费输入 token 保守边界、8,192 `max_tokens`，单次保守预留 USD0.901120。A30 继续约束输入，只发送明确公开来源并已做敏感模式过滤的知识副本；内部培训、私人邮箱、内部维护文件和无公开来源标记上传内容不外发。全量测试、TypeScript、lint、公开费率审计、实际 SDK 无网络线形及真实 PostgreSQL 合成预留／防重复验证通过，真实模型语义和账单未验收。[阶段证据](A31_RAG_ANSWER_CONTRACT_STAGE245_2026-09-15.md)。

### A30 — 公开／公开来源信息可外发，敏感信息禁止外发（2026-09-15，用户明确确认；Terra 入口已实施并实测，产品全入口审计待完成）

用户原话：“可以发送，产品中除了API密钥、个人信息等敏感信息，只要是公开信息或者从公开渠道取得的信息，都可以向外部发送。”范围为产品向外部服务发送数据：公开信息或从公开渠道取得的信息可以发送；API 密钥、个人信息及其他敏感信息不得作为业务内容外发。确认本身不等于实现或验收。当前 Terra 独立复核入口只外发公开公司证据、结构化业务事实、市场目标和版本化评分规则，并在外发副本中递归替换邮箱、电话、凭据/私钥、证件号和支付卡号形态；本地原证据不改写，公开 URL 保留。两次实际 Terra v2 请求体均通过发送前敏感模式检查，但没有有效输出；因此当前仅该入口的边界实测通过，其他产品外发入口仍需逐项审计，真实供应商语义和账单未通过。[阶段证据](A30_PUBLIC_EXTERNAL_DISCLOSURE_STAGE244_2026-09-15.md)。

### A29 — 当前阶段允许付费调用及未知费用重放（2026-09-15，用户明确确认；阶段授权实施中）

用户原话：“我在使用产品的时候，付费调用被阻止。当前阶段，允许所有付费调用。”在解释“重放是再次发送旧 Terra 请求，首次可能已经扣费，因而可能二次扣费”后，用户进一步明确回复：“接受”。范围是当前产品阶段和当前登录用户；授权包含累计用户／任务预算超额准入，以及费用未知、无可复用输出的旧请求重放。没有给出美元上限或结束时间，因此实现为必须同时配置规则号 `A29` 与精确用户 ID 才启用的临时进程级授权，不把任何金额伪造为用户确认值。授权不清除旧账、不把未知费用记为零，不放行缺少有效单次费率上界、被冻结账户、暂停费率、并发在途／超界请求或已有有效输出的重复请求；每笔新预留须写入 A29 授权来源。实际恢复先按原适配器上限发出两次 Terra v1 重放，均无有效输出且费用未知，累计占用从 USD39.870306 增至 USD61.908710。只读端点元数据证明旧线形含所有端点不支持的 `temperature`，因此按 A27 同类技术阻塞原则新增 Terra-only v2 合同，省略该字段并使用受支持的 `max_tokens=8192`，模型、费率上界及数据策略不变。A30 明确外发边界后，又实际发送两次已检查的 v2 请求，仍无有效输出且费用未知，累计保守占用增至 USD83.947114；不再继续盲目重放。用户接受风险不等于实际现金已知或验收通过。[阶段243证据](A29_PAID_REPLAY_ADMISSION_STAGE243_2026-09-15.md)、[阶段244证据](A30_PUBLIC_EXTERNAL_DISCLOSURE_STAGE244_2026-09-15.md)。

### A28 — 本轮分层验收与真实费用核销暂缓（2026-09-14，用户明确确认；阶段 242 受控产品层已完成，真实供应商层仍未通过）

用户原话：“审查当前验收进度，暂时不验收真实供应商费用，以尽可能完成端到端工作流完整和质量闭环、验收为主，设计收尾plan，记录到resume点中，便于我下次实施plan。”规划澄清时进一步选择“额度内允许调用”和“分层验收（推荐）”。范围仅为本轮隔离本地产品验收：允许已批准合同下、执行时累计 USD50 内且逐次有有效费用上界的**新**真实请求，但暂不以完整供应商账单／真实现金线索成本作为本轮产品层通过条件。受控传输可验证同一任务的产品入口、图、质量门禁、SQL、API 与页面闭环；真实供应商语义、真实复核与费用核销须单列状态。A25/A26 原子预留、未知费用保留和不重放、A11 新路由／合同确认及公司资格、角色、证据、评分和租户隔离均不放宽。不得把分层产品通过写成原计划整体验收完成。实施状态：[阶段 239 恢复计划](RESUME_PRODUCT_ACCEPTANCE_STAGE239_2026-09-14.md)已登记；[阶段 240](REVIEW_COMPLETION_PERSISTENCE_GATE_STAGE240_2026-09-15.md)修复最终发布门禁；[阶段 241](CONTROLLED_ACTUAL_REVIEW_PRODUCT_LOOP_STAGE241_2026-09-15.md)通过同一合成动作的实际 Agent 校验、SQL、API 与生产双视口正结果层；[阶段 242](LAYERED_QUALITY_AND_FAILURE_PROGRESS_STAGE242_2026-09-15.md)又通过质量反例、必要复核失败／恢复、真实 PostgreSQL 发布门禁和生产失败进度层，因此 A28 的受控产品层完成。各阶段都为零真实供应商调用。真实 Terra 语义、完整账单／现金成本和原整体验收仍未通过；真实业务最新事实仍以[阶段 238](S02_MINIMAL_LIVE_PARTIAL_STAGE238_2026-09-14.md)为准。

### A27 — 主要端到端业务优先、记录技术妥协（2026-09-14，用户明确确认；S02 已真实部分验证，其他个案待逐项验证）

用户原话：“遇到类似阻塞点时，降低要求，以跑通产品主要端对端业务验收为准。类似问题记录、妥协或者绕开。”适用于本地生产验收中与 OpenRouter 参数兼容性类似的技术阻塞：优先使主要自然语言→搜索→补证→角色/评分→国家结果展示链可运行，并如实记录实际降低、绕开的条件和未验证部分。此话没有给出新的费率、额外预算、搜索范围或合格标准数值；当前仍沿用已确认的 A26 隔离 USD50、A25 已知单步费用与原子预留、不重复公司和国家/用户隔离。具体新模型路由或收费合同仍需形成可核对的边界，不能从“降低要求”推定未知成本为零。实施/验收状态：S02 已落地并真实通过市场计划、搜索、补证及首次评分；Terra 复核费用未知并被防重放门禁暂停，没有绕过复核、降低标准或入库结果。[无付费证据](S02_PLAYBOOK_PARAMETER_ACCEPTANCE_STAGE237_2026-09-14.md)、[真实部分验收](S02_MINIMAL_LIVE_PARTIAL_STAGE238_2026-09-14.md)。

### S02 — 市场计划 Sol 参数专用修订（2026-09-14，用户明确批准；实现、无付费及真实单步验收通过，整体验收未通过）

用户原话：“批准 S02 并继续最小真实验收（推荐）”。范围为[已审S02提案](S02_SOL_PLAYBOOK_PARAMETER_PROPOSAL_2026-09-14.md)：仅在已批准 S01 的 OpenRouter credits/OpenAI 标准端点市场计划使用 `max_tokens=4096` 并省略 `temperature`；维持 `openai/gpt-5.6-sol`、严格 JSON、`provider.only=["openai"]`、`allow_fallbacks=false`、61,440 字节、4,096 总输出及单次 USD10.622880。现行隔离累计 USD50 与逐请求费用门禁不变；旧 404 动作与未知费用占用不自动重放或释放。版本 `request-bounds-v1.10.0` / `openrouter-sol-openai-playbook-v2`、新缓存身份及合成线形/全量回归通过；新隔离真实任务的市场计划返回有效输出，预留 USD10.622880、报告 USD0.017461，但完整业务在 Terra 复核未知费用时暂停。[阶段237无付费证据](S02_PLAYBOOK_PARAMETER_ACCEPTANCE_STAGE237_2026-09-14.md)、[阶段238真实部分验收](S02_MINIMAL_LIVE_PARTIAL_STAGE238_2026-09-14.md)。原 S01/v1 提案、路由及失败事实保留为历史。

2026-09-14 stage 236 / A26 acceptance observation: the post-FX production build passed 68/68 isolated desktop/mobile Chrome checks, including dynamic FX and budget views; fixtures and server were removed, external paid calls/mail zero. Read-only acceptance occupancy stayed USD23.520920/50 with ten incomplete cost reports. This is regression evidence, not a new rule, S02 approval or A11 closed loop. [Evidence](A26_POST_FX_CURRENT_BUILD_UI_STAGE236_2026-09-14.md).
2026-09-14 stage 235 / A25-A26 documentation status: present-tense acceptance table rows were reconciled to the confirmed progressive per-request admission and isolated USD50/fixed-FX validation rule, plus the actual stage232 partial live run. Earlier USD30/72-hour and unrun stage notes remain as history. This is not a new confirmation, S02 approval, paid call or A11 completion. [Evidence](A26_CURRENT_ACCEPTANCE_TABLE_RECONCILIATION_STAGE235_2026-09-14.md).
2026-09-14 stage 234 / A26 implementation status: ordinary product FX admission and UI expiry now use seven days from the actual stored retrieval time, while acquisition still rejects a source already seven days old. A duplicate official payload triggers a recheck before the original stored snapshot expires; failure/stale source retains the hourly retry and paid hold. The local fixed validation FX version remains pinned without expiry or another fetch. Full 1,052 tests, typecheck, lint and production build pass with zero external calls. This applies the confirmed weekly rule, not a new product confirmation or S02 approval. [Evidence](A26_WEEKLY_FX_EXPIRY_EDGE_STAGE234_2026-09-14.md).
2026-09-14 stage 233 / A26 acceptance observation: the current production build passed 68/68 isolated Chrome desktop/mobile UI/HTTP/SQL checks with fixture/service cleanup, zero paid provider calls and zero mail. Read-only A26 occupancy remained USD23.520920/50 with ten incomplete cost reports. This is UI regression evidence, not a new product rule, S02 approval or real A11 closed-loop completion. [Evidence](A26_CURRENT_BUILD_UI_REGRESSION_STAGE233_2026-09-14.md).

2026-09-14 stage 232 / A26-A11 observation: the isolated real two-turn assistant produced a corrected Spanish CO/Distributor target-one proposal; actual S01 OpenAI-only market planning then received HTTP 404 for unsupported request parameters. No company discovery or result save followed. Occupancy is USD23.520920/50, six original plus four new incomplete provider-cost reports retained. [S02 parameter-only proposal](S02_SOL_PLAYBOOK_PARAMETER_PROPOSAL_2026-09-14.md) is **not confirmed or implemented**; S01 stays paused and the failed paid action is not replayed. This observation does not supersede A26 or approve another route. [Evidence](A26_LIVE_PARTIAL_ACCEPTANCE_STAGE232_2026-09-14.md).


### A26 — 本地验收固定汇率、USD50 上限及产品每周汇率（2026-09-14，用户明确确认；实现/无付费验收通过，真实闭环待验）

用户原话：“汇率在验证阶段只取一次数值，不过期。真实产品运行时，每周取一次汇率。放宽本次验证上限至50美元或者以默认验证阶段汇率等价的人民币金额。加快验证完成。”本次选择 **USD50**，仅限隔离本地验收账号；不设第二个人民币预算，也不改普通产品用户预算。验收固定一份库内官方 ECB 版本 `ecb-cny-usd-2026-09-11`（USD/EUR `1.1592`、CNY/EUR `7.7762`、2026-09-13 05:47:16 UTC 取回），验证期间不因日历年龄失效、不再次抓取。真实产品共享每周一次官方汇率刷新，失败后按小时退避，普通运行最多使用七天有效参考；原 5% 仅预留缓冲保留。A25 逐请求原子预留及未知单步费用/预算不足/未知付费结果暂停继续有效，原 USD12.324404 历史占用与六笔未知账单不重置。此条覆盖 A01/A10/A25 中旧的本地 USD30、每日/72 小时验收执行值，不追改其历史确认文本；没有批准新模型、搜索路由或费率。实现状态：代码、1,051 项测试/类型/lint/生产构建/安全审计及真实库只读预检通过；隔离额度已改 USD50，未发出的合成预留有追加式零费用核销。真实 A11 闭环和整体验收仍未通过。[证据](A26_WEEKLY_FX_AND_USD50_LOCAL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 stage 230 / A25 observation: the first scheduled official ECB recheck after A25 still returned only the expired Sep 11 reference. Intent-light and knowledge-embedding remain held at their own paid steps, even though a whole-run quote is no longer required. Next stored retry is 13:50:54 UTC. This is not a new user confirmation, tariff, FX rate or real A11 acceptance. [Evidence](FX_A25_DUE_RECHECK_STAGE230_2026-09-14.md).
### A25 — 费用验收采用逐步预留（2026-09-14，用户明确确认，预检口径已更新；真实闭环待验收）

用户先明确：“费用、汇率等相关项目可适当放宽验收条件，精确的预算和成本计算不是本产品的重点”；随后对具体边界选择：“保留 USD30，允许逐步预留（推荐）”。本次验收不再要求先取得整个任务的精确费用上界才能开始，但每一次实际付费请求仍须有已知且有效的单步费用上界，并在外发前按实际请求原子预留；单步费用未知、汇率过期或预计累计占用超过 **USD30** 时在该步暂停，继续显示未知，不把未知记成零。USD30 是原累计上限，历史占用不重置；本规则不批准新的模型路由、价格合同或供应商，也不证明可完成整条业务链。此前 A11/S01/A22–A24 文本中的“整次预检照旧”为当时验收边界，保留历史记录；当前执行边界以 A25 为准。实施状态：现行逐请求合同/数据库原子预算门禁已存在并有无付费验证；阶段229只读预检已更新为逐步准入描述，真实最小闭环、实际账单及整体验收未通过。[证据](PROGRESSIVE_BUDGET_ADMISSION_STAGE229_2026-09-14.md)。

2026-09-14 stage 221 / existing A05-A11 FX rule: one due official ECB retry still yielded the expired Sep 11 reference; the confirmed 72-hour validity and CNY paid hold remain, with next stored retry 12:50:36 UTC. This is an observation, not a new user confirmation, refreshed rate or real A11 acceptance. [Evidence](FX_SCHEDULED_RECHECK_1150_2026-09-14.md).
2026-09-14 stage 220 / existing A01-A13 acceptance status: the current build passed 68 isolated Chrome desktop/mobile checks; matrix rows now show the confirmed and implemented A22-A24 single-call contracts while retaining older proposal history. The real A11 whole-run bound remains null. This is status and test evidence, not a new user confirmation or real business adoption. [Evidence](CURRENT_BUILD_UI_AND_MATRIX_RECONCILIATION_2026-09-14.md).
2026-09-14 stage 219 / existing P06 backup-route rule: oversized chunk planning now uses every approved primary/fallback route's exact wire bytes and retains the actual fallback completion identity. Synthetic Agent and product SQL checks pass without a paid request. This implements the already confirmed model-specific request-contract rule; it is not new route/tariff approval or full P06/A11 acceptance. [Evidence](P06_SINGLETON_FALLBACK_WIRE_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 218 / existing P06 rule: one synthetic long critical finding now passes the current Agent and real append-only PostgreSQL checkpoints across process interruption and zero-call replay. No real provider or customer task ran. This verifies part of the confirmed recovery rule, not new user confirmation, real semantic quality or full P06/A11 acceptance. [Evidence](P06_SINGLETON_AGENT_CROSS_PROCESS_SQL_2026-09-14.md).
2026-09-14 stage 217 / existing P06 rule: the qualification Agent now connects worst-case bounded chunk/phase/final preflight, exact completed chunk reuse, derived-summary provenance and uncertain-critical pending behavior. Synthetic Agent and independent product SQL checks pass without paid calls. This is implementation evidence under the confirmed large-company and no-replay rules, not a new user confirmation or proof of real model semantics, full P06 or A11 acceptance. [Evidence](P06_SINGLETON_AGENT_RUNTIME_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 216 / existing P06 rule: an oversized qualification fact phase now identifies its original source or finding and citation closure for future chunk recovery. It still pauses without a paid call; the Agent, checkpointed chunk execution and final scoring remain pending. This is partial implementation of the confirmed large-company recovery rule, not a new user confirmation or P06 acceptance. [Evidence](P06_OVERSIZED_UNIT_RECOVERY_IDENTITY_2026-09-14.md).
2026-09-14 stage 215 / A05-A11 observation: the scheduled official ECB retry still yielded an expired Sep 11 reference. The already confirmed 72-hour validity rule and paid hold remain; this observation is not a new user confirmation, a rate refresh, or real A11 acceptance. [Evidence](FX_SCHEDULED_RECHECK_1050_2026-09-14.md).
2026-09-14 stage 214 / existing search and telemetry scope: provider raw row/link count and over-delivery are now separately recorded from admitted and normalized candidate counts. Old cached responses without raw volume stay unknown historically. This is a verified implementation under A21, not a new product confirmation or a claim of unique/qualified company gain. [Evidence](DISCOVERY_PROVIDER_VOLUME_TELEMETRY_2026-09-14.md).
### A24 — Sol 分歧裁决费用合同（2026-09-14，用户明确批准，已实施、无付费验收通过）
用户原话：“批准两项合同的实现与无付费验收”。其中 Sol 分歧裁决按 [候选报告](OPENROUTER_SOL_JUDGE_PROPOSAL_2026-09-14.md) 限定为现有 OpenRouter credits、`openai/gpt-5.6-sol`、严格 JSON、`reasoning.effort=high`、总输出最多 12,000 token、五个标准端点范围，单次保守预留 USD27.736500；不得借用 S01 市场计划的 OpenAI-only 合同。只授权实现与无付费验收，不授权真实调用；累计 USD30 与整次费用预检照旧。实施版本 `request-bounds-v1.9.0`，严格合同、任务路由、真实SQL合成预算和回归通过；真实模型兼容性与账单未验收。[证据](OPENROUTER_REVIEW_ACTIVE_CONTRACT_ACCEPTANCE_2026-09-14.md)。历史提案时“未确认”保留为旧状态。

### A23 — Terra 条件二次复核费用合同（2026-09-14，用户明确批准，已实施、无付费验收通过）
同一用户确认中的 Terra 合同按 [候选报告](OPENROUTER_TERRA_REVIEW_PROPOSAL_2026-09-14.md) 限定为现有 OpenRouter credits、`openai/gpt-5.6-terra`、严格 JSON、`reasoning.effort=medium`、总输出最多 8,192 token、五个标准端点范围，单次保守预留 USD11.019202。只授权实现与无付费验收，不授权真实调用；累计 USD30 与整次费用预检照旧。实施版本 `request-bounds-v1.9.0`，严格合同、任务路由、真实SQL合成预算和回归通过；真实模型兼容性与账单未验收。[证据](OPENROUTER_REVIEW_ACTIVE_CONTRACT_ACCEPTANCE_2026-09-14.md)。历史提案时“未确认”保留为旧状态。

### A22 — Tavily basic Extract 费用合同（2026-09-14，用户明确批准，已实施、无付费验收通过）
用户原话：“批准该合同（推荐）”。仅限 [已审候选](TAVILY_EXTRACT_TARIFF_PROPOSAL_2026-09-14.md) 的现有 basic `POST /extract`、最多 20 个 HTTPS URL、文本输出、单次保守预留 USD0.032000、2026-09-21 00:00 UTC 到期；保留原累计 USD30 和整次预检，不授权真实调用。实施版本 `request-bounds-v1.8.0`；严格请求合同、SQL 预算/去重和无付费回归已通过，真实账单及整体验收仍未完成。[验收证据](TAVILY_EXTRACT_ACTIVE_CONTRACT_ACCEPTANCE_2026-09-14.md)。

2026-09-14 stage 211 / existing acceptance boundary: Google Places, Exa and Brave now cap downstream candidate items at the requested result count, matching Gemini/SearchAPI. This is a verified implementation under the authorized cost/acceptance plan, not a new user confirmation and not D13-O05's role-scoring proposal. The 240 read-only accepted slots are not unique or qualified companies; the whole-run paid bound remains unknown. [Evidence](DISCOVERY_DOWNSTREAM_RESULT_CAP_2026-09-14.md).
2026-09-14 stage 210 / P06 implementation status: the existing confirmed large-company handling rule now has a pure complete-chunk assembly guard; any uncertain segment remains uncertain and missing/mismatched parts are rejected. Product scoring integration and real acceptance remain open. This is not a new user confirmation. [Evidence](P06_SINGLETON_CHUNK_SYNTHESIS_PREFLIGHT_2026-09-14.md).
2026-09-14 stage 209 / P06 implementation status: a separate per-unit chunk identity now uses the existing append-only, tenant-scoped phase table and exact paid-request fingerprint. Real SQL checks passed without a migration or provider call. Agent/synthesis integration is still required; this is partial implementation of the existing confirmed recovery rule, not a new user decision or overall acceptance. [Evidence](P06_SINGLETON_CHUNK_CHECKPOINT_2026-09-14.md).
2026-09-14 stage 208 / P06 implementation status: the existing confirmed oversized-singleton rule now has an exact-wire, Unicode-safe chunk preflight and original-citation validator. Product execution/checkpoint/synthesis integration and real semantic acceptance remain open. This is partial implementation of an existing rule, not a new user decision or P06 completion. [Evidence](P06_SINGLETON_CHUNK_PREFLIGHT_2026-09-14.md).
2026-09-14 stage 207 / A05-A11 observation: the due official ECB retry at 09:49 UTC produced no new valid reference; the existing confirmed 72-hour FX requirement and paid hold remain in force. This is an observation under existing rules, not a new user confirmation or live A11 acceptance. [Evidence](FX_SCHEDULED_RECHECK_0949_2026-09-14.md).
2026-09-14 stage 202 / A09-A10-A13 acceptance status: the latest local production build passed 68 real Chrome desktop/mobile checks with isolated fixture cleanup, followed by unchanged USD12.324404/30 read-only occupancy and zero paid calls. This is regression evidence for existing product behavior, not a new confirmed rule or live A11 acceptance. [Evidence](PRODUCTION_UI_REGRESSION_STAGE202_2026-09-14.md).
2026-09-14 stage 200 / A06 implementation status: SearchAPI's effective standard-or-alias credential and endpoint are now resolved identically for the paid request and recovery dependency. Changing an alias account under a blank standard key invalidates old purchased-work checkpoints; no key is persisted and no automatic replay occurs. This implements the existing paid-request identity/recovery rule, not a new SearchAPI tariff or route confirmation. Full 1,026 tests and build pass; A11 remains open. [Evidence](SEARCHAPI_ALIAS_RECOVERY_IDENTITY_2026-09-14.md).
2026-09-14 stage 198 / A06-A11 implementation status: provider request, discovery recovery identity and read-only preflight now use the same trimmed Gemini model fallback. A blank primary override followed by a changed fallback invalidates the old paid checkpoint instead of silently reusing it. This implements the existing request-identity and no-automatic-paid-replay rules; it does not confirm or activate a new model route or tariff. Full 1,024 tests and build pass; live A11 remains open. [Evidence](GEMINI_DISCOVERY_MODEL_RECOVERY_IDENTITY_2026-09-14.md).
2026-09-14 stage 195 / A10-A08 implementation status: official ECB responses that parse correctly but have passed the already confirmed 72-hour validity window now receive a distinct append-only discard reason from transport/invalid failures. The existing `unavailable` state, one-hour retry, expired-FX paid hold, and A09/A10 values remain unchanged. Synthetic tests and current-build checks are documented in [evidence](FX_STALE_SOURCE_OBSERVABILITY_2026-09-14.md); this is not a new rule, a fresh exchange rate or live A11 acceptance.
2026-09-14 stage 193 / D13-O03 implementation status: the existing two completed zero-final-round safety stop now emits `no-qualified-progress`; legacy `confirmed-exhaustion` remains readable and is displayed as historical stagnation, not proof of market exhaustion. Both prevent an identical continuation. This implements the already confirmed O03 boundary without changing target, scope or thresholds. Full 1,021 tests and production Chrome 68 checks pass; live A11 is still open. [Evidence](O03_STAGNATION_STOP_REASON_ACCEPTANCE_2026-09-14.md).
2026-09-14 stage 190 / A08-A13 acceptance status: after migration 075, the current production build and 66 real Chrome desktop/mobile checks passed with isolated fixture cleanup, no paid provider call and unchanged USD30 occupancy. This validates tested UI paths under existing rules; it is not new user confirmation, real adoption or A11 completion. [Evidence](PRODUCTION_UI_REGRESSION_STAGE190_2026-09-14.md).
2026-09-14 stage 188 / A10-A11 implementation status: the 07:49 UTC scheduled public FX retry yielded no validated new reference; the stored 2026-09-11 snapshot remains expired, so CNY paid admission and the whole-run A11 gate stay closed. This is an observation under existing rules, not a new confirmed rate or authorization. [Evidence](FX_SCHEDULED_RECHECK_0749_2026-09-14.md).
2026-09-14 stages 185-187 / A06-A08-A13 implementation status: migrations 073-075 restore application SELECT/INSERT-only access to memory audit, continuation lineage, workflow telemetry/workspace audit and private document revision history after full migration replay. Two complete replays per stage and the final 23-table role audit passed; parent privacy deletion still cascades. These are integrity fixes to existing recovery, telemetry and isolation rules, not new user decisions or live A11 acceptance. [Memory/continuation](MEMORY_AUDIT_SEARCH_CONTINUATION_ACL_2026-09-14.md), [telemetry/audit](WORKFLOW_TELEMETRY_AUDIT_APPEND_ONLY_ACL_2026-09-14.md), [knowledge revision](KNOWLEDGE_REVISION_APPEND_ONLY_ACL_2026-09-14.md).
2026-09-14 stage 184 / B25 recovery implementation: migration 072 restores SELECT/INSERT-only application ACL for immutable processing-recovery lineage after migration 014's blanket replay. Two full migration replays and isolated SQL budget/ACL checks pass; this is a fix to the existing confirmed recovery/budget contract, not a new user rule or real A11 completion. [Evidence](PROCESSING_RECOVERY_APPEND_ONLY_ACL_2026-09-14.md).
2026-09-14 stage 180 / A11 read-only audit: Terra and Sol judge public standard-route proposal ceilings remain USD11.019202 and USD27.736500; no tariff admitted. S01 playbook plus one possible Terra conservative reservation totals USD21.642082, above the USD17.675596 remaining cap. This is not actual expense or new authorization. [Evidence](A11_REVIEW_ROUTE_BUDGET_AUDIT_2026-09-14.md).
2026-09-14 stage 179 / A11 acceptance visibility: read-only whole-run preflight now lists inactive Tavily /extract as missing-strict-contract, rather than omitting it from readiness. Candidate tariff remains unapproved/inactive, totalRunBoundUsd null, USD30 gate unchanged. [Evidence](A11_EXTRACT_PREFLIGHT_VISIBILITY_2026-09-14.md).
2026-09-14 stage 178 / A10 implementation observation: the planned 06:48 UTC ECB retry returned no fresh reference; 2026-09-11 remains expired, next retry 07:48 UTC. The confirmed 72-hour rule and paid gate are unchanged; this is not a new rule or A11 acceptance. [Evidence](FX_SCHEDULED_RECHECK_2026-09-14.md).
2026-09-14 stage 177 / A11 pending decision: Tavily basic /extract USD0.032000 candidate and strict request validator are documented and tested, but no active tariff was added. This is a proposal under the existing rule that new billing contracts require confirmation; no product approval, paid call, or A11 completion is inferred. [Candidate](TAVILY_EXTRACT_TARIFF_PROPOSAL_2026-09-14.md).
2026-09-14 stage 176 / D13-O03 implementation: final target and stop reason now use post-review eligible assessments; review-requested research pauses as processing-incomplete. Five existing search rounds are shared with read-only A11 preflight. Synthetic graph verification passed; this does not change the user's confirmed O01-O05 scope, prove real fill rate, or complete A11. [Evidence](O03_POST_REVIEW_TARGET_COMPLETION_2026-09-14.md).

2026-09-14 阶段175 / A11、S01验收状态：已批准市场计划专用路由的合成请求与单次合同仍有效，但官方OpenAI端点参数清单未列实际请求中的 `max_completion_tokens` 和 `temperature`；这是未验证的兼容性缺口，不是用户撤销S01或供应商拒绝的证据。路由、费率、4096输出和USD30门禁均未更改；真实业务与整体验收仍未通过。[证据](S01_PUBLIC_ENDPOINT_PARAMETER_GAP_2026-09-14.md)。

2026-09-14 阶段174 / A05、A06实施状态：迁移071将费用观测、价证和预算状态9张表从历史宽授权归一到追加式或状态更新所需最小权限，真实应用角色15/15权限及核销/任务限额SQL通过，未知账单6笔和USD30上限不变。这是既有追加式核销与恢复规则的修复，不是新产品确认，也不证明真实账单或A11完成。[证据](BILLING_LEDGER_ACL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段173 / A05、A10实施状态：迁移070修正既有应用授权残留，公共FX快照及刷新观测仅可追加/读取；官方9月11日参考值在14日00:00 UTC满72小时后继续阻止付费预留，计划刷新失败按原一小时退避。真实SQL和官方只读复核通过，0付费。这是既有确认规则的实施，不是新规则确认或A11通过。[证据](BILLING_FX_EXPIRY_AND_APPEND_ONLY_ACL_2026-09-14.md)。

2026-09-14 阶段161 / B25、B26实施验收进度：仅对现有已批准备用路由按实际请求身份保存并复用完成响应；路由变化、费用未知和模型不符仍暂停，126事实合成图与跨进程产品SQL通过，0真实付费。默认备用严格费率、较长请求、真实语义及A11未通过。这是既有恢复规则实施，不是新供应商/模型路由确认。[证据](P06_FALLBACK_ROUTE_CHECKPOINT_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段160 / B25、B26实施进度：现有OpenAI兼容备用提供方现在可计算与费用层一致的实际付费请求哈希；本地传输拦截核对通过，0真实付费。这不新增路由确认、不准入默认备用费率，也未完成备用响应检查点或A11。[证据](P06_FALLBACK_PAID_REQUEST_IDENTITY_2026-09-14.md)。

2026-09-14 阶段159 / C13、B25、B26实施验收进度：条件Pro在完整LangGraph评分前检查点→3事实阶段→Flash/Pro两次最终请求→产品SQL路径合成通过，151事实/证据、5条用量及Pro精确评估缓存可核对；0真实付费。既有升级阈值未改，真实语义、备用路由及A11整次验收仍缺。[证据](P06_PHASED_PRO_GRAPH_SQL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段158 / C13、B26实施验收进度：超限公司仅在既有8分或关键状态升级条件成立时使用有界Pro最终请求；阶段事实不重算，Flash与Pro响应各按精确合同保存，跨进程零模型复用。7分且无关键变化不升级。合成SQL/预检通过，0真实付费；这不是新模型路由确认或真实语义验收，A11整次费用仍未知。[证据](P06_PHASED_PRO_ESCALATION_2026-09-14.md)。

2026-09-14 阶段157 / B25、B26实施验收进度：最终评分付费结构响应在业务归一化与评估缓存前按完整请求身份追加保存，已保存结果跨进程复用而不重计模型调用；未知、截断、路由或哈希不符仍禁止自动重放。迁移069与合成SQL/全量回归通过，0真实付费。这是既有恢复规则实施，非新用户确认；Pro/备用路由、真实语义和A11仍缺。[证据](P06_FINAL_SCORE_RESPONSE_RECOVERY_2026-09-14.md)。

2026-09-14 阶段156 / B07、B25、B26实施验收进度：隔离合成公司151事实/151来源经现行图、评分Agent、3阶段加1最终请求、PostgreSQL跨进程检查点和产品SQL保存联通，派生缓存合同跨用户隔离；0真实付费。仅证实接线和持久化，不增加新评分规则，也不完成真实模型语义、备用路由、Pro升级或A11整体验收。[证据](P06_PHASED_GRAPH_SQL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段155 / A11、B25进度：只读整次预检显式计入“分阶段评分调用次数上界未知”，保持整次费用`null`与USD30门禁；4阶段合成示例评分+市场计划已超过当前剩余额度USD0.030089，不能启动真实业务。这是既有预算规则的验收状态，不是新增确认。[证据](A11_PHASED_SCORE_WHOLE_RUN_PREFLIGHT_2026-09-14.md)。

2026-09-14 阶段154 / B07、B25、B26实施进度：超限且可评分公司已接入任务范围内逐阶段检查点恢复及最终评分路径；本地SQL 4阶段跨进程部分恢复、图评估缓存先于付费恢复门禁、预算/备用路由/缺项/写失败停止后续请求通过。0真实供应商调用；真实语义、费用合同及生产完整图仍待验收，不能标记P06/A11完成。这是既有确认的实施。[证据](P06_PHASE_AGENT_SQL_RECOVERY_2026-09-14.md)。

2026-09-14 阶段153 / B07、B26实施进度：新增阶段响应完整覆盖综合与最终请求实际字节预检，150条独立事实及全部来源ID可在已批准上限内表达；较长摘要超界则技术暂停。原始证据保留于状态，关键/争议原文在最终请求保留，其他支持事实使用阶段摘要；语义质量仍未实测，阶段付费执行未接线。这是既有确认规则的部分实施。[证据](P06_PHASE_SYNTHESIS_PREFLIGHT_2026-09-14.md)。

2026-09-14 阶段152 / B07、B25、B26实施进度：分阶段完成行新增精确付费HTTP请求哈希，图恢复门禁仅对已报告、完整且哈希匹配的阶段响应免阻止；未知费用、截断和不匹配仍暂停。迁移068及模拟费用行SQL验证通过，尚未接线阶段Agent和最终综合，不视为P06完成；这是既有规则实施，不是新增确认。[证据](P06_PHASE_PAID_REPLAY_IDENTITY_2026-09-14.md)。

2026-09-14 阶段151 / B07、B25、B26实施验收进度：新增用户/任务/国家/来源/阶段/实际请求契约绑定的追加式完成响应SQL表，跨进程读取、重复幂等、RLS隔离及不可修改通过；模拟响应1、0付费。迁移001–067及067重复执行通过，1000项/205文件与生产构建通过。尚未接入评分Agent、未知付费防重放与最终综合；这是既有规则的部分实施，不是新增确认。[证据](P06_PHASE_CHECKPOINT_SQL_2026-09-14.md)。

2026-09-14 阶段150 / B07、B26实施进度：分阶段事实规划请求的Schema与严格输出校验共用定义，缺失/重复/捏造ID、跨事实引用及空摘要在缓存前拒绝，合法乱序归位；1000项/205文件全量回归及生产构建通过。仍未执行或保存阶段模型结果、未完成最终综合和P06；这是既有确认规则的部分实现，不是新增确认。[证据](P06_PHASE_OUTPUT_VALIDATION_2026-09-14.md)。

2026-09-14 阶段149 / B07、B26实施进度：P06既有许可范围内新增无付费、未接线的分阶段事实请求规划器，151事实/152本轮证据均按引用闭合拆入实际序列化上限内的请求；单条超界仍技术暂停。989项全量回归和生产构建通过；阶段响应校验、持久化、防重放、最终综合及真实模型未实施，不能标记P06完成。这不是新增用户确认。[证据](P06_PHASED_FACT_REQUEST_PLANNER_2026-09-14.md)。

2026-09-14 阶段148 / B07、B26实施验收进度：P06已确认边界内，受限原文折叠可与无损字段表及可选共享短语组合，仍按最终完整请求字节预检。110条高熵补充事实经真实序列化与跨进程产品SQL完成模拟评分，111条原证据/111条事实及遥测保留；125/150条边界仍技术待恢复，真实模型和任意大单项分阶段处理未验收。987项全量回归、类型检查和生产构建通过，0付费；这是既有规则的部分实现，不是新增用户确认。[证据](P06_FOLDED_FIELD_TABLE_COMBINATION_2026-09-14.md)。

2026-09-14 阶段147 / B07、B26验收进度：已确认P06边界内，折叠评分的56条原始证据/56条事实经PostgreSQL跨进程恢复及实际产品SQL保存；冲突原文、证据身份、事实与引用保留，准备元数据记录折叠条数，第二账号不可读，0付费。101/105无损路径复验通过。任意大单项分阶段处理、真实模型遵从及A11完整闭环仍缺。这是既有规则的部分验收，不是新增确认。[证据](P06_FOLDED_EXCERPT_CROSS_PROCESS_SQL_2026-09-14.md)。

2026-09-14 阶段146 / B07、B26实施验收进度：已确认的P06边界内，评分单公司无损准备仍超限时，可对校正已支持事实的部分冗长证据原文作显式结构化折叠；全部事实/状态/证据身份与引用保留，冲突、否定和未知原文不折叠，完整请求继续预检。55条独有事实含冲突来源的合成评分完成，全冲突及150条大单项仍技术待恢复；986项全量回归通过，真实模型质量与任意大单项分阶段处理未验收。这是既有规则的部分实现，不是新增确认。[证据](P06_SUPPORTED_EXCERPT_FOLD_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段145 / B07、B26及A11验收核查：无付费全量984项/203文件、生产构建、18项双视口浏览器、lint 0错误/11既有警告及生产依赖审计0漏洞通过。不可压缩的任意大单公司仍为技术待恢复，分阶段完成未实现；整次付费上界仍未知，A11与整体验收未通过。此为已确认规则的当前实施状态，不是新增确认。[证据](CURRENT_REGRESSION_AND_P06_BOUNDARY_2026-09-14.md)。

2026-09-14 阶段144 / B07、B25、B26及D13-O01/O05验收进度：现行补证函数以模拟 Tavily 搜索/提取各1次从空证据候选生成本轮官方证据，再由现行校正与评分 Agent 完成引用、SQL保存1家和生产双视口复核；真实供应商调用0。这是已确认规则的部分接线验收，不新增搜索、角色或评分规则，真实覆盖、语义及 A11 闭环仍未验收。[证据](CURRENT_EVIDENCE_COLLECTOR_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段143 / B07、B25、B26及D13-O01/O05验收进度：现行校正 Agent 用本轮官方夹具证据完成 Distributor 主角色与6条事实，现行评分 Agent 使用校正后的引用完成评分，正结果图经 SQL 和生产双视口保存1家；补充搜索和真实付费调用均为0。仅为已确认规则的部分合成验收，不新增角色或评分产品规则，真实语义、冻结盲审及 A11 闭环仍未验收。[证据](CURRENT_CORRECTION_AGENT_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段142 / B07、B25、B26与D13-O05验收进度：现行评分Agent在隔离合成正结果图中处理一条模拟结构响应，五门禁supported、无规模事实时规模维度中性8/15、7说明引用本轮证据，精确请求缓存入SQL，最终保存1家并经生产双视口复核。无真实模型/搜索或新盲审，O05语义正确率与A11完整闭环仍未证明；是既有规则的部分验收。[证据](CURRENT_SCORE_AGENT_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段141 / A09–A13、B25实施验收进度：隔离两轮自然语言仅用确定性降级生成/修改哥伦比亚Distributor计划，旧提案取消、新提案确认入队；合成完整图评分前暂停恢复后SQL保存1家，本地生产双视口达标，夹具费用守恒。真实Kimi、市场供应商/账单和A11付费闭环未验收；这是既有规则的部分接线验收，不是新确认。[证据](ASSISTANT_FALLBACK_POSITIVE_GRAPH_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段140 / A10验收修正：阶段138–139的隔离正结果夹具初版清理遗漏全局公司身份；6条本轮无外键引用的合成残留已清除，脚本加入提交后零残留断言。用户USD30预算及真实业务数据未变；这只修正验收证据，不是新产品规则或A11真实闭环。[证据](POSITIVE_GRAPH_FIXTURE_CLEANUP_2026-09-14.md)。

2026-09-14 阶段139 / B07、B25、B26验收进度：隔离合成正结果图在评分前暂停，同一PostgreSQL检查点继续至公司入库与本地生产双视口；已完成前置阶段不重跑、夹具预留7 micro-USD不重复、越权恢复拒绝。仅验证同进程可控暂停，未知在途费用、跨进程完整正结果及A11真实闭环仍未验收；属于既有规则的部分验收，不是新确认。[证据](POSITIVE_GRAPH_SCORING_PAUSE_RECOVERY_2026-09-14.md)。

2026-09-14 阶段138 / A09、A10、A11、B07实施验收进度：隔离合成正结果从预置计划经图的发现/补证/校正/评分/复核/交接进入产品SQL和本地生产任务页面，目标1、保存1、两视口刷新一致；7 micro-USD夹具费用守恒分配。真实意图模型、搜索、账单及自然语言业务闭环未验收。属于既有确认规则的部分接线验收，不是新增产品规则。[证据](POSITIVE_RESULT_GRAPH_SQL_UI_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段137 / B07、B26实施进度：用户已确认的P06费用及超界处理规则下，评分Agent将不可压缩的超界公司保留为技术待恢复，其同批可评分公司继续按原最多5家及精确缓存契约评分。合成混合次序和全量984项回归通过；图仍在未完成检查点暂停，分阶段大公司、真实模型质量及A11闭环未验收。这是既有规则的部分实现，不是新增用户确认。[证据](P06_OVERSIZED_PEER_ISOLATION_2026-09-14.md)。

2026-09-14 阶段136 / B07、B26实施进度：评分超界的合成图检查点保留公司、原证据及前置额度，恢复不重跑发现/补证/校正；982项全量回归通过。无损压缩与技术暂停已有证据，但不可压缩大单项的分阶段完成和真实模型结构遵从仍未验收。此为既有确认规则的部分验收，不是新确认。[证据](P06_OVERSIZED_SCORE_GRAPH_CHECKPOINT_2026-09-14.md)。

2026-09-14 阶段134 / S01：用户多次明确批准同一项市场计划 Sol 路由和费用合同变更，仍受 A01 累计 USD30 及整次预检约束。实施范围和无付费验证见 [S01 验收](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)；真实最小业务闭环未完成。下文较早阶段所写“S01 待确认”均为当时状态，不代表当前规则。

2026-09-14 阶段133 / B25、B26实施进度：条件复核与裁决各自的有效输出按完整兼容请求依赖、用户/工作区/国家/公司追加式持久化；后续暂停复用已完成子调用，写失败不继续启动下一付费模型。迁移重复执行、真实SQL跨进程隔离及合成 Agent 回归通过，真实付费整图未验收。属于既有结果复用与批次安全规则的部分实现，不是新用户确认；历史费用未知、A11合同与S01待确认不变。[证据](REVIEW_SUBCALL_CHECKPOINT_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段131 / B07、B25、B26验收进度：同一隔离合成任务第一进程评分前暂停，第二进程从真实PostgreSQL检查点使用当前评分Agent和共享短语编码完成1次模拟评分并写入产品结果SQL；101证据/105事实及遥测保留，缓存契约一致，跨用户/动作恢复拒绝，合格和交付0、无真实费用。该路径仍从预置已校正候选开始，不含自然语言/真实供应商或任意大单项分阶段处理；是既有规则的部分验收而非新确认。[证据](P06_SHARED_PHRASE_CROSS_PROCESS_PRODUCT_SQL_2026-09-14.md)。

2026-09-14 阶段130 / B07、B26验收进度：101证据/105事实的无损共享短语评分经实际产品图与 `persistLeadWorkflowResult` 写入一条完成评估、101证据快照、评分遥测及用量；合格0、公司交付0，第二账号不可读、无付费记录。隔离夹具已清理。此为既有规则的真实SQL部分验收，不是新确认；两进程恢复与产品SQL为独立夹具，真实模型和A11完整业务仍未验收。[证据](P06_SHARED_PHRASE_PRODUCT_SQL_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段129 / B07、B25、B26验收进度：101证据/105事实的共享短语评分请求经真实图与PostgreSQL检查点在第二进程由当前评分Agent完成，准备metadata及13个合成额度保留，前置阶段不重跑、跨用户/动作恢复拒绝、国家/证据变化使缓存契约失效。模拟评分完成但本夹具最终合格0；业务结果保存仍为模拟适配器、0真实付费。这是既有规则的跨进程部分验收，不是新确认或完整P06/A11通过。[证据](P06_SHARED_PHRASE_CROSS_PROCESS_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段128 / B07、B26实施与验收进度：P06 完整评分 Agent 的超界单公司可对重复的独有事实短语作精确字典引用，完整证据/事实/引用可反解；101证据/105事实合成请求进入既有61,440字节上限，151证据/155事实不可压缩案例仍在外发前暂停。970项测试、类型检查及生产构建通过，0付费。这是既有规则的部分实现及合成回归，不是用户新增确认；真实模型结构遵从与跨进程完整业务尚未验收。[证据](P06_SHARED_PHRASE_SINGLETON_ACCEPTANCE_2026-09-14.md)。

2026-09-14 阶段120 / D13-O03、A09 验收进度：已采纳的“以最终合格保存数和缺口为目标，部分完成明确原因”在对话卡及详情页共用标签；合成生产 UI 两视口66组通过，缺失历史数仍为未知。此为既有确认规则的部分实现和测试，不是新的用户确认，也不证明真实业务填满目标。[验收](SEARCH_TASK_STATUS_LABEL_PRODUCTION_UI_2026-09-14.md)。

2026-09-14 阶段119 / A04、A07、O03 验收进度：零合格结果经实际产品 SQL 可并发幂等保存，空处理公司集合的合成共享预留保留为未分配、未知核销而不虚构公司费用。这是既有规则的部分实现证据，不是新的用户确认，也不证明真实业务停止原因或 A11 闭环。[证据](ZERO_QUALIFIED_RESULT_PERSISTENCE_2026-09-14.md)。

2026-09-14 阶段118 / B07、B26验收进度：完整评分 Agent 合成回归证明独有证据/事实在可压缩范围内保留值、顺序和引用；压缩后仍超限的公司在调用前停为未完成，不被判低分或不合格。这是既有 P06 边界的部分验收，不是新规则确认或真实模型质量证明。[证据](P06_FULL_SCORING_AGENT_SINGLETON_BOUNDARY_2026-09-14.md)。

2026-09-14 阶段117 / A02只读证据：当前配置的 SearchAPI 凭据可访问官方账号用量接口，但返回字段不能核定当前套餐单价；阶段116的费用拒绝继续有效。此为观察结果，不是用户新确认、已验证费率或准入。[报告](SEARCHAPI_ACCOUNT_READONLY_CHECK_2026-09-14.md)。

2026-09-14 阶段116 / A02实施进度：SearchAPI 当前账号套餐/速度档未核实，产品入口即使有公开参考价也在费用报价时返回 `missing-tariff`，不预留或外发；现有窄请求校验保留，未来准入须有账号合同证据与新版本。此为既有“完整上界缺失即阻止”的修复，不是新价格或路由确认。[验收](SEARCHAPI_ACCOUNT_BOUND_HOLD_2026-09-14.md)。

2026-09-14 阶段115 / A12、O03实施验收进度：发现执行器对合成 `missing-tariff` 与 `budget-exhausted` 保留费用拒绝错误，不写供应商故障或市场耗尽计数。此为既有预算/停止规则的无付费回归证据，并非新增用户确认或真实业务闭环。[报告](DISCOVERY_BUDGET_DENIAL_STATUS_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段114 / A11实施进度：当前最小路径的 Exa 条件发现及 Tavily 官方/校正两类补证，以生产提供方合成传输核对现行严格合同，3条请求均在外发前拦截。原费率、路由、地域与评分边界不变；这不是新用户确认、真实市场闭环或付费放行。[报告](MINIMAL_ACCEPTANCE_EXA_TAVILY_WIRES_2026-09-14.md)。

2026-09-14阶段113 / A11实施进度：最小路径 Brave 核心入口的生产提供方合成请求合同已捕获并验证，CO按既有策略使用 `country=ALL`、单次静态上界USD0.005；真实外发和预算变更均0。此为已授权预检，不是新搜索范围、费率或用户确认；S01及整次真实业务仍待。[验收](MINIMAL_ACCEPTANCE_BRAVE_WIRE_2026-09-14.md)。

2026-09-14阶段112 / A11实施进度：最小闭环只读预检现覆盖当前具体发现、补证、校正、评分和条件复核路径，明确两条搜索缺合同、Terra缺合同、Sol裁决超合同及现行市场计划单次超余额；无用户新确认、无产品路由或付费准入变更。S01依A11仍待单独确认，真实请求及整次预算未验收。[路径清单](MINIMAL_ACCEPTANCE_ROUTE_COVERAGE_2026-09-14.md)。

2026-09-14阶段111 / A05、A08实施进度：公开费率刷新在价证待审或既有粘性暂停时，后续追加遥测不再把它算成下游可用输出；有效价证与真正被下游使用分别计数，原暂停和静态合同不变。15项合成定向测试及 typecheck 通过，不回写历史记录、无新产品确认。[报告](PUBLIC_RATE_HOLD_USAGE_ACCOUNTING_2026-09-14.md)。

2026-09-14阶段110 / A05实施进度：Exa Search 和 Google Places Text Search Enterprise 的现行静态上界新增官方公开单价只读刷新与预算页面展示。真实SQL中 Exa 一致；Places 一次265字节短页无法核实，现保持 review-required/hold=true，后续独立官方页面与基线一致也不自动解除。原金额、截止、路由均未改；SearchAPI 套餐归属/完整上界仍缺，继续阻止。此为已授权部分验收，不是新费率或新用户确认。[报告](EXA_PLACES_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段109 / B25、D13-O01实施进度：评分付费响应已返回但缓存与图检查点都未持久化时，恢复保留原检查点时间，按用户/任务/公司国家哈希查询已记账响应并阻止自动重放；有效缓存仍复用、费用占用不释放。真实PostgreSQL跨进程合成故障回归通过。这是已确认规则的部分实现，不是新产品确认、真实模型闭环或整体验收。[证据](UNCHECKPOINTED_SCORE_RECOVERY_GUARD_2026-09-14.md)。

2026-09-14阶段108 / A05实施进度：现行 Brave/Tavily Search 静态上界新增每日官方公开单价与credit用量只读复核，漂移时按受影响规则粘性暂停新预留；真实SQL/生产UI通过。这是既有费用门禁的部分实现，不是新用户确认、新费率或新路由。原2026-09-20截止和A11/S01状态不变。[验收](SEARCH_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段107 / A05、A11实施进度：现行 DeepSeek Flash/Pro 静态合同新增每日官方公开费率只读复核、漂移时粘性暂停新预留和预算状态展示，真实SQL/生产UI通过。此为既有费用门禁与费率刷新要求的部分实现，不是新费率、新路由或用户确认；原合同金额及 2026-09-20 截止不变，A11变更确认与S01路由确认仍待。[验收](DEEPSEEK_PUBLIC_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段106 / D13、P05实施进度：已完成评分批次缓存保存失败或缺少精确复用合同后，停止启动后续批次并保留待恢复状态；真实PostgreSQL合成检查点恢复通过。这是已有O01/O04及中断恢复规则的部分实现，不是新用户确认；A11新费用合同与S01路由确认仍待。[证据](ASSESSMENT_BATCH_PERSISTENCE_STOP_2026-09-14.md)。

2026-09-14阶段104 / A10、A11实施进度：现行 Sol 合同已接七天公开只读复核、漂移/无法核验时粘性暂停新预留，网络失败不延长静态期限；真实SQL和本地生产UI通过。这是既有确认规则的部分实现，不是新产品确认；其他费率刷新、变更确认及S01路由确认仍待。[验收](OPENROUTER_SOL_RATE_REFRESH_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段103 / A02实施核查：四条默认OpenRouter备用模型公开端点只读审计发现 DeepSeek V4 Flash/Pro价格证据已漂移、所有可兼容端点缺显式缓存写价，仍不得准入。[缺口审计](OPENROUTER_DEFAULT_FALLBACK_GAP_AUDIT_2026-09-14.md)。这不是新确认；A11变更确认、A20 credits-only、D13 O01–O05采纳及S01待确认状态不变。

2026-09-14阶段102 / A11预检进度：合成市场计划SDK实际传输4,171字节/4,096输出符合现行Sol合同，但27.345252单次上界超最后余额。此为已授权只读验收证据，不是新用户确认或付费许可；A11变更确认、A20 credits-only、D13 O01–O05采纳及S01待确认状态不变。[报告](MINIMAL_ACCEPTANCE_PLAYBOOK_WIRE_PREFLIGHT_2026-09-14.md)。

2026-09-14阶段101 / O04、P05实施进度：公开主角色缓存读取异常不再按未命中发起补证/模型，恢复后真实空缓存仍可继续。此为D13已采纳复用及已授权防重放修复，不是新用户确认；A11费用变更、A20 credits-only与S01待确认状态不变。[验证](ROLE_CACHE_READ_FAILURE_GATE_2026-09-14.md)。

2026-09-14阶段100 / O04、P05实施进度：可选市场计划缓存写入失败不再丢失已生成计划，图检查点保留计划及额度并可跨进程恢复。此为D13已采纳的复用与已授权恢复修复，不是新用户确认；A11费用变更确认、A20 credits-only和S01待确认状态不变。[验收](PLAYBOOK_CACHE_WRITE_RECOVERY_2026-09-14.md)。

2026-09-14阶段99 / A11费用合同进度：Sol 分歧裁决 12,000 输出的公开端点只读复核得 USD27.736500/次候选上界，仍超现行 4,096 输出合同及最后余额。这不是新用户确认或实际费率准入；A11变更确认、A20 credits-only、D13 O01–O05采纳与S01待确认状态均不变。[候选合同](OPENROUTER_SOL_JUDGE_PROPOSAL_2026-09-14.md)。

2026-09-14阶段98 / A08验收进度：真实本地生产HTTP和Chrome两视口58组证实阶段用量聚合刷新不重计、未知采用保留；这是已确认遥测规则的合成验收，不是新产品确认或真实业务采用证据。[报告](WORKFLOW_USAGE_PRODUCTION_HTTP_2026-09-14.md)。

2026-09-14阶段97 / A08实施进度：工作流阶段与模型聚合经独立API字段只读展示，未知用户采用不填零，真实SQL合成对账及跨用户隔离通过。此为既有A08遥测要求的实现，不是新用户确认；A11费用变更确认和S01待确认状态不变。[报告](WORKFLOW_USAGE_AGGREGATE_ACCEPTANCE_2026-09-14.md)。

2026-09-14阶段96 / P05实施进度：公开角色校正缓存引用绑定 v3 精确区分同页同摘录、不同标题证据；旧绑定 miss 保留历史。此为已确认缓存身份与引用正确性范围内的修复，不是新产品确认，不改变 D13、A11 费用变更确认或 S01 待确认状态。[验证](ROLE_CORRECTION_CACHE_BINDING_V3_2026-09-14.md)。

2026-09-14阶段95 / A11费用合同进度：官方公开 Terra 端点只读复核仍得二次复核候选上界 USD11.019202；这不是新用户确认或实际费率准入，不改既有 A11 变更确认、A20 credits-only、D13 O01–O05采纳和 S01 待确认状态。[候选合同](OPENROUTER_TERRA_REVIEW_PROPOSAL_2026-09-14.md)。

2026-09-14阶段94 / P05、用户修改优先的验收证据：隔离真实SQL证明再评估不覆盖同国手动主角色、账户等级、阶段和跟进行动，机器分数可更新、冲突继续标为需重验，另一国及用户隔离；fixture清理，0真实付费。此为已有确认规则的验收，不是新的产品确认。[报告](USER_OVERRIDE_REASSESSMENT_SQL_2026-09-14.md)。

2026-09-14阶段93 / A13实施进度：Gemini外部问答明确非完成响应不进入答案整合，费用和未完成状态保留；这是已授权回归修复，不是新用户确认。Gemini费用门禁、S01待确认及D13采纳状态不变。[验证](GEMINI_EXTERNAL_ANSWER_COMPLETION_2026-09-14.md)。

2026-09-14阶段92 / A02实施进度：Gemini发现请求新增12,000生成输出上限，明确非完成结果不转成有效公司；仍缺服务端搜索次数费用上界，保持拦截。此为已授权费用/未完成状态修复，不是新用户确认、不改变D13、A20或S01待确认状态。[验证](GEMINI_DISCOVERY_OUTPUT_BOUND_2026-09-14.md)。

2026-09-14阶段91 / A11预算核查：新增[条件复核情景](OPENROUTER_REVIEW_BUDGET_SCENARIO_2026-09-14.md)，S01与Terra上界合计超最后余额。此为只读推算，不是新确认、不改变A20 credits-only、D13采纳或S01待确认状态；付费前仍须重核累计USD30。

2026-09-14阶段90 / A20、D13实施进度：当前账号仅OpenRouter credits、无BYOK的已确认范围不变。公开抓取6模型52端点仅作证据；备用校正补默认8192输出上限，未知模型费率/完整合同仍拒绝。此阶段没有新用户确认规则，也没有采纳S01路由候选。[费用审计](OPENROUTER_REMAINING_ROUTE_AUDIT_2026-09-14.md)。

2026-09-14阶段89 / D13实施进度：恢复检查点继续前重新核验证据日期、内容/当前运行绑定、原快照及公共文档版本；到期或无法核实的公司重回必要补证，原费用保留。此为已确认O01/P05的部分实现证据，不新增确认规则。888测试/195文件、build、局部lint与隔离SQL通过，0真实付费；真实业务仍缺。[阶段报告](RECOVERY_RESUME_DEPENDENCY_REVALIDATION_2026-09-14.md)。

2026-09-14阶段88 / D13实施进度：恢复链唯一保存公司数按用户、原任务、国家及已完成运行的实际入库选择对账；重复槽位不补量，缺失来源保留未知。此为已采纳O01–O03的实现/合成验收证据，不新增确认规则，不改冻结测评。882测试/194文件、build、真实SQL及生产Chrome两视口56组通过；0真实付费/发信，A11仍未验收。见[恢复链对账](RECOVERY_FAMILY_RECONCILIATION_2026-09-14.md)。

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

2026-09-13阶段66 / A21、B25恢复验收：结果提交保存完整JSON输入身份；同一run相同输入幂等，不同输入拒绝，历史无身份保留待核对。实际产品SQL两国6次冲突/2次旧记录拒绝通过，原事件/国家/费用守恒；834测试、build含类型及局部lint通过。无新用户规则、无真实付费，不把此项当历史缺项恢复完成。

2026-09-13阶段65 / A21待处理展示：复用已有检查点接口公开待校正/待评分候选项，按阶段不相加；任务刷新重新读进度，缺失/失败unknown、已知0保留。生产Chrome两视口44组通过，真实Postgres检查点1/1→0/0、owner拒绝及恢复验证，无节点执行/新付费，fixture清理。832测试/build/生成check及局部lint通过；无新产品规则。

2026-09-13阶段64 / A21页面验收：失败或暂停等有已记录保存数的任务也显示实际缺口，unknown不倒推0；不改变续搜执行规则。最新本地生产Chrome两视口42组检查通过，含九类数量/停止状态与刷新，原国家/个人修改/成本回归通过。832测试/build/生成check通过，无真实付费/发信，fixture清理；待处理检查点数量展示及真实业务UI仍未完成，无新规则。

2026-09-13阶段63 / A21实际入库验收：调用产品persistLeadWorkflowResult定位并修复证据有效期参数整数/文本冲突。两国4并发实际SQL通过，1共享身份/2国家记录/2证据/14幂等事件，23微美元合成预留分摊守恒且未知保留、跨用户不可读；fixture清理。无新规则、无真实付费、未改累计USD30；完整真实模型/UI闭环仍未验收。[报告](RESULT_PERSISTENCE_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段62 / A21遥测实施：结果保存写saved/delivery-selected并标记system，用户采用/页面查看为null；有效角色依完成契约计数。迁移054仅扩展事件枚举及v2唯一索引，历史不改。实际SQL重复仅7事件、冲突拒绝、国家/用户隔离通过，迁移已应用，fixture回滚、0付费。无新产品规则，真实UI采用仍待接线，[边界与回滚](ARTIFACT_OBSERVATION_BOUNDARY_2026-09-13.md)。

2026-09-13阶段61 / B25、B26验收：当前字段表压缩及实际序列化契约通过两进程PostgreSQL检查点恢复：100证据/准备metadata/13合成额度保留，校正不重做，owner/action拒绝及国家/证据契约变化通过。typecheck通过，隔离thread清理，0付费。仍是合成业务适配器，不替代完整真实业务或实际Agent全部契约；无新规则，goal active。

2026-09-13阶段60 / B07、B26实施：超限单公司新增独有证据/事实的字段表结构化压缩，完整值/引用/顺序保留，按实际主/备用请求测量；仍超限保持未完成并暂停。既有规则明确压缩或分阶段，未新增自动付费摘要。63针对性测试及生产build通过，内存图恢复保留候选/费用且不重复搜索补证；真实模型、跨进程全链路仍待验收。[边界与证据](P06_STRUCTURED_SINGLETON_2026-09-13.md)。

2026-09-13阶段59 / A20、A21实施：credits-only Sol精确标准文本JSON请求加入静态v1.6.0，完整上下文分别计入输入/缓存读/写，4096输出，上界USD27.345252，到期2026-09-20T00:00:00Z；不改模型/路由，未知能力拒绝。828测试/build通过，预算只读仍12.324404/30，单次预留高于余额，真实业务未调用。无新用户决定；A20确认不替代其他模型上界、历史费用或整体验收证据。[计算与限制](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)。

2026-09-13阶段58：A20既有credits-only确认已重新核对，用户再次明确当前账号/工作区“未配置 BYOK，仅使用 OpenRouter credits”，覆盖本次询问列举的OpenAI/Azure/Bedrock等供应商。此前阶段56–57重新列为待确认是恢复核对遗漏，现撤销该当前阻塞，保留历史过程。当前产品124b0c2全量826测试/181文件、生产build含类型检查、生成check通过；生产依赖及全依赖npm audit均0漏洞，lint0错误/11既有警告。无新付费，整体仍未完成。

2026-09-13阶段57 / A21采用遥测：续搜创建记录1个有效新提案，重复复用记录0新输出，不再每次点击累计下游使用；两者执行计数0、userAdoptedItems=null，保留输入/耗时/重复原因/费用0。5项相关测试、typecheck、生成check及真实SQL通过：两次调用仅1新提案，无执行job，父结果不变且RLS通过。verify-search-continuation.ts改为临时隔离账号，全部schema/fixture事务回滚，无付费。历史终态缺项恢复仍待完成，BYOK确认尚未收到，goal active。

2026-09-13阶段56：实际LangChain市场计划请求离线捕获，7个顶层字段、2纯文本消息、strict JSON Schema、4096输出和既有provider参数，无工具/插件/特殊层；模拟门禁后仅1次传输捕获，0真实推理。typecheck通过。只读key元数据证实非管理key，不能据此推定未配置BYOK，已询问用户工作区状态；不索取密钥。详见[费用核验补证](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)。产品未改，无新增规则，goal active。

2026-09-13阶段55：公开API捕获Sol 7端点及来源哈希，官方证据澄清当前未启用特殊服务层，不需把flex/priority直接归入当前路由；标准Azure仍有长上下文/缓存收费差异。脚本和typecheck通过，0推理/付费/账号变化，未启用费率或改模型。详见[费用上界核验及下一步骤](OPENROUTER_SOL_BOUND_AUDIT_2026-09-13.md)，整体验收未完成。

2026-09-13阶段54：新增最小闭环只读预检脚本，当前目标1首池2，预算仍12.324404/30；市场计划实际openai/gpt-5.6-sol缺完整费率，未启动已知会中断的前置付费。仅验证5个入口费率可用性，不是整次费用上界；无调用/账号修改/任务认领，typecheck通过。详见[预检结果与下一必要工作](MINIMAL_PRODUCTION_PREFLIGHT_2026-09-13.md)。无新产品规则，goal active。

2026-09-13阶段53 / A21、D13-O04验收：阶段52搜索指纹通过真实应用角色SQL与合成传输验证，未知响应后两并发重试在出网前拒绝、参数换序复用身份、原10微美元合成预留保留、其他operation独立、成功请求禁止重复。原核销/分摊检查继续通过；typecheck通过，fixture清理，真实付费0，无新规则。

2026-09-13阶段52 / A21、D13-O04恢复：已核验的Brave/Tavily/Exa/Places/SearchAPI同步搜索在发送前生成请求指纹，接入既有按用户/operation/stage隔离的持久账本防重放；模型原指纹不变，轮询不扩大适用。查询/正文排序规范化，Places字段范围纳入身份，凭据不进入语义身份。825测试/build/生成check通过，真实SQL搜索恢复待补验。预算只读重核仍USD12.324404/30、6未知，无新付费；无新产品决定。

2026-09-13阶段51 / A21验收：阶段50审核修复通过真实SQL补验，包括跨用户、事务锁、重复决定、并发唯一新决定、部分批准恢复、遥测2个新输出及知识可检索。固定合成数据与预存知识，无新付费；首次fixture字段缺失已回滚修正。无新产品决定，邮件模型提取/嵌入及页面全链路仍未完成。

2026-09-13阶段50 / A21恢复与采用率收尾：邮件候选审核按用户/候选事务锁串行，重复同决定复用，相反决定或处理中返回409；已保存知识但状态提交中断时保留批准恢复资格，禁止改为拒绝。保持私有知识规则，无新产品决定。8项针对性测试、820全量测试（遥测包装前）、最终包装后针对性/typecheck/生产build通过。真实SQL并发及邮件全链路仍待验收。

2026-09-13阶段48 / A21验收：两视口24组真实浏览器检查通过，新增一年以上证据提醒及保留查看；私有开发知识真实SQL检索验证两用户、国家/角色/归档/用途过滤及RLS，无嵌入API。首次合成状态值错误已事务回滚后修正。typecheck通过、fixture清理、无付费/发信，无新规则；通用RAG/邮件知识全链路仍不据此标完成。[证据](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段47 / A21渠道图验收：修复手工添加响应的国家字段和英国别名归一，新增节点即时显示；保持公司身份共享、国家业务隔离与待核实状态。真实Chrome桌面/手机22组检查通过，含手工表单、重复返回已有公司且不新建。812测试/build/生成check通过，0搜索/模型/发信，fixture清理。未新增产品决定，[证据](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段46 / A21 UI收尾：详情新增缺失的账户等级编辑，沿用现有层级兼容与个人记忆保存规则；真实生产Chrome两视口20组检查通过，其中角色/等级/路径三项修改经页面→API→SQL记忆核对，国家隔离及评分待更新提示正确。无自动重评/搜索/发信，fixture清理。812测试/build/生成check通过；无新产品规则，[页面证据](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)，整体仍未完成。

2026-09-13阶段45 / A21本地生产验收：真实Chrome桌面/手机18组页面检查通过，范围为鉴权、国家详情/图、任务/知识导航、预算取消与读取、公司成本真实API和刷新；数据均隔离合成，0付费/发信，已清理。累计占用只读重核USD12.324404/30、6未知保留。仅此范围通过，用户修改/真实业务闭环仍待验，不新增规则。详见[页面报告](LOCAL_PRODUCTION_UI_ACCEPTANCE_2026-09-13.md)。

2026-09-13阶段44 / A08与D13-O03：首轮零候选不再直接抛异常；保留run、调用证据、费用和实际处理集合，由已有图控制器决定继续/耗尽/供应商不可用。预算异常仍抛出，不返回伪零结果。812测试/178文件、生产build（含类型检查）和生成check通过；合成图验证零输出可进入结果/费用完成路径且不调用评分。无新规则或付费，实际浏览器/业务仍待验。

2026-09-13阶段43 / A07–A08：任务预算API及页面接入公司当前费用投影，逐预留读取五种独立口径，按已保存归属/完成集合分摊，未关联归属独立展示；每种金额显示已知次数/相关调用次数，未知与零分开。仅从当前用户当前任务搜索结果关联域名/国家，不借用其他任务身份。808测试/177文件、typecheck/build、真实SQL守恒/重复读/用户任务隔离与静态页面渲染通过；浏览器和真实业务尚未验收。无新业务规则或付费。

2026-09-13阶段42 / A07–A08实施：工作流公共开销显式task-shared，直接公司调用继续覆盖为company-inputs；跨轮累计实际门禁处理公司键，含拒绝/缓存复用，不按目标或合格数分摊。结果事务保存完成集合及独立预留分摊，集合不可静默改变；后到核销采用该集合，原观测和金额不重写。旧检查点缺集合保持未知。805测试/175文件、typecheck/build/生成check及真实SQL合成核销通过；公司成本页面和真实业务仍未完成，不新增确认规则。

2026-09-13阶段41 / A21阶段4、D13状态同步：当前验收矩阵已逐行整合阶段25–40实现、合成/SQL验证及剩余真实验收；旧矩阵原样归档，避免旧“全部待实现”覆盖O01–O05当前证据。D13采纳持续有效，无新产品决定；Gemini完整费用上界仍缺官方搜索次数约束，继续门禁。仅文档核验，无代码/费率/付费变化，整体验收未完成。后续状态以[唯一矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)为准。

2026-09-13阶段40 / A21费用及D13-O04兼容性：SearchAPI普通Google/Bing第一页保守上界USD0.008接入，覆盖公开增强速度最高档，至2026-09-20T00:00:00Z；Google按官方固定num=10，Bing最多20，不自动追加分页。严格字段/引擎契约，旧发现会话版本不静默复用。802测试/typecheck/build通过，无付费；[依据及范围](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。

2026-09-13阶段39 / A21费用收尾：Google Places现有Text Search字段集合按Enterprise SKU保守预留USD0.035/次，至2026-09-20T00:00:00Z；实际FieldMask纳入发送前白名单校验，禁止字段扩张沿用旧预留。800测试、typecheck/build通过，无付费。公开标准价、字段和范围详见[核验来源](SEARCH_REQUEST_BOUNDS_2026-09-13.md)，不把预留当作已核销账单。

2026-09-13阶段38 / A21费用收尾及D13-O04兼容性：Exa auto/company纯文本搜索最多20结果的保守预留USD0.027已按官方来源核验并接入，至2026-09-20T00:00:00Z过期。移除官方已不支持的company/excludeDomains组合；原查询及本地排除保留，不扩范围。请求契约版本升级，旧会话不能静默复用；costDollars只作估算，不核销。798测试、typecheck/build通过，无付费；来源与限制见[搜索上界核验](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。

2026-09-13阶段37 / A21费用收尾：按已授权边界核验并启用Brave普通Web Search上界USD0.005/次、Tavily basic/advanced Search统一保守上界USD0.016/次；仅公开标准计费，严格方法/端点/字段白名单，有效至2026-09-20T00:00:00Z。见[来源与请求边界](SEARCH_REQUEST_BOUNDS_2026-09-13.md)。796测试、typecheck/build通过，无新增付费；预算只读重核仍USD12.324404/30，6笔历史未知保留。此为请求上界，不是账单核销；其他未核验入口继续阻止。

2026-09-13阶段36 / B26-P06：超限单家公司请求新增无损重复文本字典压缩。只合并完全相同且至少256字符的证据标题/摘录，保留每项ID、URL、来源、全部事实与引用；只在实际主/备用请求字节减少时采用。原始证据不改写，缓存身份使用压缩后的实际请求。795测试/174文件及typecheck/build通过，无付费。普通批次不改变；无可合并文本或压缩后仍超限继续暂停，独有事实过大的分阶段处理及完整P06仍未完成。

2026-09-13阶段35 / B26-P06：校正/评分拆批开始使用主路由及获准备用模型各自序列化后的完整字节数，包含schema、实际模型和extraBody，最多5家公司及既有字节上限保持。公开专用路由不参与私人请求拆批；熔断状态不改变批次或缓存身份。真实适配器+受控传输验证备用schema导致的双公司拆分、发送字节一致及路由成功；全量792测试、typecheck/build通过，无付费。这是提前按所有获准路由拆批，单项仍超限时继续暂停，结构化压缩/分阶段处理仍待实现，不标记完整P06通过。

2026-09-13 阶段34 / D13-O05：13 个具体角色的可观察证据锚点接入评分请求，沿用现有评分卡、权重、资格与证据上限；family/subtype 不一致、Hybrid 或 Unresolved 不进入评分付费批次，保留 research-required/retry-required。缓存依赖同步采用过滤后的实际批次与新提示版本。冻结 374 条校正记录覆盖回放：112 条具体角色可用、208 条主角色待定、54 条校正需恢复；不等于唯一公司数或恢复数量。791 测试、typecheck/build 通过，无付费、无盲审重跑。O05 规则实施及离线覆盖完成，真实产品接线验收和整体 goal 仍未完成。

2026-09-13 阶段33 / D13-O04：策略1.7.0将四类搜索各轨Brave设为核心，Retail Places、Distribution/SI Exa、Distribution/Resale Gemini按任务+类别的已购新增公司贡献条件启用；SI原有Gemini也保留为可选探测，其余类别不变。不全局禁工具，连续两次成功新请求无新增才暂停该任务类别的可选调用（沿用已有阈值2），故障/缓存不计无贡献。跨轨复用忽略内部类别/轨道/机制标签，但严格保留实际请求输入差异；策略/契约版本进入会话依赖。788测试/typecheck/build通过，无新实验/付费，实际业务验收仍待完成。

2026-09-13 阶段32 / D13-O04：发现调用结果与门禁结果在轮内写入带用户/工作区/国家/任务/请求契约的检查点；恢复重建已完成调用与门禁，不再当作新供应商调用。遥测写入事务化且按运行/请求指纹幂等，整轮汇总按轮次幂等；保存故障不污染供应商健康。786测试、真实SQL并发幂等/恢复边界、typecheck/build通过，无付费。跨轨实际请求去重、类别条件路由及整体业务/UI验收继续。

2026-09-13 阶段31 / D13-O04：产品发现轮次之间开始传递任务会话快照，保存去重集合、已购搜索结果、失败/熔断/冷却状态到图检查点。依赖覆盖原请求、任务、国家、策略与供应商配置摘要，变更时阻止直接恢复旧会话；不保存明文凭据或rawResponse。784测试、typecheck/build通过。单轮内部中断保存、跨轨请求契约去重和类别条件工具顺序仍待完成，O04未整体验收。

2026-09-13 阶段30 / D13-O02/O03：O02真实路由SQL验证通过，用户/工作区/国家隔离和范围外状态已核对。角色待判明确返回role-unresolved，不能认定搜索耗尽；最终保存不足返回qualified-shortfall而非沿用中间target-met；故障期间旧停滞数不能证明耗尽。任务消息与页面共用停止原因，未达标显示部分完成及缺口。完整780测试及生产构建通过；此进度不替代真实业务/UI整体验收。

2026-09-13 阶段29 / D13-O02：新增独立候选路由节点，按规范化公司身份、国家、目标家族关联；目标具体角色必须属于原请求，范围外只保存状态，同家族未请求子类型也不自动扩大范围。跨轮次重复只送一个公司评分，优先复用已有完整评估的候选ID；冲突角色保留待判。路由先写 run.metadata.candidateRouting，再进入评分，写入失败从路由检查点恢复，不重做校正。合成单元/图验收通过，真实路由SQL与冲突恢复闭环尚待验收。

2026-09-13 阶段28 / D13-O01/O03：真实 PostgreSQL 跨进程缺项恢复和核销后失败请求恢复门禁验证通过（合成公司持久化适配器）；续搜只排除 scoring_status=completed，连续零结果不单独认定市场耗尽，processing-incomplete 禁止新建续搜。O01 历史终态兼容、跨国家恢复和完整业务持久化验收仍未全部完成。

2026-09-13 阶段27 / D13-O01：处理缺项改为停在可恢复检查点，现有失败任务恢复入口只重开缺失校正及未完成评分，保留完整评分、证据与累计费用。恢复前核验整个任务的未知/在途/超界费用，禁止用改变批次绕过请求防重放。合成跨流程实例恢复验证通过；真实 PostgreSQL 跨进程恢复、历史终态任务迁移及全部 O01 验收仍待完成。

2026-09-13 阶段26 / D13 实施进度：O01 已接入校正完成状态、异常角色缓存读写门禁及处理未完成停止原因；角色策略升至 v4，使旧缓存依赖失效。合法多家族 Hybrid 与证据不足 Unresolved 保留原语义。未完成付费请求没有自动重放授权。恢复入口与完整状态持久化尚待实施，O01 未整体验收；O02–O05 的用户采纳持续有效，仍按报告边界实施。

版本：1.26.0。整理日期：2026-09-15。来源：本项目用户确认记录及仓库文档。

阶段25 / A05/A20：OpenRouter固定HTTPS即时响应在完整usage.cost、明确is_byok=false及请求唯一关联后可追加核销；缺失/过期/不匹配保留预留。761 tests/170 files、typecheck、生产build及真实数据库合成传输入口验证通过。未改变模型/路由，不新增付费，不开放未核验费率；真实完整业务待验收。验收占用只读重新核验USD12.324404/30，6笔费用仍未知。D13仅为新优化采纳，O01–O05实现仍未完成。

### D13 — 采纳 O01–O05（2026-09-13，用户明确确认，待实施）

用户原话：“采纳 O01–O05，按报告边界实施”。对应 [流失调查方案表](COLOMBIA_CANDIDATE_ATTRITION_2026-09-13.md)：O01异常角色/未完成状态、O02原请求四类别范围内可追踪错类转移与去重、O03最终合格目标/停止和恢复状态、O04任务工具健康/跨轨去重及类别条件启用、O05角色评分锚点与family/subtype校验。具体实施必须保留报告验收边界：不降标准、不扩大用户指定范围、不新增调查搜索/补证/模型盲审、不改写冻结结果、不把潜在恢复池当合格增量；模型质量验证如需额外调用仍受原授权边界约束。此确认覆盖D12及相关文档的O01–O05待采纳状态，不等于已实现或通过验证。确认时生产代码尚未改变；后续逐项登记实现及验收证据。

### A21 — 本次完整 plan 的验收范围（2026-09-13，用户明确授权）

完成已授权费用门禁/核销/公司成本、P05/P06与中断恢复、遥测/UI及本地生产最小真实闭环和最终回归；累计 USD30 上限不重置，最后历史占用 USD12.324404，付费前重新核验。只用隔离验收账号，不执行已有用户待办；已通过模型连通性及 SMTP 收件不重复列待测，除非相关实现变化影响其证据。不含云部署、新市场实验或无关扩展。全部必需项实际通过才标记整体验收完成。实现/验收状态：部分实现、整体未通过，以 [当前矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md) 为准；创建 active goal 不构成实现或测试证据。

### D12 — 候选不足调查与新优化采纳边界（2026-09-13，用户明确授权）

仅使用冻结现有测评数据，不重跑正式实验、不新增搜索/补证/模型盲审；不降低合格标准、不扩大指定范围、不使用重复公司补量。以最终合格数量为目标；预算、供应商不可用或有依据的耗尽允许部分完成，并明确缺口和停止原因。新搜索/角色判断/评分优化须形成可核对方案，用户确认后才能进入真实产品。原冻结报告与盲审失败不改写，不将确定性回放解释为实际填充率提升。实现/验收状态：首版 [调查与O01–O05建议](COLOMBIA_CANDIDATE_ATTRITION_2026-09-13.md) 完成、8项离线对账通过；原历史缺失明确未知；O01–O05尚未采纳，生产代码未因调查而改动。本轮不使用旧恢复文档中追加最小模型校准的建议发起模型调用。

阶段 24 / A06/A07/B21：补证和主角色补充搜索逐公司费用归属、门禁逐真实批次归属已接入；补证预算停止不再被吞为普通警告。722 tests /169 files、typecheck/build 通过，无新增付费。没有新增规则或扩大预算；完整共享成本与真实业务等未完成，详见验收阶段 24。

### A20 — 当前 OpenRouter 账号计费方式（2026-09-13，用户已确认）

再次确认原话：“未配置 BYOK，仅使用 OpenRouter credits”。范围为当前产品使用的OpenRouter账号/工作区及所有供应商BYOK，不仅限于下面历史说明中的OpenAI/Anthropic。实施状态：credits-only报告适配已在阶段25实现并经合成SQL验证；完整请求上界尚未启用，真实业务费用报告仍待验证。当前无需再次询问此账号状态，除非用户明确告知配置发生变化。

用户明确确认：当前账号仅使用 OpenRouter 充值余额，未配置 OpenAI/Anthropic BYOK。这是本项目当前账号的计费前提，不推定其他账号或未来账号配置。网关接口报告仍需完整且唯一匹配调用才能按 A05 核销；账号确认本身不证明单次费用、不释放历史未知预留、不提高 USD30 验收预算、不改变模型或路由。如后续启用 BYOK，须重新核验上游单独计费边界，不沿用 credits-only 的完整性结论。本条覆盖阶段 23 的账号待确认状态；正式网关费率及报告适配尚待验证。

阶段 23 / A02/A06/B21：北京区 text-embedding-v4 同步纯文本预留契约及完整向量检查已接入，保留原模型、1536 维配置、无 Embedding 冗余。官网完整批次 CNY0.040960，经有效 FX 和 5% 缓冲预留 USD0.006412；未知账单不释放。719 tests /168 files、typecheck/build、真实库只读预算/FX 核验及双范围依赖审计通过。规则版本不变；OpenRouter 当前账号是否 BYOK 尚待确认，非用户已经批准的计费假设，整体验收未通过。详见验收阶段 23。

### A19 — 兼容评分入口输出上限（2026-09-13，已实现待完整业务验收）

用户明确确认：复核 8,192、裁决 12,000、备用评分 8,192，分别可配置；模型、推理强度和升级条件不变，截断未完成且不自动重试。生效范围 OpenAiCompatibleProvider 的 lead-review-secondary / lead-review-judge / lead-qualification；原生 DeepSeek 主评分等不受影响。实现与检查详见验收阶段 22。本条覆盖 A18 及阶段 21 中关于这些入口的历史待确认状态。

### A18 — 三类文本输出上限（2026-09-13，已实现待完整业务验收）

用户明确确认：回答/整合各 8,192，playbook 4,096。分别可配置，不改变模型和 thinking；截断不记成功、不自动重试，已发生用量与未知费用保留。实现 text-output-policy.ts、三个 SDK 入口及账本完成状态；playbook 缓存纳入契约。详见验收阶段 21。复核/裁决/备用评分额外上限未获确认，不包含在本条授权中。

阶段 20 / A01–A08：现有追加式费用观测保存估算/报告/发票及前后占用的独立守恒分摊，只使用原预留中已存公司归属，不取发票处理任务的上下文。未知仍 null，旧缺失归属不猜测，不新增支出或核销权限。701 tests /163 files、生产 build、真实 SQL 052 合成六观测守恒/幂等/发票优先验证通过，真实账单适配及任务共享完成分摊等仍待完成，详见验收阶段 20。

阶段 19 / A07–A08：评分、主角色矫正、异常复核及修复/升级入口记录实际输入公司与国家键，在原预留事务保存独立的守恒预留分摊；失败费用不丢弃，未知不填零、不新增支出。697 tests /162 files、typecheck/build、真实 SQL 051 合成守恒/隔离验证通过。任务共享完成分摊、其他费用口径持久化和完整公司成本展示尚未完成；规则未变，详见验收阶段 19。

阶段 18 / A01–A06、B11–B15：公共 ECB 参考快照独立入库，worker 运行时每日刷新、失败每小时恢复、跨进程去重；严格 72 小时及 5% 预留缓冲，不扩展既有授权。680 tests /160 files、生产 build、真实 SQL 053 并发/缓存/不可覆盖验证通过，无新增付费。并未据此启用人民币费率或发票核销，不等于整体验收通过；详见验收阶段 18。

阶段 17 / A01–A06、A12、B11–B15：上线版本 request-bounds-v1.1.0 仅允许严格非思考文本 DeepSeek Flash Chat / Pro Anthropic，官网上下文保守上界为 USD0.324404 / USD1.416561 每次，2026-09-20T00:00Z 最迟失效。不是新模型/新费率决策的虚构用户确认，是既有官网费率与保守预留原则的实现计算；其他接口仍缺失即阻止。真实 V4.1 单合成样本计数 155=155、输出有效、一次调用通过；原累计预算占用现 USD12.324404/30，估算 USD0.000054 只追加记录不释放预留，账单未知。详见验收阶段 17，不代表整体通过。

阶段 16 / B21：Kimi 意图、开发策略/邮件/跟进、邮箱学习及 Claude 修改邮件原生入口已关联真实尝试序号与提示版本。667 tests /157 files、typecheck/build 通过。官方 Kimi 原币价格表读取成功，和 DeepSeek 来源观察存入独立 reference-only JSON，未导入付费规则；不等于费用上界/汇率/账单核销通过，无新增付费。

阶段 15 / A06、B21：SDK 调用级预算停止、逐实际 HTTP 尝试归因接入 RAG Embedding/回答、答案整合、LangChain playbook；预算错误不被 playbook 降级吞掉。原生 model 请求在缺少 invocation 时也持久防重放，非模型轮询保持原行为。665 tests /156 files、typecheck/build、真实 SQL 051 合成回归通过；不是所有模型入口或真实业务验收通过。无新增付费，规则内容未改。

### A17 — V4.1-Flash 门禁批准（2026-09-13）

编号勘误：历史阶段文字中用于 Flash 批准的 A12 统一映射为 A17；下方表格原 A12 规则不变，历史记录保留。

用户明确回复“批准；继续尚未完成的剩余验收”，批准采用实际 V4.1-Flash 作为轻量 discovery gate，重新核验版本、费用上界及缓存依赖。门禁默认及旧文本别名配置归一为 `deepseek-flash`；主评分/升级 Pro、thinking 和输出预算保持不变。此批准覆盖下文阶段 13 的“待确认”状态，不追溯改写历史。

实施阶段 14：已修改门禁选择及 Flash 缓存批准 epoch，旧 Flash 快照不再命中，Pro 缓存契约不变；epoch 不是服务商不可变版本保证。账本历史 USD 12/30 预留保持，缺失可信费用上界仍阻止付费。模型切换批准不等于计数方法/费用/真实业务已经验收。官方 recipe 的 V4.1 专用 encoding 已发现，旧 V4 本地统计不可直接作为新模型证明；核验继续中。

实施阶段 13：B25/B26 的单项完整检查点在批内恢复前保存，完整批次依赖不变，不把部分批次标为完成；坏评分快照校验后 miss。A11/B15 的新外部边界：2026-09-13 直接读取 DeepSeek 官网，旧 deepseek-v4-flash 实际已换成 V4.1-Flash。本地该别名用于 discovery gate，主评分/升级均为 Pro，未更改配置或开放费率。采用新实际门禁模型及重新核验的授权待用户明确确认，不伪造确认记录。详见最新验收报告阶段 13。

A01–A08 阶段 9：迁移 052 与真实 SQL 核销验证通过，追加观测/唯一匹配/发票优先/差额占用/受影响费率暂停、四口径折叠展示已实现；638 tests、typecheck/build 通过。内部可信账单适配边界不等于已接入真实账单，原币汇率/分摊/正式计费验收仍待完成。保留历史未知预留，不放宽规则。

A06/B25 阶段 8：已接入上下文的模型请求以完整 HTTP 指纹在用户预留锁内防同任务/阶段重放，迁移 051 与真实 SQL 并发/RLS/未知状态测试通过。历史无指纹不推定等价，不干扰轮询；结果缓存与费用未知仍独立，核销和完整恢复验收尚未完成。

A06/B25 阶段 7：预算作用域内已预留的传输异常作为未知结果停止自动重试/备用切换；未知预留不释放，且不记录为调用前零费用拦截。响应体中断、跨进程幂等及核销仍待完成。

B25/B26 阶段 6：现有用户/工作区评分缓存补显式国家及完整主模型请求依赖；常规完整批次逐批保存，缓存写失败不使已完成评分重放。费用未知不妨碍有效结果复用，预留不释放。跨进程幂等与完整批内恢复等尚未完成。

B21/P02 实施阶段 5：用户/任务预算现有折叠区接入白名单用量合计与覆盖尝试数，不跨协议相加、不推测现金折价；16 组生产模式真实登录检查通过，仅空观测 SQL/合成 UI，非空服务商数据与完整账本仍待验收。

B25/P05 实施阶段 4：公共主角色缓存要求完整主模型请求契约，依赖 v2 纳入身份/输入条件/证据标题与顺序，缺失契约旧数据不视为命中；完整候选 ID 覆盖、模型/路由一致才可写。ID 变化保守 miss，非评分/路径持久缓存完成。规则内容未变，整体验收未通过。

执行指令补充（2026-09-13）：用户要求自动完成剩余任务，再进入主线未验收项目，不再询问是否继续；不扩大既有预算/付费授权。B26/P06 阶段 3 已实现完整 UTF-8 请求预检、常规拆批与超限不可重试保护；单家公司分阶段处理/批内持久恢复等仍待完成，未整体验收。

实施状态补充（阶段 2b）：B21/P02 的 DeepSeek/compatible 调用已关联逐次 attempt、task/promptVersion、请求与响应模型、网关主机/端点类型；规则未变。评分版本关联、其他入口及聚合 UI 待完成，不能声明 P02 整体验收通过。

实施状态补充（2026-09-13，阶段 2a）：B21/P02 逐 HTTP 尝试的缓存/reasoning 原始数值字段已落账本 JSON，未知为 null，测试覆盖失败响应和隐私白名单。版本/重试归因及汇总 UI 仍待完成，不代表整项验收通过；规则内容和版本不变。

最新实施状态：P01/P03 的代码与本地回归已完成，P04 保留完整 Schema；其余 P02/P05/P06 及账本、线上业务验收尚未完成。下方旧条目的“待实施”是确认时状态，以本段和阶段记录为准。596 tests / 142 files、类型检查通过；没有付费模型调用或实测成本降幅。

这是产品规则的审阅入口，不是“产品全部完成”证明。最近的明确用户决定优先于旧方案；历史实验结果不覆盖产品规则。下文“已确认”仅表示需求获准，除明确标注外，不表示代码实现或验收已通过。

## 维护与变更

- 每条规则有稳定编号；修改保留旧版本、原因、用户确认依据、生效范围、实现位置和验证结果，通过 Git 历史追溯。
- 状态按“已确认待实施 / 部分实现 / 已实现待验收 / 已验收 / 已替代”维护；不得以讨论确认替代测试证据。
- 历史要求曾规定每个实现阶段同步更新本表、相关 PRD/端到端文档和效率台账；MA13 起停止效率台账更新，规则、PRD、工作流与验收证据仍须同步。未逐项核查的历史功能明确列为“待映射”，不推定实现完成。
- 用户未来可通过修改文档提出规则变更；文档修改不直接改动运行配置。运行时配置须另行版本化、校验、验证并记录采用版本，保留旧结果使用的规则快照。
- GitHub 只保存规则和脱敏聚合记录，不保存密钥、环境文件、邮箱地址、原始邮件、私有记忆、客户证据原文或完整模型载荷。

## A. 本地验收与费用账本（已确认；完整新机制待实施/验收）

| ID | 确认规则 | 实现/验收边界 |
|---|---|---|
| A01 | 本次只验收本地生产构建；云服务器部署另行验收。真实模型验收累计上限 USD 30，超过前询问。 | 不是所有产品用户的默认预算；不重置历史占用。 |
| A02 | 每次付费调用先按可配置费率保守预留；缺费率、有效汇率或可证明调用费用上界时阻止付费调用。 | 历史 v1.0 空规则保留；阶段 17 已接入严格 DeepSeek v1.1，阶段 21 接入 Kimi 大陆文本原币 v1.0；其他缺失规则仍阻止。 |
| A03 | 分开记录预算预留、基于用量估算、服务商接口报告、发票核验四种金额。未知是 null/unknown，不是 0。 | 不把四种金额相加当作实际成本；历史失败不视为免费。 |
| A04 | 预算占用 = 已结算占用 + 未结算预留；历史预留累计不是当前占用。 | UI 与账本保持同一口径，发票与接口报告区分。 |
| A05 | 只有费用完整、能唯一匹配调用的服务商报告才可自动释放预留差额；仅 token 估算仍保留占用等待核验。 | 接口报告仍不等同于发票；核销/更正追加记录，不覆盖历史。 |
| A06 | 超时/费用未知保留预留，不自动重复调用；可证实未计费的失败可释放。超过费用上界暂停受影响规则。 | 不因记账失败重放已经成功的业务调用。 |
| A07 | 公司直接费用直接归属；共享费用另记分摊记录。批处理无可靠逐公司用量时按实际输入公司等分。 | 分摊不是新增支出；保存方法版本并验证金额守恒。 |
| A08 | 搜索/规划等任务共同费用在完成时按实际处理的去重公司分摊，不按目标槽位或仅合格公司数分摊。 | 零结果仍是任务成本；后续新轮次单独记录。 |
| A09 | 保留原币种；USD 换算保存汇率来源、日期和版本；预留加 5% 汇率缓冲。 | 缺汇率阻止相关付费调用；发票实际美元金额优先。 |
| A10 | 费率每 7 天只读刷新；促销截止即失效；汇率每日更新，最长有效 72 小时。 | 刷新失败可沿用尚有效版本，过期阻止调用。 |
| A11 | 涨价、计费合同变化、模型路由变化需用户确认；可信降价且合同不变时可自动生成新版本。 | 不以静默切换模型或质量换预算。 |
| A12 | 仅暂停受影响付费环节，保存已完成结果；可继续不依赖阻塞环节的免费缓存/本地步骤。 | 合法、已批准备用模型仍须预算充足，旧未知预留不能释放来给备用模型腾预算。 |
| A13 | 恢复从检查点继续，不重放成功环节，不自动减目标公司数、评分质量或规则。 | 模型冗余不豁免预算门禁。 |
| A14 | 任务中心/公司详情用简洁摘要和可展开账本，展示预留与真实费用差异。 | 不展示或记录原始敏感载荷。 |
| A15 | 真实模型价格先查对应服务商官网，找不到按用户授权采用 OpenAI 参考费率并明确标记。 | 参考值不是该服务商真实账单，也不自动构成可证明费用上界。 |
| A16 | SMTP 只向用户授权测试收件人发送明确标记测试邮件；用户已确认收到。 | 已有发送验收提交 `cade233`；不因此授权发送客户邮件。 |
| S01 | 2026-09-14 用户确认：仅 `buildLeadMarketPlaybook` 使用 OpenRouter credits 的 `openai/gpt-5.6-sol` 时限定 OpenAI 标准端点，`provider.only=["openai"]`、`allow_fallbacks=false`，保留 `require_parameters=true`、`data_collection=deny`；单次保守预留 **USD10.622880**，最多 61,440 请求字节、4,096 总输出 token、严格 JSON Schema，不启用工具、插件、特殊服务层或显式缓存；端点不可用时暂停。其他模型/阶段不改，旧多供应商上界 USD27.345252 保留。 | 已实现专用请求合同、版本 v1.7.0、实际 SDK 合成传输与拒绝路径；完整生产业务和真实账单尚未验收。真实付费仍须累计 USD30 与整次费用预检，不因单次可容纳而放行。[报告](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)。 |

实现索引：`src/lib/billing/`、`src/providers/deepseek.ts`、`src/lib/mailbox/smtp-transport.ts`。现有预算基础设施不等于上述完整账本新规则已实现。

## B. DeepSeek 请求边界（本次确认）

| ID | 已确认规则 | 状态 |
|---|---|---|
| B01 | 主模型以当前使用配置为准；此轮不改变 thinking 行为，不静默换模型。 | 待后续实现阶段持续校验。 |
| B02 | 输出默认上限保留 8,192；不自动调到 16,384，也不擅自下调。 | 当前默认值已读代码并离线测得；16,384 是现有可配置最大值，不是新默认。 |
| B03 | 拆批按完整序列化请求体计算，包括系统提示、JSON Schema、证据 ID、业务输入和封装。 | 已确认待实施；UTF-8 字节与 JS 字符不能混用。 |
| B04 | 补证/主角色矫正初始完整请求体上限 **36 KiB = 36,864 字节**。 | 已确认待配置和边界测试。 |
| B05 | 仅评分初始完整请求体上限 **56 KiB = 57,344 字节**。 | 已确认待配置和边界测试。 |
| B06 | 评分＋合作路径初始完整请求体上限 **60 KiB = 61,440 字节**。 | 已确认待配置和边界测试。 |
| B07 | 多公司超限先拆批；单公司超限进入保留关键信息的证据压缩/分阶段处理。 | 已实现无损压缩与超界前暂停；图检查点/合成恢复通过。仍不可压缩的任意大单项分阶段完成及真实模型质量未验收。不静默截断、低分、不通过或绕过限制；压缩本身若付费也受预算门禁。 |
| B08 | 字节上限只是工程边界，不是 token 上限；真实付费放行前另行建立可靠输入 token/完整计费上界。 | 尚未完成，不能因 B04–B06 已确认就开放付费。 |
| B09 | 按每次尝试保存 usage、缓存用量、finish reason、重试与路由；缺失不是 0。 | 已确认待补齐；旧聚合事件不能冒充逐请求 P95。 |
| B10 | 两种 DeepSeek 传输端点分别评估；以已核验高峰/缓存未命中费率保守预留。 | 当前 Pro 自动选择 Anthropic 兼容端点；其 thinking 与 Chat 端点存在差异，此轮不改。 |
| B11 | 完整输入 token 优先使用与当前模型匹配、可本地运行的官方 tokenizer 计算，含系统提示、Schema、证据和业务输入。 | 已确认待实施；还须计入模型聊天模板/特殊 token，不能简单对 HTTP JSON 字符串编码就称为实际输入。 |
| B12 | 不能准确计数时只接受可核验的保守上界；不以字符/token 经验比例放行。 | 无可信上界仍阻止相关付费调用并提示原因。 |
| B13 | 每次预留 = 输入 token 上界 × 输入费率 + 输出 token 上限 × 输出费率 + 其他已知费用上界。 | DeepSeek 高峰/缓存未命中预留，输出暂为 8,192；差额遵循 A05，不能由估算自动释放。 |
| B14 | 按每次尝试预留，不一次占用所有可能重试次数；重试须获准且预算足够。 | 上次未知费用占用保留；不新增自动重试授权。 |
| B15 | 模型、传输端点、计费合同变化时重新核验 token 方法和费用上界。 | 未核验不得沿用旧方法放行。 |
| B16 | 采用官方 recipe＋匹配当前模型的 V4 tokenizer，固定版本/校验值，在隔离环境离线验证两种现有文本请求格式。 | 2026-09-13 用户同意；固定源码和 tokenizer 校验及 B17 合成文本验证完成，完整业务计数未验证，未接入产品。 |
| B17 | 允许使用本机 Docker 隔离安装构建依赖；依赖准备后断网验证，不全局安装 Windows 工具链，不注入产品密钥，不开放付费。 | 2026-09-13 用户同意；首轮纯文本 Rust 构建和断网合成验证通过。 |
| B18 | 将已有 207 家冻结公司重建的完整请求送入本地计数器，分析业务输入及各部分开销；不新增证据、不调用模型、不改变评分。 | 2026-09-13 用户同意；三模式单公司/现行批次共 1,053 请求离线计数通过，评分仍为标准 playbook，不是历史完整上下文回放。 |
| B19 | 审核固定提示/评分规则重复内容和缓存复用，先提出不改变评分含义的方案，先讨论、不改产品逻辑。 | 2026-09-13 用户同意；只读审核完成，见下方方案。P01–P06 尚未获准实施。 |
| B20 | 确认 P01 固定内容前置：保留原消息权限、全部规则/证据与数组顺序，只调整字段排列；不共享个人记忆、不用规则 ID 替代正文、不付费预热、不降并发。 | 2026-09-13 用户确认，待实施；先离线校验，质量/实际命中另行验证。P02–P06 全部确认后再修改产品代码。 |
| B21 | 确认 P02 七条缓存观测细则：逐尝试记录，保留协议真实用量和未知状态，区分本地免调用/服务商折价，展示命中及覆盖率，估算与账单分离，未命中预留，不保存额外正文/密钥，复用折叠费用 UI。 | 2026-09-13 用户确认，待实施；记录失败不重放成功调用。P03–P06 全部确认后统一改代码。 |
| B22 | 继续未完成/未通过验收项，同时完成 P03–P06，之后以完成验收为主线；不扩展新优化议题。 | 2026-09-13 用户明确安排。继续既有逐项确认约定，不视为 P03–P06 具体方案已确认或新增付费/云部署授权。 |
| B23 | 确认 P03 模型规则投影：保留全部评分语义/角色标准/证据门禁；精确重复字段单点表达；等级阈值与管理元数据留程序/审计；从唯一完整配置确定性生成，不调用模型压缩。 | 2026-09-13 用户确认，待实施；原始规则/版本/缓存依赖保留，首版不裁其他角色，不改输出 Schema，先规则覆盖及离线计数再质量验证。 |
| B24 | 确认 P04 六条 Schema 保障：完整字段/必填/类型/枚举/边界与模式差异保留，单一来源生成并完整传送；仅审查周边明确重复，不强制结构压缩；无效结果不冒充成功或低分，不新增重试；按有效输出及整体成本验收。 | 2026-09-13 用户确认，待实施；没有明确收益可以不改 Schema，模型质量验证受费用边界约束。 |
| B25 | 确认 P05 八条精确结果复用与失效规则：公共矫正/私人评分分域、完整有效依赖含批次/版本、证据重绑定、尊重人工覆盖、主动重评按范围、并发幂等、成本未知与结果成功分开、记录复用收益及失效原因。 | 2026-09-13 用户确认，待实施；完整已校验结果可复用但未知费用预留保留，禁止跨域或未验证跨模型复用。 |
| B26 | 确认 P06 七条批次安全/完整性规则：保留最多五家、检查最终完整请求和输出约束、单公司超限不降分漏报、按任务保留路径、不跨域凑批、不重复成功结果、按整体有效结果验收。 | 2026-09-13 用户确认，P01–P06 全部获准实施；批次/无损压缩/图暂停与合成恢复已部分验收，任意大单项及真实模型全链仍缺；不豁免费率、预算或既有外部动作边界。 |

固定提示审核：[P01–P06 已确认方案与实施状态](FIXED_PROMPT_CACHE_REVIEW_2026-09-13.md)。现进入实施与剩余验收，确认与实现/验收仍分开记录。

### B18 冻结业务请求离线计数

可复现诊断入口：`scripts/offline-tokenizer/measure-frozen.ts`。原始请求仅经内存 stdin 送入禁网、只读、非 root 容器，不写原文文件，不挂载宿主或注入密钥。使用当前 agent 请求构建器与模拟 DeepSeek 传输；不执行 agent.evaluate、搜索、RAG 或评分。模型配置实际为 `deepseek-v4-pro` / Messages / thinking disabled / 输出 8,192。当前运行只验证这个配置，前面的两格式合成测试不能替代另一格式的业务覆盖。

输入：207 家冻结德国候选。每模式逐公司 207 请求，加现行字符规则批次 103/158/171，共 1,053 请求；完整编码各重复一次共 2,106 次，全部 token ID 一致。八类输入片段另行孤立计数共 8,424 次。Docker 阶段墙钟 68,289 ms，诊断脚本墙钟 78,824 ms（不含镜像构建和启动器）；包含重复与分项诊断，不是未来单请求生产耗时。模型调用/费用为 0。

| 模式 | 现行批次数 | 批次 token P50 / P95 / 最大 | 单公司 token 最大 | 超已确认字节上限 |
|---|---:|---:|---:|---:|
| 补证 | 103 | 7,450 / 8,931 / 9,492 | 6,462 | 0 |
| 仅评分 | 158 | 9,742 / 12,117 / 13,513 | 12,078 | 0 |
| 评分＋路径 | 171 | 10,117 / 12,785 / 13,017 | 13,017 | 0 |

每请求系统提示（含输出 Schema）孤立计数为 848 / 1,162 / 1,661；评分 rubric 为仅评分 2,041、带路径 2,299；任务 instructions 为 851 / 662 / 844。这些是诊断分项，不应相加当总量：input 包含 instructions/rubric/evidence/findings，user 又包含 input。不同部分独立分词存在边界差异，null/空占位也会计数。

仅评分现行批次输入合计 1,559,247；评分＋路径合计 1,772,323，高 213,076（约 13.67%），同时批次数 158→171。它说明路径任务输入/拆批额外开销，不是产品已实现节省率；输出费用和模型质量未测试，不授权取消用户需要的路径。固定规则/提示的复用、减少不影响信息的重复结构值得下一步研究；不自动压缩评分标准。

原字节规则单公司超限缺陷仍存在；本批样本在新建议字节上限内不代表修复。最大实测 token 不是所有输入的安全上界，不能直接加经验余量成为美元预留保证。仍未核验线上 usage/实际账单，不改变付费门禁。完整脱敏聚合及来源文件哈希：[计数记录](reports/OFFLINE_FROZEN_TOKEN_COUNTS_2026-09-13.json)。原始证据不提交。

### B17 隔离运行结果（取代 B16 下方历史环境阻塞状态）

诊断代码：`scripts/offline-tokenizer/`，不被产品运行时引用。Docker Linux 可用；只编译官方协议/文本编码 Rust crates，不编译 Python/图像组件，所以不需要安装 OpenCV。固定官方源码提交与 V4 tokenizer 保持不变，Rust 1.97.1 基础镜像摘要已固定，依赖版本保存于 Cargo.lock。构建可下载公开依赖；执行使用 `--network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 65534:65534`，无宿主目录挂载、无密钥环境变量。

四类合成文本 × 两种格式 × 有/无系统 Schema，共 16 个组合，每个重复编码一次，共 32 次编码；全部非空且重复 token ID 一致，所有 Schema 增量为 30 tokens。首轮编码测试循环 69 ms（不含进程启动、tokenizer 加载或构建时间），不是生产延迟承诺。

锁文件及镜像摘要固定后重建通过，再次断网执行同一组 32 编码通过，全部计数与首轮一致，循环 68 ms；两轮共 64 编码，仍只有 16 个不同输入组合。依赖锁、构建器、测试源码纳入 Git；无业务模型调用。专用未启动锁文件导出容器已删除，镜像和构建缓存保留。

| 合成输入 | Messages 无/有 Schema | Chat 无/有 Schema |
|---|---:|---:|
| 英文短文本 | 10 / 40 | 111 / 141 |
| 中文混合业务短文本 | 21 / 51 | 122 / 152 |
| 多语言及 emoji | 20 / 50 | 121 / 151 |
| 长证据式文本 | 8,010 / 8,040 | 8,111 / 8,141 |

两种请求按现有 Pro 构建方式分别使用 disabled/enabled thinking，Chat 另有 JSON object 设置，因此差异不能直接归因于单一因素，也不能把 101 当通用固定开销。未改变实际产品设置。范围仅合成文本编码：未重放 207 家完整业务请求、未比较线上 usage、未建立美元费用保证。API 模型调用和费用均为 0；产品付费门禁仍关闭。构建缓存/镜像保留本地便于恢复，不推送到容器注册表。

### 官方工具核查（2026-09-12；事实与待确认选型分开）

- [官方 token 用量说明](https://api-docs.deepseek.com/quick_start/token_usage/)提供离线 tokenizer 下载；字符比例只是近似，实际用量以 API usage 为准。
- [官方 deepseek-recipe](https://github.com/deepseek-ai/deepseek-recipe)支持 Messages/Chat Completions/Responses 格式转换、V4/V4.1 prompt 编码，提供 Rust/Python 接口。[tokenizer 指南](https://github.com/deepseek-ai/deepseek-recipe/blob/main/docs/tokenizer.md)要求匹配模型 tokenizer 和特殊 token。
- 仓库声明不支持 JSON Schema 输出约束；本产品当前 DeepSeek 将 Schema 作为系统提示文本，不能把这与 API 原生约束混同。工具存在不证明托管 API 计费完全一致。
- [Anthropic 兼容文档](https://api-docs.deepseek.com/guides/anthropic_api/)提示不支持的模型名会映射为其他模型，因此端点格式兼容不等于模型身份/费率一致；不得以 Claude tokenizer 计算 DeepSeek 用量。
- 当前只读核查未安装依赖、执行官方工具或请求模型；本项目尚无已接入的本地 token 计数器。原有 `maximumChargeMicros` 固定上界规则仍在使用，全球规则为空。
- **已由 B16 确认（2026-09-13）**：选择官方 recipe＋匹配的 V4 tokenizer，固定版本/文件校验值，在隔离离线环境先验证当前两种文本请求格式。通过前仅为离线诊断，不用于付费放行；不改 thinking、不自动跟随最新版、不将样本误差上浮若干百分比冒充数学上界。

### B16 固定版本与环境检查（2026-09-13）

- 官方源码提交：`8cadfede7063c896b944e7bae05daa3549ae97ea`，Python 项目声明版本 `0.1.1`；只下载到 Git 忽略的 `tmp/deepseek-recipe-audit-20260913`，未安装、未执行其中代码。
- V4 tokenizer：`static/tokenizers/v4/tokenizer.json`。Windows checkout 自动转 CRLF，磁盘 6,634,504 字节，SHA-256 `d9c43162add2f9b6d2ccde2e8873c0e67b78320ccafe7714dab0f213c5dd7e46`；在内存还原 LF 后 6,367,146 字节，SHA-256 `97d2f31b020d18b5aee5c9b3d5b4efb10ea210f3fe3f7dffe3f1cd90542d6b19` 与官方同提交 README 一致。不能以官方 LF 哈希直接验证 CRLF 文件；未来固定资产应明确字节规范。本地 JSON 解析通过：BPE，词表 128,000 项，added tokens 1,283 项。这不是 token 编码执行测试。
- 官方 README 说明此 tokenizer 相比 Hugging Face 对照版本交换了两个 image token 的 ID；本次只验证文本，未来不得据此直接开放图像计费。对照来源版本 `b5968e9190ef611bbf34a7229255be88a0e937c1`。
- 使用官方 PyPI 索引、有限超时/零重试查询，未获得可用发行包；不能断言所有平台无包。本机 Python 3.11.9，`cargo`/`clang`/`cmake` 不在 PATH；官方源码构建文档要求 Rust、C/C++、Clang/libclang 和 OpenCV 4.x 等依赖。尚未安装完整编译工具链。
- 结论：来源、版本和文件完整性检查通过；两种请求格式实际 token 编码、耗时与线上 usage 一致性仍未验证。无付费模型、无产品依赖/配置变化；继续 fail-closed。下一步需选择隔离构建环境，不能把源码检查当作运行验收通过。

### 离线依据：不是历史 token 重放

207 家德国冻结候选公司，当前补证/评分请求构建器＋模拟 DeepSeek 传输，1,053 次本地截获，网络/模型调用均 0，服务商费用 0。评分使用标准 playbook，不含原始 RAG 或个人长期记忆，不保证覆盖未来最大载荷。一次性诊断脚本在本地 `tmp/offline-deepseek-request-sizing.ts`，不是产品运行代码；不提交原始样本。

| 环节 | 当前拆批数 | 完整请求体 P95 / 最大（字节） | 遗漏封装开销范围（字节） | 原规则下超限单公司数 |
|---|---:|---:|---:|---:|
| 补证 | 103 | 33,075 / 33,496 | 4,608–5,756 | 0 |
| 仅评分 | 158 | 49,707 / 50,567 | 7,017–8,701 | 0 |
| 评分＋路径 | 171 | 51,887 / 54,383 | 9,115–10,867 | 1 |

现有代码只计算 `JSON.stringify(request.input).length`，补证 28,000 字符、评分 42,000 字符，且只在已有其他公司时拆批。以上批次数是当前规则重建结果，不是新上限的测试结果，也不能作为优化节省率。单公司问题和高结构开销是已识别优化点。

## C. 搜索、证据、评分与开发（历史明确决定索引，实现逐项待映射）

| ID | 确认规则 | 对应文档/范围 |
|---|---|---|
| C01 | 取消“优先向上”；agent 识别实际主角色并按用户发展阶段分析合作路径。搜索通道不是主角色或路径。 | PRD、端到端工作流。 |
| C02 | 路径仅五类：一级代理直接供货、通过已有/未来代理商供货、直接下级渠道供货、OEM/ODM、其他。每公司最多两条，取消路径 confidence。 | 评分与开发；全部路径低于 65 时只展示最高一条。 |
| C03 | 路径子分为角色/结构 30、用户阶段/供货适配 25、产品/客户/场景 20、采购影响 15、执行可行性 10；总分由程序计算。 | 见当前 qualification agent；正常推荐至少 65。 |
| C04 | 主角色、账户等级、合作路径可由用户修改，写入个人长期记忆和学习数据。角色与可能路径输入后续开发策略/邮件 agent。 | 私有数据不得污染通用知识库。 |
| C05 | 产品/场景 50（产品家族 25、客户/场景 15、定位 10），合作路径/采购影响 15，同主角色规模/覆盖 15，执行/赋能 10，机会/风险 10。 | 版本化评分配置；历史评分保留版本，不能套用新权重冒充原结果。 |
| C06 | 使用最适合的启用产品轨道，不因 SMB 专注或 broadline 非相关业务稀释产品匹配。SMB SI 按项目 B 端、零售/电商按消费者场景分别判断。 | 大集团按相关区域/业务单元，不要求全集团资料穷尽。 |
| C07 | 先识别规模；高价值大公司可深查。明确识别长尾且有限补证仍不足可低分/不推荐，但缺资料不等于证实规模小。 | 未知事实不能伪装成负面证据。 |
| C08 | KA 只用于下级渠道候选，不用于一级代理/分销商；TD SYNNEX 不能据规模评为 KA。 | 销售账户等级与主分数分开。 |
| C09 | 模型负责语义判断及各子项分数，程序负责确定性总分和状态；说明压缩但保留关键证据。 | 不用模型重复计算可确定部分。 |
| C10 | 完整公共证据结构化存入现有数据库中的独立证据库，可跨用户检索公共公司证据。私有知识/长期记忆严格隔离。 | 公司身份/公共证据共用，各国家业务状态独立。 |
| C11 | 必要补证、主角色矫正和可能重复任务首次执行即建立缓存和结构化结果供下游复用；两条搜索轨道实时反馈去重。 | 不新增重复搜索/补证流程；缓存须保留来源与版本。 |
| C12 | 信息超过一年提示，不自动 invalid；用户要求核实时再搜索。二次引用应预期总分改变至少 8 分或满足已确认关键状态条件；仅小幅增加置信度不升级。 | 搜索/证据新鲜度与评分有效性区分。 |
| C13 | 高能力升级只在预计能显著解决当前模型不能解决的问题时；Top-N 不作为正式产品升级依据。 | 实验质量门禁 Top-N 90%、MAD 3 分仅实验范围。 |
| C14 | 意图保持 Kimi 轻量模型、多轮交互，不改成确定性优先；每任务轻量判断标准 playbook/搜索模板是否需改，明确复杂任务再 Kimi K3 规划。 | 模板和缓存不替代意图识别。 |
| C15 | 主模型按当前配置；有限失败重试后可临时跨厂商同级冗余，不影响预算约束；Embedding 不设冗余。 | 未确认具体备用路由不可臆造。 |
| C16 | Gemini Product 与 Gemini Full 机制重合，默认不重复调用；同搜索引擎/机制工具仅有特殊补充能力理由才并用。 | 混合搜索须与补证/评分适配，支持明确 50/100 等目标数与结束机制。 |
| C17 | 错类公司符合其他目标类别可转移并去重；搜索阶段只轻量结构化关系，由后续 agent 深入判断。 | 不把分类转移当新增公司贡献。 |
| C18 | 默认不搜索 Agent 或 OEM/ODM 销售线索，除非用户明确要求；产品不寻找给 Cudy 代工的供应商。 | OEM/ODM 销售机会与采购供应商不同。 |
| C19 | PDF 提取前判断价值；过程中/升级提取方法前根据已有内容再次判断价值与预算。 | 具体解析器方案须沿用既有已确认文档，不在此编造。 |
| C20 | 已确认知识/个人记忆优先；经用户确认的营销表述可进入用户开发上下文。 | 不把营销夸张变成公共事实或客观评分证据。 |
| C21 | Cudy 定位先本地 RAG＋Web＋分析，再用户确认入库；Omada 为 TP-Link 企业分支、Mercusys 为低端子品牌，Archer/Deco 是系列，AVM、DrayTek 纳入竞品。 | `knowledge/CUDY_POSITIONING_CONFIRMED_V1.md`。 |

## D. 界面、邮件与实验边界（历史明确决定索引，实现逐项待映射）

| ID | 确认规则 |
|---|---|
| D01 | 销售线索、渠道图按国家独立页面；公司身份共用，各国评分、路径、账户等级和开发进度独立。结果经流程确认后自动保存对应数据库/板块，不能等同于用户开发采用。 |
| D02 | 用户可手工加公司到渠道图；当前单用户产品，不做团队管理/负责人；用户可主动标记已联系，产品发送成功也可推进状态。 |
| D03 | 已发送邮件保留时间和详情；同公司不同联系人可复用邮件版本，新公司策略/邮件由行动 agent 生成。跟进可展开原信参考，用户自然语言表达内容，agent 复用称呼/职位及商务格式；生成不等于发送。 |
| D04 | 用户每次邮件修改可沉淀为个人风格偏好；私有记忆与通用知识库隔离。 |
| D05 | 成本降低是永久任务；记录各阶段输入、有效输出、下游使用量、token/API额度/美元、延迟、重试、弃用原因、利用率、具体优化机会。未知指标明确未知，不能把 HTTP 成功当业务采用。 |
| D06 | 已讨论优化目标为 token 再降 40%、付费搜索额度至少降 30%，不牺牲质量；目标不是已经达成的节省率。代表性样本每类 1–2 家。 |
| D07 | 测评中的产品改动应用真实产品前需用户确认，实验分支结果不能自动等于生产批准。搜索机制、端到端流向与迭代需在 GitHub 留档。 |
| D08 | v3.0 工具评分沿用 v2.0 搜索结果/证据，不加搜索/证据，不生成路径或策略；只评线索价值并分析混合搜索优化。 |
| D09 | 首次正式实验英国/墨西哥，四类 Distributor/VAD、Reseller/VAR、Retailer/E-tailer、SI/MSP，每市场每类 30 槽位；冷启动、独立高能力盲审，产品/对照实际时间各自记录，不要求等时。 |
| D10 | 首次实验 USD 100 硬上限，在 20/40/60/80% 检查并预测总成本，预计超限则预警并确认设计调整；哥伦比亚下一轮四类各 50、上限 USD 50，在 20/40/60% 检查。两者不替代 A01 本地验收预算。 |
| D11 | 盲审 fallback 曾获准对话内 Codex、不调用 Codex API；后续模型网关改动与具体实验协议以对应版本为准，不用历史授权擅自重跑付费实验。 |

## 文档索引与剩余核对

- 产品需求：[`Network_Channel_Copilot_PRD_v1.1.md`](../Network_Channel_Copilot_PRD_v1.1.md)。
- 当前 UI/业务端到端：[`PRODUCT_UI_V1.1_WORKFLOW.md`](PRODUCT_UI_V1.1_WORKFLOW.md)。
- 搜索：[`HYBRID_SEARCH_WORKFLOW.md`](HYBRID_SEARCH_WORKFLOW.md)；评分工作流：[`generated/LEAD_EVALUATION_WORKFLOW_V2.md`](generated/LEAD_EVALUATION_WORKFLOW_V2.md)。
- 成本与优化：[`PRODUCT_WORKFLOW_EFFICIENCY_LEDGER.md`](PRODUCT_WORKFLOW_EFFICIENCY_LEDGER.md)。
- 验收证据：[`LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md`](LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md)。
- 恢复：[`RESUME_PRODUCT_UI_2026-09-11.md`](RESUME_PRODUCT_UI_2026-09-11.md)。

本次补齐可恢复的明确规则，不能声称已复原对话中所有仅回复“确认”但原提案未保留的细节。后续验收须逐 ID 补代码/配置/测试映射；PDF 解析器具体选择、账户等级完整枚举、各类搜索工具路由及实验最新盲审细则须从对应既有文档/版本核对，不凭空补写。发现冲突或缺失先标明，不自动改产品。

## 版本记录

- 1.12.0 / 2026-09-13：确认 P06（B26），实施阶段 1 完成 P01/P03 本地代码及测试；P04 无 Schema 改动；其余验收继续。
- 1.11.0 / 2026-09-13：确认 P05（B25），补齐最后一项 P06 待讨论细则；产品逻辑未改。
- 1.10.0 / 2026-09-13：确认 P04（B24），补齐 P05 待讨论细则；未改产品逻辑。
- 1.9.0 / 2026-09-13：确认 P03（B23），补齐 P04 待讨论细则；未改产品逻辑。
- 1.8.0 / 2026-09-13：记录 B22 验收主线安排，验收报告增加缺口/通过依据表；P03–P06 待逐项确认。
- 1.7.0 / 2026-09-13：确认 P02（B21）全部细则，新增 P03 待确认保留/排除方案；仅文档更新。
- 1.6.0 / 2026-09-13：用户确认 P01（B20），补齐 P02 待讨论细则；保持全部确认后再改产品代码。
- 1.5.0 / 2026-09-13：确认 B19 分析范围并完成代码/官方缓存文档核查；列出 P01–P06 待确认建议，无产品逻辑变化。
- 1.4.0 / 2026-09-13：确认 B18；当前构建器冻结业务请求 1,053 条离线计数及重复校验通过，记录分项开销和边界；无运行时规则/费率改变。
- 1.3.0 / 2026-09-13：确认 B17；新增 Docker 纯文本隔离验证器、固定构建依赖及合成测试结果。未变更产品逻辑或付费许可。
- 1.2.0 / 2026-09-13：确认 B16，固定官方源码与 tokenizer 校验值；记录本地环境限制及未完成运行验证。
- 1.1.0 / 2026-09-12：用户确认 B11–B15 token/预留原则；新增官方工具核查及待确认选型。无产品代码或付费调用变化。
- 1.0.0 / 2026-09-12：集中登记明确用户决定；补齐费用账本规则、36/56/60 KiB 边界及离线依据；明确确认与实现/验收分离。仅文档和工作约定更新，无运行时变化或付费调用。
# KQ04 implementation status addendum — 2026-09-18

KQ04 继续实施状态：型号比较意图现已进入独立 `compare_verified_facts` 节点；无显式属性时按登记资料目录推断类别并加载版本化默认 profile，结构化返回先列关键差异、再列完整属性，且把未知、候选、冲突和版本不一致保留为不同状态。活动 v3 指针存在时，事实查询和四路检索仅读取该 release；Qwen 与 BGE 查询向量分别缓存、分别降级，事实/全文通道不因任一向量服务故障而停机。BGE 固定为官方 revision `5617a9f61b028005a4858fdac845db406aefb181`，服务只允许 `127.0.0.1`，不接受外部 URL、运行时下载或正文日志。实施与验收状态：代码及 31 项聚焦测试、TypeScript 检查已通过；完整 shadow release、真实双向量、300 条 gold、UI 浏览器验收和激活仍未完成，因此不构成生产验收。

KQ04 BGE 实施证据：官方固定 revision 的本地推理文件为 2,293,315,801 bytes，逐文件清单的聚合 SHA-256 为 `4f2ef0a2c9b4250206e9ddc202a2bbe01718aacd2a06f87e3e09887b2a076c28`。服务启动前逐文件复核大小与 SHA，且只从 `BGE_M3_MODEL_PATH` 指定的本地目录加载。真实本地探针得到 1,024 维归一化向量；这证明本地 lane 可运行，但不代表全库 BGE 向量已生成或 release 已可激活。

KQ04 管理可见性实施状态：知识状态接口与知识页现在显示最新 v3 release 的活动状态、资产完成度、chunk、Qwen/BGE 完成数、open/OCR review 和 candidate/conflict fact 数。影子 release 明确标注为未激活，并提示生产仍使用既有索引；该显示不绕过激活门禁，也不把 building 状态写成可用。

KQ04 单元终态实施状态：普通全成功资产可直接标记处理完成；任何未人工确认的 `blank`、`review-required` 或 `failed` 单元都必须创建 open review 并使资产保持 pending。只有精确清单中的 `accept-candidate`/`decorative-no-body` 决定可以关闭对应异常单元；`failed` 优先于 review/blank 作为资产状态。该状态机已通过 4 项聚焦断言，但实际全库 open review 数仍需 shadow 入库后核验。

KQ04 路由验收状态：版本化属性注册表 `attribute-registry-v1.2.1` 补充通用端口同义词，比较、事实、原文件和解释分类器覆盖无实体边界问法；冻结的 300 条评测记录现为 action 300/300、entity 300/300。该结果只证明确定性意图/实体路由，不代表答案正确性、来源 Recall@8 或人工 gold 验收；`humanAnswerReviewed` 仍为 0，release 仍不得激活。
