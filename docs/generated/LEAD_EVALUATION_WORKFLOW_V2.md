# Cudy 销售线索端到端工作流 v3.1.0

> 本文档由 `scripts/generate-lead-workflow-doc.mjs` 自动生成。请修改版本化配置或实现代码，不要直接编辑生成文件。

- 运行时策略版本：3.1.0（基础流程定义 2.3.1）
- 评分策略版本：2.0.0
- 成本质量策略版本：3.0.1
- 配置指纹：`1394c63171b6fd8c2d57e724cbc5ba1143d4679188646833028c15b984fe0822`
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
| `config/lead-scoring/policy-v2.0.0.json` | `3e0e88b26ad3e7923b2f21d6c0d9595983599832f59174a63f4d51eaf058307c` |
| `config/lead-search/hybrid-search-v1.0.0.json` | `f45e900b461c63649ac8bfe74a35469a594366ab8d7b0c848adcc21baf007e74` |
| `config/lead-workflow/cost-quality-policy-v3.0.0.json` | `90bb896e2fdfd0738296ab4b82dae6bb0f75e1b06d95955f69e4eaaa55a7aae6` |
| `config/lead-workflow/runtime-policy-v3.0.0.json` | `31a0f7030758c373a697c82afc85f31b940c3b9104f8eb9c846aa0249a6e6f4c` |
| `src/app/api/assistant/messages/route.ts` | `04bec90cc3d3f336195e8ab97a5ad4b1ec1e05b95606064225e098e94ed7a5cd` |
| `src/lib/assistant/types.ts` | `2523b45296954202abb860201b71fde2b013130ce668cfb4e70e2231ff8c4880` |
| `src/lib/assistant/intent.ts` | `5501e1e0a9617b34f40d14af6bf65fdae8250f9f9ed714647ec6878eb1179ab3` |
| `src/lib/assistant/intent-agent.ts` | `d7250f9945301e762d030be38d376ff69c473f78b9f34cddd767f6f3ded8ce48` |
| `src/lib/rag/openai-provider.ts` | `8d3151fd671b7a791ac81885a91a09a9281be5b3ebd04edcd188f517da3e088d` |
| `src/lib/assistant/service.ts` | `1e2d9719d2937cc3081c3dbddf016d7cd665de1c1e9a88c775d10e3863ec00df` |
| `src/lib/assistant/repository.ts` | `4243485613740437216b7867c0b8b420ea16d555f852397b436fd8a5f5414e67` |
| `src/lib/leads/workflow/graph.ts` | `9aec3d93db68b3f08746e63b6159859f74405e80fc730c81a85582413535bbc6` |
| `src/lib/leads/workflow/jobs.ts` | `138299e1dac31066c136382219f6177126ec3a0efe0de67c837f30b0132f4ce1` |
| `src/lib/leads/workflow/rag-context.ts` | `1e1ee21e77b90731e849426cd7130de7d1e50ee6aec9f196e44cb642bf81387b` |
| `src/lib/leads/workflow/playbook.ts` | `92ee9d6f02304824bd3761600637d170c494e357accba24fd662d21ee6140cf3` |
| `src/lib/leads/workflow/playbook-cache.ts` | `945d3fc727312208650ee7b4e55e33860e7c54f7e3daa939f768952409a1803f` |
| `src/lib/leads/workflow/hybrid-search-policy.ts` | `775d1d1571062f41208b5226799c18df91645da865c0c2a8bee23c93928045bc` |
| `src/lib/leads/workflow/candidate-registry.ts` | `55d11ebb6d6add24161ca5ad9126f767102b002f14d08706845ac6a7b6d43666` |
| `src/lib/leads/workflow/discovery-gate.ts` | `c73f4b05a49573e7536125f95359d0d96c787e0a2cd1f0d18879f63715341eb3` |
| `src/lib/leads/workflow/hybrid-discovery-executor.ts` | `f4fd7f1e310b5970a42100b6514bf35ace87d19bea34a058adc288dd53bdb39a` |
| `src/lib/leads/workflow/discovery.ts` | `bc026f4bdf9bbbca4a88569838a1d07a8aeb0b673bde883d7f5c41d2e85379bb` |
| `src/lib/leads/global-search.ts` | `3e808deea189a90ca6686ec8348648e9f98d97080c9cb78aa9226f6384a4db30` |
| `src/lib/leads/workflow/evidence-correction-agent.ts` | `12060d5c5e9737011e6e5119adc9898b6c9423175508999fe8b6bcbcf6fffe7d` |
| `src/lib/leads/workflow/evidence-packet.ts` | `c3b646b9a78e0584f267ddec5c97dc6bbfc4abc01a39ca4de9795d3c480ac005` |
| `src/lib/leads/workflow/qualification-agent.ts` | `190c04a4599f81963d9fe8b9a1dd98cd0578c1c81c8bd2456537b8cc241b1239` |
| `src/lib/leads/workflow/assessment-cache.ts` | `d7fd5fe0b350aa56eb9fcfb283c2c81a2de9564f88a3ef677631b82d81474fb3` |
| `src/lib/leads/workflow/assessment-review-agent.ts` | `14120dc50c23946269c3980466788dd81b68755d0c9d3c54b3c690de65b37ce6` |
| `src/providers/deepseek.ts` | `5b75d30e54d3a6aa96537fb5783da2e719ca70f9b16f180ff01872eb0e5a3584` |
| `src/providers/discovery-contracts.ts` | `063e409c3545060f1a7be3222cbaa9c9a118b513cf7f12f3d839a9dce7f491c9` |
| `src/providers/discovery.ts` | `375254caabc6a343d691bb6fbb1a39fe556ca3fbe334d1ded8b4b048582b47cd` |
| `src/providers/resilient-ai.ts` | `3fe571fe48f48c0f89ccbf7241ed303b554598243bd8bfa08dc7c2a76c85258b` |
| `src/providers/openrouter.ts` | `b43ba8fdf08602cb7d3567ea88bdc2cfee704de0c1b197cc574abe5e9b89143d` |
| `db/migrations/034_model_account_cash_cost.sql` | `4790c7ad12eda543e197c84ddd77c4a5ce296b7871ccee799f3aa2262684bdbb` |
| `src/providers/tavily.ts` | `78b2035eeb987e4c537bae812cc1095c5728e5e72842c6e438fd59fd7a4f6f9d` |
| `src/lib/leads/workflow/handoff-assembler.ts` | `58b92f337c05b7e1b62b28db27eb7d6ed1b5bcd95272926868f3c4a1df3a680c` |
| `src/lib/leads/workflow/persistence.ts` | `6ad64ddf71aee9d59332ca396822b87504f7ee0686d68184b4bd4a8069464f1d` |
| `src/lib/sales/repository.ts` | `3f3a9ca6f0b98b43f9609091b6ce93a046f336246b71e46d53a3525fd9e7ba86` |
| `src/lib/outreach/graph.ts` | `97c7377dbc5eaaabe150f42e10811e599fdd65f028424f4c415927b5045b2590` |
| `src/lib/outreach/kimi-agent.ts` | `e2e219fb192f8cb9593b9dd3d2413205f88e9664324e1b8b8844e1101db9981c` |
| `src/lib/outreach/claude-agent.ts` | `85013925504a3c73aee5de50690a30e4eb15e5a98b8d4ab3ddfeee832cc164aa` |
| `src/lib/outreach/repository.ts` | `44448d88796ef8908843c80b779d831cb5fd966a605a73c98642ea99e7eb76a2` |
| `src/lib/outreach/knowledge-repository.ts` | `d38601efa6bf9911675774e3fea45d2041ef47907cf3bbbc2d0732bf036cd204` |
| `db/migrations/033_hybrid_search_contribution.sql` | `4088eb1ae2f9dbf58c2150a5c7ce3b4f5a49e1e75e2fb372887aed9d153ffb05` |
| `experiments/search-e2e-evaluation/uk-mx-v1/lib/cost-ledger.ts` | `ed80331dc58258e07b0f86b865cddf8c1ab1ba7521b613dfef6686086f762cac` |
| `experiments/search-e2e-evaluation/uk-mx-v1/scripts/run-formal-experiment.ts` | `3074023865fa6fb5d2869addda6c012eb7aec4d870b7ffc40aece61799eae03d` |
| `src/lib/leads/workflow/evidence-budget.ts` | `db035da87b8896ae5a81b12744a072810de80f160cb472724d5cedbcf06037f9` |
| `src/lib/leads/workflow/pdf-extraction-policy.ts` | `6d8847827f1e96eab570114bca33cd447eaa3e64d7246ee09a748f8e6d6ade03` |
| `src/lib/leads/workflow/public-evidence-repository.ts` | `5dcbfe60487eeb5d2ccab4b6e3eac9529705b21005abaa599359c992e51c4b03` |
| `src/lib/leads/workflow/workflow-telemetry.ts` | `47c86d6b05cd87f088eb110cae2603989aebc920b4203688fb899c4d48cbde95` |
| `src/lib/leads/workflow/role-correction-cache.ts` | `b594593f4b7e74f503458731826aa4154b16f8be1194b2ecbafb9d1563251ba6` |
| `src/lib/leads/workflow/target-completion-policy.ts` | `3239db048621ed0d3ee257bb109fd7a629c3ab68386f0d5c341bba4f111ae3de` |
| `experiments/multi-source-lead-discovery/scripts/score-v3-tool-lead-value.ts` | `0417c889812d19ff5b8f28a76102eb80bc827b1356fc26cb5a33a22240ee811d` |
| `experiments/multi-source-lead-discovery/scripts/render-v3-tool-evaluation.ts` | `1fdb0d23c3465159403b54f4a42a19e28556ce31de320c118ada5d8fd2615a7c` |
| `experiments/multi-source-lead-discovery/scripts/verify-v3-tool-evaluation.ts` | `447ed84f220192fbab192033ebde7d8b0b2f7d86552a0769cbe0f341d33797fd` |
| `db/migrations/029_isolated_user_long_term_memory.sql` | `3956b46f04babda1cd2af1c3bb33f246730d240ab7586940aca2393b852c66b1` |
| `db/migrations/030_public_evidence_library.sql` | `43a795e0b015613db763707136829c04bdca56a0b6a19b950a9bf9a810eb3998` |
| `db/migrations/031_workflow_efficiency_telemetry.sql` | `982a799ecd008ba7f8b68d9fc6b54fc59f2532aad8dea4fb7771659badff0a26` |
| `db/migrations/032_lead_assessment_cache.sql` | `3837fd5de46961ebf27258f59ecfb623407e601dcd1e0554dcc64cab370acad6` |
| `db/migrations/035_search_and_role_correction_cache.sql` | `2b9d8caeef27c260e3a6a49aef32b2a514604c24e671a8833a9b486ccdd3dd78` |
