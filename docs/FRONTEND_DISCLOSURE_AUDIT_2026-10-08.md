# 前端折叠与批量操作审查（待确认）

后续状态：用户已确认实施。重点 F01–F10/F13 已有代码修改与关键隔离测试；F11 增加管理分区、筛选重置，F12 增加长串断行。完整变更与验证边界见 [MAILCRM 实施证据](MAILCRM_IMPLEMENTATION_2026-10-08.md)。以下为原始审查快照，不应把当时的“未实现”当作当前状态，也不把静态检查当成所有页面视觉验收。

2026-10-08 新增 F13：优化删除对话历史确认窗口，并扩展邮箱操作与客户公司时间线设计。参见 [MAILCRM-01～04 方案及 GitHub 调研](MAILBOX_CUSTOMER_TIMELINE_PROPOSAL_2026-10-08.md)。本补充未改变原审查的确认后实施边界。

2026-10-15 F01/F02 候选网页补验：空邮箱合成账号在实际 Next 页面打开邮箱管理抽屉，1366×900、1366×360、390×760 三视口均通过背景不透明、边界、Escape/焦点回归及未提交地址保留；有溢出的矮窗口和手机实测抽屉正文滚轮，截图已目视检查。详见 [隔离收据](evidence/ma24-g13-mailbox-drawer-candidate-page-clone-2026-10-15.json)。原审查快照仍保留当时的未验状态；该补验不覆盖生产、多邮箱长列表或其余 F 项。

同日继续用四个合成已连接邮箱的隔离账号复核，三个视口均有实际内容溢出且内部滚轮有效；四张账户卡、添加表单、遮盖和固定标题在截图中可见。未发起同步或真实邮箱连接。[四邮箱收据](evidence/ma24-g13-mailbox-drawer-four-account-clone-2026-10-15.json)。

## 范围与证据边界

用户要求逐个核查折叠功能，取消待学习邮件批量授权数量上限，其余前端建议经确认后实施。用户现场反馈：邮箱管理展开后透明、与下方文字重叠，滚轮似乎不可用。

本轮完成源码入口清点和重点交互/CSS/接口审查：33 个组件文件、51 个原生 details、8 个 aria-expanded 标记；这些是源码出现次数，不是互不重复的线上功能数。当前浏览器工具返回空列表，未做真实页面逐项点击、截图或滚轮验收。下列明确区分已定位缺陷与待视觉验证风险。没有修改运行时代码、没有授权邮件外发。

## 拟修改方案

| 编号 | 优先级 | 问题与依据 | 建议及验收要点 |
| --- | --- | --- | --- |
| F01 | P0 | globals.css 的 mailbox-manager 使用未定义的 --panel 背景变量；用户确认透明重叠。 | 使用现有深色不透明 surface，并提供明确兜底色；不依赖提高 z-index 修补透明。展开后底层文字不可穿透。 |
| F02 | P0 | 管理区域是绝对定位大浮层，父级 100dvh/overflow:hidden；浮层自己有滚动。缺少专用关闭、Escape、焦点返回。滚轮失效具体触发点待复现。 | 改为右侧邮箱管理抽屉，小屏全屏面板；独立于被裁切祖先，固定标题/关闭区、唯一主体滚动区。背景不可交互；Escape 关闭，焦点返回触发器，未保存输入不意外丢失。抽屉内部滚动到底，关闭后邮件列表正常滚动。 |
| F03 | P0 | 每页 8 封，前端选择超过 5 封禁用；screening API authorize 上限也是 5，且 HTTP 请求内串行等待逐封模型。 | 取消用户批次总数上限，选择 8 封应可直接提交。后台持久任务逐封处理、进度可见、页面刷新后可继续查看；限制并发而不限制总数。保留逐封脱敏、授权审计和现有权限。未知调用结果先核对，不盲目重试。 |
| F04 | P1 | 连接新邮箱表单先于已有邮箱；同步选项位于所有同步按钮之后；同步默认最多 100 封，但成功提示只写新增量。 | 管理默认展示已连接邮箱，添加邮箱为独立入口；先选邮箱和日期再同步。显示发现/本次处理/剩余待处理，不把 100 封上限称为全部完成；提供继续同步入口，明确当前范围。 |
| F05 | P1 | mailbox-notice 为绝对定位，覆盖工作区；成功和异常共用绿色 status；同步错误仅放 title。refresh 对非 OK 响应不展示错误。 | 错误放在相关操作旁，给可执行重试；顶部仅保留简短状态。成功与失败分色，失败可键盘读取；加载失败不伪装成空列表。 |
| F06 | P1 | OriginalMail 无加载提示；读取成功后未清理旧错误；邮件正文在列表滚动区内再限高滚动。 | 打开显示加载状态，错误可原地重试并清理；长正文优先进入阅读侧栏，短内容保留原位折叠，减少嵌套滚动。 |
| F07 | P1 | 批量处理返回逐项 results，但前端仅显示总处理/失败并清空勾选；翻页会清空全部选择，半选无明确表现。 | 显示成功、失败、处理中，保留失败项选择；全选有半选态。建议支持跨页保留选择及“选择当前筛选全部”，明确总数并固定本次授权清单，新增邮件不自动加入。此扩展待确认。 |
| F08 | P1 | 附件选择只取 private/shared 各第一页 offset=0，无分页/搜索；自定义展开无 aria-controls、关闭与焦点策略。 | 搜索+分页或按需加载；已选资料始终可见，显示未处理文件进度；统一浮层关闭和键盘行为。 |
| F09 | P1 | AgentRunCard 对已完成且无记忆任务直接不渲染；执行详情仅 events.slice(-16)，无“仅最近16条”说明或更早入口。 | 完成后保留简短结果与历史详情入口；分页看完整执行历史；业务原因优先，技术字段按需展开。 |
| F10 | P1 | KnowledgeRevisions 初次展开尚未加载就显示“没有历史版本”；失败后成功不清理 error；无独立重试。 | 区分加载、空数据、失败；原地重试和正常分页；展开状态不因普通刷新无故丢失。 |
| F11 | P2 | 高级筛选收起后仍生效，但 summary 固定，缺少条件数与清空；Skill/记忆/定时任务塞在一个滚动折叠中。 | 显示“高级筛选 · N项”与清空；管理入口拆为明确分区并复用已有记忆中心，避免重复大面板。 |
| F12 | P2 | 多个技术折叠直接展示 JSON，部分 pre 仅 pre-wrap、缺长串断行；预算存在多层 details；危险操作与常用操作并排。 | 默认显示可读字段/差异，原始 JSON 次级保留并可复制；长文本断行、有界滚动；删除与断开放独立危险操作区；不改变原确认门槛。 |

