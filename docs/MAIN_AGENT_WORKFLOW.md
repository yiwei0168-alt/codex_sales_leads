> MA15 变更：采用已确认的半透明紫色视觉、三个业务入口及资料默认页；四阶段已实现，模式/资料隔离、六组布局/路由、真实批准与模拟断线恢复、构建及静态资源通过；验收边界见 MA15_UI_ACCEPTANCE_2026-09-21.md。精确规则与状态见 [规则](CONFIRMED_PRODUCT_RULES.md) 和 [工作流](FRONTEND_SIMPLIFICATION_PLAN_2026-09-21.md)。

# 产品主 Agent 与开放式工具架构

## MA20 对话内状态和精确确认（2026-09-22 已确认）

任务状态与待批准内容按 `runId` 附在发起任务的用户消息下方；运行完成后回答保留在普通对话消息中，详细事件仅在需要时展开。普通公开网页检索及单渠道查询属于只读调用，不单独创建动作批准；同一任务的最终精确批准可覆盖相同范围的付费计划，Agent 不重复索取计划确认。发送邮件、删除、正式发布、私有邮件学习授权及大规模/不确定付费计划仍依照现有边界确认。旧线索卡的“确认并开始搜索”按钮本身表达用户决定，不再叠加浏览器确认框。[规则](CONFIRMED_PRODUCT_RULES.md)、[界面方案](FRONTEND_SIMPLIFICATION_PLAN_2026-09-21.md)与[验收记录](MA20_CONVERSATION_APPROVAL_ACCEPTANCE_2026-09-22.md)分别记录确认、实现与检查。

## MA21 对话历史操作（2026-09-22 已确认）

对话历史当前项使用透明浅紫色标识；每条右侧更多菜单提供重命名、查看技术流水和删除。流水从同一账户的已保存主 Agent 任务与事件读取，在独立只读弹窗中按需展开。删除先确认，再将对话标记为 `deleted` 并从历史与普通对话读取中隐藏；有 queued/running/waiting_user/paused 任务或已确认待执行动作时拒绝删除。保留原有任务、消息和审计回执用于恢复及重复副作用防护。跨账户仍由 RLS 与用户过滤隔离。见[规则](CONFIRMED_PRODUCT_RULES.md)和[验收记录](MA21_CONVERSATION_HISTORY_ACCEPTANCE_2026-09-22.md)。

## MA19 外部 HTTP API 网络路径（2026-09-22 已确认）

固定的 Google Places、Exa、Brave、SearchAPI 和 Tavily 请求使用本机 `MODEL_PROXY_URL`；Gemini 继续使用 `GEMINI_PROXY_URL`。OpenRouter 请求按模型选择：GLM、DeepSeek、Kimi 直连，其余模型及没有明确模型的网关请求走本机代理。独立的 DeepSeek/Kimi API 与阿里云百炼兼容接口保持直连；IMAP/SMTP、本地服务和按需条件连接不改。代理必需的路径缺少有效本机地址时明确失败，不回退直连。实际可用性仍取决于各服务的密钥及提供方状态。[精确规则](CONFIRMED_PRODUCT_RULES.md)与[验收记录](MA19_API_NETWORK_ROUTE_ACCEPTANCE_2026-09-22.md)分别记录决策和验证。

## MA18 模型网络路径（2026-09-22 已确认）

主 Agent 默认的 OpenRouter GLM 5.3 请求直连；通过同一 OpenRouter 网关调用 OpenAI 或 Claude 模型时按请求中的模型 ID 使用 `MODEL_PROXY_URL`。Gemini Google API 使用 `GEMINI_PROXY_URL`，包括主 Agent 网页搜索和产品线索发现。需要代理的模型在本地代理未配置或无效时明确失败，不回退直连。批次提交及按保存模型读取收据遵循相同路径；其他提供方和元数据读取路径不变。[精确规则](CONFIRMED_PRODUCT_RULES.md)及[验收证据](MA18_MODEL_NETWORK_ROUTE_ACCEPTANCE_2026-09-22.md)分别记录确认、实现与实际检查。

前端精简与可读性改造按 [MA15 计划](FRONTEND_SIMPLIFICATION_PLAN_2026-09-21.md) 推进；基础视觉、导航、模式退场与页面重排已实现；本地验收和明确边界见 MA15 验收记录。

本地页面运行故障及恢复验证见 [2026-09-21 本地 UI 静态资源事件](LOCAL_UI_RUNTIME_INCIDENT_2026-09-21.md)。停止旧服务后再构建，启动时只保留一个服务，并先检查静态资源，再运行登录后的桌面与移动端浏览器流程。

## MA14 local simulation acceptance (confirmed 2026-09-21)

For the current MA11 milestone, remaining product flows are accepted using isolated local records, synthetic model outputs and controlled send/publish substitutes. A working account's real scoring, contact classification, SMTP delivery or new RAG release is not an acceptance prerequisite at this stage. The local checks must still exercise the real account service, tool contract and persistence boundary where applicable, and report source ownership, version/hash checks, approval, missing-input honesty and replay safety. Simulated outputs are labeled as such. The local clone passed formal score and contact publication, standalone encrypted follow-up, synthetic binary registration with local embeddings and existing release-gate reuse; see the exact checks and limits in [the acceptance log](MAIN_AGENT_ACCEPTANCE.md). The earlier 80/40 Graph replay and eight authorized GLM Batch calls remain separate evidence; this scope change does not turn either into proof of a different flow. [Rule](CONFIRMED_PRODUCT_RULES.md).

## MA13 quality-first development priority (confirmed 2026-09-21)

Development stages now spend engineering and model effort on completing product flows and improving output quality. They no longer update the development efficiency ledger or automatically generate expense reports. Historical ledger entries stay unchanged. Durable provider receipts may retain raw fields needed to resume a task, prevent duplicate effects or perform an explicitly requested reconciliation, but routine verification does not aggregate cost, token or utilization metrics. Acceptance evidence continues to record behavior, permissions, exact effects, failures and quality findings.

