# 产品工作流效率台账

本台账把成本降低作为长期产品任务。所有产品工作流都应衡量“生成了多少”以及“最终有多少真正被下游使用”，避免只统计 API 请求或 token 总量。

## 强制记录口径

每个阶段至少记录：输入量、有效输出量、下游实际采用量、输入/输出 token、API credits、延迟、调用次数、失败重试、废弃输出及原因。

核心效率指标：

- 有效输出率 = 有效输出量 / 输入量
- 下游利用率 = 下游采用量 / 有效输出量
- 单位有效输出成本 = 总成本 / 有效输出量
- 单位采用输出成本 = 总成本 / 下游采用量
- 重试率 = 失败调用 / 总调用
- 浪费率 = 未被采用的有效输出 / 有效输出量

GitHub 只保存聚合指标、质量门禁和优化事项，不保存密钥、个人联系人、私有用户原文或供应商原始响应。

## 当前基线：德国线索 v2 原 81 家

| 环节 | 输入 | 有效输出 | 下游采用 | 实际成本 | 已识别问题 |
|---|---:|---:|---:|---|---|
| 新证据获取 | 81 家 | 81 份快照 | 81 | Tavily 438 credits | 原始页面和重复内容较多 |
| 纠错与主评分 | 81 家 | 81 份评分 | 81 | DeepSeek 6,016,877 tokens | 批次重试和输入证据过长 |
| 独立复核 | 81 家 | 复核结果 | 最终评分 | 4,528,395 tokens | 复核触发过宽，Judge 比例高 |
| 工具排行榜 | 81 家旧 Top-10 去重池 | 81 | 仅旧入选池 | 未单独计费 | 未覆盖 126 家旧硬门槛/Top-10 外候选 |

## 已实施优化

- finding 引用证据 100% 保留，非引用上下文限额并压缩长摘录。
- 主评分批次同时受公司数和序列化输入字符预算约束。
- JSON Schema 只在 system prompt 发送一次。
- 已解决的例行升级 warning 不再重复触发独立复核。
- 结构化 DeepSeek 评分温度固定为 0，降低数值漂移。
- 工具榜使用一次公司级 v2 评分映射所有工具，不按工具重复生成合作路径。
- 正式 v2.0 工具榜扩大到全部 207 家唯一候选。
- 纠偏和主评分完成后立即保存模型用量检查点，后续失败不再丢失已发生的 token 成本。
- 失败评分按候选集合重试，并只复核修复集合；工具排行榜模式可跳过合作路径独立盲审。
- 非标准角色事实类型支持 `role-distributor`、`role-vad` 等前缀形式，避免有效角色被归一化为 `other`。
- 每个 Agent 阶段现记录输入/输出体积、产物生成/有效/下游采用量、付费搜索 credits、实际模型 token、延迟、实际模型与 fallback。
- 公共证据库、进行中请求去重和严格新鲜度复用减少重复搜索；旧证据必须完成当前运行的新鲜度验证后才能进入评分。
- 标准 playbook 与候选评分采用租户隔离的精确依赖缓存；证据、纠正事实、评分策略/校验和、Prompt、任务目标或用户路径记忆变化时，仅失效受影响候选。
- 全缓存命中时不再向模型发送空候选请求。
- 高能力模型仅在问题可解决且预计改变总分至少 8 分或关键状态时升级；低置信度、Top-N 和随机抽检不触发生产升级。
- 供应商故障最多有限重试后使用同级能力、同隐私边界、同结构化输出能力的两个 fallback；Embedding 不做跨模型 fallback。

## 实测：德国工具榜 v2 全量 207 家

运行：`2026-08-30-de-v2-tools-full`。质量门禁为 Top-10 重合率 ≥90%、MAD ≤3 分；实测分别为 100% 和 1.17 分。

