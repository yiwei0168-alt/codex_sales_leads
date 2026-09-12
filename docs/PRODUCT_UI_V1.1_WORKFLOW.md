# Product UI v1.1 implementation workflow

## 2026-09-13 local token accounting prerequisite

B16 in the [rule register](CONFIRMED_PRODUCT_RULES.md) is now approved. Official source and V4 tokenizer are pinned and integrity-checked in ignored local storage; no tokenizer runtime or provider call has run. Official PyPI lookup yielded no installable distribution and the local native toolchain is absent from PATH. Isolated build environment selection remains pending; this is not a billing upper-bound acceptance. No runtime workflow or dependency changed.

## 2026-09-12 confirmed-rule checkpoint (documentation only)

Register v1.1.0 adds approved B11–B15: model-matched local token accounting or verified upper bounds -> input/output/other-charge quote -> per-attempt reservation, retaining unknown prior costs. Changed model/endpoint/contracts require revalidation. Official recipe discovery is documented; its concrete integration is still a proposal, not a tested billing guarantee.

The [confirmed rule register](CONFIRMED_PRODUCT_RULES.md) is the review index for exact user decisions and their implementation status. Approved next flow: frozen/reusable evidence -> current semantic request -> full serialized UTF-8 body measurement -> split oversized batches or handle oversized single-company evidence without silent loss -> independently verified tariff/token bounds -> reservation -> provider attempt -> separate reported/estimated/invoice amounts -> downstream adoption metrics. Body limits: correction 36,864 bytes; score-only 57,344; score-and-paths 61,440; output default remains 8,192. These new limits and full reconciliation rules are **not implemented by this documentation stage**. Global tariffs remain empty/fail-closed. Rules A01–B10 govern the next stage; historical workflow results below retain their original scope.

## SMTP send acceptance — latest 2026-09-12 update

Following separate user confirmation, one synthetic test email passed the real product send path: SMTP accepted, encrypted receipt and sent timestamp persisted, encrypted readback validated. No retry, no model call. The test node remains distinct from customer records. Await recipient confirmation before marking inbox delivery accepted; server `sent` status alone does not prove it.

## SMTP system-DNS connector — 2026-09-12

Confirmed product change: saved mailbox -> system DNS (5-second bound) -> up to four distinct TLS endpoints (5 seconds each, transport failures only) -> secured socket handed to Nodemailer -> authentication -> existing explicitly confirmed send/idempotency flow. Preserve hostname/certificate verification; no hardcoded IP, TLS bypass, or post-handoff retry. System resolution avoids the observed mismatch with Nodemailer's DNS resolver. Authentication-only live check passed in 504 ms, no mail or database mutation. Actual delivery remains pending. See the acceptance report for diagnostics and limits.

## DeepSeek recharge recheck — latest 2026-09-12 update

User-authorized single-stage retry selects only DeepSeek with a fixed new audit stage, under the existing advisory lock and cumulative $30 budget. The original 402 and its reservation remain immutable; repeat invocations skip the new receipt too. HTTP 200 / valid JSON, 1719 ms, 102 input and 27 output tokens. Reservation now $12, not actual spending. No production routing or mailbox settings changed; five provider contracts now pass but full business acceptance remains incomplete. See `LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md`.

## 2026-09-12 local production and bounded provider acceptance

Latest authority: `LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md`. Local production only. Login body validation precedes account lookup; each session requires an active user. Kimi K3 requests use the provider-supported completion cap; the billing boundary rejects obsolete-only caps. Server-side acceptance scopes inherit isolated reviewed tariffs without modifying the fail-closed global product policy or normal user budget.

Flow: fixed synthetic input -> exact provider/model request -> durable $2 reservation under isolated $30 cap -> one HTTP attempt -> JSON/vector validation -> aggregate receipt and estimate -> report. No tools, search, business data or automatic retries. Five attempts, four valid validator-consumed outputs, $10 reserved; OpenRouter reports $0.00015, other invoices unknown. Failed requests and resumed runs retain costs and never replay automatically. This is not full business-agent acceptance. SMTP verification failed before send and no outbound receipt exists. 586 tests, 18 browser checks, 14 authenticated groups and build/typecheck pass. Remaining gates and official price sources are in the linked report.

## 2026-09-12 自然语言预算提案（最新补充）

assistant-intent-plan-v1.3继续使用现有Kimi轻量模型和多轮历史，新增budget_change结构：user/task范围、绝对累计美元上限。币种、范围或金额不明确时澄清；数字校验由程序完成，预算提案不升级K3、不调用RAG/网页搜索。联合“新搜索+预算”先澄清两步建立计划/设置预算，不默默丢掉预算或自动执行。模型不能返回可信任务ID。