2026-10-15 F12 局部实现和页面验收：公司评分与资料来源坐标使用可复制、可换行的原始 JSON 展开组件；资料树真实页面/隔离库已验证 1620 字符连续坐标和复制一致。邮箱断开、删除本地数据改进独立展开区，手机、桌面和矮窗口四连接页面均验证入口与确认取消，连接未变。公司评分实际页面、其他 JSON/危险入口及生产尚未覆盖。[收据](evidence/ma24-g13-f12-raw-json-danger-page-clone-2026-10-15.json)。

2026-10-15 F12 公司评分补验：隔离恢复库的合成公司及已保存评分由候选实际页面/API 读取；390×760 和 1366×900 均显示政策版本、可读分项 `40 / 50`。原始子项默认折叠，展开后 1620 字符连续字段不横向溢出，复制内容与数据库输入一致。其他 F12 入口和生产仍待验。[补验收据](evidence/ma24-g13-f12-company-score-page-clone-2026-10-15.json)。

2026-10-15 F12 审核材料补验：Skill 验收证据先显示页/块等简短坐标，完整坐标和收据放在可复制的次级展开区；非邮件 Agent 审批继续先显示可读业务字段，技术参数改为可复制展开区。合成 API 组件浏览器在 1366/390/320 宽度验证长坐标、复制、无横向溢出与原审核保存/撤销流程；随后候选真实页面/API/隔离库又验证原始收据复制与数据库一致，判决保存 r1、刷新和撤销 r2，Skill 仍关闭。完整构建通过；自然审核质量、审批页及生产未验。[收据](evidence/ma24-g10-g13-review-raw-json-ui-2026-10-15.json)。

## 批量无上限的具体范围（方案待确认）

- 已确定的用户目标：取消待学习邮件单次授权“最多 5 封”的产品数量限制；不是把分页从 8 改成 5。
- 建议按钮：`授权学习（已选 N 封）`，确认面板列出数量、邮箱范围、脱敏后发送 Kimi 的既有用途；单次确认覆盖固定所选清单。
- 用户可提交任意数量的本人合格待学习邮件，服务端以分页/分片接收与处理，不把请求体大小、模型上下文或并发控制转变为用户必须手工拆批的障碍。
- 后台队列需要幂等键、逐封状态、失败重试、未知结果核对及暂停后续处理。停止与重试的具体交互随方案确认；不取消脱敏、权限或正式知识复核。
- `kimi.ts` 中单模型调用最多 5 条的内部 helper 与用户一次授权总数不是同一限制；当前 service 每次只传 1 封。保留或调整内部技术批次，不应限制用户操作数量。
- 单次同步 100 封与单次授权 5 封是两个问题；本方案不未经确认删除同步分页边界。

## 逐入口清单

以下覆盖静态清点中的每个组件。标为保留表示当前代码没有发现必须改变折叠目的的问题，不表示视觉验收通过。