## MA11 current milestone (confirmed 2026-09-21)

Current MA12 checkpoint: all eight authorized GLM Batch tasks completed with saved final replies. The read paths and answer review are reported separately from the 80/40 isolated replay in [acceptance](MAIN_AGENT_ACCEPTANCE.md). Six answers were clear at the requested record/state level; two reproduced more private text than needed. These outcomes do not complete the remaining workflow adapters or authorize broad release.

The current deliverable is a verifiable main-Agent architecture using existing product business workflows. New MCP, network-browser and private-Git connections are later work. Preserve existing detailed pages, formal scoring, RAG v3 and account ACL. The chat becomes the single `/` entry with owned `/c/[id]` deep links, one navigation sidebar, durable event-cursor progress and exact final-action approvals. GLM Batch waiting shows queue/execution and elapsed time. The palette and acceptance values are recorded exactly in [MA11](CONFIRMED_PRODUCT_RULES.md).

Coverage continuation: the registry now exposes 96 tools. The latest shared-service adapters cover workspace mode, feedback regeneration, mailbox screening/learning/lifecycle, mailbox connection shutdown/deletion, stale-operation reconciliation, administrator Gold review, approved mailbox knowledge, exact-approved shared-text knowledge publication, hash-verified shared binary registration, shared RAG v3 release preflight/activation, persisted contact-enrichment status, staged contact verification and formal standalone score publication. Credentials never enter tool inputs, and publish/destructive effects retain central approval. [The capability matrix](MAIN_AGENT_CAPABILITY_COVERAGE_MA11.md) lists the remaining acceptance gaps and separates later MCP/browser/private-Git work.

Stage evidence is separate: confirmation here is neither a tool implementation nor a passing replay. The 120 isolated data-copy replays exercise Graph, worker, tools and persistence; controlled external-send substitutes cannot count as real model planning. Eight configured GLM Batch tasks are reported separately. Locked architecture/workflow acceptance requires at least 38/40 plus every specified critical boundary. The entry remains configuration controlled and passing this milestone does not imply full release. The original MA09 gate stays in version history.

Implementation stage: `/` renders a blank composer even when the account has history; `/c/[id]` checks ownership server side and restores the selected conversation. Existing market paths stay intact. The sidebar owns conversation history and feature entry points; settings holds Skill, memory and schedule controls outside the message stream. `AgentRuns` reads account-scoped saved cursor pages and the latest persisted Batch state. A page refresh starts at cursor zero and continues until caught up; incomplete tool results display their stored status and missing fields. Batch polling is receipt-only and UI time is elapsed time, not generated-token animation. [Synthetic desktop/mobile and database evidence](MAIN_AGENT_ACCEPTANCE.md). Current release scope is still configuration controlled.

The optional `lead_workflow` adapter uses the exact-approved existing lead-search action and queues its normal worker/Graph path. Migration 098 binds one action to one durable Agent call so a lost parent receipt can be reconciled without creating a second job. Queue state and task URL are returned as artifacts, while provider/workflow completion is checked separately. [Generated coverage](MAIN_AGENT_CAPABILITY_COVERAGE_MA11.md) lists every registered tool and the page-only/missing gaps. This adapter has passed unit/schema checks, not a positive real worker execution or model-selection test.

MA11 architecture replay uses `scripts/replay-main-agent-ma11.ts`: `--prepare` clones the local PostgreSQL source and freezes a private 80/40 source-ID/version/hash manifest under ignored `tmp/`; `--run` executes deterministic model decisions through the actual Graph/checkpointer, registered read tools, tenant boundaries, approval/call journal and targeted worker leases, then drops the clone. `--cleanup` removes a stranded clone after interruption. External send checks use a controlled in-process substitute. [Replay evidence](MAIN_AGENT_ACCEPTANCE.md) is separate from eight actual GLM Batch selections and from business answer quality.

The eight-case live verifier is prepared but requires explicit authorization for private account data to reach OpenRouter/Fireworks GLM Batch. Its `--start`/`--poll` paths require `--allow-private-provider-data`; `--reconcile` is read-only. The first sandboxed submission remained locally uncertain and a provider listing showed zero batches in its time window. Auto-review rejected the subsequent private-data submission before execution, so [the acceptance log](MAIN_AGENT_ACCEPTANCE.md) keeps actual model selection and cost unknown. The main entry remains configuration controlled.

MA12 (2026-09-21) now gives the exact private-data authorization for these eight verification tasks and their necessary continuation turns to configured OpenRouter/Fireworks GLM Batch. The earlier rejection and uncertain sandbox attempt remain historical. Resume with a fresh isolated clone and saved Batch IDs; record real model selection, valid outputs, costs and latency separately from deterministic replay. No SMTP send, publishing, deletion or full release is authorized by MA12.

Execution checkpoint: all eight first-turn Batch submissions have distinct saved remote IDs and provider status `in_progress`. The verifier polls those IDs and inspects each returned tool choice against a read-only allowlist before resuming the Graph; it stops a task after eight saved Batch turns. Admission acknowledgements are not answers. Results and billing remain pending in [the acceptance log](MAIN_AGENT_ACCEPTANCE.md).

Later checkpoint: all eight first model decisions are saved. The model used `describe_tool` before target reads; two runs have since executed account-scoped read tools and continued through saved Batch turns. Invalid version-suffixed names are preserved as model-selection failures and safely handled by the registered-tool dispatcher. A single `--watch --allow-private-provider-data` process now polls only the eight saved runs every 120 seconds, stops at eight Batch turns per task or after 48 hours, and writes a private report under ignored `tmp/`. Its exclusive local lock prevents a second watcher. The isolated database clone must be retained while turns are pending and cleaned only after terminal reporting. [Current aggregate tokens, cost and unknowns](MAIN_AGENT_ACCEPTANCE.md) remain separate from the 120 deterministic replay.

