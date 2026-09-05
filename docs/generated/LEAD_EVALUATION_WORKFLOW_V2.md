# Cudy 销售线索端到端工作流 v3.1.0

> 本文档由 `scripts/generate-lead-workflow-doc.mjs` 自动生成。请修改版本化配置或实现代码，不要直接编辑生成文件。

- 运行时策略版本：3.1.0（基础流程定义 2.3.2）
- 评分策略版本：2.0.0
- 成本质量策略版本：3.0.1
- 配置指纹：`3525b92ba9033dc58f2908ac10f8b055c89f68cb6f244a32b573fba9a3a80f88`
- 范围：From the user's natural-language market-development request and workspace context to ranked companies, editable cooperation paths, development strategy, outreach email, and private-memory learning from user edits.

## 一、从用户输入到最终输出的总流程

```mermaid
flowchart TD
  S1["User request and editable business intent"] --> S2
  S2["Workspace context, shared knowledge and private memory"] --> S3
  S3["Market playbook and search plan"] --> S4
  S4["Multi-source candidate discovery"] --> S5
  S5["Fresh public evidence acquisition"] --> S6
  S6["Entity correction, atomic facts and primary-role decision"] --> S7
  S7["Research-depth routing"] --> S8
  S8["Claim-linked model evidence packet"] --> S9
  S9["Role-aware scoring and possible cooperation paths"] --> S10
  S10["Selective blind review and disagreement judge"] --> S11
  S11["Ranking, recommendation and sales-account tier"] --> S12
  S12["Restricted handoff and persistence"] --> S13
  S13["User presentation and cooperation-path override"] --> S14
  S14["Development strategy generation"] --> S15
  S15["Development email generation and validation"] --> S16
  S16["User edits, feedback and long-term learning"]
```

最终输出不是单一分数，而是：证据约束下的公司身份与角色、评分、可能合作路径、账户等级、开发策略、开发信，以及用户修改后形成的私有长期学习信号。

## 二、不可破坏的核心原则

- The original search channel is provenance only and never determines the final primary role or cooperation path.
- Only current-run or freshness-validated evidence may affect scoring.
- Unknown evidence is not negative evidence.
- Product and use-case fit is evaluated against the best enabled Cudy product track and the candidate role's actual target customers.
- User-confirmed knowledge has higher priority than ordinary retrieval, while shared knowledge and user/workspace memory remain isolated.
- Cooperation paths, roles and evidence restrictions travel into development strategy and email generation.
- User edits to paths and outreach are retained as private learning signals, not written into the shared knowledge base.
- OpenAI and Anthropic generation is routed through the pinned OpenRouter HTTPS gateway; embeddings, Kimi, DeepSeek and Gemini retain their dedicated providers.
- Every potentially overlapping task must create and consume a versioned cache at first execution; downstream stages receive exact evidence IDs, role corrections and explicit missing-evidence gaps.

## 三、模型调用路由

| 阶段 | 用途 | 默认模型 | 升级/回退 | 调用策略 |
|---|---|---|---|---|
| `01-user-input` | Intent classification and execution planning | KIMI_INTENT_LIGHT_MODEL; default kimi-k2.6 | KIMI_INTENT_MODEL or KIMI_MODEL; default kimi-k3 for materially complex planning | Light Kimi runs every turn; deterministic parsing is failure fallback only; harmless confidence/count formatting is normalized before schema validation |
| `02-context-memory` | Local-database RAG query and memory embeddings | EMBEDDING_MODEL; default text-embedding-v4 | No generative fallback | Required for vector retrieval; source documents remain in the local database |
| `03-playbook` | Market playbook and search-query planning | LEAD_PLANNER_MODEL or OPENAI_GENERATION_MODEL; default openai/gpt-5-mini through OpenRouter | Deterministic playbook with required role-family coverage | Cached standard playbook; light Kimi checks template fit; complex non-standard tasks use Kimi-k3 planning |
| `04-discovery` | Lightweight candidate existence, relevance and category gate | DEEPSEEK_DISCOVERY_GATE_MODEL; fixed default deepseek-v4-flash and never inherits a Pro global routine setting | Same-tier resilient provider fallback; unavailable batches are held for downstream evidence, never upgraded to Pro | Batches of up to 10 after direct lightweight homepage fetch; compact semantic signals only, with deterministic pass/hold/reject |
| `06-correction-role` | Entity correction, atomic facts and primary-role analysis | DEEPSEEK_MODEL; default deepseek-v4-flash | DEEPSEEK_ESCALATION_MODEL; default deepseek-v4-pro; deterministic fallback is retry-only | Routine batches; upgrade only for expected score change >=8 or a resolvable critical-state change |
| `09-scoring-paths` | Role-aware score and possible cooperation paths | DEEPSEEK_MODEL; default deepseek-v4-flash | DEEPSEEK_ESCALATION_MODEL; default deepseek-v4-pro | Routine batches; confidence, alternative paths and Top-N position never trigger upgrade alone |
| `10-review` | Blind secondary review and disagreement judgment | LEAD_REVIEW_MODEL default openai/gpt-5.6-terra; LEAD_JUDGE_MODEL default openai/gpt-5.6-sol through OpenRouter | DeepSeek review adapter using deepseek-v4-pro when explicitly routed | Selective only; skipped for the search-tool leaderboard where cooperation-path review cannot affect the metric |
| `14-strategy` | Path-specific development strategy | KIMI_OUTREACH_MODEL or KIMI_MODEL; default kimi-k3 | Restricted template fallback | One call per generated strategy |
| `15-email` | Path-specific development email | KIMI_OUTREACH_MODEL or KIMI_MODEL; default kimi-k3 | Restricted template fallback | One call per generated email, plus one bounded retry only for invalid JSON/schema output |
| `16-feedback-memory` | User-feedback revision and reusable private-memory extraction | CLAUDE_OUTREACH_MODEL or CLAUDE_MODEL; default anthropic/claude-sonnet-4.6 through OpenRouter | Keep the user draft and record a failed memory event | One call per requested revision; text-embedding-v4 embeds accepted private memory |