| 组件 | 折叠/展开入口 | 建议 |
| --- | --- | --- |
| mailbox-workspace | 管理/连接；邮件原文；完整提取内容 | F01–F07，最高优先级 |
| mailbox-integration | 原文；提取全文（旧组件） | 未找到当前产品导入调用；记录为旧入口，确认可达性后再清理，不计作已验收线上页 |
| mail-company-link | 修改公司关联 | 原文内再嵌套操作；改可搜索公司选择，显示当前关联，删除移至危险区 |
| agent-attachments | 任务资料 | F08 |
| conversation-history | 对话更多操作 | 已有 portal、越界调整、Escape及焦点处理，可复用方向；窄屏、滚动后位置仍待实测 |
| copilot-demo | 帮助；账户；移动导航；自定义多选展开 | 保留导航折叠；已有部分焦点处理，统一控件关联和移动端实测，不盲目重写 |
| agent-library | Skill、记忆、定时任务 | F11，分区、加载与重试 |
| agent-runs | 执行详情 | F09 |
| agent-approvals | 参数版本；操作来源 | 保留业务预览常显、技术折叠；使用统一长文本样式，审批中防重复点击待核查 |
| bulk-company-actions | 批量管理 | 已有“失败保留勾选”，应复用到邮箱；补进度与筛选范围可见性 |
| company-correspondence | 各封关联邮件 | 已有加载、翻页、重新展开重试；保留并统一长正文阅读 |
| company-detail | 合作路径；联系人；子项评分；政策权重 | 合作路径/联系人保留数量摘要；原始评分和权重增加可读字段层，JSON次级 |
| company-cost-summary | 公司分摊费用 | 保留，不开展费用分析；长列表分页/过滤建议 |
| cost-stage-summary | 分阶段明细 | 保留，不新增账本；统一宽度和断行 |
| knowledge-base | 邮箱知识条目 | 保留；标题长时可完整阅读，原文与管理动作层次清楚 |
| knowledge-library | 已保存检索正文 | 保留“片段可能重叠”说明；外层已可滚动，不再叠加整页滚动 |
| knowledge-review-center | 纠正结构化值 | 保留按需编辑；字段错误就地展示，保存/取消明确，键盘验收 |
| knowledge-revisions | 历史列表；各版本全文 | F10；避免无限嵌套滚动 |
| knowledge-tree | 完整来源坐标 | 原始页/块坐标常显；JSON次级、断行和复制 |
| lead-filters | 高级筛选排序 | F11，收起仍显示已生效条件 |
| memory-history | Status/range audit snapshots | Readable before/after projection and unchanged secondary raw copy accepted at 0315939e / actual 36512; [scope](MEMORY_AUDIT_DIFFERENCES_2026-10-22.md). |
| memory-observations | 来源收据 | 保留审计；JSON可读与溢出约束 |
| personal-memory | 记忆变更审计；正文 | 保留独立分区，正文长时统一阅读区域 |
| outbound-composer | 发送历史；核实发送；详情；原邮件；保存草稿 | 历史维持分页；未知发送状态及核实入口应常显，避免藏在多层折叠里；保留最终发信确认 |
| provider-usage-summary | 用量总览；每组明细 | 减少多层折叠，保留已有原始收据，不增加成本分析 |
| search-task-detail | 原始任务要求 | 保留，统一长文本排版 |
| spend-budget | 上界期限；OpenRouter；DeepSeek；搜索费率；人民币期限 | 管理信息按服务分组，异常摘要常显；不改变费率/预算规则 |
| task-center | 总预算；任务指标；联系人批次 | 任务业务状态先显示，指标按需；联系人批次注明独立范围 |
| task-detail-view | 技术原始结构 | 保留，折叠前给业务摘要 |
| task-record-summary | 草稿/邮件正文 | 长正文统一阅读模式 |
| task-run-controls | 阶段数量记录 | 保留，不扩大费用账本；简短结果先于技术JSON |
| task-spend-budget | 任务预算 | 已有加载和重试；减少嵌套、保持表单明确 |
| user-channel-map | 添加公司；角色显隐；关系记录 | 角色勾选“显示/隐藏”语义明确；关系数量与分页可见；新增表单可取消 |

## 确认后验收

维持现有深色风格和固定工作区，不改为无限整页下滑。桌面、小高度窗口、手机、200%缩放下逐项打开和收起；鼠标滚轮、触控板、触屏、Tab/Enter/Space/Escape均检查。浮层无透明穿透、无祖先裁切，只有预期区域滚动，关闭后焦点和滚动恢复。

批量测试覆盖 0/1/5/8/跨页/大批次、重复提交、部分失败、刷新恢复和取消后续；采用合成数据和模拟模型，不因视觉验收真实发送私有邮件。确认后再实现，目前没有将建议标为已完成。


### MA24-16 / F08 — 附件选择跨页保留（2026-10-11，G13 部分）

- 补齐已确认 F08 的已选资料可见性：独立列表显示当前已选文件，翻页/搜索后可查看和移除；同一组件关闭重开保留名称与选择。名称尚未加载时明确标注，不凭 ID 编造文件名；缓存名称仅用于显示，任务权限校验不变。
- 区分加载、空结果与读取失败；失败重试使用原请求的页码/搜索条件，旧请求迟到不覆盖新列表。补充触发器与对话框关联，去除重复标题，长文件名允许断行。
- 实际组件及产品 CSS 的隔离浏览器桌面 1366×900、手机 390×844 两项测试通过；覆盖跨页选择、搜索、503 后重试、加载状态、移除、Escape/焦点返回和无横向溢出。手机截图已查看；类型与定向 lint 通过。全部接口合成拦截，无真实上传/模型调用。
- 此为 F08 局部验收，尚未部署新版网页；33 个组件全部可达入口及矮窗口/复杂长资料仍需继续核查，G13 未完成。证据：`docs/evidence/ma24-attachment-selection-2026-10-11.json`。

2026-10-15 页面到库补验：候选实际网页与隔离恢复库用 13 个合成已注册私有原件完成 12+1 页搜索/跨页选择/移除/重开保留；第二合成账号经实际 API 查询 0 项。桌面和手机无横向溢出；克隆已清理。真实上传、任务引用、生产入口及短窗口长标题尚未验收。[页面收据](evidence/ma24-g13-f08-attachment-page-db-clone-2026-10-15.json)。


### MA24-16 / F11 — 管理分区读取与草案状态（2026-10-11，G13 部分）

- 设置页 Skill/记忆/定时任务折叠区分别处理读取结果，一个接口失败不再阻断其他分区更新。加载和失败期间不显示“尚无记忆”等空数据结论；读取失败保留旧内容并注明，禁用未刷新分区的变更动作，草稿输入保留。重开/刷新请求的迟到结果不能覆盖新一轮读取。
- Skill 编辑器成功提示改为“未启用草案”，与 importSkill 服务端强制 enabled=false 一致，不再称保存后即可使用。没有改变人工启用或自动启用权限。
- 桌面 1366×900、手机 390×844 隔离组件浏览器两项通过：独立失败、加载、空结果、保留草稿、旧数据禁用、刷新恢复、合成保存状态与无横向溢出；手机截图已检查。类型和定向 lint 通过。所有接口合成拦截，没有真实导入/定时任务/模型调用。
- 待后续网页发布加载；本阶段不代表全部折叠入口或 G13 完成。证据：`docs/evidence/ma24-library-load-state-2026-10-11.json`。

