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