助理消息保存可审阅提案；页面允许修改金额，任务范围必须从当前对话拥有的搜索任务中手工选择，取消任务不列出。点击后再次明确确认，通过已有owner校验的/api/budget写入，旧预留不重置、额度不自动追加、任务不启动。初始没有预算或费率时，Kimi调用本身仍受阻；任务中心的直接预算表单可用于首次设置。

提案复用既有意图模型聚合遥测和预算变更审计，没有增加第二次模型识别、补证或搜索流程。预算提案生成不等于用户采用；成功确认只代表预算配置采用，不代表真实费用或搜索结果。后续优化：增加提案ID到确认审计的细粒度关联，以量化提案改写率；当前不虚构该指标。

567项单元测试/136文件、18项桌面/手机隔离浏览器检查、类型检查和生产构建通过；lint 0错误/11项既有警告。隔离检查现同时加载globals.css与ipados.css，避免漏掉实际主题覆盖。真实登录验收12组通过（新增预算提案读取/取消无写入），390px截图已复查，合成记录已清理。没有实际模型、搜索或SMTP调用；这不是Kimi真实账号连通性验收。剩余上线限制仍为审核后的供应商请求费用上界/发票核销合同、真实SMTP测试收件人，以及后续真实采用链路测量；未擅自更改实验策略。

## 2026-09-12 任务预算与聚合遥测收尾（最新状态）

迁移050已应用：task_spend_limit保存owner/action级可选累计上限，spend_budget_change以只追加记录保存用户确认的修改和零外部调用聚合指标。每次HTTP预留在同一用户行锁下同时检查总预算和任务预算，修改上限不得低于已有预留；不重置历史占用、不自动启动任务。任务详情折叠读取预算，支持明确确认修改，展示各阶段预留/已报告费用/未知账单/累计HTTP耗时；耗时不是并行墙钟时间，预留不是实际支出。无任务上限沿用用户总预算，续搜仍是需独立确认的新任务。

新增trackedOperation覆盖独立RAG回答、知识分块存储、手动私有记忆和跟进生成的成功/失败聚合记录：输入量、有效输出、存储采用或待审核、token/费用/重试未知值、耗时、弃用原因和优化机会。只保存计数，不写提示词、邮件或错误原文；指标落库失败不重放成功的业务操作。嵌套阶段保留父任务预算ID，不能因新建指标ID逃逸任务上限。RAG回答返回不等于用户采用；知识/记忆入库不等于未来检索或邮件采用。HTTP账本与操作指标有重叠，不相加。跟进token为最终响应报告，不冒充包含所有重试的总量。

验证：561项单元测试/135文件、16项隔离浏览器测试、类型检查通过，lint为0错误/11项既有警告；任务预算真实SQL探针验证预留拒绝不增加占用及跨用户RLS。登录验收扩展为10组桌面/手机真实本地API检查，包括零美元合成任务预算；付费调用和SMTP发送均为0。临时合成用户清理新增预算外键时曾回滚，已用严格身份/无付费记录检查清理并修正自动清理顺序；未删除客户数据。

仍不能声称已完成真实付费上线验收：已审核网关全包请求费用上界尚缺，config/billing/request-bounds-v1.0.0.json保持空规则；部分无输出上界请求继续阻止。发票核销/释放依赖账单接口合同，未知占用保留。真实SMTP需要专用测试收件人。自然语言预算变更尚未实现，当前只有显式表单确认；未实现的最终用户采用事件保持unknown，不虚构完整利用率或节省百分比。手动记忆持锁embedding的连接占用、SDK包装拒绝的无网络重试以及更细的语义采用链路作为后续优化记录，未擅自降模型或输出质量。

## 2026-09-12 登录后响应式验收

新增scripts/verify-authenticated-ui.ts：只允许localhost，用同库迁移连接建立临时合成用户/工作区，真实应用角色和密码登录访问API；检查1366px与390px的GB/MX独立候选、详情Escape、实际渠道图、任务/知识/邮箱导航及预算/用量读取。浏览器禁止外网及非登录写入，不替换API响应。8组检查通过，付费预留0、真实邮件0；临时用户/工作区/公司已清理，正常登录审计保留。另有14项隔离浏览器测试、552项单元测试及构建通过。

