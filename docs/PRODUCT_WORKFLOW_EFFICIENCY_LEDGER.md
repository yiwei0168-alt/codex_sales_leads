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

### 2026-09-05：混合搜索 v1.1.0 与最终有效槽位闭环（实现验证）

MX Retail v1.0.15 的实际漏斗是 43 条原始结果、23 家唯一公司、12 家轻门禁保留、6 家最终在类公司，端到端利用率 14.0%。根因包括固定轻门禁候选池、供应商失败被错误计入无价值批次、未启用本地零售轨道，以及角色校正结果没有反馈回搜索。

v1.1.0 将用户指定数量定义为身份、市场和主角色验证后的最终有效公司数；初始规划池为 1.5 倍，后续按保守实测转化率补量。失败调用不再推进无价值停止计数；认证/额度/配置故障熔断，瞬时故障最多两次尝试，并转向不同索引或机制。MX Retail 首轮同时开启 national、E-tail 和 Google Places，默认 Retail/Reseller 路线移除 Gemini Product。

重叠工作通过任务内搜索调用缓存、实时公司注册表、证据 ID/内容哈希和公开角色校正快照避免。角色校正缓存严格绑定证据 URL/内容哈希、Prompt 与角色分类版本；跨运行读取时把缓存引用安全重绑到本轮证据 ID，任一内容或绑定缺失即失效。校正阶段新增的公共补充证据先写入证据库，再保存角色快照与缺失证据列表，避免下一次运行重复补证。下游接收已使用证据 ID 和缺失证据列表。公共证据/角色知识与用户或工作区长期记忆继续隔离。冷启动实验禁用历史读取和写入，但不禁用本次运行内部缓存。

本阶段数据类型为“回放 + 实现验证”：旧 MX 漏斗和 1.7460204111 美元累计成本为实际历史记录；新策略尚无真实运行成本。7 个聚焦测试文件共 36 项测试和 TypeScript 类型检查已通过。预计节省来自失败熔断、同供应商串行去重、缓存复用、仅对主角色在类候选评分；实际 token、搜索额度、最终候选利用率与单条成本将在升级后的正式实验逐阶段记录。

实验执行器和生产 LangGraph 现已共用同一个目标完成控制器。生产流程按轮执行“发现→补证→角色校正→仅在类评分”，把已发现及校正后的域名反馈给下一轮；达到目标、连续两轮无新增最终有效公司、供应商不可用或五轮安全上限时停止。角色矫正后的错类别公司保留到候选库，但不消耗本轮评分模型；每轮分别记录输入、有效输出、下游使用、缓存、失败、成本和停止原因。新增生产图循环测试验证两轮后达到指定有效数量，避免实验能力高于实际产品。

### 2026-09-05：正式搜索实验 v1.1.0 预注册（尚未产生新实验结果）

新运行继承并明确标注 v1.0.15 的实际历史成本：产品账本 0.857181411051939 美元、Gemini 账本 0.888839 美元，合计 1.7460204110519397 美元。由于对照 Prompt、`gemini-3.6-flash`、单次 Google Search 机制及输出已冻结且没有变化，MX Retail 的 30 家 Gemini 对照结果只读复用，不再产生第二次调用；产品组 6/30 结果不复用，按 v1.1.0 生产机制重跑。

轮换后的 `OPENROUTER_API_KEY` 已完成零生成成本的官方模型目录连通性检查，目录确认 `anthropic/claude-opus-5` 与 `openai/gpt-5.6-sol` 可路由；尚未把目录可见性误记为生成模型可用性。冻结后的最小结构化盲审预检按 Claude→OpenAI→本对话 Codex 顺序执行，并记录每次输入、有效输出、token、`usage.cost`、延迟、重试、丢弃原因和实际采用模型。硬预算及 20/40/60/80 美元检查点不变。

正式预检实际选择了本对话 Codex。Claude Opus 5 能返回内容但没有遵守完整盲审 Schema，因缺少维度对象等字段被确定性校验拒绝；OpenRouter 的 GPT-5.6-sol 因当前端点无法满足所请求参数返回 HTTP 404，未产生可采用输出。两次外部尝试均未继续重试，避免重复浪费；合计新增评估开销 0.07361 美元，0 条有效输出、0 条下游采用，丢弃原因为 `invalid-structured-output` 与 `unsupported-parameters`。累计实验成本为 1.8196304111 美元（预算 1.82%），初始完工预测 30 美元、保守上界 40.50 美元，无预算预警。优化机会是后续版本用 OpenRouter 实际支持的 JSON Schema 子集或提示后本地规范化复测 Claude，并在模型目录预检之外增加参数能力预检；本冻结版本不事后更换盲审规则。

v1.1.0 首个 MX Retail 单元完成后被判为无效诊断运行：15 次 DeepSeek 调用全部因全局环境模型泄漏使用 `deepseek-v4-pro`，而不是已确认的 Flash 例行模型，且没有任何一次是物质性升级。该单元实际输入 345 条搜索结果、形成 62 家唯一公司、轻门禁保留 49 家、主角色在类 24 家、最终合格 15 家；模型输入/输出为 369,962/114,023 token，墙钟 1,091,386 ms。单元费用 1.5705186596 美元，其中发现、首次补证和纠偏补证合计 1.304 美元（83.0%）；52 个发现 credits 中 Exa 8 credits 最终贡献为 0，SearchAPI 与 Brave 合计产生 282 次重复。输入→最终利用率为 4.35%，每家最终线索 0.10470 美元，每家 65+ 线索 0.39263 美元。剩余七个单元未调用，避免继续测量错误处理组；历史成本将完整结转到修复版本。

v1.1.1/v1.2.0 修复阶段把发现轻门禁改为独立的 `DEEPSEEK_DISCOVERY_GATE_MODEL`，固定默认 Flash，不再继承可能为 Pro 的全局设置。正式实验进一步显式冻结角色纠偏和评分例行模型为 Flash、Pro 仅用于满足既有物质性升级条件。动态计划池现在把每个 provider 的请求深度从固定 12 调整到 12–20；Brave/SearchAPI 最多携带 20 个已见域名排除，Google Places 使用短本地商业查询。调用缓存指纹同步加入请求深度与域名排除上下文，防止较宽的补搜错误复用旧窄结果。新增 `requestedResults` 让实际请求深度与原始/唯一/下游采用可以直接比较。该阶段数据类型为“实现验证”，外部输入、有效输出和边际费用尚未观测；质量门禁是 Flash 绑定零漂移、旧缓存/失败语义不变、目标填充不下降，并在新的 MX Retail 单元测量重复率与单位最终线索成本。