2026-10-15 页面到库补验：候选设置页实际读取三分区，单次响应注入记忆 503 不阻断 Skill/定时任务，草稿保留；刷新后恢复。桌面/手机各经真实 API 保存一条未启用指令 Skill 草案并从克隆库读回，定时任务未创建。自然质量、启用资格和生产入口仍待验。[页面收据](evidence/ma24-g13-f11-agent-library-page-db-clone-2026-10-15.json)。


### MA24-16 / F10 — 历史版本分页状态（2026-10-11，G13 部分）

- 历史版本读取期间禁用分页，加载/失败时不再将上页内容显示为请求页；重开显示加载，失败原页重试。文档变更重置页码/内容/展开状态；取消请求不显示失败，内部版本展开不会误触外层加载。新增页号和长原文断行，保留历史片段重建及 5000 字预览边界说明。
- 桌面 1366×900、手机 390×844 隔离浏览器两项通过，覆盖延迟读取、503、原页重试、加载禁用分页、取消在途读取并重开、文档切换、空结果、嵌套展开及长串无横向溢出。类型与定向 lint 通过。接口均为合成拦截，无产品库写入或模型调用。
- 本阶段仅关闭 F10 的上述状态缺口，不宣称全部历史全文可在前端读取或全部折叠入口通过；代码尚未部署网页。G13 仍进行中。证据：`docs/evidence/ma24-revision-pagination-2026-10-11.json`。

2026-10-15 页面到库补验：候选实际网页/隔离库从真实历史 API 读取 11 条合成私有版本；第二页一次响应注入 503 后，手机与桌面隐藏旧页、在原页重试并显示重建说明。注入失败不是自然服务故障，原件正确性与生产入口仍待验。[页面收据](evidence/ma24-g13-f10-revision-history-page-db-clone-2026-10-15.json)。


### MA24-16 / F09 — 执行历史及追加要求恢复（2026-10-11，G13 部分）

- 追加任务要求仅在服务端成功响应后清理本次提交文字；失败保留输入，请求期间用户新编辑的文字不会被旧成功响应清空。请求期间禁用该卡片的重复控制操作；操作错误与轮询错误分开，正常状态刷新不再抹去操作失败，操作错误绑定对话。没有自动重试控制请求或改变服务端授权。
- 重建轮询时按持久事件 ID 合并去重、数值排序，避免重复加载同一页导致执行记录数量膨胀。继续保留“加载更早记录”和完整收据内容，取消的读取不触发旧刷新回调。
- 3 项事件单测通过，包括超过 JS 安全整数的 ID 顺序；桌面/手机 2 项隔离浏览器通过，40 条记录从最近 16 条展开、轮询重建无重复、失败输入保留、正常轮询不清失败、在途编辑保留及成功清理均验证。类型/lint 通过；网络全部合成拦截，无真实任务控制或模型调用。
- 此为 G13/F09 局部修复，代码未部署网页，不代表后端任务恢复或全部折叠入口验收。证据：`docs/evidence/ma24-run-history-recovery-2026-10-11.json`。

2026-10-15 页面到库补验：候选实际网页从隔离库读取 40 条合成工具回执，桌面/手机展开完整历史；两次追加要求由真实控制 API 持久化，首个控制事件在第二视口可见。第三次请求前合成并发改为终态，实际 API 返回 409，页面保留草稿和错误。未启动任务 worker 或模型；自然任务与生产入口继续待验。[页面收据](evidence/ma24-g13-f09-run-history-page-db-clone-2026-10-15.json)。


### MA24 网页发布补记（2026-10-11，G01/G13/G19）

- 正式网页 localhost:3018 已加载 `2446594d` 对应构建 `.next-releases/ma24-workflow-ui`，包括附件跨页选择、管理分区加载/草案提示、历史版本分页、任务追加输入恢复及执行事件去重。原 `.next-releases/ma24-blind-review` 保留；此阶段没有执行实际回滚，不能代替 G18 演练。
- 构建通过，85 份 trace 清单无私有依赖。14 项桌面/手机隔离浏览器回归通过，覆盖四个修复区及邮箱管理/阅读、客户时间线和删除对话确认。它们使用合成接口，不代表全量真实业务质量。
- 候选 3048 与正式 3018 均通过一次性账号登录、未登录拒绝、分页、审核 owner 伪造拒绝、真实公开 PDF multipart 上传及同内容复用验证；测试账号/作业/原件清理完成，未创建模型任务。两处首页与 11 个静态资源健康。候选 PID 37384 已关闭。
- 替换前确认主任务队列为空且旧网页 PID 为 3996；正式网页现为 PID 37244。LangGraph 仍为 PID 36248，主/邮箱/线索 worker 未重启；此前主 worker/LangGraph 更新授权仍待回应。未改变自动学习、图谱、Skill 或检索主路开关。
- G13 全部可达折叠入口和 G14–G18 质量/发布门槛仍未完成，Goal 保持 active。证据：`docs/evidence/ma24-workflow-web-release-2026-10-11.json`。