无生成模型阶段：多源搜索与网页抓取、研究深度确定性规则、证据包压缩、新鲜度校验、排行榜、账户等级、handoff 组装和持久化。

意图识别每轮先调用轻量 Kimi 检查标准模板是否足够；仅在多市场、多目标、冲突约束或非标准复杂规划时升级 Kimi-k3。Lead 纠偏和评分以当前 DeepSeek 模型为主，只有预计改变总分至少 8 分或关键状态且高能力模型可解决时升级。主模型与升级模型相同则合并调用。最多允许两个显式批准、同级能力、同 Schema、同数据权限的跨公司 fallback；Embedding 不设置 fallback。

## 四、逐步输入、输出与策略

### 1. User request and editable business intent

阶段 ID：`01-user-input`

输入：

- Natural-language request
- Target country/market
- Desired count
- Optional roles, products, constraints and nominated companies

输出：

- LeadSearchPlan
- Explicit opportunity targets
- Coverage mode
- Verified-only flag
- Kimi requested/actual model, success state, usage availability and token/latency/retry usage
- userId
- workspaceId
- actionId
- graphThreadId

策略：

- Preserve explicit user constraints
- Treat requested roles as search intent, not final classification
- Agent, Brand Owner and OEM/ODM are explicit-only; explicit English, Spanish or Chinese exclusions override keyword mentions
- Never route OEM/ODM supplier sourcing
- Mark nominated companies for deep research
- Record the light Kimi call and any K3 escalation separately instead of attributing only the final model
- Normalize non-critical objective and coverage-mode synonyms deterministically; unknown coverage mode uses the existing auto default
- Normalize numeric strings, percentages and bounded descriptive confidence without replacing Kimi semantic intent; nonnumeric target counts fall back to the user-request parser
- For frozen evaluations, require the recognized roles to stay inside the requested category, then execute the complete frozen role set
- Preserve failed-call telemetry before deterministic fallback; formal evaluations reserve budget when provider usage is unavailable

失败与回退：Reject only structurally unusable requests; do not silently invent a target market or role, and do not discard paid-call telemetry when falling back.

流向下游：

- Knowledge retrieval
- Workflow checkpoint identity

### 2. Workspace context, shared knowledge and private memory

阶段 ID：`02-context-memory`

输入：

- LeadSearchPlan
- Shared product/company/industry RAG
- User-confirmed workspace knowledge
- Private cooperation-path memory
- Private email-style and edit memory

输出：

- LeadRagCitation[]
- Embedding request/token/latency usage
- CooperationPathMemory[]
- OutreachKnowledge[]

策略：

- Keep shared and private stores physically/logically separated
- Give user-confirmed knowledge priority over ordinary retrieval
- Never let private edits contaminate the shared Cudy knowledge base

失败与回退：Pre-search gate blocks lead discovery when required product, company or industry context is missing or uncorroborated.

流向下游：

- Market playbook
- Path recommendation
- Development strategy
- Email style

### 3. Market playbook and search plan

阶段 ID：`03-playbook`

输入：

- LeadSearchPlan
- RAG citations
- Private cooperation-path memory

输出：

- Market hypothesis
- Enabled product angles
- Preferred traits
- Exclusions
- Role-family search queries

策略：