v1.1.1 正式预检通过冻结文件、Git 标签祖先关系、8 个实验单元以及三项例行 Flash 模型绑定检查。预检直接复用已冻结的非盲审连通性结果和 v1.1.0 的盲审选择，不调用搜索、补证或生成模型：新增输入、有效输出、下游采用、token、搜索 credits、重试和边际费用均为 0；仅结转历史成本 3.3901490706 美元。当前预算使用率 3.39%，初始完工预测 30.00 美元、保守上界 40.50 美元，未触发预算预警。该零调用复用避免重复预检成本，下一项优化观测点转为正式单元中的每轮请求深度、重复输出、Flash/Pro 实际路由、最终采用率和单位合格线索成本。

v1.1.1 MX Retail 诊断实际处理 70 条原始结果、47 家新唯一公司、36 家纠偏公司、21 家被评分公司，最终仅 8/30 合格，端到端原始结果利用率 11.43%。单元边际费用 0.9570672632 美元，其中搜索发现 0.206 美元、首次补证 0.416 美元、纠偏补证搜索 0.256 美元；墙钟时间 510,744 ms。三项常规模型均正确使用 Flash，证明模型路由修复有效；但两条 Brave 查询因完整查询达到 824/834 字符而被其 600 字符上限拒绝，两条 SearchAPI 查询各尝试两次后约 90 秒超时，随后任务级瞬时熔断让第二、三轮大量调用直接跳过。部分 provider 不可用的两轮仍被累计为“连续无最终新增”，错误触发 `confirmed-exhaustion`。该结果作为产品错误诊断作废，费用完整结转，总累计 4.3472163339 美元、预算使用率 4.35%。v1.2.1 将 Web 完整查询限制为 580 字符，永久熔断仅保留给认证/额度/配置错误，瞬时路由故障每轮恢复且只做有界探针，并禁止把 provider 部分不可用轮次计入穷尽证明；评分、样本和对照均不改变。

v1.1.2 冻结校验与继承预检均通过，输入文件 68 个，预检新增外部请求、token、搜索 credits、重试及边际费用均为 0。历史产品、Gemini 与评估成本分别按 3.3847673339、0.888839、0.07361 美元结转，累计 4.3472163339 美元；预算使用率 4.35%，初始完工预测 30.00 美元、保守上界 40.50 美元，未触发 20 美元检查点或预算预警。下一阶段以 MX Retail 有效填充率、Web 查询拒绝数、瞬时恢复探针成功率、每轮 provider 可用覆盖和单位最终线索成本验证 v1.2.1。

v1.1.2 MX Retail 有效运行处理 461 条原始搜索结果、83 家新唯一公司、65 家纠偏公司、36 家完成评分公司，五轮分别新增 13/2/1/2/3 家最终合格公司，得到 21/30，因达到五轮上限停止。墙钟时间 1,401,235 ms，单元费用 1.9103677258 美元；Brave 的查询拒绝从 2 次降为 0，SearchAPI 瞬时超时没有跨轮永久封锁，证明 v1.2.1 的三项质量修复有效。运行发现两项 `downstream-use-exceeds-valid-output` 遥测异常：同一评分阶段的总体输入/输出量被复制给 Flash 与 Pro 两个成本事件，且第一轮 26 个评分结果中 1 个 `retry-required` 仍被计为下游使用；候选、评分、token 和成本不受影响。v1.1.3 将阶段总体量只归属一次，额外模型事件仅保留 token/成本及明确的零量说明，并把下游采用限制为完成评分数。历史结转事件改为仅结转费用、零操作量，避免跨版本重复计算效率。MX Retail 质量与工具贡献只读复用，不产生新搜索、补证或模型费用；累计成本 6.2575840597 美元。

v1.1.3 的 MX Retail 零调用复用在公开产物再序列化时失败：公开产物为保护查询内容仅保存 `querySha256`，复用器却要求原始 `query` 并再次哈希，因而抛出缺失输入错误。失败发生在任何搜索、补证、模型或新成本事件之前；新增输入/有效输出/下游采用/token/credits/费用均为 0，累计成本保持 6.2575840597 美元。v1.1.4 把公开产物清洗提取为独立纯函数，接受原始查询或既有哈希、两者皆无时才拒绝，并新增公开产物复用回归测试。该修复只影响编排，不改变产品搜索或评分。

v1.1.4 随后成功以零新增调用复用 MX Retail 两组结果，但暴露出成本预测偏差：已完成的零成本复用单元被当作零运行费率样本，使预计总成本从预注册的 30 美元错误降至 16.2575840597 美元。v1.1.5 将“进度完成单元”和“有正成本的运行费率样本”分开：复用单元仍减少剩余单元数，但在首个新付费单元完成前不参与均值估计，预测保持预注册的 30 美元期望值和 40.50 美元上界。新增回归测试；该变更不产生搜索、补证、模型输入输出或费用，也不改变任何质量结果。

v1.1.5 的 84 项冻结输入校验、继承预检和 MX Retail 双臂复用均通过。复用单元输入、输出、token、搜索额度和增量费用均为 0；完成进度为 1/8，累计预算费用保持 6.2575840597 美元，修正后的预测为初始估算法 30 美元期望值、40.50 美元上界，无预算预警或遥测异常。

v1.1.5 GB Distributor/VAD 正式单元两组均达到 30/30。产品组处理 117 条原始发现结果、70 家去重候选、50 家纠偏候选和 39 家完成评分候选，三轮新增 28/0/2 家最终候选，墙钟 487,460 ms；单元增量费用 1.5479422519 美元（产品 1.3548973519、Gemini 0.1930449），累计 7.8055263116 美元，预测总成本 27.0931798232 美元、上界 31.6441300438 美元，无预算或结构化遥测异常。质量审查发现两项待优化但未影响最终 30 家的成本浪费：发现输出存在尾随反引号及退化为 `co.uk` 的脏域名；Tavily 第二轮 7 家首次补证失败后恢复，但失败路径将 attempts 记为 0。为保持冻结实验处理一致性，本轮不修改机制；最终产品修复应增加候选身份规范化/公共后缀拒绝，并在异常路径保留实际 attempts/retries/latency。