| 口径 | 81 家基线 | 207 家有效运行 | 单位成本变化 |
|---|---:|---:|---:|
| Tavily credits | 438 | 696 | 5.41→3.36 / 公司（-37.8%） |
| DeepSeek 纠偏+评分 token | 6,016,877 | 7,757,415 | 74,282→37,475 / 公司（-49.5%） |
| 全流程模型 token | 10,545,272 | 7,757,415 | 130,189→37,475 / 公司（-71.2%） |
| 完成评分 | 48 | 207 | 完成率 59.3%→100% |

开发事故另计：错误角色归一化额外消耗 236 Tavily credits 和约 2,953,703 token（估算，±20%）；独立复核端点额度不足产生 193 次 403 失败且无可用 token 记录。事故口径单位公司仍为约 4.50 credits、51,745 token，分别比旧基线低 16.7% 和 60.3%。

## 实测：v3 代表性 A/B 与精确缓存门禁

样本为 9 家，每个类别 1–2 家：distribution 2、retail 2、services 2、ISP 1、hybrid 2。首次臂使用冻结的当前证据并真实调用自适应模型；重复臂验证精确依赖缓存，属于“回放”，不是第二次模型运行。

| 指标 | 修复前无缓存重复 | 精确缓存重复 | 门禁 |
|---|---:|---:|---:|
| 主角色一致率 | 100% | 100% | ≥97% |
| eligibility 一致率 | 88.9% | 100% | ≥97% |
| MAD | 3.89 | 0 | ≤3 |
| 重复模型请求/token | 10 / 128,283 | 0 / 0 | 不重复计费 |

修复前差异主要来自 DNS:NET 在一次输出中遗漏合格路径，导致 eligibility 和总分变化。这说明 `temperature=0` 不能作为结果稳定性的保证。精确缓存只复用依赖完全一致的已完成评分，并由单元测试验证模型不会被调用；任何语义依赖变化都会重新评分。

首次臂为 128,283 token，即 14,254 token/公司：相对 207 家优化运行的 37,475 token/公司再降 62.0%，超过“再降 40%”目标；相对 81 家旧全流程基线下降 89.1%。付费搜索沿用真实历史对比 5.41→3.36 credits/公司，下降 37.8%，超过至少 30% 目标；本次冻结证据实验没有新增付费搜索调用。

全 Pro 仅作为诊断：完成率 77.8%、相对自适应臂 MAD 22.56，未形成可靠参考，反而暴露端点输出失败与能力/成本溢出。因此不采用全量 Pro，也不以“模型更强”本身作为升级理由。

## 实测：v3.0 冻结证据工具搜索结果评测

运行：`2026-08-30-de-v3-tools-frozen-v2`。严格复用 v2 的 207 家公司、253 条工具候选记录与既有证据；新增搜索、补证、合作路径、开发策略和开发信调用均为 0。用户可见输出只生成工具搜索结果测评报告。

| 指标 | v3.0 实测 | 说明 |
|---|---:|---|
| 完成评分 | 207/207 | 全量冻结池 |
| 模型请求 | 105 | 全部 deepseek-v4-flash；无 Pro 升级 |
| 模型 token | 1,275,467 | 6,162/公司 |
| 付费搜索/补证 | 0/0 | 输入文件指纹锁定 |
| 最终证据引用有效率 | 100% | 模型原始合规率 99.5%，1 个无效 ID 被程序删除 |
| 路径/策略/邮件产物 | 0/0/0 | 工具榜专用 Schema 不含这些字段 |

相对 v2 全量纠偏+评分 7,757,415 token 下降 83.6%，但范围不完全相同：v3 直接复用 v2 的纠偏角色和证据，主要衡量“只做工具线索价值评分”的边际成本。v3 工具排名次序与 v2 相同，说明工具结论方向稳定；公司分数 MAD 为 9.08，反映新评分机制对个体价值判断有实质影响。完整报告见 `role-aware-v3/tool-search-evaluation-report.v3.0.md`。

混合搜索策略的主要新发现：原一级分销和项目服务组合分别保留全工具并集 94.9% 和 93.4%，适合渐进优化；原转售/零售组合仅保留 34.4%，需要优先拆分消费者零售与 SMB 转售查询，并采用角色核心工具加候选库缺口触发，而不是固定全并行。207 家中有 5 家满分，后续校准应收紧顶端满分证据要求，但本轮不事后改分。

