> MA15 变更：采用已确认的半透明紫色视觉、三个业务入口及资料默认页；四阶段已实现，模式/资料隔离、六组布局/路由、真实批准与模拟断线恢复、构建及静态资源通过；验收边界见 MA15_UI_ACCEPTANCE_2026-09-21.md。精确规则与状态见 [规则](CONFIRMED_PRODUCT_RULES.md) 和 [工作流](FRONTEND_SIMPLIFICATION_PLAN_2026-09-21.md)。

# 产品主 Agent 与开放式工具架构

## MA24-14 后续验收流程

资料工具返回过滤 → 服务器工具消息在模型前重新核验 → 模型后复核 → 后续动作前复核 → 最终保存/已完成 checkpoint 恢复再复核。任何已使用来源撤销、换版、文本/坐标漂移或事实变为待审，停止本轮并提示重新查询；不把旧答案继续显示为当前结论。

先补实际主 Agent 的来源复核和影子入口，再完成开发/本地恢复验收；独立配置/问题/Gold 冻结后生成两路答案，由 Codex 引导逐题核对，人工判决绑定答案哈希追加保存。质量门槛通过后才小范围启用；新付费调用须另有具体授权。见 [计划](MA24_REMAINING_PLAN_2026-10-10.md)。

## MODESEL-17 模式选择交互

用户在输入框下方直接选择快速问答/标准工作/深入研究，说明同步显示；切换保留输入，只影响随后创建的新任务。默认标准，已有任务沿用保存配置；提交中禁用控件。服务端模型与权限规则保持 MODESEL-01～16。桌面单行工具栏、手机模式独立一行，方向键/空格可操作，Enter 不在选择器上发送任务。

## MA24-13 新任务资料处理

2026-10-10 部署完成：产品、LangGraph 和三个 worker 已加载上述修复，隔离浏览器验证新任务模式/Prompt 固定。用户正常使用现有资料入口；缺目标先澄清，比较分对象取证，缺失与冲突显示。独立开发验收不产生模型判分，正式切换仍等待新的独立冻结质量门槛。

开发验收：只读原件/比较工具 → 明确结果类型 → 完整原文/坐标/来源哈希核对 → 独占写入 development 收据；语义判决保持 pending。正式引用使用自身块 ID 与坐标，不把邻块内容混入该 ID；历史冻结结果独立保留。

比较请求 → 明确两个型号和所需字段 → `knowledge_compare` 按对象/字段独立本地检索 → 当前来源回校 → 分别返回 verifiedFacts、原文导航证据、缺项和冲突 → Agent 解释有依据的比较并列出未解决项。每对象最多 4 块，缺项不代表 false，不从一方推导另一方规格。工具不改变发布权限。

新任务固定 Prompt v1.1.0；未授权跨账号私有请求明确拒绝，目标/版本不清先澄清。原件工具空目标不查询，ID 不可访问返回 deny，标题无匹配返回 insufficient-evidence，多候选等待选择。服务端固定账号与资料集合范围，旧任务 Prompt 不替换。后续比较及验证状态见 [记录](MA24_FOLLOWUP_IMPLEMENTATION_2026-10-10.md)。

## 2026-10-10：产品 RAG 返回来源复核

检索（含缓存）→ 当前 ACL/来源复核 → 公开内容脱敏并保留系统引用标识 → 生成 → 对全部输入来源再次复核 → 返回完整引用块。生成期间来源失效则不展示生成内容和来源元数据，返回权限/版本变化提示及共享途径。跨文档影子会话和旧意图开关未改变；代码本地验证及尚未完成项见 [记录](MA24_EVIDENCE_RETURN_FIX_2026-10-10.md)。

## 2026-10-10：冻结答案复核闭环

用户逐题确认 → 管理员审核服务绑定候选哈希保存 → 100 条判决齐备 → 只读正式判分及快照检查完成。总计非退步通过，跨文档比较与权限拒绝门槛仍失败；保持生产路径和回滚指针。后续修复使用开发/验证集及独立夹具，不依据锁定题调参，不回写冻结答案。详见 [最终审核与发布边界](MA24_HOLDOUT_FINAL_REVIEW_2026-10-10.md)。

## 2026-10-10 当前模式入口

业务工具补充验证：真实数据库中快速模式的邮件账号隔离、写入/同步拒绝，标准草稿修改及旧版本拒绝，深入模式研究收据/发信批准门槛，和模型备用的收据复用共 12 组通过。使用脚本化决策，不等同于真实模型业务质量验收；不新增付费调用授权。

部署补充：已在本地 3018/2024 加载模式版本，真实页面到数据库的三模式配置固定验证通过；正常 worker 已启动。MODESEL-14 八模型两轮合成协议验证 16/16 通过；该一次性授权已消耗，不能据此自动增加模型探针。没有执行真实邮箱或公司工具，供应商真实故障与完整业务效果仍待验证。