- Use confirmed Cudy positioning and competitors
- Do not average all product families
- Keep original role lanes only as discovery coverage
- Use the versioned active category route; the playbook supplies market language and product focus without duplicating provider planning

失败与回退：Use a deterministic playbook fallback with warnings when the model cannot return a valid plan.

流向下游：

- Candidate discovery
- Qualification context

### 4. Multi-source candidate discovery

阶段 ID：`04-discovery`

输入：

- Market playbook
- Role-family queries
- Target count
- Active hybrid-search policy

输出：

- Raw candidate names/domains
- Discovery provider and lane provenance
- Initial URLs/snippets
- Light-gate pass/hold/reject
- Call fingerprint and query-cluster key
- Per-call request, grounding-query, cache, yield, cost, latency, retry, failure-class and discard telemetry

策略：

- Run the confirmed category-specific provider tracks with shared real-time deduplication
- Use DeepSeek Flash only for a compact lightweight gate after direct homepage text; never upgrade this gate to Pro
- Treat a requested count as final valid in-role companies and feed evidence/role outcomes back into dynamic search rounds
- Plan the first candidate buffer at 1.5 times the requested count, then adapt from conservative observed end-to-end yield
- Start national retail, E-tail and Google Places local retail together in configured low-SEO markets
- Use local-language commercial terminology and query clusters; expand mature markets to local coverage only after a measured gap
- Stop a track only after two completed no-value batches; provider failures never count as no-value
- Serialize calls sharing one provider while different provider mechanisms remain concurrent, so exclusions update before the next same-provider query
- Tavily is forbidden in candidate discovery and remains evidence-only
- Gemini Product is not a default Retail or Reseller route
- Provider score and rank cannot enter final value scoring
- Canonicalize domains and retain first, duplicate and assisted discovery provenance

失败与回退：Classify authentication, quota, rate-limit, timeout, transport, HTTP, invalid-response and configuration failures. Non-transient failures open a scoped circuit; bounded same-tier complementary alternatives continue. Failed calls are cached briefly but never counted as empty successful searches. A gate-model failure holds candidates for evidence instead of inventing rejection or escalating capability.

流向下游：

- Fresh evidence acquisition

### 5. Fresh public evidence acquisition

阶段 ID：`05-evidence`

输入：

- Passed or held discovered candidates
- Official-site and targeted public search queries
- Evidence freshness policy

输出：

- Immutable evidence snapshot
- capturedAt
- contentHash
- sourceType
- freshnessStatus
- evidenceRunId
- Explicit missing-evidence list
- Tavily search/extract credits, attempts, retries and latency

策略：

- Reuse current public-evidence-library material before spending search credits
- Cold-start evaluation mode can explicitly disable both historical evidence reads and evidence-library writes while preserving within-run cache and deduplication
- Old-run evidence is discovery-only until reacquired or validated
- Use Tavily only for targeted evidence discovery/extraction, not candidate discovery
- Prefer official and independent public sources
- Search for defining business actions, product tracks, target customers, size and cooperation signals
- Pass exact evidence IDs and missing gaps downstream; a later Agent may supplement only a material unresolved gap

失败与回退：Failed retrieval becomes unknown; it never becomes a negative fact.

流向下游：

- Entity correction
- Role classification
- Freshness audit

### 6. Entity correction, atomic facts and primary-role decision

阶段 ID：`06-correction-role`

输入：

- Fresh evidence snapshot
- Submitted candidate identity and discovery roles
- Exact evidence IDs
- Explicit missing-evidence list

输出：

- Corrected company/domain
- Atomic fact ledger
- All supported roles
- Primary role or Hybrid/Unresolved
- Correction confidence
- Versioned public role-correction cache entry

策略：

- Reuse an exact evidence/prompt/taxonomy role-correction cache hit before any model call
- No upward-priority rule
- Agent independently decides the primary business role
- Distributor requires evidence of supplying downstream channel partners
- A company may hold multiple supported roles
- Non-standard model labels are normalized without discarding semantic role evidence
- Keep public role-correction knowledge separate from private user/workspace memory

失败与回退：Ambiguity escalates to the high-capability model; deterministic fallback is retry-only and not externally publishable as a resolved identity.

流向下游：

- Research depth
- Role-aware scoring
- Cooperation paths

### 7. Research-depth routing

阶段 ID：`07-research-depth`

输入：

- Corrected role
- Positive size evidence
- Product relevance
- User nomination
- Conflicts

输出：

- deep
- standard
- limited

策略：

- Deep research for global/national/valuable or nominated companies
- Standard research for ordinary viable candidates
- Limited research only for positively identified long-tail candidates
- Sparse web presence alone does not prove small size

失败与回退：Long-tail candidates may be held after targeted searches fail; strategic companies must not be downgraded merely because their channel structure is complex.