v1.1.5 MX SI/MSP 两组均达到 30/30。产品组处理 199 条原始结果、131 家去重候选、92 家纠偏候选和 52 家完成评分候选，两轮新增 20/10 家，墙钟 737,142 ms；单元增量费用 2.3077526438 美元（产品 2.1141123188、Gemini 0.193640325），累计 10.1132789555 美元，预测总成本 29.7525161948 美元、上界 34.2153936240 美元。Tavily 费用 1.608 美元，占产品单元 76.1%，伴随 14 次不可用和 14 次无关证据警告；另有 6 次尾随反引号。DeepSeek Pro 升级 32 次，至少 7 次因 `escalation.reason` 超过 300 字符导致结构校验失败，形成付费升级未被采用的明确浪费。冻结版本继续如实测量当前产品；实验后最高优先级修复为：提示词约束简短原因、解析前结构化压缩/安全截断、升级前严格执行“预计改变总分至少 8 分或角色结论”门禁，并记录升级成功及下游采用率。

v1.1.5 GB Reseller/VAR 首次执行在 Kimi 意图阶段因模型返回不可解析 JSON 而停止；确定性兜底被正式协议正确拒绝。同期 Gemini 臂已完成 30/30 并冻结，重试不得重复调用。失败 Kimi 调用输入 534 tokens、输出 2,000 tokens、有效/下游采用输出为 0，费用 0.0084729246 美元；已完成 Gemini 费用 0.136699375 美元，本次部分执行合计 0.1451722996 美元，累计 10.2584512550 美元。runner 对重复事件 ID追加 `repeat-N` 并保留费用，因此允许一次仅针对未完成产品臂的有限重试；原失败记录和成本不删除。

GB Reseller/VAR 第二次产品臂通过 Kimi（0.007424435 美元）和 RAG embedding（0.000006192 美元），但在公开摘要原子重命名时遇到 Windows `EPERM`；原始账本与完整临时摘要均保留，累计成本 10.2658818820 美元。该故障暴露两个编排缺口：固定进程级临时文件名和 rename 无瞬时文件锁重试；产品臂也未把已完成的意图/RAG 输出作为可恢复阶段缓存。v1.1.6 先修复前者：临时文件名加入 UUID，并对 `EPERM`/`EACCES`/`EBUSY` 按 25/75/200/500 ms 有限重试；新增瞬时与永久失败测试。三个完整质量单元及 GB Reseller Gemini 臂零成本复用，所有既有费用精确结转，只重跑未完成产品臂。阶段输出缓存列入实验后产品优化，避免改变冻结处理机制。

v1.1.6 的 97 项冻结校验、继承预检及 MX Retail、GB Distributor、MX SI/MSP 三个完整单元的零成本复用均通过；连续公开摘要写入未再出现 Windows 文件锁故障。复用阶段新增输入、输出、token、搜索额度和费用均为 0，完成进度恢复至 3/8，累计预算费用保持 10.2658818820 美元，首个新付费单元前预测保持 30 美元期望值和 40.50 美元上界。

v1.1.6 GB Reseller/VAR 有效运行复用 Gemini 30/30，只执行产品臂，五轮得到 26/30，按最大轮次停止；各轮新增最终候选 12/5/6/2/1，墙钟 1,595,737 ms。产品处理 405 条原始结果、182 家去重候选、129 家纠偏候选，但仅 35 家主角色属于 Reseller/VAR，34 家完成评分。纠偏主角色分布包括 Reseller 25、VAR 9，同时有 Unresolved 21、Distributor 20、MSP 14、Hybrid 10、Brand Owner 9 等，证明主要瓶颈是搜索/轻门禁类别纯度而非原始召回。产品臂成本 2.9532020381 美元，其中 Tavily 2.248 美元（76.1%）；Brave 159 条结果仅新增 35 家、124 条命中本轮注册表。含 v1.1.5 两次失败沉没成本后累计 13.2190839200 美元，预测 35.0318920723 美元、上界 40.8201680669 美元，无预算预警。实验后应在付费补证前增强 Reseller 查询模板、便宜角色信号与实时跨轨去重，并以“进入补证候选→正确主角色→最终采用”衡量供应商真实效率。

v1.1.6 MX Distributor/VAD 两组均达到 30/30。产品组处理 121 条原始结果、70 家去重候选、58 家纠偏候选和 42 家完成评分候选，三轮新增 24/4/2 家，墙钟 855,341 ms；单元增量费用 1.9010689240 美元（产品 1.7099195740、Gemini 0.19114935），累计 15.1201528440 美元，预测 32.4015592870 美元、上界 37.2617931801 美元。DeepSeek Pro 仅 5 次且无结构失败。SearchAPI/Bing 同一路由连续三轮超时，6 次尝试/3 次重试、有效输出和下游采用均为 0，保守计费 0.024 美元；其他工具仍完成目标。实验后可把同一任务连续两轮超时且零产出的路由降为隔轮/低频恢复探针，同时保留跨轮恢复能力，减少重复等待和无效请求。

v1.1.6 GB Retailer/E-tailer 的 Gemini 为 30/30，产品在四轮后确认耗尽为 20/30，各轮新增 14/6/0/0，墙钟 923,927 ms。产品处理 343 条原始结果、94 家去重候选、67 家纠偏候选和 30 家完成评分候选；纠偏角色仅 Retailer 29、E-tailer 1，另含 Distributor 14、Hybrid/Unresolved 各 6、Brand Owner 5 等。30 家目标角色中又有 8 家 research-required、2 家 ineligible，主要因网络产品相关性 unknown/conflicting 或英国存在性不支持；B&Q、CeX、GAME、非英国 MediaMarkt 等显示查询仍泛化到一般电子零售而非 router/mesh Wi-Fi/home networking 商品场景。单元费用 1.6957549764 美元（产品 1.6221584764、Gemini 0.0735965），累计 16.8159078204 美元，预测 31.1825917794 美元、上界 35.8599805463 美元。优化优先级是收紧商品类别查询和低成本商品页信号、跨轮去重，再决定是否扩量，避免对泛电子零售商重复补证。

v1.1.6 MX Reseller/VAR 两组均欠填：Gemini 15/30、产品 13/30；产品五轮新增 8/2/2/1/0 后达到最大轮次，墙钟 718,526 ms。产品处理 269 条原始结果、103 家去重候选、85 家纠偏候选，但目标主角色仅 VAR 10、Reseller 8，另有 Distributor 18、SI 17、Unresolved 11 等，最终 18 家完成评分、13 家采用。SearchAPI 20 个计划调用中 6 次超时、14 次轮内断路跳过，零有效输出；Brave 200 条仅新增 54 家。产品成本 2.1837832398 美元，其中 Tavily 1.64 美元；Pro 16 次且 4 次结构失败。单元总费用 2.2484862398 美元，累计 19.0643940602 美元，预测 31.2640221048 美元、上界 35.9536254205 美元。市场本身困难，但产品仍需用墨西哥本地 Reseller/VAR 术语和 Distributor/SI 排除信号提升早期纯度，并修复升级输出规范化；单纯扩轮会继续增加错角色补证。