## 实施记录：混合搜索可执行契约 v1（2026-09-01）

本阶段完成策略契约，尚未进行真实外部搜索，因此以下为“实现验证”，不是生产成本实测：

| 环节 | 输入 | 有效输出 | 下游采用 | token/API 成本 | 延迟/重试 | 丢弃与优化机会 |
|---|---:|---:|---:|---:|---|---|
| 意图标准化 | 1 个 LeadSearchPlan | 1 个显式角色/机会计划 | 1 | 既有 Kimi 调用不变；新增 0 | 单元测试内 | 非明确 Agent、Brand Owner、OEM/ODM 被确定性移除 |
| 混合路由 | 1 个标准化计划 | 按类别生成的 provider 步骤 | 尚未接执行器 | 0 | 纯确定性、无重试 | 下一阶段接入真实 provider、实时注册表和缺口停止 |
| 旧 v3 工具榜边界 | 冻结旧角色池 | 旧 11 角色或 Unresolved | 100% 保持旧口径 | 0 | 纯确定性 | 新角色不会污染历史排行榜 |

已实现的成本控制：Agent、Brand Owner、OEM/ODM默认关闭；Tavily从发现策略中禁止；同一轨道禁止相同provider/引擎/机制重复；Gemini Full/Product Gemini和SearchAPI按类别互斥或仅缺口升级。当前最重要的未完成优化是把路由执行结果的新增唯一候选、重复、门禁、credits、延迟和下游采用真实回写数据库。

### 阶段2：统一provider与实时注册表（实现验证）

新增生产级Google Grounding（Full/Product）、SearchAPI Google/Bing、Brave、Exa和Google Places适配器，以及跨工具共享的实时候选注册表。适配器统一记录请求数、有限重试、credits、模型token和延迟；不保存密钥或原始响应。注册表按根域名、Place ID和规范化名称实时归并，保留首次发现及全部辅助发现记录；无官网的Places候选保留为待解析实体，不直接进入评分。

本阶段仍未激活外部调用，真实输入/有效输出/下游采用/API成本均为`not-observed`。自动测试覆盖16项provider/注册表/路由行为；下一阶段必须接入轻量门禁和数据库贡献回写后再激活，避免只增加provider调用而不减少重复下游成本。

### Stage 3: active hybrid executor, light gate and contribution telemetry (implementation verification)

The production discovery node now executes the versioned category-specific Gemini/SearchAPI/Google Places/Brave/Exa route with one shared real-time company registry. Tavily is excluded from discovery and retained for targeted evidence acquisition only. Newly discovered domain candidates receive a bounded direct-homepage read plus a compact DeepSeek Flash gate in batches of at most 10; this gate emits semantic signals only, is resolved to pass/hold/reject by code, never escalates to Pro, and holds candidates when the routine model is unavailable.

Every provider call now records aggregate input characters, raw/normalized/new/duplicate/rejected output, credits, model tokens, latency, retries, fallback status, discard reasons and call status. Every candidate occurrence records first/assisted discovery provenance and the light-gate outcome. After scoring, the same occurrence rows receive final role, eligibility, score, displayed/selected/downstream-used state and equal fractional discovery credit across all normalized occurrences of that company. LangGraph stage telemetry records raw generated results versus new unique and downstream-used candidates. Raw provider responses, credentials and private user text are not persisted.

This stage is verified with mocked providers, not a paid production benchmark: external input/output volume, unit cost and real downstream quality remain `not-observed`. The next real search run must compare per-category unique yield, duplicate rate, gate pass/hold/reject, downstream scored/displayed/selected use, credits and token cost. Automatically observed optimization candidates are: query-template tightening where paid validity is below 60%, route removal where assisted downstream contribution stays near zero, and reducing parallel core breadth when duplicate rate is high. None is auto-applied without a quality review.