新对话任务默认标准工作，允许手动选择快速问答/深入研究；API 只接收模式枚举，服务端固定路由/Prompt/阈值。知识页使用快速模式及所选集合范围。恢复读取任务内配置，旧任务保持旧路线。模型完整流结束后才允许工具执行；明确故障或超时先保存收据再顺序备用，未知收据阻止重放。执行详情展示模型尝试及安全失败码。

MODESEL-13：标准模式目前不新增搜索次数或问题数量限制；公司调查、批量发现和评分仍在深入研究，既有 Schema/权限/批准仍生效。运行代码、本地测试与尚未完成的真实验收见 [运行接入记录](AGENT_MODE_RUNTIME_2026-10-10.md)。以下较早状态保留为阶段历史。

## MODESEL-01：用户选择运行模式（设计中）

MODESEL-12：三模式 Prompt v1 已确认，静态 `modePromptRules` 模块可按 quick/standard/deep 装配，省略模式默认 standard，非法模式值拒绝；正文来自批准文档并支持漂移检查。运行主 Agent 仍未调用此模块，后续须配套服务端工具范围和上下文装配，不能仅替换提示词就声称模式上线。

MODESEL-11 已确认初始单请求首有效输出/总时限：快速 15/60 秒、标准 30/120 秒、深入 60/300 秒，后续可调整。有效输出包括思考/正文/工具片段，心跳不计；超时终止本地等待并核对收据后再备用，迟到结果不得驱动工具。总时限从请求开始计时，不代表业务任务总时限。此决定补齐下述历史待定项，运行实现仍待完成。

MODESEL-10 已确认明确 429、可重试 5xx 或连接失败时顺序尝试备用 1/2；同一轮模型决策每模型最多一次，三路失败保存任务，已执行工具不重放。排队/超时阈值仍待定。该规则尚未实现；当前生产 429 停止行为保持原状。

MODESEL-09：八个候选的单步工具调用格式通过现有解析器；实际工具、多轮循环与自动备用切换待验证。当前运行代码仍在 429 时保存任务并停止，不自动使用新候选模型。

MODESEL-08：候选主备八个不同模型已完成一次性合成连通性测试，均成功；未接入生产模式路由。工具调用、任务恢复和自动备用切换仍待验证；GLM 成功路径为 Relace。见 PRD 验收及连通性收据。

MODESEL-07：深入研究第二备用确定为 OpenRouter `z-ai/glm-5.3`，替换 DeepSeek V4 Pro 0813 候选；其他槽位仍待确认，具体上游与运行接入尚未实施。不修改既有专用 DeepSeek 流程。

MODESEL-06 明确网关范围为全部云端模型；BGE、Qwen 等本地模型继续本地执行，保留私有处理边界，不因本地故障自动转云端。此决定关闭下述 MODESEL-05 的本地范围待定项；云端迁移尚未实施。

MODESEL-05 已确认允许新供应商，全部模型统一 OpenRouter 网关。新模式主选/两备均通过该网关；现有专用模型直连列入迁移盘点。本地专用模型与私有处理边界须明确范围，尚未迁移。模型故障切换与 OpenRouter 上游路由分开配置；不以网关故障触发供应商直连。

MODESEL-04 已确认默认“标准工作”，用户可手动切换“快速问答／深入研究”；能力不足时提示切换，不自动升级。默认值和切换功能尚未实现；进行中任务切换与选择记忆策略待定。

MODESEL-03 已确认：标准模式按需用少量公开网页搜索补充单个事实；批量爬取、公司调查和评分转深入模式。具体搜索预算待确定，不能用循环搜索绕过边界；运行实现待后续阶段。

MODESEL-02 已确认快速模式允许已保存邮件、客户记录与沟通时间线只读查询，不同步、不写入、不发起新调查。结果应保留来源、数据时间与未读范围；实现和运行验收待后续阶段。

用户使用默认标准工作或手动选择模式 → 固定任务配置版本 → 使用该模式的模型、prompt 和服务端工具允许集 → 按待确认规则依次尝试两个备用路由 → 沿用工具收据恢复。模式名称与默认值已确认，其余具体执行配置仍为建议；现有运行链未改。完整工具目录更新至 104 项，输入/输出定义和逐工具分配见 [讨论稿](AGENT_MODE_DESIGN_2026-10-09.md)。

> 本机运行恢复说明（2026-10-08）：运行时进程的受限网络权限曾导致 GLM 直连 `EACCES`。正常权限重启后，用户确认恢复原任务，真实主模型与工具调用成功。邮件同步另受 fake-IP DNS 和 IMAP TLS 重置影响；已增加显式 HTTPS DNS 配置并保留公网/TLS 校验，但真实简报尚未完成。详见 [恢复证据](LOCAL_RUNTIME_RECOVERY_2026-10-08.md)。