v1.1.6 GB SI/MSP 两组均达到 30/30。产品组处理 84 条原始结果、72 家去重候选、67 家纠偏候选和 60 家完成评分候选，两轮新增 29/1 家，墙钟 515,504 ms。单元增量费用 1.6972997338 美元（产品 1.5607417338、Gemini 0.136558），其中 Tavily 为 1.168 美元；Google Places 32 条有效结果中 31 条进入下游，Gemini Full 32 条中 27 条、Brave 20 条中 14 条进入下游，SearchAPI 两次尝试和一次重试仍为零产出。DeepSeek 共 42 次 Flash 和 5 次 Pro；两次 Pro 结构失败再次验证升级输出规范化问题。该单元没有域名反引号、provider unavailable 或预算异常，说明 SI/MSP 搜索模板在英国的召回和类别纯度明显优于 Reseller 与 Retailer。

正式搜索阶段 8/8 单元完成后，累计实际费用为 20.7616937940 美元，触发 USD 20（20%）预算检查点。按有正成本的实际单元速率预测，实验完成总成本为 30.7616937940 美元，保守区间为 26.1474397249–35.3759478631 美元；没有超出 USD 100 硬上限的风险，因而不触发暂停或方案调整。该累计费用包含先前失效版本、作废正式尝试和预检的沉没成本，不能只用当前有效单元的边际成本反推。搜索槽位原始填充率为 Gemini 225/240（93.75%）、产品 200/240（83.33%）；这只是召回数量，不是最终质量结论，必须在共享补证、统一评分和盲审之后按有效性、65+/75+、NDCG 与槽位效用判断。下一阶段重点观测重复证据复用率、Gemini-only 候选的增量补证成本、评分输出利用率和盲审校准成本。

v1.1.6 共享评估 8/8 单元完成：产品已经处理过的候选直接复用本次运行证据与评分，只对 Gemini 独有候选执行新增 Tavily 证据、DeepSeek 主角色纠偏和 score-only 评分，不生成合作路径、策略、邮件或联系人。该阶段使累计费用从 20.7616937940 增至 24.9223087090 美元，增量 4.1606149150 美元；三个总账截至盲审前分别为产品臂 18.809853、Gemini 原生臂 1.878230、共享评估 4.234225 美元。全程未触发 40% 检查点或预算预警。运行器已生成 32 份隐藏组别与原评分的随机盲审包，并按协议停在 `blind-audit-running`；盲审决策必须由本对话 Codex 在不搜索 Web 的情况下完成、提交并推送后才允许解盲。观察到的四项遥测异常均为 `downstream-use-exceeds-valid-output` 口径问题：部分纠偏批次把总体输入/采用量复制到 Flash/Pro 成本子事件，候选、评分和实际费用不受影响，但实验后需把阶段总体量只归属一次，模型子事件仅记录自身 token、成本和实际有效输出。

首轮 32 家本对话 Codex 盲审的增量 API 现金成本为 0，32 条输入、32 条有效输出和32条下游采用均已记录；本对话 token 无法从运行时取得，明确标记为遥测缺口而不伪造估算。校准结果为主角色一致率 62.5%、合格状态一致率 78.125%、Spearman 0.570、平均偏差 -0.094、MAE 11.781、引用对齐 100%。仅系统性偏差与引用门禁通过，角色、资格、排序和绝对误差未通过，因此按冻结协议自动扩展为 64 家；该扩展不新增搜索、补证或外部模型调用，累计费用仍为 24.9223087090 美元。低平均偏差但高 MAE 表明问题不是整体偏高或偏低，而是公司级语义判断分歧大；在 64 家完成并正式解盲前不修改裁判或产品评分，也不提前归因。

64 家扩展盲审完成后，主角色精确一致率为 60.94%、合格状态一致率 70.31%、Spearman 0.691、平均偏差 +2.91、MAE 10.75、引用对齐 100%。精确角色、合格状态、排序和绝对误差门禁未通过，因此正式结论为“不确定”，不能依据产品评分器显示的 +22.69 宏观槽位效用、7/8 单元获胜和 [18.48, 26.92] bootstrap 区间宣称产品优于 Gemini。角色家族一致率为 82.81%，高于精确角色一致率，主要由于 Retailer/E-tailer、Distributor/VAD 等同家族子型差异；后续实验应把角色家族/请求类别准确率作为搜索质量主门禁，精确子型保留为独立诊断，同时继续严格拦截 Brand Owner、ISP、目录和错误 `Hybrid` 等真实跨家族错误。GB Retail 与 MX Retail 是优先校准单元。

正式实验总成本为 24.9223087090 美元、495 个事件：Gemini 账本 1.87823045、产品账本 18.8098533440、共享评估 4.2342249150 美元。该总额包括所有预检、失败和作废版本沉没成本；仅达到 20 美元检查点，未达到 40/60/80 美元检查点，始终没有 100 美元上限风险。两组共 425 条最终输出、322 条评分器认定有效、228 条 65+、140 条 75+，相应全实验单位成本为 0.0586、0.0774、0.1093、0.1780 美元，但盲审门禁失败意味着后面三种质量单位只能作为未校准指标。

八个最终采用的产品单元执行成本为 15.4091824586 美元、200 条最终输出，即 0.077046 美元/输出；其中发现搜索 2.979 美元，Tavily 首次/纠偏补证 1,378 credits、11.024 美元，DeepSeek 轻门禁+纠偏+评分 6,300,277 token、1.353276 美元。按冻结官方费率回算，v2.0 的 207 家预选池证据+纠偏+评分为 9.689593 美元，即 0.046810 美元/预选公司。当前模型成本/最终输出下降 66.0%，Tavily credits/纠偏公司下降 33.1%；但模型+Tavily/最终输出比 v2.0 高 32.2%，原因是冷启动流程需要为大量最终被判错角色或证据不足的公司付费补证。成本优化在模型调用和单个纠偏对象层面成功，但端到端单位采用成本尚未成功；下一步必须提高付费补证前类别纯度。