2026-10-21 / Existing MA24-16 F12 approval submission follow-up: in-flight individual/batch decisions now lock competing decision buttons. Successful server acknowledgements retain an ID/hash-specific local receipt while polls catch up; exact submitted batches do not approve changed/new items. Saved-decision notices do not claim action execution, and failures do not claim success. Two preview tests, actual-component synthetic HTTP checks at three widths, full typecheck and three-file lint passed. Fixed-package/API/database/Worker acceptance pending; no new product confirmation or real quality/production claim. [Scope](APPROVAL_SUBMISSION_STATE_2026-10-21.md).


2026-10-21 / MA24-16 F12 approval submission accepted within scope: product **6640ef30**, host **8a6cd550**, actual **60432 exited 0** through Chrome/HTTPS/compiled Web/API/Worker/fresh PostgreSQL; both result records inspected. Held real single/batch responses disable competing approval actions and successful receipts are visible. All four Worker approve/deny/revoke/changed-hash cases passed with tool-receipt counts 1/0/0/1; duplicate, peer and wrong-hash decisions remain rejected. Exact two-mail batch excludes the plan, immediate single revoke preserves the other approval, paused task remains paused with zero tool calls/mail connections/external sends. Three-width component tests additionally cover repeated clicks, stale props, changed hashes/new batch items and network/409 failures; screenshots inspected. Three builds/five package checks, final typecheck/lint and source hashes passed. Failed 88565 and its inspected/removed temporary runtime/network are retained; the successful retry cleaned up normally and original three services remain. This is generated workflow evidence, not real human approval, natural model/answer quality, provider/production qualification, activation or deployment. G14-G20 remain deferred. [Scope](APPROVAL_SUBMISSION_STATE_2026-10-21.md); [evidence](evidence/ma24-g13-approval-submission-2026-10-21.json).


2026-10-22 / Existing MA24-16 F09 task recovery: failed/unconfirmed status now marks the retained snapshot historical and disables controls/approvals/undo without discarding the instruction draft. Independent event paging cannot block status reads; read deadlines and epochs prevent stalled/pre-write responses from restoring old actions. Saved-request notices and errors stay conversation-scoped. Five tests, three-width real-component timeout/recovery cases, prior approval component regression, typecheck and six-file lint passed; fixed packages and actual database/API browser acceptance pending. No new confirmation, mutation retry contract, real quality or production claim. [Scope](RUN_STATUS_RECOVERY_2026-10-22.md).


2026-10-22 / MA24-16 F09 task-status recovery accepted within scope: product/fixture **cd4cf736**, actual **45699 exited 0** through Chrome/HTTPS/compiled Web/API/fresh PostgreSQL; both result records inspected. Failed status reads disable controls/approvals while retaining the draft. Held real event responses do not block actual resume/pause readback. Two explicit instruction submissions persist two exact entries; a held acknowledgement plus failed readback preserves text typed after submission and the saved-request notice. A pre-write real GET cannot restore old controls; recovery, peer/anonymous isolation and unchanged pending mail approvals passed. Task ends paused; tool/model/external calls 0 and no Worker/mail connection was started. Five unit tests, three-width component cases (including real read deadlines, exact cursor and cross-conversation late response), previous approval component regression, six-file lint/typecheck, three builds and five package checks passed. Source hashes matched and screenshots were inspected. Temporary resources removed; original three services remain. No real business/answer/provider quality, mutation retry contract, production qualification, activation or deployment claim. G14-G20 remain deferred. [Scope](RUN_STATUS_RECOVERY_2026-10-22.md); [evidence](evidence/ma24-g13-run-status-recovery-2026-10-22.json).


2026-10-22 / Existing MA24-16 F09 instruction recovery implementation: official UI retains a task/content-specific random submission identity using a digest-only tab record. Owner-locked POST replay acknowledges exactly saved content without another write/event, while changed content and new terminal/evaluation work remain refused. A private read-only receipt supports explicit reconciliation after reload/task completion; active absence stays pending. Legacy callers remain compatible. Forty-three tests, typecheck/eleven-file lint and three-width status regression passed; new packages, native browser/concurrency/rollback and affected runtime acceptance pending. No new confirmation, real quality, provider, activation or deployment claim. [Scope](INSTRUCTION_SUBMISSION_RECOVERY_2026-10-22.md).


2026-10-22 / MA24-16 F09 instruction acknowledgement recovery accepted within scope: fixed product/fixture **b853fee5**. Actual Chrome/HTTPS/Web/API/database **14875 exited 0**: committed-but-dropped response, reload/same-key retry with unchanged row and one instruction/event, explicit same-content/new-key submission, active absence, multiple unknown identities, terminal read-only reconciliation/unchanged exact replay, changed-body refusal, actor/task isolation, concurrent same-key/changed-body serialization and mid-event-failure rollback/retry passed. Browser storage contains digest/identity metadata, not instruction plaintext. Existing status/draft/old-read checks remain passed. Fixed API/Worker **34089 exited 0** preserves source-withdrawal recovery, four local-action cases and exact paused mail batch. Correct collector TLS declaration **74974 exited 0** verifies retry, CA/deployment/key/purpose/account/revocation and disablement commit wait; wrong-entry 30390 is retained, with no relaxed gate. Current full TLS composition **73734 exited 0**, all 12 records inspected: application/migration encryption/refusal probes, six safety arms, same-freeze five categories/eight ledgers, current package registration/provenance, live-source/policy checks, actual post-read termination/default-lease natural expiry/new-process recovery without repeated committed HTTP steps, and fixed-launcher completed reuse passed. Twelve source hashes match; 43 tests, typecheck/eleven-file lint, prior three-width component regression, three builds/five package checks and inspected screenshots passed. All temporary resources removed; original three services remain. No actual model call, real business/human/provider quality, whole-fixture production wrapper, production qualification, activation or deployment is claimed. Legacy unkeyed callers and unrelated controls retain their old contracts; G14-G20 remain deferred. [Scope](INSTRUCTION_SUBMISSION_RECOVERY_2026-10-22.md); [evidence](evidence/ma24-g01-g13-instruction-submission-2026-10-22.json).