## P5 historical manual memory save - 2026-09-21 (partial)

`legacy_memory_save` uses the existing page's manual-memory editor and persistence service for account-owned email style or explicitly approved marketing claims. The central hook requires exact approval; edit inputs include the observed update revision and cannot target source-managed company classifications. Unchanged content reuses the existing embedding, while content changes use the configured embedding provider and retain an unknown bill until reconciled. This bridges the historical store but does not merge every legacy record into the new versioned memory tables. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2/P5 private task attachment entry - 2026-09-21 (partial)

An authenticated account can queue a **private** PDF/PPTX/XLSX extraction job without the shared-upload administrator token. Shared uploads still require the administrator role and token. The main composer lists only already registered private/shared original assets, passes selected IDs to the existing server-side owner/registration check and retains the user's text on send failure. Newly uploaded files are clearly pending until local extraction and registration; they are not silently attached. Legacy conversation mode explicitly rejects a selected attachment instead of ignoring it. The picker currently shows the first 50 assets per scope; text-file import and processing-state refresh inside the composer remain open. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2 independent follow-up drafts - 2026-09-21 (partial)

The existing follow-up page and new `follow_up_list`/`follow_up_generate` tools use a common service. An owned sent parent message supplies bounded thread, inbound and style context; generation records an encrypted account-owned UUID draft, without sending. The tool can be chosen without rerunning a development strategy. An unassociated parent is supported with nullable-safe ancestor checks and bounded account inbound messages filtered by exact addresses after decryption. Migration 099 must be applied before deployment; live generation and SMTP remain unverified. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2 contact enrichment status - 2026-09-21 (partial)

`contacts_enrichment_latest` and the existing page route now read one account-scoped service for the latest persisted run, per-company phase/errors and workspace coverage. The tool never starts a provider call. Unit/schema/type checks passed; live-run and database-isolation checks remain open. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2 shared binary registration - 2026-09-21 (partial)

The upload worker now scans active account IDs and claims each pending job under that account's RLS context; extraction artifacts are saved under the job owner's directory. Administrator tool `knowledge_shared_binary_register` accepts an owned extracted job ID and observed original SHA-256 after exact approval. It verifies both the original and extraction artifact hashes, rejects pending OCR/failed units, stores extracted text as a shared document and registers the original binary asset. Migration 100 records the document/asset receipt and status. The response says `ragV3: pending-release`: an active immutable RAG v3 release still requires its existing build/review/activation workflow. Browser file input remains the appropriate boundary for raw bytes. [Verification](MAIN_AGENT_ACCEPTANCE.md).

The registration service also checks the account's stored active administrator role before using shared-document write privileges. Raw file input stays on the authenticated upload page.

The administrator can call `knowledge_shared_release_gate` to read an existing shared release's ID, manifest hash, asset/chunk/dual-vector counts and unresolved document reviews. `knowledge_shared_release_activate` requires exact final-action approval carrying that ID and hash; it rechecks the stored active administrator role and release identity inside the transaction, refuses incomplete inputs, then invokes the existing atomic database activation function. Open fact reviews remain quarantined under the existing KQ04 rule; Gold review and holdout progress are reported but are not new activation blockers. The configured local source currently has an active 281-asset release and no document blockers; no new release was activated. A newly registered binary remains outside that immutable release until the existing build/embedding/review process creates a complete next release. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2 independent contact verification - 2026-09-21 (partial)

`contacts_candidate_list` reads owned email candidate IDs and current attribution. `contacts_verify_evaluate` requires exact approval before sending the selected candidate and saved public evidence to the configured DeepSeek verification specialist. It binds a shadow run to the durable Agent call ID; an existing uncertain attempt is not repeated. The shadow decision cannot change active contact/email state. A separate exact-approved `contacts_verify_publish` receives the observed decision hash, email, category, resulting status and prior decision ID, then rechecks source evidence, candidate state and ownership under one transaction before publishing the decision and review queue state. Migration 101 adds the call binding. Unit and isolated PostgreSQL checks passed, including real publication, owner exclusion, stale hash refusal and idempotency; a real specialist call remains pending. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2 standalone formal score publication - 2026-09-21 (partial)

`company_score` now stamps the current official scoring policy version and checksum onto its server-produced research artifact. `score_review` preserves that provenance. `company_score_publish` requires exact approval of the saved review call ID, owned company, domain, score, policy version and observed market revision. It rejects incomplete/ineligible review, changed policy, missing or stale cited evidence and a changed company revision. A successful transaction creates a versioned formal `lead_search_run`, persists the assessment and evidence snapshots, and updates company market state through the existing manual-override-preserving helper. Migration 102 prevents duplicate publication from the same source call. An isolated PostgreSQL fixture passed positive publication, idempotent replay, cross-account refusal and stale-revision refusal; the fixture was removed. Live specialist scoring and broad release remain open. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2 mailbox candidate review - 2026-09-21 (partial)

`mailbox_candidate_list` reads only pending candidates owned by the current account, including the private content and its hash. The page uses the same read service. `mailbox_candidate_review` accepts a candidate ID, observed content hash and approve/reject decision; central confirmation is required before this tool can publish private knowledge, and the row-locked review service rejects changed content. The existing page still makes its own direct review call. An unknown embedding result during approval remains recoverable under the existing service rules; no live embedding was invoked in this stage. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2 version-bound draft updates - 2026-09-21 (partial)