冻结报告的 provider Top-30 贡献全为 0 是报告器错误，不能用于裁剪工具。报告器把数组形式的 `raw.corrected` 当成 `raw.corrected.candidates`，且未追溯三个零调用复用单元的原始 provenance。只读运行后审计要求 200/200 最终产品候选都能映射来源，修正后的 fractional final credit 为 Brave 77.5、Gemini Full 44、Exa 27、Google Places 27、SearchAPI 24.5，总和精确等于 200；对应完整有效产品执行的发现成本合计 2.979 美元。SearchAPI 虽有重复超时但贡献不是 0，应改为隔轮有界恢复探针，而不是删除。另有 48 条共享纠偏 `downstream-use-exceeds-valid-output` 来自把阶段总体量复制到每个模型 usage 事件；需改为总体量只归属一次。64 条本对话 Codex token 不可见异常属于明确的观测边界，API 现金成本为 0，不做伪造估算。
### Stage 6: post-experiment category-purity and failed-cost repairs (implementation verification)

The formal UK/MX audit showed that paid evidence was being spent on directories, direct brand stores, ISPs and unrelated retailers, and that repeated transient SearchAPI failures were probed in every round. Hybrid-search v1.3.0 now validates domain syntax/public-suffix boundaries before the semantic gate, tests Retail/Reseller/Distributor/SI categories by defining commercial action, and changes repeated transient failures to one skipped round followed by a bounded recovery probe. SearchAPI remains enabled because corrected attribution showed 24.5/200 fractional final-output contribution.

Role correction v7 now requires material co-primary operations before using `Hybrid`, preserves conflicting duplicate decisions as `Unresolved`, and applies subtype-specific action definitions. A bounded structural sanitizer truncates overlong strings and drops unknown enum labels without adding evidence or turning unknown claims into supported ones. This removes schema-only Pro retries while retaining the existing material escalation gate of an expected score change of at least eight points or a critical-state change.

Tavily failures now retain aggregate request attempts, retries and latency. For this implementation-verification stage, repository input was the 64-company blind-audit diagnosis plus five edited workflow components; valid output was five passing focused test files (27 tests), and every code output is consumed by production discovery/evidence/correction. External token/API-credit cost is USD 0, external latency is 0, external retries are 0, and real quality/cost deltas are `not-observed`. Discarded implementation outputs: none. The next measured run must record raw candidates, valid domain candidates, light-gate category pass/hold/reject, downstream corrected/scored/final counts, Tavily credits and failed attempts, model tokens, latency, cooldown skips, recovered probes, schema repairs, schema retries, exact-role/family agreement, and cost per final in-role company.

Automatic optimization opportunities retained for later evidence: replace the finite public-suffix exception list with a maintained PSL implementation if country expansion exposes misses; calibrate category reject codes on one to two representative companies per category; and remove or further cool a provider only when final fractional contribution and quality-adjusted marginal cost both support that change.

### Stage 7: evaluation attribution and aggregate-volume repair (implementation verification)

Future product-cell outputs now retain a compact candidate-to-discovery-provider projection that is actually consumed by the formal contribution report. Frozen-arm reuse reconstructs the same projection from the source raw checkpoint and fails closed when any final candidate lacks provenance. Shared-evaluation correction/scoring usage is grouped by provider/requested/actual model; aggregate stage input, valid output and downstream-use volume is attributed once, while every model group retains its own token cost, latency, attempts and retries. This removes the two reporting defects diagnosed after v1.1.6 without mutating its frozen result; the v1.0.16 post-run audit remains authoritative for that completed run.

This implementation stage used repository fixtures only: two reporting paths received valid output, three regression tests consume those outputs, external token/API-credit cost and external latency are USD 0/0 ms, retries are 0, and discarded output is 0. The next experiment must assert that fractional final credit sums exactly to the product final-candidate count and that no cost event has downstream-used output above valid output. Any mismatch is fatal before route-optimization recommendations are rendered.

### Stage 8: blind-audit v2 bias and cost-control mechanism (implementation verification)

The next formal evaluation now uses a versioned blind-audit v2 protocol without rewriting the completed v1.1.6 result. Each of eight cells contributes six representative candidates selected by a deterministic hash that does not consume arm, rank, score or scoring-citation fields, plus two deliberately difficult candidates selected for threshold or arm/rank disagreement. The 48 representative cases alone control the calibration gates; the 16 stress cases retain diagnostic value but cannot depress a population-quality estimate by construction. Sample cohort and stress stratum remain in the private mapping and are not sent to judges.

Every packet reuses current-run cached evidence from an audit pool that is separate from the primary scorer's cited subset, applies a fixed source-order and size policy, and includes a same-market/same-role scale anchor. Missing score-independent evidence fails closed instead of silently falling back to scorer-selected citations. No packet construction triggers search or evidence acquisition. Two different high-capability provider/model families must produce independent decisions. A third decision is allowed only when total scores differ by at least eight points, role families disagree, or identity, target market, requested family, score threshold or eligibility disagree. Same-family subtype disagreement is retained as a diagnostic and does not itself trigger arbitration. This bounds the expensive third call while ensuring every first- and second-judge output is consumed by consensus. Dependency-complete decision keys checkpoint every valid judge and arbitrator output; execution returns cache reads, hits, misses and writes, and rejects mismatched entries. Every cache miss must pass an explicit atomic paid-call authorization hook so the frozen USD 100 hard limit and 20/40/60/80 checkpoints cannot be bypassed by concurrent judges.

Main gates now use role-family agreement, overall qualified-state agreement, macro-average within-cell Spearman, absolute mean bias, MAE, citation-ID validity and citation-claim entailment. Exact role subtype and pooled Spearman are diagnostics. Qualification is separately audited for identity, market presence, requested family, 65-point threshold and output-eligibility label. Raw inter-judge role-family, exact-subtype, qualification and score-difference diagnostics expose whether consensus is masking an unstable judge. Claim entailment is derived from the judges' explicit direct/partial/context-only/unsupported annotations; it is no longer conflated with syntactically valid evidence IDs. This is still model-mediated semantic verification, so later human spot checks should measure judge reliability rather than treating it as ground truth.

Implementation inputs were the frozen v1.1.6 failure diagnosis, one existing evidence/scoring data path and the confirmed scoring policy. Valid outputs are one versioned protocol, two rubrics, one strict schema, one executable sampling/judging/consensus/metrics module, an independent audit-evidence projection and regression coverage. All valid code and documentation outputs are downstream-used; discarded implementation output is 0. Paid model calls, Web searches, extraction credits, external token input/output, external latency and retries for this stage are all 0. Measured v2 quality improvement, token cost, cash cost, arbitration rate and judge reliability remain `not-observed` until the next preregistered evaluation. The next run must record each judge and arbitrator separately: input bytes/items, valid output, downstream use, token usage, official/account cost, latency, attempts, retries, schema rejection reason, citation rates, arbitration reason and marginal effect on the final consensus.