2026-10-22 / Existing MA24-16 F12 memory-history disclosure: a readable before/after projection now uses only retained kind/status/scope/country/role/character-count values; creation/deletion, missing/null/invalid values and same-length body edits are explicit. Existing raw JSON remains secondary and exact. Four tests, typecheck/five-file lint and three-width actual-component read/copy/paging/recovery checks passed. Fixed packages and actual audit API/database/browser acceptance are pending; no retention/permission change, new confirmation, quality or production claim. [Scope](MEMORY_AUDIT_DIFFERENCES_2026-10-22.md).


2026-10-22 / Existing MA24-16 F12 memory-history readable differences accepted within scope: fixed product/fixture **0315939e**, actual **36512 exited 0** through Chrome/HTTPS/compiled Web/API/fresh PostgreSQL; both result records inspected. Actual create/delete audit cells, same-length body revision with explicit change note, external-use revocation to internal learning, initially collapsed/exact copied raw snapshot and desktop/mobile table layout passed. Existing CRUD, version conflicts, confirmed-write/readback failure, owner/peer audit privacy, read-failure clearing/retry and pagination remain passed. Four projection tests, three-width actual-component long/missing/null/malformed/copy/paging checks, typecheck/five-file lint, three builds/five package checks and seven source hashes passed; representative component and all four actual audit screenshots inspected. Main/collector executables, Node and dependencies match b853fee5; its full runtime/TLS evidence is retained at that version rather than re-claimed as a new composition. Temporary resources removed, original three services remain. No retention/API/permission change, historical body restoration, model call, real business quality, production qualification or deployment is claimed. G14-G20 remain deferred. [Scope](MEMORY_AUDIT_DIFFERENCES_2026-10-22.md); [evidence](evidence/ma24-g13-memory-audit-differences-2026-10-22.json).


2026-10-22 / G13 conversation-date correction: the history list now formats the saved timestamp in the current device timezone, matching the message clock convention, instead of slicing the UTC date. Raw timestamps remain in semantic time elements; database values and ordering are unchanged. Six actual React/local-HTTP browser cases (Shanghai, Los Angeles and UTC, each at 1366/390 widths) passed explicit cross-midnight expected dates and unchanged timestamp attributes, with zero writes/model calls. Full TypeScript and component ESLint passed. This is component evidence only, not fixed-image/API/business-quality or production acceptance; previous fixed-image receipts remain version-scoped. No new user confirmation. G14-G20 and deployment remain deferred. [Evidence](evidence/ma24-g13-conversation-local-date-2026-10-22.json).


2026-10-22 / Existing G13 conversation-management recovery implemented: retained rename dialog, submission lock/deadline and explicit read-only current-title reconciliation replace the unhandled browser-prompt request. Newer input survives old-result reconciliation; a different server title requires explicit overwrite. Confirmed deletion is independent of optional session-storage cleanup and list readback. Three-width component cases and existing delete-dialog regression, full TypeScript and five-file lint passed. Actual fixed Web/API/database fixture is prepared, with build/native acceptance still pending; no new server write/concurrency contract, user confirmation, real quality or deployment claim. [Scope](CONVERSATION_MANAGEMENT_RECOVERY_2026-10-22.md).


2026-10-22 / G13 conversation-management recovery accepted within scope: fixed product/fixtures **2765496e**, actual **78455 exited 0** through Chrome/HTTPS/compiled Web/API/fresh PostgreSQL. Both 1366/390 widths passed owner/peer/anonymous isolation, cancel without writes, actual saved rename, committed-but-dropped acknowledgement with exact current-title readback and no repeated PATCH, failed read preservation, explicit overwrite after another title, paused-task deletion refusal and confirmed active-conversation deletion despite blocked browser storage; completed task history remains. Three-width component cases additionally pass duplicate-submit/held-response locks, rejected and newer drafts, read-failure and post-delete list recovery. Existing delete-dialog regression, full TypeScript/five-file lint, fixed Web build, 1062-input source/private-file/static checks and five source hashes passed. Representative component and both native screenshots inspected; temporary resources removed, original three services remain. No real provider/model/business quality, new whole backend composition, production qualification, activation or deployment claim. G14-G20 remain deferred. [Scope](CONVERSATION_MANAGEMENT_RECOVERY_2026-10-22.md); [evidence](evidence/ma24-g13-conversation-management-recovery-2026-10-22.json).


2026-10-22 / Existing MA24-16 F08 upload-progress workflow implemented: task attachments now show six-per-page owner-scoped upload states with explicit loading/read failures/unknown values and an existing knowledge-workspace link. Upload locking is separate from library reads, survives close/reopen, and never auto-retries unknown acknowledgements; reused receipts are identified. Only registered library originals remain selectable. Three-width actual-component checks, TypeScript and five-file lint passed; actual fixed-Web/database fixture is prepared, build/native acceptance pending. No new rule confirmation, worker/model execution, format/content-quality, qualification or deployment claim. [Scope](ATTACHMENT_UPLOAD_PROGRESS_2026-10-22.md).