流向下游：

- Evidence budget
- Model routing
- Search stopping rule

### 8. Claim-linked model evidence packet

阶段 ID：`08-evidence-packet`

输入：

- Current evidence
- Atomic findings
- Cost-quality policy

输出：

- All finding-linked evidence
- Small relevance-ranked context set
- Compacted excerpts

策略：

- Never remove evidence referenced by a finding
- Remove stale/discovery-only material
- Deduplicate unlinked context
- Keep keyword windows for products, roles, customers, scale and procurement

失败与回退：If compaction cannot retain every cited evidence ID, stop rather than score with an incomplete fact ledger.

流向下游：

- Primary scoring
- Independent review

### 9. Role-aware scoring and possible cooperation paths

阶段 ID：`09-scoring-paths`

输入：

- Corrected candidate
- Atomic findings
- Evidence packet
- Cudy playbook
- Private path memory
- Versioned scoring policy

输出：

- Seven dimensions
- Total score
- Eligibility
- Score confidence
- At most two compact possible paths in normal product mode
- Selected path in normal product mode

策略：

- Product/use-case fit 50
- Path/influence 15
- Same-primary-role scale 15
- Execution 10
- Opportunity/risk 10
- Use the best enabled product track
- Use role-specific target-customer and scenario criteria
- Normal product mode uses only the five-path taxonomy and computes path FitScore deterministically from 30/25/20/15/10 sub-scores
- Search-quality evaluation mode uses a score-only schema: score procurement/influence from role evidence and emit no paths, strategy, email or contacts
- Do not output path Confidence
- Unknown is not zero
- Path memory is guidance, not unsupported public fact

失败与回退：Unsupported evidence IDs and paths are removed; schema failures retry only the invalid candidate and reuse checkpoints.

流向下游：

- Independent review
- Ranking
- Development handoff

### 10. Selective blind review and disagreement judge

阶段 ID：`10-review`

输入：

- Primary assessment
- Evidence packet
- Review-routing policy

输出：

- not-required
- secondary-confirmed
- judge-resolved
- targeted-research-required
- review-failed

策略：

- Review only severe deterministic conflicts and unresolved critical states
- Do not review solely for low confidence, alternative paths, generic warnings or Top-N position
- Do not spend high-capability review on non-actionable long-tail research holds
- Judge only outcome-sensitive disagreement of at least 8 points or a critical state

失败与回退：Retain a valid primary assessment when review service fails unless a severe unresolved trigger makes publication unsafe.

流向下游：

- Final assessment
- Research queue
- Cost telemetry

### 11. Ranking, recommendation and sales-account tier

阶段 ID：`11-ranking-account`

输入：

- Reviewed assessments
- Primary roles
- Eligibility
- Configurable thresholds

输出：

- Ranked companies
- Recommendation priority
- Sales account tier

策略：

- Account tier does not alter score
- KA is only for downstream candidates
- Tier-1 distributors use Strategic/Priority/Standard/Long-tail Distributor
- Scale is compared within the same primary role

失败与回退：Any tier-1 Distributor/VAD assigned KA fails the deterministic quality gate.

流向下游：

- User results
- Sales workspace
- Handoff

### 12. Restricted handoff and persistence

阶段 ID：`12-handoff-persist`

输入：

- Corrected candidate
- Final assessment
- Review
- Evidence ledger

输出：

- LeadDevelopmentHandoff
- Externally usable facts
- Internal interpretations
- Do-not-claim list
- Personalization hooks
- Quality flags

策略：

- Keep handoff within transport budget
- Only supported facts may be used externally
- Carry role and at most two possible paths to downstream agents
- Anchor downstream execution to selectedPathId unless the user overrides it

失败与回退：Email generation is disabled when the handoff is not ready for external use; strategy may still be generated with unknowns.

流向下游：

- Sales UI
- Development strategy Agent
- Email Agent

### 13. User presentation and cooperation-path override

阶段 ID：`13-user-result-edit`

输入：

- Ranked results
- Evidence-linked reasons
- Possible paths
- Selected path

输出：

- User-visible company assessment
- Optional selectedPathId override
- Owner/next action updates

策略：

- Show the Agent recommendation but allow the user to change the cooperation path
- Preserve who changed what and when
- Do not rewrite public evidence when the user changes a commercial preference

失败与回退：Reject a selectedPathId that is not one of the candidate's generated paths.

流向下游：

- Private path memory
- Development strategy
- Email

### 14. Development strategy generation

阶段 ID：`14-strategy`

输入：

- Full restricted handoff
- Selected cooperation path
- Role
- Risks
- Unknowns
- Private path memory
- Outreach knowledge

输出：