Optimization opportunities recorded for later analysis: calibrate the 35% arbitration-rate warning after the first measured run; compare one or two representative cases per role family against a human audit; compress duplicated evidence excerpts only after citation-entailment and within-cell ranking gates hold; and consider a smaller second judge only if it preserves family, qualification and score calibration. None of these cost reductions is applied automatically.

### Stage 9: Colombia formal evaluation v2 preregistration (implementation verification)

The second formal evaluation is preregistered under `experiments/search-e2e-evaluation/co-v2`. It freezes one Colombia market, the four core role categories, 50 requested companies per arm/category, 200 slots per arm and 400 total slots. The product arm uses the current category-purity, within-run caching, fresh-evidence, primary-role correction and score-only mechanism; the one-shot Gemini control is unchanged except for the requested count. Cooperation paths and downstream sales outputs remain excluded.

The v2.1 blind protocol preserves the v2 per-cell density while scaling from eight to four cells: 24 representative and 8 diagnostic stress cases. Two independent high-capability model families are required, with conditional DeepSeek Pro arbitration only for an eight-point or critical-state conflict. All judge outputs use dependency-complete local caches, and no blind packet triggers search or evidence acquisition.

The run has a USD 50 hard cap and mandatory USD 10/20/30 reviews. Each cost event supplies aggregate input, raw, valid and downstream-used volume, model/search cost, latency, retries and discard reasons; checkpoint artifacts add completion forecasts and utilization. The preregistration stage itself made 0 external calls, consumed 0 paid tokens/credits, incurred USD 0 external cost and 0 external latency/retries. Valid outputs are the frozen configuration, protocol, runner, schemas, tests and documentation; all are used downstream and discarded implementation output is 0. Actual Colombia efficiency and quality remain `not-observed` until paid execution.

### Stage 10: Colombia intent-constraint guard v2.0.1

The first CO Retail attempt found a material intent-planner defect before Product discovery: Kimi changed the explicit confirmed request from 50 Retailer/E-tailer companies to 20 companies across all ordinary roles. The semantic guard stopped the Product arm. Gemini independently returned 15/50 and remains frozen/reusable. Sunk cost is preserved: Kimi 559 input/1,166 output tokens, 14.402 seconds and USD 0.0051770629; Gemini 561 input/2,188 output tokens, 12 grounding queries, 16.776 seconds and USD 0.1764651; cumulative USD 0.1816421629. Kimi produced one schema-valid plan but it was not used for execution, recorded as `confirmedPlanMismatch`.

v2.0.1 keeps the agreed model-first, multi-turn Kimi intent step and strengthens its instruction to copy explicit country/count/role constraints. Once a user has confirmed a plan, the confirmed structured constraints are authoritative; a later lightweight template-fit call may recommend coverage/template changes but cannot silently change scope. The experiment harness now records divergence as a warning and continues with the confirmed frozen plan. This change does not alter search, evidence, scoring, sample or win gates. It prevents a model fidelity error from wasting all downstream discovery/evidence cost or shrinking the requested output.

### Stage 11: bounded structured-intent retry and provider redundancy v2.0.2

The next CO Retail Product attempt again stopped before search: Kimi returned truncated JSON at exactly the former 2,000-token light-intent ceiling. This added 601 input/2,000 output tokens, 33.940 seconds and USD 0.0085371301 with zero valid or downstream-used output. Cumulative experiment cost is USD 0.1901792930; no Product discovery, evidence, correction or scoring cost exists yet.

The production intent agent now retries invalid/truncated Kimi structured output once, aggregates every attempt's tokens/latency/retry count instead of pricing only the last response, and raises the light ceiling to 4,000 tokens. If Kimi still fails, the previously approved cross-company same-capability redundancy uses DeepSeek Flash and records actual provider/model, fallback state, input/output, latency, attempts and warnings. Deterministic routing remains last-resort degraded UI behavior, not a silent production substitute. Nineteen focused tests cover Kimi success, retry aggregation, provider fallback, failure telemetry and Colombia 50-slot invariants; external calls/cost for implementation verification are 0 and discarded code output is 0.

### Stage 12: Colombia model-provider outage and cache-safe recovery v2.0.3

The first successful CO Retail Product traversal generated 65 raw discovery results, 31 new unique companies, 27 fresh-evidence/correction inputs and 27 deterministic correction outputs, but zero publishable role corrections, score inputs or final outputs. DeepSeek direct inference returned `Insufficient Balance`; because no `LEAD_AI_FALLBACK_*` route was configured, every candidate remained `Unresolved`. Product spent USD 0.7530831701 (search USD 0.222, initial Tavily evidence USD 0.320, correction Tavily evidence USD 0.192, intent/RAG USD 0.0190831701) with zero downstream final utilization. Together with the frozen Gemini result and two earlier intent failures, cumulative experiment spend became USD 0.9295482701. SearchAPI also returned quota HTTP 429, while Brave rejected `country=CO` with HTTP 422.

v2.0.3 makes a configured OpenRouter key an automatic public-only same-tier DeepSeek fallback after bounded direct-provider failure. Packets containing private cooperation-path memory remain `private-workspace` and require a separately approved private fallback. Successful fallback telemetry now carries the requested and actual provider/model, primary plus fallback attempts, token usage and OpenRouter-reported cash cost. Brave uses `ALL` for unsupported country parameters while retaining the country name in its localized query. A minimal live OpenRouter DeepSeek structured-output diagnostic used 87 input and 130 output tokens, returned one valid/used result, cost USD 0.000046498, and discarded zero outputs; the unavailable direct DeepSeek request returned before token billing.

### Stage 13: Colombia reasoning timeout and invalid Pro escalation repair v2.0.4

CO Retail v2.0.3 accumulated USD 1.6755584861 across 66 events, accepted 466/486 raw outputs, used 296 downstream, and still published 0/50. Product cost was USD 1.4990933861; Gemini cost was USD 0.1764651000. Summed event latency was 1,025,291 ms with four retries. Discards included 117 duplicates, 78 wrong-primary-role/gate outcomes, 52 reroutes, 17 light-gate rejects, 10 provider-cooldown skips, and 17 explicit provider/rate-limit/circuit/HTTP failures. No USD 10/20/30 checkpoint was crossed; the forecast was USD 14.7022 expected and USD 17.1652 upper.

The dominant defect was output utilization, not acquisition scarcity: the cache held 51 corrected candidates, but 47 were deterministic unresolved fallbacks after reasoning-enabled routine calls timed out. Observable late-round model events generated 21,795 reasoning tokens that were not required for compact classification. Generic catch handlers then upgraded infrastructure failures to Pro, producing paid work without the required semantic evidence of an eight-point or critical-state change.