### Stage 4: cold-start evaluation isolation and score-only qualification (implementation verification)

The qualification agent now has an explicit score-only mode for end-to-end search evaluation. It retains the same seven semantic dimensions, deterministic total, evidence gates and material-change escalation rule, but its model schema excludes cooperation paths and selected path. It also forbids development strategy, email and contact output. Normal product execution remains unchanged and continues to generate editable paths.

Fresh evidence collection now accepts explicit cold-start controls. Formal evaluations can disable reads from the historical public-evidence library and disable writes back to that library while still acquiring current-run evidence. Defaults remain reusable and persistent for normal production work.

This stage is implementation verification only: paid input/output volume, external latency and unit cost are `not-observed`. Type checking and 13 focused workflow tests pass. Expected savings come from eliminating unused path fields and avoiding experiment contamination; actual token and paid-search deltas will be measured by the UK/Mexico formal evaluation. The experiment must record zero historical evidence reads, zero private memory reads, score-only output utilization, and any model output rejected because it attempted to emit excluded fields.

### Stage 5: formal-evaluation cost observability and hard budget gate (implementation verification)

The UK/Mexico formal search evaluation now has three separately priced ledgers (`gemini-native-arm`, `product-e2e-arm`, and `evaluation-overhead`) and a USD 100 hard cap. Official list price is the conservative budget basis unless an observed account cash charge is available. Unknown model rates, missing Gemini grounding-query counts, and missing currency conversion no longer become zero; they block cost finalization.

The runtime records light-Kimi and K3 calls separately, local-RAG embedding tokens, search-provider requests, Gemini grounding queries, Tavily search/extract credits and retries, DeepSeek requested/actual model tokens and retries, stage latency, raw/valid/downstream-used output, and discard reasons. Cost snapshots are generated at USD 20/40/60/80. A completion forecast above USD 100 pauses the next paid stage and requires a user decision; sample size and quality gates are never silently reduced.

This stage is implementation verification only and has made no formal experimental calls. Type checking and 30 focused tests pass. The first real cells must measure provider output utilization, cost per requested/final/65+/75+ lead, retry waste, and market/category cost skew. The frozen experiment manifest and Git tag prevent post-start code, prompt, policy or rate-card drift.

Preflight v1.0.0 found that Kimi could exceed the former 45-second safety timeout and could return the semantically equivalent enum `new_market`. Before any UK/Mexico cell ran, v1.0.1 increased the intent timeout to 120 seconds and added deterministic underscore/space-to-hyphen enum normalization. A conservative USD 0.01 adjustment carries the two v1.0.0 Kimi attempts into the v1.0.1 hard-budget ledger. Preflight checks and formal cell arms now checkpoint cost events immediately; retries skip completed checks/arms, while any repeated stage call in an incomplete arm is retained under a distinct event ID so retry waste remains visible.

Preflight v1.0.1 then exposed a deterministic Kimi fallback whose failure detail and usage were not returned to the experiment ledger. Before formal cells, v1.0.2 preserves failed planner-call telemetry and uses a conservative USD 0.01 reserve whenever the provider returns no usage. The combined pre-v1.0.2 adjustment is USD 0.02 for three attempts; future failures are recorded individually rather than reconstructed later.

Preflight v1.0.2 retained the next failure correctly: 538 input tokens (all reported cached), 1,591 output tokens, 44.805 seconds, no retry, and USD 0.0064203807. The rejected field was only a non-canonical `coverage_mode`. v1.0.3 normalizes recognized synonyms and maps unknown values to the pre-existing `auto` default; the four pre-v1.0.3 attempts carry forward as USD 0.026421. No UK/Mexico formal cell had started.

Preflight v1.0.3 then passed schema validation but exposed an over-strict exact-role-set check: a model can correctly identify one role within a frozen category such as Distributor/VAD without echoing every alias. v1.0.4 requires country/count/objective equality and a non-empty role subset with no out-of-category role, then forces the downstream plan back to the complete frozen role set. The v1.0.3 call used 538 cached input tokens, 1,070 output tokens, 30.503 seconds and USD 0.0043464890; cumulative carry-forward is USD 0.030768. No formal cell had started.