实际检查发现并修复手机顶栏溢出、筛选文字竖排、侧栏图标缺可访问名称和移动端退出入口被隐藏；渠道图表单整理为响应式布局，SVG横向滚动仅限图框。已截图复查。验收使用合成数据，不代表所有真实客户历史异常或SMTP发送均已验收；费率和真实收件人未确认的外部调用继续阻止。验收初次localhost探测受CLI代理影响已改为显式本地直连，不能据此断言原3000服务本身故障。

## 2026-09-12 剩余付费入口与拒绝审计

已接入联系人、存量关系分析、独立RAG查询/知识入库、开发上下文/反馈/手动记忆、邮箱授权学习的用户预算作用域；本地邮箱筛选不调用模型。Snov OAuth也不假定免费，表单仅按已审核端点/请求体积报价，无费率不发送。结果链接限定官方域名和结果路径、禁重定向；按顶层status判断完成，轮询未完成抛出unknown而非缓存为空；保留第一页最多50条的现有范围并明确提示，不自动翻页。依据：https://snov.io/api 。

DeepSeek/兼容模型/搜索/补证/主评分/复核捕获预算拒绝后向上抛出，不触发备用供应商、候选失败评分或付费重试。预算拒绝记录到product_operation_metric，仅本次被阻止HTTP的现金/token为0，不把此前调用视为免费。用量接口把操作表与30天HTTP预留/已报告费用/未知数/耗时分开，不重复加总；输入输出使用效率仍以各业务表语义为准。新增552项总回归通过、类型检查通过；不含真实付费调用。

剩余边界：供应商/网关的全包请求费用上界仍未审核，费率保持空，不把公开token单价或历史估算冒充合同上界；任务子预算、发票核销释放、独立RAG/记忆等完整语义利用率仍待补齐。手动记忆目前持锁进行embedding，需后续优化连接占用；仅新增费用检查未改变其并发写入语义。当前代码覆盖已识别的产品入口，不等于历史费用全量或真实模型/SMTP验收。

## 2026-09-12 助手与开发生成预算边界

助手主图、开发策略/修订及跟进生成建立用户费用作用域；Kimi、Claude、Gemini聊天搜索及综合回答HTTP传输接入预留检查。并发子作用域独立，禁止跨用户嵌套；开发生成沿用已持久化操作ID。Kimi/Claude捕获预算拒绝后直接退出，不重试、不生成模板冒充成功、不切换供应商。跟进入口返回明确402，不改变原邮件。既有输出token上限不降低，未设上限请求继续保守阻止。

验证：541项测试、类型检查通过，lint 0错误/11项已有警告；新增无费率零网络调用及并发归属测试。无付费调用、真实邮件发送或数据库迁移。联系人、独立知识处理/邮箱学习、完整阶段细分与拒绝遥测、费用上界配置及登录端到端验收仍未完成；未验证费率保持空，不能将预留占用当实际成本或声称全产品已封顶。

## 2026-09-12 completed-underfilled continuation

049 adds owner-private parent/child/root lineage and exclusion snapshots. A completed task with a known gap can create one idempotent **proposed** child, never queue or execute it. The original result, checkpoint and cost remain unchanged. The child uses the remaining target, original market/roles and current product scoring policy; historical scores are not retroactively recomputed. Prior assessed domains across the lineage seed the existing discovery exclusion mechanism; they are not added to playbook prompts. The new task page exposes a separate plan/fee confirmation before execution through the existing budget-controlled workflow. Repeated clicks return the same child and record cache reuse. Maximum three continuations, confirmed exhaustion or consecutive zero-yield tasks require replanning; missing run provenance/counts or oversized exclusions are not silently inferred/truncated. Conversation deletion cascades lineage. 536 tests, 14 isolated browser checks and real rollback proposal/idempotency/RLS/deletion checks passed; migration 049 applied without running a paid search.

## 2026-09-12 uncertain-cache reconciliation

Task details offer explicit local closure for a company-detail contact lookup still running after ten minutes, and for failed/ten-minute-stale relationship analysis. Server ownership/status/time checks are authoritative; this never calls a provider, issues a refund or releases a dollar reservation. Contact cache becomes unknown, requiring a separate explicitly confirmed refresh. Relationship attempts retain their original ID/results/metrics and archive the cache key so a separate explicit analysis creates a new ID. Completed/recent-running/already-reconciled records cannot be reset. Contact writes lock and verify run ID/status before persistence; relationship completion requires its old ID still running. Late output records usage/discard reasons only, never replaces new results or returns suggestions. No new migration; per-owner local audit aggregates record reconciliation separately from uncertain external fees.

## 2026-09-12 country state cutover