`draft_read` exposes an owned draft body and current revision; `draft_edit`, new `draft_approve` and the existing draft page now use the same row-locked update service. The page and tool submit the revision they read; a stale revision returns a conflict before writing, and the page carries the returned revision into its next save. Identical approval stays idempotent; editing approved text advances the revision and returns the draft to generated. Approval saves internal draft status only and never sends mail. Legacy internal callers retain the compatibility service, while the public PATCH endpoint requires a current revision. Full outreach tool coverage and P6 acceptance remain open. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P3 cost and usage observation read - 2026-09-21 (partial)

`task_usage_read` and `/api/tasks/usage` now call the same account-scoped service for the last 30 days. Operational metrics, HTTP attempts, workflow stages and model usage remain separate arrays; their amounts are not additive, and missing bills stay unknown. The tool makes existing diagnostics available for planning without modifying spend admission or sending any provider request. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2 knowledge library and history adapters - 2026-09-20 (partial)

`knowledge_library_list` browses private, shared or public evidence with bounded pages; document rows include a content hash for versioned actions. `knowledge_revision_list` reads account-owned prior content without changing RAG v3. `knowledge_upload_jobs` reports existing extraction jobs. `knowledge_private_delete` requires central exact approval of document ID and observed content hash, then calls the same owned private-document deletion service as the page. The existing page confirmation remains separate. Binary upload/processing, shared publication and other knowledge administration remain outstanding. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P3/P5 standalone mail task visibility - 2026-09-20 (partial)

The shared task feed and detail query include account-owned outbound mail with nullable company/workspace. Linked mail still shows its company; standalone mail gets a generic title and a null company in details. Both page and Agent task tools use these services. An unknown send result remains unknown and needs reconciliation; listing it cannot trigger SMTP or infer a company business state. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P2 saved company detail reads - 2026-09-20 (partial)

The saved assessment and company correspondence page routes now call the same owner-scoped services as `company_assessment_read` and `company_correspondence_list`. The former returns the latest persisted formal score and scoring policy snapshot; it never rescored. The latter returns linked message metadata and decrypted subject only, with a bounded cursor; message body still requires a separate owned `mail_read`. No discovery, model or mailbox sync prerequisite is introduced. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P5 memory lifecycle tools - 2026-09-20 (partial)

The account Agent can list its own active/inactive versioned memories and toggle active state using current version plus `updatedAt`. Account preferences can change without extra approval. Business policies and company decisions use a separate exact confirmation, and global policy changes require both live administrator role and exact confirmation. The ordinary account tool rejects policy IDs. Historical outreach memory lifecycle reuses the page service and its source-managed classification guard, with an update revision to prevent stale archive/restore/delete. The server supplies the legacy confirmation flag; `legacy_memory_delete` uses the central exact destructive approval before invoking that service. The legacy page remains compatible and may omit the new optional revision; convergence of its confirmation flow, unified writes and complete memory deletion/version policy remain outstanding. [Verification](MAIN_AGENT_ACCEPTANCE.md).

## P5 historical memory reading - 2026-09-20 (partial)

Each main-model decision and safe-boundary revision digest now includes current memory plus active shared distribution-policy records. Market aliases (GB/UK, NL/BE/LU/BENELUX), company and original channel-role scope remain visible. Historical shared policy is a default, never an inferred mandatory rule. `memory_history_search` reads active account-owned historical styles, claims and company decisions plus shared feedback guidance on demand, with literal text, structured scope and bounded pagination. Original store/ID, source references, usage restriction and update revision are retained; vectorless records work. No historical records are moved or reclassified. Unified historical writes, semantic history retrieval and full P5 acceptance remain outstanding. [Verification](MAIN_AGENT_ACCEPTANCE.md).

本文件是 2026-09-20 用户提供的 P0–P6 计划的实施跟踪。规则来源见 [MA01–MA09](CONFIRMED_PRODUCT_RULES.md)。确认、实现、本地验证和真实验收分别记录；未完成的阶段不得写成已发布。

后续 MA10 指令将主模型改为 OpenRouter `z-ai/glm-5.3:batch`，当前唯一批处理供应商 `fireworks`。已接入真正的异步 Batch API、持久批次 ID 和结果查询；每轮结果回来后才继续 LangGraph 规划。两项公开合成请求已真实完成，文本和工具参数均通过，批次创建至完成 680 秒；另一项公开合成主任务也完成了能力发现和最终答复两轮，供应商报告费用合计 US$0.00632807，耗时较长。迁移 097 后 worker 每轮先查询到期模型批次，再领取普通任务；轮询不创建新推理调用，取消后仍保留迟到费用/结果。带日期的实际型号接受同一模型的日期版本，其他变体不通过。P6 仍待验收。[路由诊断、费用和恢复证据](MAIN_AGENT_MODEL_ROUTE_2026-09-20.md)。

当前阶段已有 53 项可调用适配器的[自动生成目录](MAIN_AGENT_TOOL_CATALOG.md)。知识事实待审列表和单项决定复用现有管理员审核仓库；决定需管理员身份与精确内容批准，已有类型注册表和 stale-review 拒绝规则继续生效。P4/P5 基础包含 Skill 包导入、公开 SKILL.md 网址与公开 GitHub 目录导入、全局发布确认与任务版本绑定、带来源的偏好/政策及撤销、一次/间隔/每周定时任务和管理面板；完整阶段仍未验收。具体缺项和真实/模拟结果见[验收记录](MAIN_AGENT_ACCEPTANCE.md)。

公司业务状态工具现读取 `workspace_company_market.revision` 并转为安全整数，更新时在同一公司锁内核对 Agent 读取的版本，冲突则拒绝覆盖并要求重新读取。页面和工具共用字段校验与业务仓库；原页面尚未提交版本，页面之间的并发保护仍待迁移。目录现为 53 项，P2 验收仍未完成。