## MA24-13 冻结集辅助审核

Codex 逐题读取已冻结的候选回答、Gold 和当前可访问原文，分别给出答案正确性与精确引用正确性的建议、理由和原文核对点。用户在对话中确认或纠正后，才将最终判决绑定该候选哈希保存；同题两路回答一致时可一并展示，但保留两条路径的独立记录。模型建议与最终人工判决分别记录，候选与冻结配置保持原始评测内容。见 [确认规则](CONFIRMED_PRODUCT_RULES.md)。

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
2026-09-29 / MA24 对话辅助审核：助手逐题读取活动原件证据，提出候选标准答案与精确来源，用户逐题确认、修改或暂缓。仅已明确确认的候选可保存为人工 Gold，保留题目哈希和审核修订；确认前不得计入质量验收。按 development、validation、冻结配置后 holdout 的原顺序进行。
2026-09-29 / MA24 PoE 审核口径（MA24-09）：用户明确要求“未声明是否支持POE就是不支持”。本轮 Gold 的 PoE 能力题在完整核对匹配型号/版本原件后，未声明 PoE 支持就判为不支持；不能把检索遗漏或未读完整资料当作未声明。用户对第 23 题的明确修改已保存为 GS108 不支持 PoE 的 r1，真实供电/协议短引与审核备注保留，不伪造原件否定句。生产自动判定与整体质量对照仍待实现/验收。
2026-09-24 / MA24 Skill 权限补充：既有 `agent_skill_version` 与任务固定版本继续保留；导入含脚本或依赖的版本时停用 Skill，Agent 的 `skill_manage` 对这类版本拒绝启用或恢复，记忆中心对这些停用版本显示“待审核”且不提供启用按钮。账户 API 的版本操作使用会话鉴权，脚本逐项审核流程尚未交付。记忆中心 Skill 分区通过账户 RLS 分页读取，不把个人记忆混入资料列表。
2026-09-24 / MA24 资料树读者：`/api/knowledge/tree` 仅在账户会话下分页返回当前树节点；按 nodeId 回读时还要求返回证据所属文档等于请求文档，跨文档请求返回 404。资料列表的可检索状态与读路径共用活动状态、当前版本、来源哈希及注册检查。界面只在用户点选原文块后加载正文，旧检索片段保留在折叠区。
2026-09-24 / MA24 真实上传探针：`knowledge:verify-tree-real-uploads-local` 在本地用 PDF/PPTX/XLSX 各一份创建临时私有上传作业，运行现有解析器并逐份注册，核对可检索状态、坐标、幂等、跨账户拒绝和撤销禁引；结束后清理临时副本和记录。PDF 样本还以有效/过期租约分别调用实际 worker，验证未过期不领取、过期后重领并完成；未实际杀死进程。
2026-09-24 / MA24 worker 恢复：迁移 115 为上传作业添加租约令牌与期限；领取运行中但过期的作业时在事务内换令牌。解析产物路径含本次令牌；结果写回须匹配令牌且租约有效。解析失败仅更新仍由本次尝试持有的运行作业，旧进程不能覆盖新结果。
2026-09-24 / MA24 图谱 outbox 探针：`memory:verify-graph-clone-outbox-local` 在隔离数据库运行真实 outbox 消费函数及本机 Graphiti 投影，检查只返回观察 ID 的图候选、账户隔离、PostgreSQL 重新校验和重放；按精确观察 ID 清理合成图节点及克隆库记录。`memory:verify-graph-real-outbox-local` 仅在权威库存在合格待办时消费一条；本次无合格待办。主 Agent 仍使用 OpenRouter，私有证据原文不得因新工具直接转入其上下文；新检索保持影子路径。
2026-09-24 / MA24 PageIndex 隔离试验：`.venv-pageindex-local` 与生产解析环境隔离；`knowledge:verify-pageindex-isolated-local` 生成合成 PDF、限制运行期 socket 仅回环、以本机 Ollama 的 `qwen3:8b` 进行 SDK 索引，再与无需模型的 Flash 结构比较。两条路径各返回 2 个页节点；所有临时内容与索引自动清理。PageIndex 摘要只供结构导航参考，不替代 `readEvidence` 的原文和坐标，也不处理 PDF 以外本阶段格式。
2026-09-24 / MA24 Skill 启用门槛：`skill_import` 及用户导入都先保存停用版本；新版本替换当前版本时也先停用。`skill_manage` 由 Agent 调用启用或回滚时，先核对账户范围、无脚本/依赖和 `validation.autoEnable=passed`；未通过回放与影子验收则拒绝。账户页面的手动启用保留用户显式操作，导入提示改为草案，记忆中心区分待验证与待审核。