047/048 are now applied, superseding the foundation-only status below. Search/manual candidates, list/edit/assessment, assistant lookup, relationships, development strategy, contact aliases and outbound/follow-up resolve workspace-country candidates. Global identity is not overwritten on reassessment; matching-role reassessment can clear stale flags without removing user decisions or contact progress. New mail stores country and updates only that market. Old country-unconfirmed mail is labeled and excluded from market totals until an explicit audited assignment; no resend. Historical draft country is recovered only from a matching stored search run; otherwise task history says unknown. Real application-role reads and rollback isolation/reassessment probes passed, plus 10 isolated desktop/mobile browser checks. See `COMPANY_MARKET_STATE_CONTRACT.md`; no paid calls or authenticated/live-delivery acceptance claim.

## 2026-09-12 country state foundation (not enabled)

Migration 047 and a country-state repository preserve global identity/legacy FKs while isolating workspace/country snapshots and overrides. Existing candidate IDs survive backfill; reassessment preserves development progress. Six tests and a real database rollback probe verified country/owner isolation. The migration is not yet applied and production readers/writers are not switched: mail/strategy provenance and all candidate-action lookups must be adapted together. See `COMPANY_MARKET_STATE_CONTRACT.md`. No new evidence/model/search/mail operation.

## 2026-09-12 conservative budget foundation

User confirmed fail-closed missing prices and country-independent business states. Migration 046 adds integer micro-USD owner budgets and pre-network reservations. Task Center has lazy-loaded budget edit/refresh with explicit confirmation and separate occupied/reported/unknown amounts. The production lead workflow binds per-action scope through embedding/playbook/discovery/evidence/scoring transports and retries. Empty unverified tariff configuration blocks uncached paid work. This is a foundation: independent chat/mail/contact/knowledge entry scopes, reviewed provider bounds and task sub-limits are still pending. See `BILLING_BUDGET_CONTRACT.md`; no full-product cap or actual cost reduction is claimed. Real RLS probes passed with verification writes rolled back.

## 2026-09-12 compatible security patch verification

Next.js and its lint config upgraded to 16.3.4, mailparser to 3.9.24, Vitest to 4.1.11 and compatible transitive js-yaml to 4.3.2. This addresses the preceding audit alerts without forced major upgrades or dependency overrides. Official Windows advisory: https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36 . Final install audit reports zero known vulnerabilities; this is a point-in-time dependency check, not a full security certification. Running processes must restart to load new dependencies; an older loaded native binary was left untouched rather than killing an unidentified user process. Existing experiment artifacts and databases were not altered.

## 2026-09-11 relationship adoption linkage

Analysis responses include the cache record ID and original (pre-filter) suggestion index. Loading a suggestion alone is not adoption; saving carries this reference and validates owner, workspace, country, directed company pair and completed analysis in the same transaction. Saved indices are deduplicated under a row lock, so retries do not increase downstream-used counts. The user may edit the proposal; the metric means used as a source for a saved relationship, not unchanged acceptance or verified cooperation. Manual relationships require no analysis and consume no tokens. Historical saves are not backfilled speculatively.

## 2026-09-11 isolated browser acceptance

Company/task/evidence dialogs share topmost-only Escape handling, Tab containment, opener focus restoration and background scroll locking. Assessment retry clears the previous failure only after a successful read. Six Chrome checks pass at 1366px/390px using actual React components and production CSS, with synthetic fixtures and every network request intercepted. This verifies interaction, not authenticated Next.js navigation, real provider calls or live SMTP. Run `npm run test:browser` with installed Chrome; output stays in ignored `tmp/`. Test fixtures do not expose a product route or authentication bypass.

Production dependency audit reports six affected packages, including a critical Next.js advisory; this is a deployment risk pending a separately verified compatible dependency fix, not introduced by the browser fixtures. No `npm audit fix --force` or unverified dependency override applied.

## 2026-09-11 completion continuation: dependency invalidation and delivery accounting

Development snapshots now store a conservative hash over visible knowledge revisions, owner memories/status and owner relationship revisions. Reading an old strategy compares this hash without embedding or generation; legacy snapshots remain unknown. Role/path/tier edits in the same page mark the loaded strategy for review immediately. This conservative scope can flag unrelated knowledge edits and should later narrow only with proven complete dependencies.

Development generation/revision reserves a durable operation before execution, settles persisted-output metrics, and records failed/abandoned attempts as failed/running with unknown cash cost. Task feed shows running/failed generation attempts as a sixth kind, avoiding a duplicate completed task next to the saved draft. This supplements, not replaces, saved draft usage. Retries without source telemetry remain null. No failed model call is automatically replayed.