后续页面迁移：公司编辑页面现在也从工作区读取 `stateRevision`，逐次保存携带版本；HTTP 409 不自动重试旧修改，待现有保存队列结束后刷新状态并提示重新检查。服务返回下一版本供同页连续编辑使用。该实现覆盖这一页面与 Agent 的并发写入，不等于其他公司写路径或完整任务恢复验收。

独立业务阶段：主 Agent 可选择单公司已有公共证据、定向补证、只校正角色、按原标准评分及主动复核；各环节通过已保存工具结果的 `callId` 组合，不依赖旧工作流节点。模型自写的分数或校正对象不能作为服务执行回执。改动证据后丢弃旧角色/评分解释，保留历史研究版本；正式公司发布仍是待迁移能力，当前结果标记 `research-only`。角色校正可关闭内部补证；评分使用原 score-only 版本与算分、引用合同。单渠道搜索/Gemini 公网检索暂需精确查询范围确认，避免将新外部数据范围静默放行；完整连接级授权与数据流策略尚未完成。独立策略与直接草稿工具返回任务研究产物，不自动发送。

运行 Skill/记忆/调度前应用迁移 093–095。`assistant:worker` 先领取到期计划，再处理 Agent 任务；每次计划生成独立对话与任务，按 occurrence key 防止重复入队。运行中、等待确认、暂停或部分完成的前次任务阻止周期重叠。下一次时间以实际恢复时刻计算，跳过漏掉的周期；夏令时不存在的时间跳过、重复的时间仅取首次。停用计划不取消已执行的工作。恢复顺序：数据库迁移、LangGraph 服务、主任务 worker、Web；回退主入口配置不删新任务和费用记录。

精确邮件批次：第 49 项工具 `mail_batch_send` 通过稳定的 batchId/itemId 记录批次与单封身份。每封邮件仍经 mail_send 执行层，批准绑定最终收件人、正文和附件哈希；批次中存在待确认项时不启动发送。相同内容的单封邮件共享已批准动作的唯一执行回执，批次改动/移除一封只撤销该封尚未消费的批准。合成组合的父记录可重新进入，但每个外发叶子动作先持久化并单次消费批准。用户在等待确认时追加要求会重新排队，在安全边界关闭旧待执行调用并交回主模型规划。已有发送与费用保留。旧邮件页面向中心批准记录迁移仍待完成。

可选沙箱镜像通过 `docker build -f Dockerfile.agent-sandbox -t codex-agent-sandbox:1 <空目录>` 构建，然后配置 `AGENT_SANDBOX_IMAGE=codex-agent-sandbox:1`。基础 Node 镜像已固定摘要，正式镜像现已在本机从空上下文构建成功。仅挂载临时任务输入目录；网络关闭，无宿主凭据、仓库或 Docker Socket 挂载。执行入口明确覆盖镜像自带 ENTRYPOINT，临时目录在写入或运行失败时都会清理。正式镜像上的真实 Python 和 Node 脚本已验证非 root、只读输入、禁网、无仓库与 Socket 挂载。公开 Skill 来源导入只发送用户给定的 URL 或 GitHub 仓库路径：HTTPS DNS 先检查并固定到 TLS 连接，禁止私有地址、凭据、端口与重定向绕过；GitHub 文件按提交 SHA 和 Git blob 哈希验证后入库。镜像还没有 Playwright；MCP/API、联网浏览器代理与接管、非 GitHub 仓库和需凭据的私有来源、历史记忆统一也未完成。

验证命令：`node scripts/run-tsx.cjs scripts/generate-main-agent-catalog.ts --check`、`node scripts/run-tsx.cjs scripts/verify-main-agent-db.ts`、本机启动后 `node scripts/run-tsx.cjs scripts/verify-main-agent-ui.ts`。数据库和浏览器测试创建并清理隔离的合成账户，不调用付费模型或发送邮件。运行时私有正文继续隔离；MA13 起不再同步维护开发效率台账。

## 目标与边界

主 Agent 理解开放式任务，自主选择和组合产品能力。意图标签仅用于统计。LangGraph 是唯一业务编排运行时；Next.js 负责鉴权、入队、事件和控制。现有完整工作流作为兼容组合工具保留。RAG v3 数据、Gold/holdout 和正式评分标准不重建、不重定义。

```mermaid
flowchart TD
  U[用户任务 / 附件 / 追加要求] --> API[鉴权与账户任务入队]
  API --> DB[(PostgreSQL 任务 / 事件 / 工具记录)]
  DB --> W[租约工作进程]
  W --> G[持久 LangGraph Thread]
  G --> M[管理员指定主模型]
  M --> C[按需能力目录 / 产品理解 / 政策]
  C --> H[账户权限 / 精确批准 / 费用记录]
  H --> T[业务服务 / 专业 Agent / 外部能力]
  T --> DB
  T --> M
  DB --> UI[可续读事件 / 产物 / 确认 / 控制]
```

## 分阶段状态

| 阶段 | 工作 | 实现状态 | 验收状态 |
|---|---|---|---|
| P0 | 规则、能力盘点、基线 | 已记录 9 组规则、53 个 API、旧门禁与依赖 | 基线测试 1191 通过、2 项旧费率日期失败 |
| P1 | 主模型工具循环、产品包、通用任务、读取能力 | 初始实现：9 个读取工具、任务/事件/租约/检查点、控制 UI | 8 项单元与 15 项真实数据库检查通过；真实模型与进程重启闭环待验 |
| P2 | 独立业务工具、解除不必要前置依赖 | 已接入部分写工具、独立市场计划/草稿修改；全产品覆盖未完成 | 局部测试通过，阶段未验收 |
| P3 | 集中确认、费用提示、私有上下文、独立/批次邮件 | 单项精确批准、共享费用观察配置、无公司邮件/附件已接入；批次及旧页面批准存储待接入 | 24 项数据库边界检查通过；真实主模型 HTTP 403，阶段未验收 |
| P4 | Skill、连接、隔离脚本与浏览器 | 局部实现：公开 HTTPS/GitHub 来源、作用域与版本、Node/Python 沙箱；浏览器/MCP/连接仍缺 | 公开来源与 Docker 实测通过，阶段未验收 |
| P5 | 统一记忆、后台与定时任务、完整 UI | 待实施 | 未验收 |
| P6 | 80 开发 + 40 锁定任务、真实闭环、灰度发布 | 待实施 | 未执行；完成率未知 |