2026-09-29 / MA24-10 同类 Gold 授权：用户要求已审核同类直接采纳助手的 Gold，只将不同类交用户审核。助手仍逐条读取匹配原件、保存题目哈希与精确来源；审核备注明确记录“按类型授权自动采纳”和代表题，不写成用户逐题确认。新类型确认后应用于同类表达，已保存决定不覆盖；development/validation 完成与配置冻结前不打开 holdout。[执行证据](MA24_GOLD_PATTERN_REVIEW_2026-09-29.md)。

本次已执行到 147/300：五类资料题新写入 80 条，型号套装、2.5G/5G、SFP兼容性及否定理解分别确认代表题并保存各 4 条。对原件缺失参数、可选配置、区域版本与矛盾数值保留限制；每条经既有保存校验并回读，重放不增加修订。后续沿相同流程继续，来源完整度审计不替代答案与引用质量对照。

2026-09-29 / MA24-10 第三阶段：86 条同类资料题及四种新边界类型的 16 条题已保存并回读，重放新增 0。当前 development 189/190、validation 60/60、holdout 0/50，共 249/300（52 条明确确认、197 条类型授权自动采纳）。全部已保存 Gold 的 494 条坐标匹配当前活动原文，前 43 条决定与阶段快照一致；开放式型号差异题待审核，holdout 未解锁。来源一致不替代回答质量对照。[证据](MA24_GOLD_PATTERN_REVIEW_2026-09-29.md)。

2026-09-30 / MA24-11：用户明确确认冻结既有 v3 检索配置 key `rag-v3-rrf-v1.0.0` 及 SHA-256 `37d58b9f3c768f48d45679b6a172246b1a0d7ebe7e25c6043cba6cfad7c31752`，仅解锁 Gold holdout，不切生产主路。保存前重检 250 条开发/验证题及全部活动原文短引，门禁记录回读一致。锁定集 50 题仅在冻结后按 MA24-10 已确认同类生成并保存，逐题备注为类型授权自动采纳。现 190/190、60/60、50/50；604 条活动原文坐标复核通过。下一步仍须 v3 与无向量主路在同一锁定集比答案正确数和精确引用正确数，补 PPTX/XLSX 与新文件样本；未通过质量/安全门槛不得切换。[记录](MA24_GOLD_LOCKED_REVIEW_2026-09-30.md)。

2026-09-30 / MA24-02 来源边界补强：无向量文档集合的计数和筛选对文本资料均要求当前哈希对应非重建原始修订，与候选搜索的资格条件一致。隔离本机探针证明有效文本进入集合，缺失原始修订、旧哈希和跨账号文本不进入集合；临时数据已清理。生产主路未切换。[证据](evidence/ma24-document-set-source-boundary-2026-09-30.json)。

2026-09-30 / MA24-03 补充格式探针：本地 PPTX 和 XLSX 原件与活动共享树哈希相符。幻灯片 12 的五种模式和 `Price List` 第 329/330 行的两款 SM10G 模块均经原件独立核对、`readEvidence` 回读，并写入语料外的补充样本。原检索无候选的无型号中文问法可用最多 32 个四字片段有限回查，仍限定 24 份候选和当前来源/权限。开发、验证及 holdout 的文档级来源覆盖不退步，30 道非路由题未新增候选。生产主路和回答质量门槛未切换。[记录](MA24_SUPPLEMENTAL_FORMAT_REVIEW_2026-09-30.md)。

2026-09-30 / MA24-01 锁定集只读检索预检：50 条 Gold 门禁重检后，对 44 道 route 题运行无向量文档候选和活动 v3 事实/全文检索，后者未提供 Qwen/BGE 查询向量。所需原件全部入候选分别为 41/44 与 40/44。只定位两路径的候选缺口，未比较生成答案、精确引用或完整 v3；不能切换主路。[预检](MA24_HOLDOUT_RETRIEVAL_PREFLIGHT_2026-09-30.md)。

2026-09-30 / MA24-04 本地记忆抽取：保留已通过的偏好专用提示词，另以独立 Schema 请求识别用户自己明确陈述的业务事实。两类结果均需原消息逐字短引；业务事实固定记录为未经核实内部工作记忆、置信度上限 0.7，业务生效时间保留未知。含政策、评分、批准、联系人、假设、请求或指令覆盖的候选拒绝。真实 `qwen3:8b` 旧五类偏好与新七类事实合成样本均通过；默认 worker 仍关闭，任务经验与真实正例端到端待验收。[收据](evidence/ma24-local-business-fact-extraction-2026-09-30.json)。

## 本地网络运行约束补充（2026-10-08）