Lead persistence stores added/updated/role-changed counts relative to the user's workspace; role changes are a subset of updates and exclude an explicit primary-role override. Counts are written in the result transaction and reused on persistence replay. Manually protected companies now advance their assessment run link without overwriting protected business fields. This does not yet implement multiple same-domain country memberships or completed-run continuation. Task detail defaults to readable metadata, candidate table and contact summary; complete raw data remains collapsed. JSX tests are now included in Vitest rather than silently omitted.

## 2026-09-11 resumed: market counts and company correspondence

Global overview counts active (confirmed/running/sending) tasks across all five shared sources without list pagination. Countries with active tasks but no candidates appear; unknown/mixed counts stay separate. Refresh is visible-only/non-overlapping at 30 seconds; unavailable statistics are not zero. Manual company creation exposes optional role, remains unverified and invokes no model.

Company development records list locally imported, owner/company-associated correspondence in pages of twenty. The API fetches a twenty-first sentinel but decrypts only projected rows; body/ciphertext never enter the list response. Expansion uses the existing owner-protected mailbox API. No sync/learning/search is triggered. Association does not prove a shared thread. New read stages retain durable counts, zero model/search cost, latency/failure/discard and projection boundaries. 493 tests / 115 files, typecheck/build pass; lint zero errors/11 old warnings; real task aggregate SQL/RLS checks pass. Browser/SMTP acceptance remains outstanding.

## 2026-09-11 resumed: durable non-lead usage

Intent and local company lookup now reserve/settle owner-isolated product operation records (migration045). Unknown costs and incomplete token usage remain null. Finished intent telemetry is persisted before downstream routing; failed final telemetry does not discard the paid result. The new read-only `/api/tasks/usage` reports these sources separately from lead search/model ledgers, not as a complete budget. It has no UI hard-limit claim. Pending work remains in the completion checklist.

Authoritative scope: `Network_Channel_Copilot_PRD_v1.1.md`. Product functionality is explicitly authorized; experiment mechanism migrations are not included.

## Stage 1a: country routing

Authenticated user -> current owner-scoped workspace + user's search-action countries -> country selector -> `/markets/{country}/{leads|channel-map}` -> freshly loaded saved workspace -> selected-country list/map. Names are normalized across supported locales. All-country maps show a selection prompt. Conversation result buttons pass the task country. Switching countries does not invoke acquisition, scoring or generation.

Verification: country normalization unit tests and TypeScript. This stage does not claim completion of the table redesign, polling/incremental persistence, map relationship editing or other PRD functionality.

## Remaining stages

### Stage 4e: multi-type task feed

Task center now reads one owner-scoped projection of assistant searches, contact enrichment batches, outreach drafts and outbound SMTP records. Type/country/status filtering happens before pagination across history; 50 rows plus one sentinel. Existing search detail links remain unchanged. Draft approval is explicitly not proof of sending; SMTP acceptance is not delivery/read. Unknown SMTP status asks for verification, never auto-retry. Contact batches without reliable country snapshots remain unknown/mixed; draft/send countries reflect current canonical company country rather than an immutable task snapshot.

Metadata-only list excludes email bodies/addresses, strategies, evidence and full model responses. Visible active pages poll at five seconds with per-effect in-flight deduplication; terminal pages use manual refresh. Existing latest-contact detail is lazily expanded and explicitly independent of feed filters. This is four-source history integration, not a fully unified execution engine: relationship analysis, standalone scoring, running/failed draft-generation attempts and follow-up generation audits are not yet integrated. Full typed detail/recovery and per-step budget accounting remain pending.

Validation: three API/status tests, TypeScript, targeted lint and real DB read-only execution for all four branches under the application role, with unknown-owner results empty. No paid calls or data writes in feed verification. Authenticated visual QA remains outstanding.

### Stage 4d: transactional memory change audit

Migration 039 adds owner-RLS `user_memory_audit` and an AFTER INSERT/UPDATE/DELETE trigger on private memories. Every source writer, including Agent upserts and workspace-less manual saves, now produces audit in the same transaction; timestamp-only changes are suppressed. Owner UI lazily opens paginated history, including deleted memory IDs. Snapshots contain status, kind, scope and content length, plus changed field names, but no title, body, embedding or arbitrary context. This is change auditing, not full-text version recovery; historical text rollback remains unsupported and pre-migration changes are not reconstructed.

Migration applied. Real-database rollback smoke passed for create/archive/delete, no-op suppression, no private text duplication and other-user RLS invisibility. API tests cover auth, pagination and private caching; TypeScript and targeted lint pass. No paid API call or real user deletion occurred. Browser interaction QA remains outstanding.