## 执行与恢复合同

记忆新版本在来源快照中保存真实前驱版本及启用状态。撤销后重新修改形成分支时，撤销新修改回到修改前状态，不能按版本号复活已经撤销的中间内容。旧版本没有前驱元数据的仍沿用历史顺序回退，不推断丢失的历史状态。版本和来源不删除，旧通知不能撤销后续版本或重复撤销已停用项。

迁移 096 将原邮件页面的最终确认接入中心批准记录与后台队列：持久化精确内容和人工批准后再允许 worker 领取。邮件由确定性 LangGraph 流程执行，不需要调用主模型；页面读取真实任务状态，未知回执仍需核对。进程恢复先进入安全边界，每个叶子动作在数据库锁内核对新指令。批次中途追加要求会停止剩余发送；已完成邮件复用原回执。此项取代上文“旧邮件页面批准存储待接入”的历史状态，实际 SMTP 验收仍待完成。

工具合同包含标识/版本、输入输出 Schema、角色与连接、数据依赖、副作用、幂等恢复、费用已知/估计/未知。身份由服务端注入。结果区分成功、部分完成、缺少输入、等待确认、暂不可用、执行结果未知；提供方故障不等于业务不合格。

每次工具执行先持久化参数和动作身份，再执行并保存结果。已完成动作恢复时复用；外部副作用回执未知必须核对，不能自动重发。主模型同一路由最多一次自动重试，不静默切换私有数据接收方。无新状态的重复调用触发停滞保护。暂停/取消在安全边界生效，已发生费用与已发送邮件保留。

邮件确认绑定最终收件人、正文、附件及版本；精确批次逐项绑定，某封修改仅使该项失效。批准由已登录用户产生，模型不能提交批准令牌。定时任务授权不替代每次最终发信确认。

## 配置与数据

MA10 当前默认主模型 OpenRouter `z-ai/glm-5.3:batch`／`fireworks`；管理员可配置。新任务固定创建时的配置，历史任务保留旧路由。私有任务资料允许进入指定路由，凭据不能进入提示。同步路由带禁止供应商数据收集的配置；Batch API 继承 OpenRouter 账户数据政策，账户应保持禁止供应商数据收集。无配置的等效路由不备用。网页、Skill 和第三方返回值视为资料，不得改变权限或批准记录。

MA05 的观察模式也允许没有旧预算记录的新账户记入已验证费用观察；付费调用记录仍须先存在，租户和来源校验保持生效。旧预算不再是主 Agent 调用或后续对账的隐含前置条件。

管理员发布 Skill 后全账户可用，成员仅本人；运行任务固定版本。脚本与浏览器在 Docker Linux 隔离环境执行，缺依赖则返回不可用，不直接在宿主执行。全局强制政策独立存储，优先于个人默认方法。

通用任务状态：queued / running / waiting_user / paused / partial / completed / failed / cancelled。定时任务保存时区（账户无配置时 Asia/Shanghai）、范围和下一次时间，默认不重叠、不补跑所有遗漏周期。

## 验收与效率

能力盘点见 [能力迁移清单](MAIN_AGENT_CAPABILITIES.md)。所有工作流阶段记录输入、有效输出、实际下游使用、tokens/API credits、已知/未知费用、延迟、重试、丢弃原因、利用率和优化机会。私有载荷与可提交的聚合遥测隔离。真实完成率、误追问率、费用和供应商延迟不能从模拟测试推断。

发布门槛：40 条锁定验收至少 95% 端到端完成；权限/边界全部通过；跨账户泄漏、未经批准外发、伪造回执、重复发送均为零。全部盘点能力可调用，原评分与证据合同通过。先管理员、后工作账户灰度；未达门槛保持兼容入口。

## 部署与回退

新增表采用增量迁移和强制 RLS。旧运行任务保留旧执行版本。发布切换通过运行配置完成，回退不删除任务、费用、记忆和执行记录。具体启动与验证命令随对应阶段补充。

P1：应用迁移 090；启动原 `npm run langgraph:dev` 和新增 `npm run assistant:worker`；通过部署环境设置 `MAIN_AGENT_ROLLOUT=admin` 先开放管理员（`all` 为全账户，空值回退）。主模型/接收方通过 `MAIN_AGENT_MODEL` / `MAIN_AGENT_PROVIDERS` 配置，新任务固定该配置。运行 `node scripts/run-tsx.cjs scripts/verify-main-agent-db.ts` 验证数据库。该验证仅清理自己创建的合成账户，不调用供应商。真实发信/脚本/浏览器工具尚未开放。

P2/P3 基础：继续应用 091/092；配置 `PRODUCT_FINANCIAL_POLICY=observe` 在页面和工具共用费用层启用 MA05。主 Agent 的发信工具进入精确批准，脚本/浏览器未开放。`verify-main-agent-live.ts --live` 是显式真实调用检查，保留费用/调用记录；当前路由 HTTP 403，不能切换为默认入口或宣称 P6 达标。


## MA16 unified product entry (2026-09-21)

The authenticated message API always validates and enqueues a durable main-Agent run, regardless of account role or rollout environment variable. The knowledge-base question form submits the same run with its selected industry/company/product collections and opens the owned conversation; the search tool uses the saved scope. The former direct knowledge query API now queues the main Agent and returns a task receipt and the synchronous Kimi intent branch is unreachable from product chat. Historical conversations remain readable and can receive new main-Agent runs. The assistant worker and standalone LangGraph service must both run for queued work to advance. This implementation follows [MA16](CONFIRMED_PRODUCT_RULES.md); tests and production smoke results are recorded separately.