Preflight v1.0.4 exposed another non-canonical model phrase, this time for `objective`. v1.0.5 accepts a bounded string and normalizes explicit new-market/market-entry and existing-distributor/channel-growth synonyms, falling back to the deterministic parser when unknown; the frozen experiment still overwrites the execution objective. The v1.0.4 call used 538 cached input tokens, 1,625 output tokens, 40.614 seconds and USD 0.0065557210; cumulative carry-forward is USD 0.037324. No formal cell had started.

Preflight v1.0.5 showed that a local keyword parser treated the explicit exclusion “do not search ... Brand Owner” as a positive special-role request and therefore let a model hallucination through. v1.0.6 gives English, Spanish and Chinese negation precedence for Agent, Brand Owner and OEM/ODM; only positive explicit mentions can enable them. The v1.0.5 call used 538 cached input tokens, 1,211 output tokens, 47.170 seconds and USD 0.0049077533; cumulative carry-forward is USD 0.042232. No formal cell had started.

Preflight v1.0.6 still showed that naming excluded special roles in the user message primed Kimi to echo Brand Owner. v1.0.7 removes those negative keyword lists from formal intent prompts and states only the positive market/category boundary; the system-level explicit-only rule remains authoritative. The v1.0.6 call used 538 cached input tokens, 1,246 output tokens, 34.976 seconds and USD 0.0050470743; cumulative carry-forward is USD 0.047280. No formal cell had started.

Preflight v1.0.7 passed intent, local RAG, all discovery providers, Tavily and DeepSeek score-only checks, then exposed an incorrect Gemini Interactions adapter: the JSON Schema was only copied into the prompt instead of sent through top-level `response_format`, and grounding charges were omitted when model token fields were zero. v1.0.8 uses native structured output, the official usage fields, visible-output-plus-thought billing and usage-level grounding counts. Failed parse calls now record raw/valid/downstream volume and cost before termination. Product-side v1.0.0–v1.0.7 spend is conservatively carried as USD 0.210415 after repricing six Gemini grounding queries; the lost-usage Gemini control call has a separate USD 0.100000 reserve. Total v1.0.8 starting budget is therefore USD 0.310415 (0.31% of the USD 100 cap). No UK/Mexico formal cell had started.

The v1.0.8 harness also closes a previous observability gap after search: Gemini/product overlap reuses one current-run record; only Gemini-unique final candidates receive shared evidence/correction/score calls; blind packets and decisions checkpoint individually; 32-sample failure expands deterministically to 64; final statistics include slot utility, validity, 65+/75+, NDCG, deduplication, bootstrap gates, provider fractional Top-30 contribution, three cost ledgers, actual wall time and optimization findings. A run is no longer complete at 8/8 search cells; all shared evaluation, blind calibration and reports must finish.

Preflight v1.0.8 stopped before any formal cell because Kimi returned an otherwise usable lead plan with a nonnumeric representation in one numeric field. The failed call was preserved: 531 input tokens (512 cached), 1,593 output tokens, 45.677 seconds and USD 0.0064423329. v1.0.9 normalizes only bounded presentation variants for confidence/count and still requires Kimi to supply the semantic intent; target counts that remain nonnumeric fall back to the user-text parser. The versioned end-to-end definition is 2.2.1. Product-side carry-forward is USD 0.216858 and the separate Gemini control reserve is USD 0.100000, for a USD 0.316858 starting total. Formal cells remain 0/8.

Preflight v1.0.9 passed every product-side check after two recoverable TLS resets, then the Gemini control request rejected the richer structured-output Schema with HTTP 400. Controlled probes showed that Gemini 3 + Google Search + top-level `response_format` works and that the complete field hierarchy succeeds when the API-side Schema is limited to `type/properties/required/items/enum`; local Zod continues enforcing all strict bounds. The two successful probes used three grounding queries and cost an estimated USD 0.04518225 from official usage. v1.0.10 carries USD 0.372687 product-side and USD 0.145183 Gemini-control-side, USD 0.517870 total. Formal cells remain 0/8.