### Stage 4c: manual style/claim authoring

Private memory editor -> explicit scope/content confirmation -> owner-locked, version-checked save -> existing Embedding provider for changed content only -> atomic content/vector write. Stable create IDs block duplicate records/calls on retry; conflicts are surfaced, not overwritten. Title/scope-only edits reuse vectors. Archived records stay archived when edited. Marketing claims require explicit external-use approval and remain excluded from objective scoring. Company-specific facts and structured path choices continue through their authoritative editors; arbitrary text cannot rewrite structured path history.

Private outreach RAG now filters country and role scope before ranking, rather than merely rewarding matches. Manual content caps at 1,200 characters to avoid truncating new preferences in downstream packets. No embedding failover is introduced. Eleven mocked memory tests, TypeScript and targeted lint pass; no paid embedding call or live-browser save was performed. Remaining: complete revision/provenance audit, company-specific memory authoring, price normalization and durable failure telemetry; manual scope fields currently require canonical role names and two-letter country codes.

### Stage 4b: private-memory lifecycle

Knowledge page -> session-owner memory list (50 per page) -> explicit confirmation -> archive/activate/delete transaction. Only reusable preferences/approved claims have lifecycle controls; company-classification mirrors are maintained through company/relationship source editors. Existing mail, current classifications, relationship facts and audit history are not deleted. Private RAG already requires active status. Path learning now also requires a matching active `path-edit:{id}` memory instead of unconditionally replaying modification history. Deleted or archived path preferences cannot re-enter through that history reader. Legacy edits without a matching memory are conservatively excluded. In-flight contexts and already generated drafts are not retroactively rewritten.

No new schema, embedding or generation calls. Deletion removes the memory record, not source material, after an explicit irreversible-action warning. Source reprocessing may create new memory and is not a permanent forget/blocklist. Create/edit, provenance links, full lifecycle auditing for workspace-less records and downstream consumption telemetry remain pending. Five focused tests, TypeScript and targeted lint validate this stage; authenticated UI/real-database interaction QA remains outstanding.

### Stage 4a: search task visibility

Task center -> owner-scoped assistant actions (50 per page) -> page-local country/status filters -> `/tasks/{id}` -> owner-checked search detail. Conversation cards link to the same detail component. Counts distinguish missing from measured zero, qualified from persisted and completed-shortfall from target met. Country-library links explicitly include other tasks' results. List projects only result counters; original request appears on detail. No search/retry/model action is triggered. Active pages poll every five seconds, pause when hidden and refresh on visibility return; terminal lists use manual refresh. Contact enrichment mounts only when expanded.

This stage does not yet unify strategy, relationships, sending and all contact history into one task model. Per-stage live logs, task-specific company lists, budget/cost breakdown and safe stop/resume remain pending. Detail is explicitly a page-load snapshot. Validation: four mocked API/count tests, TypeScript and targeted lint; no live authenticated browser QA.

### Stage 3a: opportunities and explicit outbound mail

Owner workspace -> seven-stage board/list -> next action/date or manual Contacted -> canonical persisted company. No team owner. SMTP acceptance advances only early stages to Contacted and protects that state from search refresh; later stages are never downgraded. Sent summaries show first/latest acceptance and follow-up counts, distinct from manual contact.

Owner mailbox -> explicit SMTP verification -> reviewed single recipient/subject/body -> encrypted sending reservation -> one SMTP call -> sent/failed/unknown receipt. Owner/key and owner/content uniqueness prevent resubmission after refresh. Uncertain sends are locked, not retried; acceptance does not establish delivery/read. Owner-only history supports original-mail expansion and reuse for another contact with recipient cleared. Follow-up selects original sender/recipient and explicitly invokes existing Kimi with an 1,800-token output cap; no search or strategy regeneration. User edits and separately confirms sending with reply headers linked to the parent.

Migration 038 applied locally. Verification: 11 focused tests, TypeScript and targeted lint, without real SMTP delivery or paid inference. Remaining: authenticated visual/live-mailbox QA, unknown-receipt reconciliation, full conversation/private style-memory retrieval, durable draft usage linkage and complete failed-call model metering. History caps at 100 messages per company. This is not completion of the full PRD.