- Positioning angle
- Stakeholder sequence
- Value proposition
- Objection handling
- CTA strategy

策略：

- Evaluate all viable paths
- Anchor to the selected path
- Use different strategy for distributor, downstream channel, retail, operator and project/specification routes
- Keep unsupported claims internal or explicitly unknown

失败与回退：Fallback strategy remains inside the same handoff fact boundary.

流向下游：

- Development email Agent

### 15. Development email generation and validation

阶段 ID：`15-email`

输入：

- Development strategy
- Selected path
- Allowed lead facts
- Target contact
- Private email-style preferences

输出：

- Subject options
- Email body
- Evidence markers
- Generation metrics

策略：

- Use path-specific templates and CTA
- Every target-company factual sentence must stay inside the allowed-fact boundary
- Use approved style memory without copying unsupported company claims

失败与回退：Invented evidence IDs, missing required markers or use of do-not-claim facts rejects the draft and triggers bounded revision/fallback.

流向下游：

- User review
- Draft persistence
- Sending workflow

### 16. User edits, feedback and long-term learning

阶段 ID：`16-feedback-memory`

输入：

- Manual email edits
- Feedback instruction
- Path override
- Approved final draft

输出：

- Outreach edit events
- Email-style preference memory
- Cooperation-path preference memory
- Audit trail

策略：

- Store only valuable reusable preferences
- Scope memory to user/workspace
- User-confirmed marketing phrasing may be reused as approved messaging but does not become public scoring evidence
- Never write private memory into shared RAG

失败与回退：Memory extraction failure does not block saving the user's draft; it records a failed memory event for retry.

流向下游：

- Future playbooks
- Future path recommendations
- Future strategy and email generation

## 五、当前评分标准

| 一级维度 | 分值 | 细分规则 |
|---|---:|---|
| 产品与应用场景匹配 | 50 | 产品家族 25；客户与场景 15；定位兼容 10 |
| 合作路径与采购影响力 | 15 | 当前路径 5；采购控制 6；选择/市场影响 4 |
| 同主角色规模与覆盖 | 15 | 相关业务规模 6；市场覆盖 5；渠道/客户网络 4 |
| 执行与赋能 | 10 | 商业运营 4；技术服务 3；市场激活 3 |
| 机会与风险 | 10 | 合作开放度 4；时机 3；竞争与结构风险 3 |

产品匹配方法：`best-enabled-track`；未知证据规则：`unknown-not-zero`。规模只在相同主角色内横向比较。

## 六、成本控制参数

- 优化目标：模型 token 再降 40%，付费搜索/提取额度至少降 30%。
- 证据预算：Limited 2250、Standard 5500、Deep 8000 tokens。
- 二次引用：预计改变总分至少 8 分或改变关键状态；仅提高少量置信度不允许。
- 主评分证据包：保留全部 finding 引用，另加最多 2 条上下文；单条摘录最多 1000 字符。
- 主评分批次：最多 42000 个序列化输入字符，同时仍受单批公司数上限约束；超限自动拆批，单候选不可再拆时保留为独立批次。
- 独立复核证据包：保留全部 finding 引用，另加最多 1 条上下文；单条摘录最多 800 字符。
- 路径最多 2 条；通常显示 FitScore ≥65，全部低于门槛时只显示最高一条；不输出路径 Confidence。
- Judge 总分差阈值：8。
- 随机盲审比例：0%。
- JSON Schema 只在最高优先级 system prompt 中发送一次，避免在 user prompt 重复整份结构定义。
- 高并发只降低墙钟时间，不降低 token；真正的成本控制来自证据压缩、选择性复核、模型路由、缓存和单候选重试。
- 标准 playbook 与已完成评分使用租户隔离的精确依赖缓存；全命中时不得发送空模型请求。证据内容/新鲜度、纠正事实、评分策略校验和、Prompt、任务目标或用户路径记忆变化时，仅重算受影响候选。

## 七、质量门禁

- strategicCandidateRecallPercent: 100
- primaryRoleAgreementPercent: 97
- eligibilityAgreementPercent: 97
- offlineToolTopNOverlapPercent: 90
- maximumMeanAbsoluteScoreDifference: 3
- tier1DistributorKaErrors: 0
- invalidEvidenceUsedForScoring: 0
- validEvidenceReferencePercent: 100
- privateMemoryLeakage: 0
- maximumTokenIncreasePercent: 5
- targetTokenReductionPercent: 40
- targetPaidSearchCreditReductionPercent: 30

任何成本优化必须在同一冻结证据快照上通过这些门禁，未通过时自动回退完整证据或高能力路径。
正式产品不以 Top-N 作为升级依据；Top-N ≥90% 只用于离线搜索工具排行榜。代表性 A/B 每类只选 1–2 家，MAD 上限为 3 分，不自动全量重跑 207 家。