MA16 implementation and isolated validation: [acceptance evidence](MA16_MAIN_AGENT_ENTRY_ACCEPTANCE_2026-09-21.md). Real model-answer quality remains separate.

## MA17 interactive GLM route (2026-09-22)

New main-Agent runs pin the synchronous OpenRouter `z-ai/glm-5.3` / `fireworks` configuration. Previously submitted `z-ai/glm-5.3:batch` runs retain their saved configuration, remote receipts and recovery behavior. The chat-completions transport remains inside the product spend and journal boundaries; the local MA05 observation policy is still a separate deployment setting. The user is considering inline tool schemas versus a small routing model; neither tool-selection strategy is confirmed or implemented in MA17. See [acceptance evidence](MA17_GLM_SYNC_ACCEPTANCE_2026-09-22.md).
# MA24 记忆观察流程补充（已确认，部分实现）

任务完成、用户纠正或可靠工具收据产生后，候选记忆必须附来源收据与账户范围；业务生效时间未知时保持空值。当前 `observeMemory` 在 PostgreSQL 事务中写不可覆写观察、幂等键、图谱 outbox 和用户通知，同主题冲突单独记录；`undoMemory` 追加失效观察。自动自由文本抽取尚未接入任务执行；Graphiti 投影未就绪时直接查询 PostgreSQL 记忆，不能自动转用云模型。正式事实、评分和外发内容继续走原确认/核验流程。

知识库记忆分区通过会话鉴权的只读查询展示观察时间轴、当前有效项、冲突和通知；撤销仅追加失效观察。此查询不自动扩大主 Agent 的事实发布权限。

`preference_save` 保存既有自动偏好版本时，在同一事务中写入新观察和 outbox；来源收据绑定 run、用户消息、旧记忆版本及调用 ID。版本更新建立更正关系；撤销时同时恢复或停用旧版 Agent 偏好，并追加观察历史。多市场/公司范围按原工具输入保留，未知的业务生效时间仍为空。

主 Agent `finishRun` 仅在实际结算状态为 `completed` 时，同事务写入本地记忆抽取队列；邮件运行与其他终态不入队。队列 worker 尚未启用，模型不可用时保持排队，不调用外部模型。

独立本地 worker 按任务收据读取账户内用户消息，先检查回环 Ollama 与固定摘要的 `qwen3:8b`，再以结构化 Schema 提取最多三条明确偏好。原文引文不匹配或 Schema 不符时不写记忆并延后重试；不符合明确偏好条件或包含指令覆盖的候选直接丢弃。租约与幂等键保障重启。本机 Ollama 真实模型的五类合成样本契约已通过，2 条真实任务消息只读测试均为空结果；`ENABLE_LOCAL_MEMORY_EXTRACTION=0` 仍是默认配置，真实偏好召回与安全验收完成前不运行消费循环。本地服务可用 `docker compose -f docker-compose.ollama.yml up -d ollama` 启动，模型需另行在容器内拉取并核对摘要；模型文件保存在本机 Docker volume，不入 Git。

Graphiti 0.30.2 的隔离依赖与本地 `nomic-embed-text` 已安装。`scripts/verify-graphiti-local.py` 只读预检先关闭 Graphiti 默认遥测，再核对本地模型和 Neo4j；`--direct` 使用本地嵌入向量验证结构化节点/关系写入、账户分组回读和清理，已通过。`--episode` 仅处理合成自由文本，当前抽取质量和时延未过门槛。生产 outbox 不消费，图谱查询不参与回答；PostgreSQL 保持权威来源。

迁移 113 为图谱 outbox 增加租约、到期重试和只返回账户/观察 ID 的 worker 收据。`run-memory-graph-worker.ts` 只有显式设置 `ENABLE_MEMORY_GRAPH_PROJECTION=1` 才消费；按账户 RLS 读取 PostgreSQL 原观察，经本地子进程调用 Graphiti 节点/关系保存接口，观察 ID 决定图 UUID，重放不重复建边。子进程只接收单条观察，关闭遥测，使用回环 Neo4j 与固定摘要的本地嵌入模型。投影成功后带租约令牌标记送达；失败只延期重试，不影响 PostgreSQL 任务。当前开关为 0，尚不从图谱给任务提供候选；日后图谱候选必须按账户、时间、权限回 PostgreSQL 核验。

内部 `searchMemoryWithGraph` 现在可从本机图谱取得最多 24 个账户分组内的观察 ID，但返回内容始终重新查询 PostgreSQL，校验账户、业务有效时间、系统已知时间、市场/公司范围、失效关系和原文命中。业务起始时间缺失的结果明确标为 `unknown`，不能表述为当前有效事实。Neo4j 不可用或候选已失效时改由 PostgreSQL 原文搜索。该接口尚未进入主 Agent 任务路径，不能把合成回退测试当作真实记忆质量验收。