Stage 2a: user-channel relationships replace the legacy map. Stored edges are owner/country scoped and require two workspace members in the requested country. Pending, user-confirmed and user-rejected changes persist with audit history and a relationship-scoped private-memory record; users cannot label their own submission evidence-supported. Same-direction/type saves update the existing edge. All current-market company nodes are reachable by scroll/search, with no fixed 5+8 cap. Manual company creation deduplicates owned domains across countries and names within a country; website is optional, and new records remain unassessed. Existing shared records are not overwritten; user-specific display/classification lives in workspace overrides. Relationship decisions now enter development strategy context, including rejected states. No automatic search, scoring or email sending occurs.

Validation: migration 037 applied; three schema/domain tests passed; typecheck and targeted lint passed. Database smoke verified insert, owner read and other-user invisibility under the application role, rolling back all test writes. Browser automation exposes no browser surfaces in this session, so visual and authenticated interaction QA remain unverified. Cross-country duplicate domains currently require opening the original country; the legacy one-workspace-company membership cannot represent the same company in multiple countries independently. Relationship edit of type/endpoints creates another edge; users should reject the old edge when replacing it. Group collapse/zoom, relation freshness, automatic analysis and complete detail UI remain pending.

Stage 1c: six business columns now show company, primary role, account tier, current score, selected cooperation path and stage; evidence confidence lives in detail. Missing paths display unanalysed. Empty results are explicit. Evidence older than one calendar year is flagged using the latest dated Verified/Corroborated source, excluding inference and future/invalid timestamps. One freshness test, typecheck and targeted lint passed. Fine-grained status filters, timestamps from persisted qualification and UI integration verification remain open.

Stage 1b implemented: role/account/path editing saves owner-scoped JSON overrides on workspace_company, with audit history and company-scoped private memory in one transaction. A role change invalidates score applicability and repairs incompatible account tiers. API returns persisted company state; UI does not optimistically claim a failed save. Development context merges overrides and current workspace fields, and excludes stale assessment/handoff. Company-classification memory is excluded from broad preference RAG; it is applied directly only to its company. Migration 036 applied successfully. Five domain/navigation tests, TypeScript and targeted lint passed. Array-generated map links were removed. Relationship CRUD, compact list redesign and all later stages remain pending.

1. Finish compact lead list, task linkage, role/score/path detail and manual persistence.
2. Implement relationship storage/maintenance and manual company creation.
3. Single-user opportunities, outbound email, historical messages and follow-up Agent.
4. Unified task center, memory management, mailbox learning and final integration.

All stages must update the PRD status and efficiency ledger, inspect diffs, run appropriate checks and push verified commits. No customer email is sent during implementation testing.
## 2026-09-11 completion continuation: persisted UI and safe recovery

Country opportunities now have independent URLs. Global overview uses actual company counts, not fabricated coverage percentages. Lead partitions/advanced score, path, stage and freshness filters reuse stored records. Bulk changes serialize owner-checked existing mutation calls; failed rows remain selected, and next-action forms stay open on failure. Company detail has overview, historical scoring policy/dimensions/evidence and development tabs. Saved strategy is loaded without generation; asynchronous generation responses cannot overwrite another selected company. Legacy placeholder overview/drawer and notification counts were removed. Relationship map adds role grouping visibility, zoom and evidence freshness.

Contact lookup now reserves a tenant/company/provider cache before a paid call, persists contact/email records and task status, and reuses completed results even when old. Explicit re-verification is required to spend again. Running calls cannot be duplicated; ambiguous failures are not automatically retried. Provider-reported emails are not represented as independently Agent-verified. Migration 040 is applied. A crashed running reservation still needs operational reconciliation; it is deliberately not silently retried.

Search tasks support requested pause at stage entry, not cancellation of in-flight provider work. Migration 041 is applied. Failed/paused execution resumes the existing LangGraph pending stage using null input instead of resetting arrays and credits. Completed checkpoints reuse the result if downstream receipt handling failed. Checkpoint owner/action identity is verified. A pause arriving during final persistence does not reclassify committed results as failed. User confirms possible subsequent cost before resume. Read-only progress displays checkpoint stage metrics/usage, not uncommitted in-flight cost.

Validation: all 461 tests across 103 files, TypeScript and production build passed; lint has zero errors and 11 pre-existing warnings. Migrations 040–041 applied. No paid provider/SMTP calls or authenticated visual QA claimed. Remaining checklist remains authoritative; this stage is not full PRD completion.
## 2026-09-11 continuation: mail management and task drilldown

Verification for this stage: all 469 tests in 106 files, TypeScript and production build pass. Lint remains zero errors with 11 existing warnings. Testing did not send mail, delete user mail, disconnect a real account or call a paid model. Live mailbox/provider acceptance and authenticated visual QA are not certified by these checks.