前端工作流待实施（MA23-03）：待学习邮件取消每批最多 5 封的用户操作限制；后台队列、跨页选择和管理抽屉属于待确认方案。当前外发逐封授权审计及后续知识审核继续适用，未在本轮修改行为。参见 [审查清单](FRONTEND_DISCLOSURE_AUDIT_2026-10-08.md)。

MAILCRM-01～04（2026-10-08，待实施）：同步近期收件及已发送 → 用户授权邮件学习 → 域名/内容提出公司归属 → 用户确认国家、类型与备注 → Skill 增量整理公司时间线并链接原邮件。以上具体流程待确认；公司统一时间轴不扩大账号访问权限，备注不授予发信权限。删除对话确认窗口同步纳入方案。详见 [提案](MAILBOX_CUSTOMER_TIMELINE_PROPOSAL_2026-10-08.md)。

后续确认与实施：用户已批准该方案；邮箱管理/删除对话采用顶层窗口，学习批次与界面同步改为持久化队列，需运行 `npm run mailbox:worker`。同步逐页提交，学习结果未明不自动重发。公司时间线仍在实施，逐阶段状态见 [实施记录](MAILCRM_IMPLEMENTATION_2026-10-08.md)。

阶段 3：邮箱“客户与时间线”中发现本地公司候选 → 确认国家/类型/备注 → 阅读统一时间线或排队本地重要节点整理。Agent 使用 customer_timeline 读取分页结果和公司备注，不能把原邮件指令当系统命令。mail_sync 工具现也返回后台队列收据；queued 不等于已同步。原件撤销/保留期删除后不返回旧摘要。公司移除保留源邮件，可恢复；合并后新往来归入目标公司。

主模型返回无效 JSON 工具参数时，执行器拒绝执行；后续同步模型请求仅规范化历史消息的传输副本，保留原始错误、工具身份与失败收据，禁止把修正副本作为工具输入。2026-10-08 对应回归及图流程 11 项测试通过，真实供应方恢复待验证。

worker 的脚本启动器和预加载器使用 EnvHttpProxyAgent 尊重 NO_PROXY；本机 LangGraph 请求从修复前 502 恢复为 200。中断任务不自动重放，恢复前继续核对执行收据。详见 [恢复记录](LOCAL_RUNTIME_RECOVERY_2026-10-08.md)。

按 MA19-02，启动和排障默认不依赖 TUN；沿既定提供方规则使用直连或显式代理，GitHub 推送使用本地代理。只有确认具体连接必须使用 TUN 时才考虑例外。首页、LangGraph 健康检查成功不等于外部模型或邮件传输验收成功。
# MAILUX-02 阅读工作区补充（2026-10-08）

MODELDIAG-01 诊断结果：已明确是 Fireworks 上游临时限流，账户余额为正。遵守当前固定供应商路由，不以诊断授权扩大为供应商切换或持续探测。一次诊断已执行，详见恢复记录。

主模型 429 处理：停止立即重试，保存 partial 状态，明确提示限流/配额限制及稍后恢复；不自动改用其他模型。历史回执保留，不能将旧提示当成新请求结果。

运行时补充：LangGraph 启动对公开模型目录进行无凭据网络预检；系统拒绝外网权限时阻断启动。不要仅凭 localhost `/ok` 判断主模型可达。见 `LOCAL_RUNTIME_RECOVERY_2026-10-08.md`。

邮箱入口 → 收件箱/已发送 → 选择邮件阅读；手机通过“返回邮件列表”回到原分页。公司时间线同样支持返回公司列表。统计、后台任务明细和收据核对从“管理 / 连接邮箱”进入，主界面保留异常/处理中提示。布局验收见 `READING_SPACE_AUDIT_2026-10-08.md`。
# 2026-10-10：专用 Kimi 工具调用路径

邮件学习与外联生成改用 OpenRouter；执行前继续检查原权限、邮件授权与付费准入。网关缺少配置时不得回退 Moonshot 直连；调用收据归属 openrouter，Kimi 模型 ID 带 moonshotai/ 前缀。现有三种主 Agent 模式不改变专用工具内部的输出上限。验收及后续缺口见 [迁移记录](OPENROUTER_KIMI_MIGRATION_2026-10-10.md)。
# 2026-10-10：旧 RAG 回答入口网关统一

旧 RAG 服务生成 Kimi 回答时使用 OpenRouter，先过滤与脱敏明确公开的资料，再执行原付费准入并保存网关调用收据。缺少网关配置时不直连回退，失败和截断输出不作为完整答案。旧意图分类与其他专用入口仍待迁移；[验收记录](OPENROUTER_RAG_MIGRATION_2026-10-10.md)。
# 2026-10-10：旧意图分类网关主备