本机独立 Neo4j 容器短暂停机时，`verify-memory-graph-fallback-local.ts` 已确认内部检索改走 PostgreSQL；容器恢复后 Graphiti 连接预检通过。此验证不覆盖 worker 投影中断后的真实 outbox 重放，也不表示主 Agent 已使用图谱。
2026-09-24 / MA24 文本资料工作流：`upsertKnowledgeDocument` 保存精确修订及旧 chunk 后，在相同事务中建立 `inline-text-v1` 树并切换指针；失败则事务回滚。`backfill-vectorless-text.ts` 只处理本机已有的、活动且有精确未重构修订的无附件文本；重复运行不重建。检索仍是影子路径，主 Agent 继续使用 v3，直到人工 Gold 和对照达标。
2026-09-24 / MA24 存量共享资料：`backfill-v3-document-trees.ts` 只读取本机活动 v3 release 的已登记共享附件与 Docling 抽取产物，逐份在事务内建树并切换该文档指针；失败不改变旧版本。检索回读重新校验树所关联附件属于同文档、已登记且 SHA-256 一致。281 份完成，重复 dry-run 无待办；主 Agent 仍使用 v3。
2026-09-24 / MA24 候选收窄：内部 `searchDocuments` 先从问题中提取最多 8 个完整型号令牌，以文档实体、活动 v3 块实体、标题和原文全文命中确定候选，并按来源理由排序。所有结果仍受账户权限、当前树版本及已登记来源检查约束。主 Agent 尚未调用该只读路径，v3 生产主路不变。
2026-09-24 / MA24 v3 备用候选：影子会话在主路搜索后可一次性查询活动 v3 的现有词法/事实通道；仅取文档 ID，重新校验当前树、注册来源及账号权限后补入最多 24 份候选，并保留 `v3-candidate` 步骤收据。旧 chunk 内容不进入答案证据；任何正式引用仍经当前原文 `readEvidence` 回读。开发/验证集主路遗漏的 16 道路由题恢复 0 道，生产主路没有切换。
2026-09-24 / MA24 历史个人记忆：本机 16 条活动邮件风格内部学习记忆按原 ID 幂等回填为私有观察，来源收据保留原状态/范围/时间，未知业务生效时间保持未知，原表继续服务旧流程。真实 outbox 经 Windows UTF-8 修复后，一条观察在本机 Graphiti 投影并由 PostgreSQL 复核；临时本机 worker 将 16/16 条投影且待处理 0。默认图谱开关仍关闭，未放宽外发或正式评分权限。
2026-09-24 / MA24 Gold 审核：用户在 `/knowledge` 的复核中心逐题审核。回答型题目须提供活动共享原件哈希、页/幻灯片/工作表与原文短引，可加块 ID/表格行；无答案且无来源时用备注记录查证范围。旧 11 条仍保留已保存状态，但精确来源为 0；开发与验证共 250 题精确审核完成前不解锁 holdout，也不切换检索主路。
2026-09-24 / MA24 来源录入：Gold 编辑器按原件 SHA-256 与页/幻灯片/工作表读取当前可检索版本的原文块。选择原文块可填入块 ID 和短引；保存时再次核对活动共享原件、当前树版本、单个原文块中的短引。人工仍负责判断短引是否支持标准答案。
2026-09-24 / MA24 Skill 权限补充：既有 `agent_skill_version` 与任务固定版本继续保留；导入含脚本或依赖的版本时停用 Skill，Agent 的 `skill_manage` 对这类版本拒绝启用或恢复，记忆中心对这些停用版本显示“待审核”且不提供启用按钮。账户 API 的版本操作使用会话鉴权，脚本逐项审核流程尚未交付。记忆中心 Skill 分区通过账户 RLS 分页读取，不把个人记忆混入资料列表。
2026-09-24 / MA24 资料树读者：`/api/knowledge/tree` 仅在账户会话下分页返回当前树节点；按 nodeId 回读时还要求返回证据所属文档等于请求文档，跨文档请求返回 404。资料列表的可检索状态与读路径共用活动状态、当前版本、来源哈希及注册检查。界面只在用户点选原文块后加载正文，旧检索片段保留在折叠区。
2026-09-24 / MA24 真实上传探针：`knowledge:verify-tree-real-uploads-local` 在本地用 PDF/PPTX/XLSX 各一份创建临时私有上传作业，运行现有解析器并逐份注册，核对可检索状态、坐标、幂等、跨账户拒绝和撤销禁引；结束后清理临时副本和记录。PDF 样本还以有效/过期租约分别调用实际 worker，验证未过期不领取、过期后重领并完成；未实际杀死进程。
2026-09-24 / MA24 worker 恢复：迁移 115 为上传作业添加租约令牌与期限；领取运行中但过期的作业时在事务内换令牌。解析产物路径含本次令牌；结果写回须匹配令牌且租约有效。解析失败仅更新仍由本次尝试持有的运行作业，旧进程不能覆盖新结果。
2026-09-24 / MA24 图谱 outbox 探针：`memory:verify-graph-clone-outbox-local` 在隔离数据库运行真实 outbox 消费函数及本机 Graphiti 投影，检查只返回观察 ID 的图候选、账户隔离、PostgreSQL 重新校验和重放；按精确观察 ID 清理合成图节点及克隆库记录。`memory:verify-graph-real-outbox-local` 仅在权威库存在合格待办时消费一条；本次无合格待办。主 Agent 仍使用 OpenRouter，私有证据原文不得因新工具直接转入其上下文；新检索保持影子路径。
2026-09-24 / MA24 PageIndex 隔离试验：`.venv-pageindex-local` 与生产解析环境隔离；`knowledge:verify-pageindex-isolated-local` 生成合成 PDF、限制运行期 socket 仅回环、以本机 Ollama 的 `qwen3:8b` 进行 SDK 索引，再与无需模型的 Flash 结构比较。两条路径各返回 2 个页节点；所有临时内容与索引自动清理。PageIndex 摘要只供结构导航参考，不替代 `readEvidence` 的原文和坐标，也不处理 PDF 以外本阶段格式。
2026-09-24 / MA24 Skill 启用门槛：`skill_import` 及用户导入都先保存停用版本；新版本替换当前版本时也先停用。`skill_manage` 由 Agent 调用启用或回滚时，先核对账户范围、无脚本/依赖和 `validation.autoEnable=passed`；未通过回放与影子验收则拒绝。账户页面的手动启用保留用户显式操作，导入提示改为草案，记忆中心区分待验证与待审核。