Outbound history is paginated at 50 records. User-confirmed reconciliation applies only to unknown/stale-sending records, labels its source and never calls SMTP. Follow-up retrieves at most eight same-sender/recipient ancestors and four active workspace/market/role-scoped style memories; original body and ancestor excerpts are bounded. This is sent-mail context, not fabricated recipient replies. Imported replies are not yet associated with company threads.

Mailbox disconnect clears credentials and retains local records; deleting local imported mail retains confirmed knowledge by default and preserves disabled mailbox identity for outbound receipt references. Neither operation deletes remote mail. Sync exposes inbox/sent scope and date range; explicit historical import skips known UIDs and does not advance incremental cursors. Individual message deletion and company association remain open.

Leads now use stored assessment eligibility for partitions, retain unknown legacy qualification as review-required, and offer record-created/workspace-updated sorting. Visible workspaces refresh stored results every 30 seconds, guarding against stale refresh overwriting in-flight edits. Task center opens all four task types in a common drawer; its separate URL reuses the same detail view. Search candidate diagnostics are bounded to 100 records with truncation disclosed. Score presentation reads saved policy weights; no current-policy substitution.
## 2026-09-11 continuation: local knowledge, relationship analysis and mailbox links

Knowledge management now has separately scoped private/shared/public-evidence lists; shared evidence remains read-only. Private-document deletion does not delete raw mail. Upload conflicts require confirmation before replacement; an optimistic hash check under a per-document lock rejects concurrent overwrite. New uploads preserve exact content revisions; legacy replaced content is reconstructed from saved chunks and explicitly labelled (not claimed a byte-identical original). History deletion follows document deletion. Migrations 042–044 are applied.

Imported mailbox messages store a domain-matched company only when exactly one owned candidate matches external party domains. Ambiguity remains unresolved; explicit assignment/unlink is preserved across re-import. Local-message deletion is separate from confirmed knowledge, blocks analyzing messages and does not touch remote mail. Message/company association is not by itself proof that a reply belongs to a particular outbound thread.

Explicit directed relationship analysis uses the configured routine DeepSeek/resilient provider, current saved Verified/Corroborated evidence, at most two suggestions and exact-quote validation. It does not add searches or assert actual cooperation automatically. Unchanged input versions reuse a tenant cache; failures/in-flight records are not automatically paid again. Rejections capture evidence fingerprints; unchanged evidence cannot regenerate rejected types. Historical rejections without fingerprints remain suppressed conservatively. Suggestions remain pending until user saves. Relationship task attempts/results/metrics are visible as a fifth task type. Focus filters show one company and its direct neighbours.

Verification: real application-role reads for workspace eligibility and available task kinds passed. Temporary contact-cache and analysis inserts were visible to the owner and invisible to another tenant, then rolled back. Real MemorySaver pause/resume test verifies no duplicate discovery or credit reset. Final regression including revision storage: 474 tests / 108 files passed, TypeScript/build passed, lint zero errors and 11 existing warnings. No paid inference or live mail delivery performed.

## 2026-09-11 pause checkpoint: local actions and follow-up reuse

Kimi intent prompt v1.2 adds product-action routing for stored-company lookup, strategy and follow-up entry points. A tenant-scoped literal name/domain query with optional country/role filters returns at most 20 choices. The user chooses the company, then uses the existing strategy/mail workflow; no automatic generation, paid search or sending. Assistant tasks reuse the Task Center drawer. Search/contact diagnostics paginate by 50. New completed searches retain structured stop reason. New searched companies enter Discovered, not the user's development shortlist; historical records are not mass-reclassified.

Saved strategy responses compare a business-context fingerprint (role, tier, chosen path, supply model, summary, country and evidence). Changed or legacy-unknown snapshots warn rather than regenerate. Relationship/private-knowledge versions are not yet fingerprinted. Follow-up drafts are retrievable from encrypted generation audits (latest ten per parent). Selected draft IDs are owner/parent validated before send reservation; a separate usage event links draft to reservation, not delivery. Edits do not overwrite the original generated snapshot.

Follow-up excludes the repeated parent from ancestor excerpts. Up to four same-contact incoming messages are selected from the latest 50 encrypted, company-associated inbound records; these are correspondence, not guaranteed replies to the chosen thread. Private style remains scoped/bounded. Generation does not trigger mailbox sync. Older unassociated messages may need manual association.

Paused at user request. See `RESUME_PRODUCT_UI_2026-09-11.md`. Regression: 479 tests / 110 files and application-role local-lookup/task SQL plus cache/analysis RLS passed. No paid inference, live SMTP delivery or authenticated visual QA performed.