## 八、离线工具搜索结果评测模式

- 工具排行榜只消费冻结的搜索结果与证据快照，不追加搜索、不补充证据，也不生成合作路径、开发策略或开发信。
- 模型只输出主角色、门禁语义判断、七项语义子分和精简证据说明；总分、状态归一化、工具映射与榜单聚合均由程序确定性完成。
- 同一规范化公司只评分一次，再把结果映射回各搜索工具的候选出现记录，避免跨工具重复消耗模型 token。
- 固定角色赛道容量、缺位记零及 Top-N 保留率只用于离线工具质量比较，不得成为正式产品的搜索停止、模型升级或候选淘汰依据。
- 每次评测保存冻结输入指纹、禁止调用项、实际模型、token、请求次数、重试、有效输出、下游采用率和丢弃原因；发布前由程序清理无效证据引用并执行完整性门禁。

## 九、搜索、网页与 PDF 获取策略

- 已知官网 URL：先定向 Extract；Search 用于发现 URL，Extract/解析器用于读取正文，模型只看与当前缺口相关的片段。
- Limited：Basic + raw content，最多 1 个查询组，不重复 Extract。Standard：Basic 不带 raw，提取 2–4 页。Deep：最多 3 个查询组，仅在实体冲突、复杂集团或 Basic 失败时用 Advanced；Crawl 仅限复杂站点且有边界。
- PDF 先做价值门禁：≥60 才提取，45–59 只抽样，低于 45 跳过；每次升级提取方式前重新评估价值。
- PDF 默认 pypdf；表格转 pdfplumber；扫描件仅对选定页用 Tesseract；仍有关键缺口时才对选定页使用高能力多模态模型。

## 十、五类合作路径与流向

- Direct Tier-1 Supply
- Distributor-Mediated Supply
- Direct Downstream Channel Supply
- OEM/ODM
- Other

路径 FitScore 由模型给出五个语义子分、程序求和：角色/结构 30，用户阶段/供货 25，产品/客户/场景 20，采购/影响 15，执行可行性 10。角色与路径展示给用户且可修改；修改写入私有长期记忆，并与识别角色、候选路径一起输入后续开发策略和开发信 Agent。

## 十一、知识、证据与长期记忆边界

| 数据 | 存储范围 | 可影响评分 | 可影响策略/邮件 |
|---|---|---:|---:|
| Cudy 产品、场景、客户与竞品确认知识 | 共享知识库 | 是 | 是 |
| 普通 Web/RAG 证据 | 独立 public_evidence 库及版本化快照 | 是；陈旧只提醒，不自动 invalid | 是，须在 handoff 允许范围内 |
| 用户确认的工作区知识 | 用户/工作区私有库 | 按知识策略；营销措辞不作为公共事实 | 是 |
| 用户合作路径修改 | 用户/工作区私有路径记忆 | 不直接改历史分数 | 是，影响未来路径推荐 |
| 用户开发信修改 | 用户/工作区私有邮件风格记忆 | 否 | 是 |

## 十二、成本与产出利用率遥测

每个阶段记录输入/输出数量与字节、生成/有效/下游采用量、Token、实际模型、fallback、搜索额度和依赖指纹。事件生命周期为 generated、valid、retrieved、cited、decision-used、displayed、selected、edited、executed。系统只自动记录优化机会，不自动应用；私有正文、Prompt 和供应商原始响应不进入 GitHub 文档或聚合遥测。

## 十三、实现文件指纹

以下指纹用于审阅代码是否发生变化。GitHub 自动同步任务会在相关实现或配置修改后重新生成本文档。