旧流程 Kimi 与 DeepSeek 等价备用统一网关，备用沿用完整意图约束；401/403 返回确定性兜底，失败收据不遗漏。现有手动模式不采用该旧复杂度判断。历史任务不自动重放；[实现记录](OPENROUTER_INTENT_MIGRATION_2026-10-10.md)。
# 2026-10-10：MODESEL-15 停用旧意图识别

旧分类入口固定返回停用提示，不调用模型、不自动判定复杂度、不调用备用或规则分类、不产生分类计费操作。用户通过新对话的快速/标准/深入模式提交任务；不自动迁移或重放旧任务。[验收记录](LEGACY_INTENT_DISABLED_2026-10-10.md)。此前意图网关迁移段落保留为历史。
# 2026-10-10：DeepSeek 专用工具网关

研究、评分及联系人核验的 DeepSeek 调用统一 OpenRouter，原数据授权和正式评分门槛继续生效。缓存版本更新，保留旧收据，禁止自动重放不确定任务；旧意图仍停用。详见 [验收](OPENROUTER_DEEPSEEK_MIGRATION_2026-10-10.md)。

## MODESEL-06 公开事实搜索迁移（2026-10-10）

public_fact_search 改用 OpenRouter 的 Gemini 原生 web 搜索，采用完整回答及有效 URL annotations。实际 Google 搜索词不可见时明确保存 not-provided，不以用户问题或引用数量冒充搜索记录；执行次数限制保持既有规则。使用 MODEL_PROXY_URL 显式本地代理，缺失时停止，不依赖 TUN 或静默直连。39 项本地回归、类型检查、lint、构建通过，无新增付费验收。客户发现及远程向量仍待迁移，详见 OPENROUTER_PUBLIC_SEARCH_MIGRATION_2026-10-10.md。

## MODESEL-16 向量工作流（2026-10-10）

已确认停用远程 Qwen。RAG 与研究上下文采用本地 BGE、全文和已核实事实；旧意图保持停用，RAG 主路指针不变。BGE 停机不触发云端向量回退。文本入库、外联知识与私有记忆取消远程 embedding 依赖，保留全文检索及原权限条件；历史向量不批量删除。详见 MODESEL16_LOCAL_RETRIEVAL_2026-10-10.md，冻结集召回对照与答案验收分开记录。

### MODESEL-16 验收脚本身份（2026-10-10）

compare-holdout-retrieval-local 的 local-document-recall-v2 收据分别记录 frozenReferenceProfile 与 evaluatedProfile，并核对运行前后 Gold、资料、权限、事实审核和 release 状态。此为文档召回诊断，不能替代答案与精确引用判分，不能据此调优已冻结题。旧候选和判决不改写；详见 LOCAL_RETRIEVAL_RECEIPT_2026-10-10.md。

### MA24-01 / MA24-02 / MA24-14 实施状态补充 — 主任务来源及范围（2026-10-10）

主 Agent 来源复核已覆盖模型前后、后续工具、完成保存及 checkpoint 恢复；默认关闭的无向量工具现可按指定账号进入知识页影子流程，范围取自任务保存值，并在每次原文和集合 SQL 中重查。52 项相关回归、类型/Lint 与隔离数据库范围验证通过；此为工程证据，持续服务加载与独立质量验收另记，未切换生产主路。见 [分阶段记录](MA24_REMAINING_PLAN_2026-10-10.md)。
### MA24-07 / MA24-14 实施补充：Skill 自动启用包校验（2026-10-10）

修复脚本识别只覆盖 py/js/mjs 的缺口。自动启用或回滚在读取目标版本时重新检查真实文件与依赖；仅 MD/TXT 指令文件可进入后续自动评测门槛，未知文件类型、无扩展名脚本、PowerShell/批处理/TypeScript、shebang 或显式可执行代码块均需人工审核。历史 validation 写“无脚本”不能绕过检查。人工管理路径保留，已启用历史 Skill 未批量变更。33 项 Skill 回归、TypeScript 和定向 ESLint 通过；重复成功经验生成草案与回放/影子评测器仍未完成，不把此静态检查当作质量验收。
### 2026-10-10 本机加载证据

本轮三个修复提交 `2f240bf`、`a1e94a4`、`b856736` 已经通过本地代理推送至 origin/main。Next 生产构建、52 项知识回归、33 项 Skill 回归、类型与定向 Lint 通过；3018 网页与 2024 LangGraph 已重新加载，HTTP 均为 200，10 项网页静态资源全部成功。主 Agent 队列为空时更新，邮件 worker 未停止，更新后继续处理任务。未新增付费模型调用；独立测评、连续记忆/Skill 影子质量及主路发布仍未完成。[机器收据](evidence/ma24-runtime-guards-2026-10-10.json)。
### MA24-04 / MA24-05 / MA24-14 — 记忆恢复与冲突隔离（2026-10-10）