v2.0.4 disables optional reasoning for automatic public OpenRouter DeepSeek requests, shares one provider circuit across a Product cell, allows one same-tier single-candidate schema repair, and forbids Pro escalation for transport, timeout, balance or provider errors. A real cached-packet diagnostic produced one valid/used correction from one input, with 9,187 input tokens, 1,859 output tokens, zero reasoning tokens, 17,867 ms latency, no retry/discard and USD 0.0018067 account cost. This diagnostic is implementation evidence and is excluded from the formal experiment ledger. The formal resume must reuse all same-run search/evidence artifacts, measure corrected-to-in-role-to-scored utilization, and retain every prior sunk cost.

### Stage 14: Colombia token-aware correction and acquisition-closed recovery v2.0.5

The v2.0.4 recovery consumed 51 cached correction inputs but produced zero model-valid corrections and zero downstream-used outputs. Large multi-candidate dossiers caused the first OpenRouter calls to exceed 75 seconds; subsequent requests were skipped after those request-local timeouts opened the fallback circuit. The recovery-boundary defect then launched discovery round five. That round added USD 0.368 to the formal ledger—USD 0.080 discovery, USD 0.168 fresh evidence and USD 0.120 correction evidence—produced 16 corrected records, and used zero for scoring/final output. Cumulative spend is USD 2.0435738961; expected/upper completion forecasts are USD 16.1742/USD 19.1782; no mandatory checkpoint has been crossed.

v2.0.5 caps correction packets at ten relevance-prioritized current evidence items and 1,200 characters per excerpt, caps serialized batch input at 28,000 characters, and uses batch size one with concurrency two for same-run formal recovery. Request-scoped timeouts no longer trip the provider-wide circuit. Recovery is acquisition-closed, so its allowed outputs are only corrected roles, score-only assessments and final rankings from the 67 cached candidates. Regression verification covers schema repair, infrastructure non-escalation, timeout circuit behavior and recovery config; actual cached-recovery token, latency, valid-output and downstream-use efficiency will be recorded by the next run.

### Stage 15: Colombia localization, identity and concrete-primary repair v2.0.6

v2.0.5 correction consumed 67 inputs and returned 66 outputs, 57 model-valid corrections and 15 in-role outputs. Flash used 240,342 input/124,140 output tokens; two policy-qualified Pro calls used 6,790/2,335; reasoning was zero. Correction account cost was USD 0.0630092. Qualification consumed 15, returned 15, completed 12 and retained 6; Flash used 104,016/21,188 tokens and one Pro call used 7,585/1,691, for USD 0.0345714. Three assessments timed out. Total experiment cost reached USD 2.1411647, with USD 16.5645 expected and USD 19.7119 upper forecast and no budget checkpoint.

Only 6/50 final outputs exposed four upstream defects: Mexico city focuses polluted every Spanish Colombia query; Exa-owned profile URLs merged unrelated companies; incomplete Latin American public suffixes yielded invalid identity domains; and 19 Hybrid primaries included single-family Retailer+E-tailer cases. v2.0.6 keys localization by country code, isolates Exa provenance from identity, normalizes observed public suffixes, and converts same-family Hybrid to a concrete role. The formal search extension reuses every prior valid score/evidence, retries only incomplete cached assessments, excludes cached domains and measures new discovery-to-gate-to-evidence-to-role-to-score utilization separately. SearchAPI's exhausted quota remains an explicit provider failure rather than silently changing the arm.

The formal repair entry point accepts only a completed zero-output Product outage artifact. It reuses the same-run intent, RAG, playbook, discovery results, fresh evidence and correction-stage supplemental evidence; only semantic correction/scoring and still-untried discovery rounds may execute. This prevents 27 candidates' already acquired evidence from being purchased again and records the reuse as a zero-cost cache event. Six focused files currently pass 41 regression tests and typecheck passes; implementation-test external cost is otherwise zero. Remaining optimization opportunities are to persist provider quota/circuit health across cells, include minimal schema-valid provider calls in formal preflight, and quantify fallback utilization/cost after recovery rather than removing SearchAPI from one quota incident.

### Stage 16: Colombia evidence affiliation and target-country gate repair v2.0.7

The v2.0.6 Retail extension reached 11/50 at cumulative USD 3.2347474982 but its valid-output count was not trustworthy. Earlier suffix collapse had turned `com.pe` and `co.cr` into evidence targets, so unrelated national-domain pages were marked official. Correction search also retained pages that did not name the candidate, and qualification could independently override country evidence. Exa profiles/domainless IDs inflated discovery yield, one overlong gate reason held a whole batch, and incomplete model rounds advanced exhaustion. These are product defects rather than evidence scarcity.

v2.0.7 requires a registrable domain before paid official evidence, filters correction results by exact domain, normalized candidate name, distinctive domain label or multi-token entity match, and instructs the correction model to answer country presence only for the requested market. Qualification deterministically downgrades or rejects a target-country gate not supported by the correction finding. Discovery-gate output is schema-bounded without inventing positive facts; provider profiles and domainless identities are discarded from valid/new-company counts; model-failed rounds do not advance exhaustion; and an explicit 50-company cell receives up to ten bounded rounds.

The corrupted Product artifact will be archived and excluded from outcome metrics, while all prior cost stays in the budget ledger and the frozen Gemini result is reused. This cache invalidation is versioned: reuse is mandatory for overlapping valid work, but artifacts proven to violate identity/evidence lineage cannot be reused. Implementation inputs were four invalid-lineage examples plus the 96-record cached pool; valid outputs are the affiliation/country guard, bounded gate normalization, corrected telemetry, exhaustion policy and restart boundary. Six focused test files consume these outputs. External implementation calls, tokens, search credits, latency and retries are 0; actual restart efficiency remains pending. Optimization opportunities to measure are affiliation-filter discard rate, gate-schema salvage rate, country-gate downgrade rate, cost per final candidate, and whether SearchAPI's persistent quota state should be cached across cells.

### Stage 17: Colombia Retail clean restart and incomplete-output diagnosis

The v2.0.7 clean Product restart published 6/50 requested Retailer/E-tailer candidates while reusing the frozen 15/50 Gemini control. Cumulative formal cost is USD 5.2302219218 across 260 events: Gemini USD 0.1764651 and Product USD 5.0537568218, including all invalidated/debug versions as sunk cost. The one-cell forecast is USD 28.9207 expected and USD 36.6090 upper against the USD 50 hard cap. Spend is 10.46%, so no mandatory USD 10/20/30 review has yet been crossed.