Preflight v1.0.10 passed Kimi intent, local RAG, every product discovery provider, Tavily evidence, DeepSeek score-only and the Gemini 3.6 Flash structured-search control. The final Claude preflight could not establish TLS to `lingyuapi.com`; formal cells remain 0/8. A runtime audit found that thrown provider requests did not persist attempts, latency or discard reasons. v1.0.11 closes that observability gap without changing experiment semantics: transport, timeout, HTTP and invalid-response failures are checkpointed before a task remains retryable, non-retryable 4xx responses stop after one attempt, and transport failures cannot trigger blind-model fallback. Prior budget carry is USD 0.531486457 product-side plus USD 0.17466425 Gemini-control-side, USD 0.706150707 total. This prevents failed-call telemetry from becoming a hidden cost or reliability blind spot in later workflow optimization.

The user authorized a three-stage blind-review fallback: Claude Opus 5, then Lingyu Responses `gpt-5.6-sol`, then direct in-session Codex. After Claude transport remained unavailable, a real high-reasoning, no-tools, `store=false`, full-schema Lingyu OpenAI probe returned HTTP 403 `insufficient_user_quota` with no model output or token usage. v1.0.12 therefore uses the direct conversation fallback. It exports randomized evidence-only packets, validates packet hashes and cited evidence IDs, recomputes totals deterministically, and blocks deblinding until every decision is committed, pushed and byte-identical to Git `HEAD`. The marginal evaluator API cash cost is zero; conversation token usage is unavailable and is recorded as an explicit telemetry anomaly rather than estimated. The v1.0.10 non-judge preflight is reused by frozen run-summary hash, preventing duplicate search/model spend. Search, evidence, scoring and win gates remain unchanged.

v1.0.13 removes a zero-cost orchestration defect discovered before the first formal cell: the paid-call gate required the frozen tag to point exactly at `HEAD`, while the project agreement requires every verified runtime stage to be committed. A preflight artifact checkpoint therefore made the valid frozen tag one commit behind and blocked execution before any provider call. The corrected gate requires the immutable frozen tag to be an ancestor of `HEAD` and still verifies every frozen input by SHA-256. This allows artifact-only checkpoint commits without weakening protocol immutability. The failed start had zero valid output, zero downstream-used output, zero token/search-credit cost, and was discarded as `orchestrationGateFailure`; the concrete optimization is to test tag ancestry semantics in future runner preflights before creating runtime commits.

v1.0.14 addresses an intent-stage efficiency failure in the first MX Retail/E-tail attempt. An overly strict full-subset role check rejected an otherwise structured Kimi plan after the Gemini arm had already produced 30 valid outputs. The Spanish source was verified as valid UTF-8; apparent corruption was only terminal rendering. The invalidated run spent USD 0.2436989 on Gemini and USD 0.0022035560011204646 on Kimi, with zero product discovery/evidence/scoring output. Those costs remain in the cumulative budget while the result set is not reused. The new gate keeps Kimi as the required conversational model and template-fit detector, requires the correct market/count/objective plus at least one role-family match, and executes only the preregistered frozen role set. Safe expected/actual semantic fields are included in future failures. This prevents synonymous adjacent-role output from wasting an entire cell while preserving category isolation.

v1.0.15 fixes a zero-call preflight accounting invariant exposed by that historical spend. The reused v1.0.10 preflight source total and the cumulative experiment carry-forward total are now separate frozen fields: the former must equal the hashed source ledger, while the latter must be at least the source total and includes invalidated formal calls. This prevents both omission of sunk experiment cost and false rejection when later failed runs legitimately increase the budget ledger. The v1.0.14 preflight produced zero provider inputs, outputs, tokens, credits and marginal cost.

### 2026-09-04：OpenRouter 统一路由与 MX Retail 欠填诊断