2026-10-22 / Existing MA24-16 F08 upload-progress workflow accepted within engineering scope: fixed Web product **0aee85a7**, corrected host fixture **afcd56a0**, actual **95198 exited 0** through Chrome/HTTPS/compiled API/fresh PostgreSQL. Desktop/mobile passed private pending-upload persistence, held acknowledgement across close/reopen and library refresh, identical bytes retaining one job, owner/peer/anonymous isolation, read-failure clearing, explicit injected failure status, committed-but-dropped acknowledgement with no automatic POST, six-row status paging and 409 refusal to submit an unprocessed job as an asset; model-task count remains zero. Three-width component status/unknown/malformed/selection/lock/wrapping checks, full typecheck/five-file lint, fixed Web build, 1063-input source/private-file/static check and six source hashes passed; both native and representative component screenshots inspected. Earlier 86684/20444 multipart fixture failures remain retained, with paired fetch/FormData correction and no product guard relaxation. Temporary resources removed, original three services remain. No extraction worker, real format/content/business quality, provider/model call, whole backend composition, production qualification, activation or deployment claim; G14-G20 deferred. [Scope](ATTACHMENT_UPLOAD_PROGRESS_2026-10-22.md); [evidence](evidence/ma24-g13-attachment-upload-progress-2026-10-22.json).


2026-10-22 / Existing G05/G13 coordinate-reader recovery implemented: selection-owned evidence reads and directory/document invalidation prevent late block replacement; pending/failed directory rows are hidden, local retry keeps its path/page, separate loading/errors and ten-second deadlines avoid stale previews. Existing raw copy and server source/owner contracts remain. Three-width actual-component checks include transport ignoring cancellation, directory/document races, malformed/failed reads, clipboard and a real deadline; TypeScript/four-file lint passed. Fixed-Web actual asset-withdrawal fixture prepared, image/native acceptance pending. No new confirmation, real quality, provider call, qualification or deployment claim. [Scope](KNOWLEDGE_TREE_READ_RECOVERY_2026-10-22.md).


2026-10-22 / Existing G05/G13 coordinate-reader recovery accepted within scope: fixed product/fixtures **79f87251**, actual **98858 exited 0** through Chrome/HTTPS/compiled Web/API/fresh PostgreSQL. Desktop/mobile passed actual owner evidence/no-store, peer/anonymous refusal, held old responses versus newer selection/directory/reader unmount, directory 503 clearing/local retry, actual asset withdrawal returning 404 with cleared preview and restoration readback, exact raw-coordinate clipboard and retained current source hash. Three-width component cases additionally ignore cancellation to prove late-result guards, reject malformed directory and mismatched evidence node, preserve retry path, and pass a real ten-second deadline plus long-coordinate wrapping. Typecheck/four-file lint, fixed Web build, 1063-input source/private-file/static check and four source hashes passed. Both native and representative component screenshots inspected; temporary resources removed, original three services remain. This does not accept saved-text/list/delete workflows, real document/model-answer quality, whole backend composition, production qualification or deployment; G14-G20 remain deferred. [Scope](KNOWLEDGE_TREE_READ_RECOVERY_2026-10-22.md); [evidence](evidence/ma24-g05-g13-knowledge-tree-recovery-2026-10-22.json).


2026-10-22 / Existing MA24-02/MA24-16 current-library source guard implemented: body and private/shared/all excerpts now share active/current-tree/current-asset-or-original checks, retaining asset-free legacy text and explicit owner history. Migration 171 limits added SELECT visibility to the current active shared original; no write/history/private grant. Reader/list recovery clears stale actions; deletion lock and acknowledgement boundaries preserve confirmed outcomes. Three existing service tests, three-width component cases, typecheck/six-file lint passed. Actual schema-171 RLS/Web fixture prepared; packages/native acceptance pending. No business migration, new user confirmation, real quality, provider call, activation or deployment. [Scope](LIBRARY_CURRENT_SOURCE_GUARD_2026-10-22.md).


2026-10-22 / Final current-source acceptance: **504dc63f**, full fixed TLS/composition/recovery **12196 exited 0**; all 12 result records and seven source hashes inspected. Six safety arms, same-freeze five categories, measured current runtime registration/provenance, live-source/policy checks, actual committed live-read process termination/default-lease natural expiry/new-process recovery without replay, preserved execution/capture/journals and completed fixed-launcher reuse passed. Application/migration TLS, plaintext/missing-CA/wrong-DNS and configured wrong-IP refusal passed. Native library/Web/RLS **24267**, actual API/Worker **20802**, canonical collector TLS/database trust **95399**, three builds/five package checks, three service tests/typecheck/six-file lint and three-width component cases are separately passed. Migration 171 is applied only to disposable databases; business databases/production are unchanged. Temporary containers removed, original three services remain. Existing MA24-02/MA24-16 current text/excerpt source protection and current-shared-original SELECT are accepted at these scopes, with explicit owner history retained. Whole production entrypoint wrapper, genuine provider/business/document-answer quality, qualification and activation remain false/unverified. G14-G20/deployment remain deferred. [Scope](LIBRARY_CURRENT_SOURCE_GUARD_2026-10-22.md); [final evidence](evidence/ma24-g02-g05-g13-library-current-source-2026-10-22.json).