| 文件 | SHA-256 |
|---|---|
| `config/lead-scoring/policy-v2.0.0.json` | `0039203aafb29ec73e4beb10f72dc5ec114785fb4c5f311c7b425de0d451fc1b` |
| `config/lead-search/hybrid-search-v1.0.0.json` | `f73cff95ae44a1bcff28cce31f352de70338872539b7b1e843366d8974044545` |
| `config/lead-workflow/cost-quality-policy-v3.0.0.json` | `90bb896e2fdfd0738296ab4b82dae6bb0f75e1b06d95955f69e4eaaa55a7aae6` |
| `config/lead-workflow/runtime-policy-v3.0.0.json` | `31a0f7030758c373a697c82afc85f31b940c3b9104f8eb9c846aa0249a6e6f4c` |
| `src/app/api/assistant/messages/route.ts` | `04bec90cc3d3f336195e8ab97a5ad4b1ec1e05b95606064225e098e94ed7a5cd` |
| `src/lib/assistant/types.ts` | `063d3688b6343d4c507e95960ed505ad80d8d778e8a22f10b574ec2668f64a9a` |
| `src/lib/assistant/intent.ts` | `cb77a2854f0058d92bf758ce4610d298bc94dde0157ade4f0bd3d05343fad168` |
| `src/lib/assistant/intent-agent.ts` | `811b836f94bbe70a2fe72eccf382cad195fc61eb91bab05852cc49f5bd45b626` |
| `src/lib/rag/openai-provider.ts` | `8d3151fd671b7a791ac81885a91a09a9281be5b3ebd04edcd188f517da3e088d` |
| `src/lib/assistant/service.ts` | `1e2d9719d2937cc3081c3dbddf016d7cd665de1c1e9a88c775d10e3863ec00df` |
| `src/lib/assistant/repository.ts` | `4243485613740437216b7867c0b8b420ea16d555f852397b436fd8a5f5414e67` |
| `src/lib/leads/workflow/graph.ts` | `a0a1b3b36f9b5e83f214c6d3db095c0a3ad18a7b1bd4599313ccaf84ff4a7b39` |
| `src/lib/leads/workflow/jobs.ts` | `1287ad4fdedd2ca838e0592f82e062214465de01bc7c31f68d2529211f558c22` |
| `src/lib/leads/workflow/rag-context.ts` | `1e1ee21e77b90731e849426cd7130de7d1e50ee6aec9f196e44cb642bf81387b` |
| `src/lib/leads/workflow/playbook.ts` | `a83d6fe0edf30c5e0504fbb7e3bdb059b5cdb8a9d8df45dc1756372b7df3e095` |
| `src/lib/leads/workflow/playbook-cache.ts` | `945d3fc727312208650ee7b4e55e33860e7c54f7e3daa939f768952409a1803f` |
| `src/lib/leads/workflow/hybrid-search-policy.ts` | `4c3ec5ff313a5551c68de8fd023deca8cf711d7a80971f52f47127d0f9a8bb87` |
| `src/lib/leads/workflow/candidate-registry.ts` | `a7d9bc2b971f854d7e5e092c6a3b6ccbe7cece0f3b5c0e1eae31f9e247f46cc5` |
| `src/lib/leads/workflow/discovery-gate.ts` | `8269725ccda70dbc4b35c4031a654b0660f5d70073f49d7bd127ed1ae9238c11` |
| `src/lib/leads/workflow/hybrid-discovery-executor.ts` | `09f16564be68bea10db374f0d08c600017cbfb1d360c01c80d90c62284aad4a0` |
| `src/lib/leads/workflow/discovery.ts` | `d0829756f30a16351a68f9e98fef4949549f0b2ff89062157ca75aa79400a2a3` |
| `src/lib/leads/global-search.ts` | `963d07622725531e72d7f1807d4228a23d59d6a320b5d1e508b602bcc05c65db` |
| `src/lib/leads/workflow/evidence-correction-agent.ts` | `d9e7d4c76b496cd19393398dfa712a50b1ef6a2548f3cb596cbfaccd9cf8db60` |
| `src/lib/leads/workflow/evidence-packet.ts` | `1ca9577284952e245a8e8c51ae9fa82472fcbcf0b262ebaa83fc6463f379836f` |
| `src/lib/leads/workflow/qualification-agent.ts` | `00fe467e454c86b2389654fbeacc497fd033bb7b2acae6f52627bf03ee828384` |
| `src/lib/leads/workflow/assessment-cache.ts` | `d7fd5fe0b350aa56eb9fcfb283c2c81a2de9564f88a3ef677631b82d81474fb3` |
| `src/lib/leads/workflow/assessment-review-agent.ts` | `5ad58c980aa7b3642d349aa543a78a54f2695274490809ce00a65bf535dae974` |
| `src/providers/deepseek.ts` | `c9bbe00521915dd27b6c20508cd062ffc494d8f449c10e1085ada48103ed877c` |
| `src/providers/discovery-contracts.ts` | `219328f21ca094e5c96c12b9cd3e638a8244629d7692271ee6b86ea39166143e` |
| `src/providers/discovery.ts` | `a7b93d1d5a8bc6412b70461d93f5c0dc1e412951100688b8ae04cee6e5113337` |
| `src/providers/resilient-ai.ts` | `3fe571fe48f48c0f89ccbf7241ed303b554598243bd8bfa08dc7c2a76c85258b` |
| `src/providers/openrouter.ts` | `b43ba8fdf08602cb7d3567ea88bdc2cfee704de0c1b197cc574abe5e9b89143d` |
| `db/migrations/034_model_account_cash_cost.sql` | `4790c7ad12eda543e197c84ddd77c4a5ce296b7871ccee799f3aa2262684bdbb` |
| `src/providers/tavily.ts` | `e601eb4eae582628dec99f03e9bcbb6fdf38dc68bcf52daf7cad8d58a2e31485` |
| `src/lib/leads/workflow/handoff-assembler.ts` | `606736bdfcced8f3a476a58808b07c65867b75f948c46b66b21354e5102f3827` |
| `src/lib/leads/workflow/persistence.ts` | `9b7cf1bb48facb73efed66db75f3863e6f0544295340125317d9695ab16a78d4` |
| `src/lib/sales/repository.ts` | `ba76e0227ec5c039bb8196df37322b24146b2d64a42af7e364e96dfd3dfdfef9` |
| `src/lib/outreach/graph.ts` | `18dbb0c67613ab49cf69a61267c62d95f7e58da8b11b7beddfb2139aad78c19c` |
| `src/lib/outreach/kimi-agent.ts` | `dd76bb48386350e1df6206385a3e90786249f2ca2a8116552fadd26a8ee94376` |
| `src/lib/outreach/claude-agent.ts` | `ed462d20fbdc983d50ff03bdd6ff42546b8734d430f7ed06428b372c395b373e` |
| `src/lib/outreach/repository.ts` | `9a70ae40ee817385f8bbbb9c9785ffc50efeb24eb4833c2e7fd8a8bfb77286ac` |
| `src/lib/outreach/knowledge-repository.ts` | `59a023091f9adac80d4b502e1b4cf69b9d318bd5a7610112354fb95a8d802557` |
| `db/migrations/033_hybrid_search_contribution.sql` | `6e002fe0a49bddd75853b6d13fdc5759b9f4b90653ffda47ccc6c8f4fddbb0d0` |
| `experiments/search-e2e-evaluation/uk-mx-v1/lib/cost-ledger.ts` | `ed80331dc58258e07b0f86b865cddf8c1ab1ba7521b613dfef6686086f762cac` |
| `experiments/search-e2e-evaluation/uk-mx-v1/scripts/run-formal-experiment.ts` | `d8a9580d01989f11df84811c576ab9feff92d12b45d2655da0a44426fe783e3f` |
| `src/lib/leads/workflow/evidence-budget.ts` | `db035da87b8896ae5a81b12744a072810de80f160cb472724d5cedbcf06037f9` |
| `src/lib/leads/workflow/pdf-extraction-policy.ts` | `6d8847827f1e96eab570114bca33cd447eaa3e64d7246ee09a748f8e6d6ade03` |
| `src/lib/leads/workflow/public-evidence-repository.ts` | `5dcbfe60487eeb5d2ccab4b6e3eac9529705b21005abaa599359c992e51c4b03` |
| `src/lib/leads/workflow/workflow-telemetry.ts` | `47c86d6b05cd87f088eb110cae2603989aebc920b4203688fb899c4d48cbde95` |
| `src/lib/leads/workflow/role-correction-cache.ts` | `b594593f4b7e74f503458731826aa4154b16f8be1194b2ecbafb9d1563251ba6` |
| `src/lib/leads/workflow/target-completion-policy.ts` | `413cafedc7b463c1562a7448d88aff71f6b0ab386b4cddcc0fdfd57aab8049f1` |
| `experiments/multi-source-lead-discovery/scripts/score-v3-tool-lead-value.ts` | `633e541c552fd9d979a60211fc4adf981327966a197d8439f41c3a88392bd6b8` |
| `experiments/multi-source-lead-discovery/scripts/render-v3-tool-evaluation.ts` | `1fdb0d23c3465159403b54f4a42a19e28556ce31de320c118ada5d8fd2615a7c` |
| `experiments/multi-source-lead-discovery/scripts/verify-v3-tool-evaluation.ts` | `447ed84f220192fbab192033ebde7d8b0b2f7d86552a0769cbe0f341d33797fd` |
| `db/migrations/029_isolated_user_long_term_memory.sql` | `e3564a7328ffd643e60798c4d2bd6377c563aec0c224ad54589f534a0b5ae07c` |
| `db/migrations/030_public_evidence_library.sql` | `43a795e0b015613db763707136829c04bdca56a0b6a19b950a9bf9a810eb3998` |
| `db/migrations/031_workflow_efficiency_telemetry.sql` | `982a799ecd008ba7f8b68d9fc6b54fc59f2532aad8dea4fb7771659badff0a26` |
| `db/migrations/032_lead_assessment_cache.sql` | `3837fd5de46961ebf27258f59ecfb623407e601dcd1e0554dcc64cab370acad6` |
| `db/migrations/035_search_and_role_correction_cache.sql` | `2b9d8caeef27c260e3a6a49aef32b2a514604c24e671a8833a9b486ccdd3dd78` |