OpenAI 与 Anthropic 生成调用已统一到 `https://openrouter.ai/api/v1/chat/completions`：RAG/混合回答、Market Playbook、独立复评使用 `openai/*`，开发信反馈修订与正式实验盲审使用 `anthropic/*`。密钥只从 `OPENROUTER_API_KEY` 读取；可选归因头使用官方的 `HTTP-Referer` 与 `X-OpenRouter-Title`。结构化调用要求端点支持参数并拒绝数据收集，模型 token 与 OpenRouter 返回的 `usage.cost` 分开记录。Embedding、Kimi、DeepSeek、Gemini 的既有直连不变。实现测试没有发起付费请求：5 个聚焦测试文件共 20 项通过，类型检查通过；真实连通性、实际模型可用性、首条延迟与现金成本仍为 `not-observed`，必须用轮换后的本地环境密钥完成最小预检。

冻结的 v1.0.15 在 MX Retail 完成后累计投入 1.7460204111 美元，其中 Gemini 账本 0.888839 美元、产品账本 0.8571814111 美元；网关更换后不得继续把新调用写入该冻结版本。该单元产品组从 43 条原始结果得到 23 家唯一公司（20 次重复），轻门禁保留 12 家，最终主角色匹配仅 6 家，填充率 20%。两个 SearchAPI Bing 路由和 Gemini Product 在请求前失败；`auto + 30` 没有启用 `retail-local` 轨道；6 家后续被排除者分别落入 Distributor 2、Brand Owner 2、Unresolved 2。最关键的流程缺陷是发现阶段按路由耗尽/门禁池停止，而不是在角色校正与最终门禁后按 30 个有效槽位反馈补搜。候选利用率为：原始→唯一 53.5%，唯一→轻门禁 52.2%，轻门禁→最终在类 50%，端到端原始→最终 14.0%。本阶段只记录根因，不修改冻结搜索策略；建议在下一实验版本评审“最终有效槽位反馈补搜、低 SEO 市场本地轨道、失败路由替补、动态过采样”后重新预注册。

## 持续优化事项

| 优先级 | 工作流环节 | 可优化点 | 质量门禁 | 状态 |
|---|---|---|---|---|
| P0 | 所有 Agent 阶段 | 记录输出是否被下一阶段实际引用 | 事件完整率 100% | 已实现，待积累生产样本 |
| P0 | 评分 | 使用重复运行 MAD 监控数值稳定性；Top-N 仅用于离线工具榜 | MAD ≤3；离线 Top-N ≥90% | 已实现 |
| P0 | 工具榜 | 仅生成主角色内线索价值所需字段，避免重复路径文本 | 角色/eligibility ≥97% | 已实现 |
| P0 | 供应商调用 | 运行前余额/最小请求预检，避免额度耗尽后批量失败 | 零额度失败 0 | 待实现 |
| P0 | 长批次 | 按批写入结果和使用量检查点，不等待整个阶段结束 | 可恢复批次 100% | 部分实现 |
| P1 | 补证 | 按公司价值和证据缺口动态决定搜索深度 | 战略公司召回 100% | 已实现，待生产校准 |
| P1 | 复核 | 统计 secondary 输出最终被 Judge/最终结果采用的比例 | 关键冲突漏审 0 | 待采集 |
| P1 | 邮件 | 统计生成段落在用户最终邮件中的保留率 | 用户确认事实边界 100% | 待实现 |
| P1 | 缓存 | 监控命中率、按失效原因分布和节省的 token/credits | 错误复用 0 | 已实现基础事件，待生产采集 |
| P2 | RAG | 统计检索 chunk 被 prompt 引用及被最终结论引用的比例 | 引用 ID 有效率 100% | 部分实现 |

## 更新规则

任何产品工作流实现、模型路由、提示、评分、证据策略或成本优化发生变化时，必须在同一开发阶段更新本台账及对应端到端文档。运行数据只能标记为“实际”“估算”或“回放”之一，不能混用。