2026-10-22 / Existing MA24-02/MA24-16 F08 task-admission source guard implemented: new ordinary requests require active accessible documents and exact registered ready current tree/asset/SHA bindings for the whole set; exact-key receipt replay and server-only reviewed-mail file semantics remain separate. UUID aliases retain original submitted input and count as one database source. Old 504dc63f immutable Web reproduction 50098 returned 202 for an unindexed registered asset and exited 1 at the new expected-409 assertion, with cleanup and no worker/model. Twenty queue/mail/recorded-source tests passed; positive selector fixtures now have ready tree metadata. Fixed packages/native rollback and UI acceptance pending; no new rule confirmation, quality, provider or deployment claim. [Scope](ATTACHMENT_ADMISSION_CURRENT_SOURCE_2026-10-22.md).


2026-10-22 / Existing MA24-16 F10 revision-read recovery: actual malformed-row Chrome reproduction on unchanged 02be6338 empties React with a null-title error. The client now validates row fields/ten-row pages, clears stale pages and applies a ten-second read deadline. Three-width component session 24392 and TypeScript/four-file lint 79967 passed. Fixed Web/native eleven-revision API/browser checks are prepared, not accepted yet. No API/retention/permission change, new confirmation, real quality/provider call or deployment. [Scope](KNOWLEDGE_REVISION_READ_RECOVERY_2026-10-22.md).


2026-10-22 / Final ordinary attachment-admission acceptance: fixed product/fixtures **02be6338**, native Chrome/HTTPS/API/database **82932**, actual API/Worker **37398**, canonical collector TLS **50745** and full fixed TLS/recovery **66074** all exited 0. All 12 full-composition result records and six frozen source hashes inspected. Eleven refusal cases preserve conversation/message/run/event counts; current shared/owner access, UUID aliases, exact-key read-only replay after withdrawal and desktop/mobile ready-current selector submission pass. Three builds/five package checks, 20 tests and TypeScript/six-file lint passed. Six safety arms, same-freeze five categories, measured package/provenance, source/policy guards, actual committed-read process termination/default-lease natural expiry/new-process recovery without repeated completed HTTP and completed fixed-launcher reuse pass. TLS and wrong-identity refusal pass. Temporary resources removed; original three services remain. All sources/accounts/answers are generated; actual model calls 0, whole production-entrypoint wrapper false, real quality/qualification/activation/deployment remain unaccepted. G14-G20 deferred. [Scope](ATTACHMENT_ADMISSION_CURRENT_SOURCE_2026-10-22.md); [evidence](evidence/ma24-g13-attachment-current-source-admission-2026-10-22.json).

2026-10-22 / Final MA24-16 F10 history recovery acceptance: fixed product/fixtures **ce2e8cbb**, actual Chrome/HTTPS/API/fresh-database **82101 exited 0**. Desktop/mobile eleven-owner-revision 10+1 paging, injected null row without React crash, 503 old-page clearing, same-offset retry and reconstructed-history disclosure pass; existing library/source/RLS/delete recovery checks also pass. Three-width component **24392** additionally verifies wrong row types, incomplete rows, long content and a real ten-second deadline; TypeScript/four-file lint **79967**, all three builds/five package checks pass. Four frozen files match, both native and two representative component screenshots inspected. Main/collector entry artifacts, Node and dependency bytes exactly match 02be6338; source/deployment manifests differ, so full backend-composition evidence remains at 02be6338. No new composition, real quality/provider/human approval/qualification/activation/deployment is claimed. Temporary resources removed; original three services remain. G14-G20 deferred. [Scope](KNOWLEDGE_REVISION_READ_RECOVERY_2026-10-22.md); [evidence](evidence/ma24-g13-knowledge-revision-read-recovery-2026-10-22.json).


2026-10-22 / Existing MA24-16 F05/F06 mailbox reader recovery: actual unchanged-022ff304 same-message reselect leaves a loading state without a second request. Selection-bound original reads, independent list/original retries, exact identity/direction and row checks, stale-read clearing and ten-second deadlines are implemented. Final three-width component 67805 passed after correcting mobile fixture return/list navigation; original and intermediate failures retained. Fixed packages/native inbox/sent/owner checks pending. No new confirmation, API/storage/permission/send change, real provider/model quality or deployment claim. [Scope](MAILBOX_READER_SELECTION_RECOVERY_2026-10-22.md).


2026-10-22 / Final MA24-16 F05/F06 mailbox reader acceptance: fixed Web/product **b5925222**, corrected host fixture **d4dd7bae**, actual Chrome/HTTPS/API/disposable-database **19976 exited 0**. Encrypted synthetic inbox and sent originals pass in 1366x900/1366x360/390x760; desktop same-message reselect starts a new read, one-shot list/original failures retry, refreshed failure clears old body, long learning originals retain drawer/focus/scroll and short originals remain inline. Owner GET 200, peer 404 and anonymous 401 passed. Three-width component **67805** independently verifies late responses despite ignored cancellation, wrong-message refusal, list clearing, original-only retry, paging and an actual ten-second deadline. TypeScript/five-file lint plus corrected fixture checks, all three builds/five package checks and five frozen source files pass. Two native key-configuration failures and two mobile fixture failures remain retained without product guard relaxation. Both native drawer and representative component screenshots inspected. Main/collector execution artifacts/Node/dependencies match ce2e8cbb; source/deployment manifests differ, so no new whole backend composition is claimed. Temporary resources removed, original three services remain. Actual model/provider connections/mail sends 0; genuine quality/qualification/activation/deployment remain open, G14-G20 deferred. [Scope](MAILBOX_READER_SELECTION_RECOVERY_2026-10-22.md); [evidence](evidence/ma24-g13-mailbox-reader-selection-recovery-2026-10-22.json).