已实现：队列仅选择活动账号的已完成主 Agent 任务；领取租约后才检查本地模型，过期处理中任务在模型离线/原文过长时也按令牌回队并设置下次时间。失去租约不覆盖新 worker 的结果，存储事务失败可回队，worker 的本地依赖异常不会退出常驻循环。本地 HTTP 禁止跟随重定向。

当前有效记忆和 Graphiti/PostgreSQL 召回共用按“已知时间＋业务时间”判断的冲突隔离：冲突双方不进入普通召回，后发生的冲突不会污染更早已知时间；撤销一方后另一方恢复，旧时间快照仍保留当时冲突。“冲突待处理”不再显示已被更正/撤销消除的争议，原观察和冲突历史不删除。

验收：19 项定向回归、TypeScript、定向 ESLint 通过。`verify-memory-recovery-clone.ts` 使用隔离数据库及 loopback 模型替身，实际终止并重启 worker；过期租约重领后只产生一条观察、一条通知、一条 outbox；取消任务不阻塞队首。业务时间、已知时间、撤销、图谱停机回退和跨账号检查通过，夹具清理完成。替身不是 qwen3 抽取质量证据；自动经验提炼、持续真实本地模型验收及 Skill 回放/影子流程仍待完成，生产开关仍关闭。


### MA24-04 / MA24-07 / MA24-14 — 本地经验与 Skill 候选（2026-10-10）

本地 qwen3:8b 现可抽取用户明确报告的做法与结果，包括失败教训；经验正文保留精确来源句，置信度上限 0.7、业务生效时间未知、来源标记 user-report / successVerified=false。计划性建议、第三方引文、权限绕过不作为经验。这里只新增内部观察，不把用户报告改写成已核实事实或成功证明。

工作器保存经验后，两个不同已完成任务中、相同 memoryKey 和相同原句的正向报告可提名一份停用的账户 Skill 草案。二次报告是本实现的候选提名条件，不是新增用户确认的质量阈值；含失败/否定、冲突、撤销、来源不匹配、范围非全账户或凭据/脚本的报告不提名。草案保留观察/任务/消息 ID 与收据哈希，重放不重复创建，不改动已有 Skill，不自动启用。尚未独立验证成功的候选需先核实来源与适用条件，再做历史回放、错误案例、注入、权限与真实任务影子对照。

证据：8 文件 69 项回归、类型与定向 Lint 通过；真实本机 qwen3:8b 的六项合成契约通过（成功报告 1、中文失败教训 1、计划/引文/绕权限/普通事实各 0），不向数据库写入质量样本。隔离库实际 worker 崩溃恢复、双时间冲突与撤销、两次报告提名、幂等重放、自动启用拒绝均通过。自然任务长期质量、结构化工具收据学习、用户纠正和完整 Skill 评测器仍未完成；生产自动学习开关尚未开启。


### 本机加载与后续顺序（2026-10-10，记忆阶段）

提交 `99df5e3`、`38b0d98` 已通过 127.0.0.1:7892 推送 GitHub；迁移 121 已在隔离库验证并应用本机。生产构建成功，产品 3018 和 LangGraph 2024 已加载，HTTP 均为 200，10 项静态资源正常；邮件 worker 未停止。经验抽取与 Skill 提名代码已就绪但自动学习开关仍关闭。下一步补用户纠正与结构化收据学习、Skill 回放/影子评测器，再开展 Codex 引导的新独立质量审核；不得将本轮 69 项回归和 6 项合成模型契约等同于独立质量通过。[验收收据](evidence/ma24-memory-recovery-experience-2026-10-10.json)。
### MA24-04 / MA24-14 — 显式记忆更正入口（2026-10-10）

学习记忆的当前记录、历史时间轴和冲突页新增更正入口，采用原记录下展开的表单与固定高度分页区域。保存完整新内容和可选原因；保留原观察、来源、范围与业务有效时间，未知时间不推造。服务端从原记录继承类型/范围，并建立 corrects_id、用户更正收据、通知和 outbox；客户端不能指定账号、权限、来源或核验状态。更正后的业务事实仍为内部未核实记忆，不触发发布或 Skill 启用。

同一更正请求幂等；更正与撤销竞争及不同更正竞争仅接受一个版本，旧页面提交返回 409 并保留草稿。被更正的原记录不能再直接撤销；撤销更正记录只使该记录失效，不自动恢复已被替代的内容。旧 agent-memory 镜像保持原管理入口，避免只改观察而遗留旧偏好。更正业务时间的专用界面、对话中自由文本纠正的自动匹配、可靠工具收据学习仍待后续实现，本阶段不宣称这些已完成。