The clean restart consumed 1,027 aggregate inputs, emitted 2,557 raw outputs, retained 2,083 valid outputs and used 1,056 downstream. Aggregate valid-output rate is 81.46% and downstream utilization is 50.70%, but those totals include repeated search rounds and cache stages and must not be interpreted as candidate precision. Discovery found fresh domain-bearing candidates during five rounds; later zero-yield rounds did not buy correction evidence. The final six scores are 68, 68, 68, 62, 57 and 53. Evidence affiliation and target-country binding remained intact in the reviewed output.

The binding underfill is model availability, not demonstrated market scarcity. Among 47 correction records, 27 are unresolved and 21 of those are deterministic fallbacks after the direct DeepSeek endpoint reported insufficient balance and the OpenRouter DeepSeek route timed out. Three more assessments are retry-required. Round one spent correction-search credits for 29 candidates but produced only 13 model-valid corrections and four requested-family corrections; all seven round-five correction inputs fell back deterministically. SearchAPI's monthly quota also remained unavailable. Therefore the 6/50 output cannot enter a quality comparison until acquisition-closed semantic recovery is attempted.

The next implementation must give each fallback route its own bounded deadline, add a public-only peer-provider route at the same routine/escalation capability tier, and recover only deterministic corrections plus incomplete or materially affected scores. Search, first evidence and correction-search evidence are cache hits with zero repeated API credit. Each fallback event must retain requested and actual provider/model, tokens, account and official cost, latency, attempts, retries and discard reason. An automatic optimization opportunity is also retained: persist provider quota health across cells and conditionally replace an unavailable discovery source without concurrently duplicating equivalent search-engine work.

### Stage 18: bounded peer-provider fallback and incomplete-only recovery v2.0.8

Runtime v3.7.0 preserves direct DeepSeek as primary and permits at most two equivalent fallbacks for public packets: the same DeepSeek tier through OpenRouter and then an OpenAI peer tier through the same gateway. The routes have independent 45-second and 25-second deadlines inside the existing outer request budget. Failed-route attempts and retries are now included in successful fallback telemetry instead of reporting only the primary failure. Private workspace content still requires an explicitly approved private route; embeddings have no fallback.

The Colombia runner adds an acquisition-closed `--repair-incomplete` mode. It retries only correction records whose prior model is `deterministic-fallback`, then scores only records that are missing, retry-required or materially changed by that correction. All completed unaffected corrections and scores, discovery results, homepages, fresh evidence and supplemental evidence are reused. Ranking is rebuilt from the complete cache, so the existing six eligible Retail results cannot disappear merely because they were not reprocessed. Empty model-usage stages still emit an explicit failed efficiency event instead of becoming invisible.

The OpenAI peer choice follows the official structured-output capability and token price for `gpt-4o-mini`; `gpt-4o` is reserved for an already policy-qualified escalation rather than infrastructure failure. The first repository-only implementation verification incurs no new search/extraction credits. A prior minimal capability diagnostic used 131 input and 6 output tokens, 1.515 seconds and USD 0.00002325 account cash cost; it sent no candidate or private content and is not yet part of the formal ledger. The frozen provider check will repeat one minimal schema call after tagging and record its exact runtime/account cost before recovery. Optimization opportunities remain: measure peer-fallback adoption and cost per recovered correction, and do not make the peer primary unless quality and availability evidence—not one outage—support that change.

### Stage 19: Colombia Retail fallback measurement

Both v2.0.8 structured preflights passed. The same-tier OpenRouter DeepSeek call cost USD 0.0000080017 and the direct OpenAI peer call cost USD 0.0000237. Acquisition-closed recovery retried 21 deterministic corrections and nine missing, retry-required or materially affected scores. It raised the Product Retail output from 6 to 13, adding seven candidates for USD 0.0339371944: correction USD 0.0212534135 and scoring USD 0.0126837809. Search, homepage and Tavily credits were zero. The complete experiment reached USD 5.2641908179; expected/upper forecasts are USD 29.0565/USD 36.7947, and no USD 10/20/30 checkpoint was crossed.

Correction returned 21 records, 11 with resolved roles and six in the requested family. Qualification returned nine completed assessments. OpenRouter DeepSeek carried 34,711 input/22,035 output correction tokens and 48,432/10,836 scoring tokens; OpenAI `gpt-4o-mini` carried 40,359/6,223 and 17,372/2,178 respectively. The aggregate event model correctly retains failed-route attempts in the eventual fallback usage, but stage-level batch persistence delayed real-time token visibility until completion. Per-call or per-candidate checkpointing is therefore an explicit future observability optimization.

Review found two policy contradictions in otherwise schema-valid output. Mercado Libre's supported findings called it a third-party seller marketplace while the role remained E-tailer. Techniservice had `Unknown` scale but received 15/15 scale/coverage, and its 15/15 buying-influence score exceeded the existing 9/15 deterministic evidence cap. The 13-result state is retained as an observed but not final-quality artifact; the repair must not repeat any external call.

### Stage 20: deterministic role and score consistency v2.0.9

Runtime v3.8.0 removes Retail/E-tail roles only when supported semantic findings explicitly establish a third-party seller marketplace, caps unknown scale at a neutral 8/15 rather than zero or maximum, and enforces the existing buying-influence evidence cap before recomputing total, range, recommendation priority and account tier. The model remains responsible for semantic findings and raw sub-scores; code enforces internally consistent totals and states.

The Colombia `--repair-consistency` path reuses all model semantic output, discovery and evidence, applies the same deterministic rules to cached records, and rebuilds ranking without a model, search, homepage or Tavily call. Implementation input was the 47 cached corrections and their cached assessments; code/tests/docs are all downstream-used, discarded implementation output is 0, and external tokens, credits, cash cost, latency and retries are 0. Full verification passed 88 files/392 tests, typecheck passed and lint has 0 errors with 11 pre-existing warnings.

The measured zero-cost repair processed 66 cached correction/assessment records, removed one explicit marketplace from the requested family and capped 15 assessments. Product Retail changed from 13 to 12 outputs. Techniservice moved from 100 to 87, Alkosto from 88 to 78 and Homecenter from 80 to 70; the complete final score sequence is 87, 78, 70, 64, 64, 64, 64, 60, 58, 55, 54 and 51. Formal cost stayed USD 5.2641908179 and no checkpoint was crossed. The superseded 13-result state remains recoverable in Git history, and all prior cost remains visible.