验证：5 文件 29 项测试、TypeScript 和定向 ESLint 通过。隔离数据库验证并发、幂等通知/outbox、跨账号拒绝、范围保留、未知时间、双时间历史、过期图谱候选与撤销。真实组件的本地浏览器合成接口测试覆盖 1366/390/320 宽度、取消不写入、错误保留草稿、保存刷新、焦点与滚动，无外部请求、模型调用或正式账号数据修改。组件测试与数据库测试分别执行，不等于自然任务质量验收。Next 生产构建通过；本轮没有数据库迁移，未切换自动学习或检索主路。
本机产品 3018 已加载本轮更正入口，LangGraph 2024 保持可用，两者 HTTP 200，11 项静态资源检查通过；邮件 worker 未中断。无模型调用，自动学习与检索主路开关不变。验收记录见 docs/evidence/ma24-memory-correction-2026-10-10.json。
### MA24-04 / MA24-05 / MA24-14 — 结构化只读收据学习首批（2026-10-10）

本地记忆 worker 在领取租约后、探测本地模型前，读取当前账号已完成主 Agent 任务的服务器工具收据。首批仅支持 version=1、effect=read 的 knowledge_compare 与 vectorless_aggregate；核对输入哈希、输出 Schema、对象/字段对应关系、集合子集与计数一致性。每批 100 条，按数据库原始时间精度与 ID 继续翻页，不丢弃后续收据。未知工具/版本、部分集合结果及不合契约的收据不参与本批学习。

产生的是历史执行经历：固定模板说明比较方法、当时缺项/冲突计数或当次候选子集数量，保存任务/调用 ID、持久化 JSON 输入输出哈希及执行时间。原文、型号、自由文本指令均不复制为经验；业务生效时间未知。successVerified 与 answerQualityVerified 均为 false，不转正式事实，不进入重复用户报告的 Skill 提名，也不自动启用。后续引用原始业务信息仍须重新验证权限、状态和来源。

观察、通知、outbox 同事务幂等；模型缺失时收据可先保存，自由文本仍排队。重试不重复通知，撤销后不复活。失效租约/跨账号/未完成任务不能写入；收据存储、模型、记忆存储错误分别记录，不把数据库故障统一报成模型故障。本阶段没有回填已 ready 的历史任务，也未实现所有工具的业务事实学习、自由文本纠正自动匹配或 Skill 效果评测。

验收：4 文件 46 项回归、TypeScript、定向 ESLint 通过。隔离数据库执行真实只读比较，模拟本地模型不就绪，验证收据保存/文本排队、哈希、幂等、撤销、账号与租约隔离，未创建 Skill；真实 worker 的终止重启、过期租约及既有冲突/草案门禁复测通过。仅使用本地数据与合成夹具，无实际模型调用或外部请求。持久 worker 未启用，自动学习与检索主路仍关闭；本次后端 worker 模块没有要求重启网页或邮件服务。详见 docs/evidence/ma24-tool-receipt-memory-2026-10-10.json。
### MA24-04 / MA24-14 — 对话中的明确记忆更正（2026-10-10）

已接入已完成主 Agent 任务的首条已保存用户消息。首批严格识别完整指令：更正记忆：“旧内容”改为“新内容”，或 Correct memory: "old content" to "new content"（两段各 3～800 字符）。这是确定性指令解析，不是任意自然语言的语义匹配，也未宣称完成所有自由文本纠正。用户原话/旧正文精确匹配本账号唯一未替代记录，并且记录为当前账户级本地学习或用户更正来源，才自动建立 corrects_id。旧版偏好、市场/公司限定、非当前业务区间、多重匹配、未解决冲突、政策/权限/生效时间修改均不自动替代；第三方引文/代码块不被识别为更正指令。

存储前重查任务、账号、用户角色消息及当前租约；同事务保存新记录、消息 ID/SHA-256/完整更正指令、通知与 outbox，并完成抽取工作。新内容继承原类型、范围、业务时间和内部权限，未知时间不推造；不同于“从现在开始”的有效期变化。匹配不明确或受限的显式指令生成“未自动替换”的学习通知，保留原记录。相同消息重放幂等，撤销后不复活；既有界面更正逻辑复用，旧版记忆原管理入口不变。

验收：6 文件 72 项回归、TypeScript、定向 ESLint 通过。隔离数据库覆盖完整 worker 入口、消息哈希、新旧关系、通知/outbox、重试、撤销、多重匹配、范围、冲突、越权与失效租约；界面更正的双时间和并发数据库探针、结构化收据离线探针均复测通过。无模型或外部请求，生产自动学习仍关闭。本轮没有生产数据回填或服务重启；尚需一般自然语言纠正的本地模型质量验证、自然任务持续学习及 Skill 回放/影子质量验收。收据：docs/evidence/ma24-message-memory-correction-2026-10-10.json。
