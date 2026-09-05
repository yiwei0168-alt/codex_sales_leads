# Cudy端到端搜索能力正式测评协议 v1.1.5

> 2026-09-06 preregistration: v1.1.5 fixes cost forecasting after a completed zero-paid-call frozen-arm reuse. Reused cells still count as completed for progress and remaining-cell calculations, but only cells with positive current-run cell cost are eligible run-rate samples. Until the first newly paid cell completes, the forecast remains the conservative preregistered USD 30 expected / USD 40.50 upper estimate. Search, evidence, scoring, samples, models, MX Retail quality outputs and cumulative USD 6.2575840597 spend are unchanged.

> 2026-09-06 preregistration: v1.1.4 fixes a zero-paid-call orchestration failure in v1.1.3. Frozen public product artifacts contain `querySha256` instead of raw query text; the reuse sanitizer now accepts the existing hash and still rejects calls with neither representation. A unit test covers the public-artifact path. The v1.1.2 MX Retail quality result, treatment, costs and all remaining experiment rules are unchanged.

> 2026-09-06 preregistration: v1.1.3 changes evaluation telemetry only. v1.1.2's MX Retail product result is a valid 21/30 quality observation and is reused byte-for-byte for scoring and provider contribution. Its USD 1.9103677258492517 cost is carried once. The instrumentation fix attributes aggregate stage input/output/downstream-use volume to one primary model cost event instead of copying it to both routine Flash and escalation Pro events; all model token and cost data remain separate. Historical cost-adjustment events now carry zero operational volume because the frozen source artifacts retain the original stage records. Search, evidence, role correction, scoring, models, stop policy, samples, control and win gates are unchanged.

> 2026-09-05 preregistration: v1.1.2 replaces the invalidated v1.1.1 treatment. v1.1.1 restored the frozen Flash routine-model bindings, but its MX Retail product arm produced only 8/30. Two Brave requests were rejected because the final query plus domain exclusions exceeded the provider's 600-character limit; two SearchAPI timeouts then opened a provider circuit that persisted across later discovery rounds; those partially unavailable rounds were nevertheless counted toward confirmed exhaustion. v1.1.2 caps submitted Brave/SearchAPI queries at 580 characters, keeps permanent circuits only for provider-scoped failures such as authentication or quota, reopens transient route failures on the next round with a bounded recovery probe, and excludes partially unavailable rounds from the two-round exhaustion counter. Scoring, eligibility, models, sample, control arm and win gates are unchanged.

> The invalidated v1.1.1 cost is not erased: its product arm added USD 0.9570672632348112. Product USD 3.384767333872236, Gemini USD 0.888839 and evaluation USD 0.07361 are carried into v1.1.2, USD 4.347216333872236 total. Its 8 product candidates are diagnostic only and are not reused.

> 2026-09-05 preregistration: v1.1.1 replaces the invalidated v1.1.0 treatment. The v1.1.0 MX Retail diagnostic produced 15/30 but all routine DeepSeek calls inherited `deepseek-v4-pro` from mutable runtime configuration, violating the confirmed Flash-routine/Pro-material-escalation policy. v1.1.1 freezes discovery gate, role correction and score-only qualification to `deepseek-v4-flash`, with `deepseek-v4-pro` available only after a material escalation trigger. A zero-call preflight rejects binding drift. Adaptive target-pool size now expands provider result depth up to 20, Google Places receives a compact local-commerce query, and Brave/SearchAPI receive bounded prior-domain exclusions. The unchanged v1.0.15 MX Retail Gemini control remains byte-for-byte reused.

> The invalidated v1.1.0 cost is not erased: product USD 2.427700070637425, Gemini USD 0.888839 and evaluation USD 0.07361 are carried into v1.1.1, USD 3.390149070637425 total. Its OpenRouter preflight already selected `codex-in-session`; the frozen selection and cost are reused without repeating failed Claude/OpenAI gateway calls.

> Blind review uses the v1.1.0 preflight result: `Codex in this conversation`, with no Codex API and no Web search. Claude Opus 5 returned a nonconforming structure and OpenAI gpt-5.6-sol had no endpoint supporting the requested parameters. Those calls are not repeated in v1.1.1.

> 2026-09-04 状态变更：v1.0.15 在完成 MX Retail 后保持不可变并暂停。用户要求把 OpenAI/Claude 改经 OpenRouter，已改变盲审 provider adapter；同时 MX Retail 暴露 6/30 的严重欠填。两项都不能回写到已冻结协议。现有结果、1.7460204111 美元累计成本与 resume checkpoint 原样保留；在轮换后的 `OPENROUTER_API_KEY` 通过最小预检、且下一版搜索补填机制完成确认之前，不得继续剩余付费单元。详细根因见 `analysis/MX-retail-underfill-v1.0.15.md`。

状态：`preregistered-pending-preflight`

v1.0.15拆分两种原本混用的成本不变量：复用的v1.0.10预检源成本必须与源账本精确一致；累计结转成本则包含其后所有作废运行的真实花费，并且不得低于预检源成本。v1.0.14因仍把两者要求为相等而在预检阶段终止，没有发起新的模型或搜索调用，成本维持0.9520531630011205美元。搜索、补证、评分、样本、盲审和胜负门禁均未改变。

v1.0.14修复首次正式任务暴露的意图边界问题。v1.0.13的墨西哥Retailer/E-tailer任务中，Gemini对照臂已冻结30家公司，Kimi轻量意图也返回了有效结构，但产品臂的严格角色集合门禁拒绝了该计划。新版本按照已确认的产品架构让Kimi负责轻量识别意图和模板适配，而不是改写已预注册的实验类别：Kimi仍须确认lead-search、国家、数量、目标并至少识别一个目标类别角色，执行器始终采用冻结角色集合，禁止其扩大实验范围。若再失败，异常会包含不含秘密的预期/实际字段差异。v1.0.13作废且结果不复用；其Gemini调用0.2436989美元和Kimi调用0.0022035560011204646美元完整结转，使v1.0.14起始累计成本为0.9520531630011205美元。经UTF-8字节核验，西班牙语源文本本身正确，先前终端中的乱码只是PowerShell显示问题，不属于根因。

v1.0.13修复正式调用前Git冻结门禁与运行检查点提交之间的冲突。冻结标签现在必须是当前`HEAD`的祖先，且冻结清单中的每个协议、配置、Prompt、Schema、策略与执行文件仍须逐字节匹配SHA-256；因此标签之后可以提交和推送仅含运行产物的恢复检查点，但任何冻结输入变化仍会立即阻断付费调用。v1.0.12首次单元尝试在任何付费调用前被该旧门禁阻断，正式单元仍为0/8，成本没有增加。

v1.0.12按用户明确授权采用三级盲审回退：`Claude Opus 5 → Lingyu Responses gpt-5.6-sol → codex-in-session`。Claude端点在有限重试后持续无法完成TLS连接；随后实际发送高推理、无工具、`store=false`、完整盲审Schema的Lingyu `gpt-5.6-sol`最小请求，网关返回HTTP 403 `insufficient_user_quota`，没有模型输出或token usage。因此本轮统一启用`codex-in-session`，不再调用Codex/OpenAI API，不通过Lingyu，不使用Web Search，只由当前对话中的Codex读取程序导出的随机化冻结证据包，不混用裁判。盲包隐藏实验组、搜索工具、来源排名和现有分数；每项决定必须声明`externalSearchUsed=false`并引用包内证据ID。程序校验包SHA-256、字段范围和证据引用，确定性重算总分。所有决定文件必须先提交并推送，且本地`HEAD`等于上游分支，之后程序才允许读取本地身份映射并汇总。对话内盲审无增量API现金成本；因运行时不暴露本对话token用量，台账明确记录该限制，不伪造token数。

v1.0.12复用v1.0.10已通过的Kimi意图、本地RAG、全部发现工具、Tavily证据、DeepSeek评分和Gemini结构化对照预检；冻结清单包含该运行摘要并核验所需检查名称。搜索、补证、评分、样本、实验门禁和100美元预算规则均未改变，正式单元仍为0/8。结转成本仍为产品侧0.531486457美元、Gemini控制侧0.17466425美元，累计0.706150707美元。

v1.0.11仅增强实验可观测性，不改变搜索、补证、评分、盲审模型、样本、门禁或预算规则。供应商请求在传输、超时、HTTP错误或无效响应时返回失败类型、实际尝试次数、重试次数和延迟；调用方必须先记录零有效输出、丢弃原因和成本事件，再让当前预检、单元或盲审任务失败并保持可重试。非重试型HTTP 4xx不再重复请求；只有收到有效响应但盲审输出Schema不兼容时，预检才允许从Opus 5整体回退到Opus 4.8，网络失败不得触发模型降级。v1.0.10已完成除Claude盲审外的全部预检；因`lingyuapi.com` TLS握手前连接重置，正式单元仍为0/8。v1.0.11结转产品侧0.531486457美元、Gemini控制侧0.17466425美元，初始累计预算为0.706150707美元。

v1.0.10把Gemini API侧Schema收敛为真实联调通过的跨工具最小子集：`type/properties/required/items/enum`。完整字段层级不变，本地Zod仍严格验证URL、长度、数组数量、分数范围和额外字段，因此不放宽最终输出门禁。v1.0.9所有产品侧预检已通过；两次TLS重置经冻结有限重试恢复，随后完整约束Schema返回HTTP 400。两次最小结构化搜索诊断分别使用1和2次grounding，合计实测约0.04518225美元。正式英国/墨西哥单元仍为0/8。产品侧结转为0.372687美元，Gemini控制与诊断结转为0.145183美元，v1.0.10初始累计预算为0.517870美元。

v1.0.9已修复Kimi对无害数字格式的兼容：`confidence`接受数值、百分比或high/medium/low等有限描述并归一到0–1；`target_count`接受纯数字或含数字的短文本，无法解析时回退到用户原文的确定性数量提取，不以确定性逻辑替代Kimi语义意图。Schema错误记录具体字段路径。

v1.0.8已修复Gemini Interactions API适配：使用顶层`response_format={type:text,mime_type:application/json,schema:...}`，将实验Schema裁剪为官方支持的JSON Schema子集，并读取`total_input_tokens`、`total_output_tokens`、`total_thought_tokens`、`total_cached_tokens`和`grounding_tool_count`。输出计费token按可见输出加thought token计算；Google grounding即使模型token为0也必须计费。解析失败调用先落账再终止。

本版保留v1.0.8补齐的预注册后评估执行器：Gemini独有最终公司统一补证/纠偏/评分，32→64独立盲审，校准门禁，Slot Utility@30、NDCG@30、10,000次分层Bootstrap、七项胜负门禁、工具真实贡献、成本与最终报告均逐项断点保存。八个搜索单元完成只进入`cells-completed`，不得提前把实验标记为完成。这些修复不改变样本、搜索策略、模型、评分标准或胜负门禁。

本协议是产品首次正式端到端搜索测评的预注册文件。实验开始后，不允许在同一run中修改提示词、模型、样本、评分、停止规则、预算规则或胜负标准。若必须修改，当前run作废，升级协议版本并重新开始。

## 1. 研究问题

验证当前产品的完整搜索工作流：

> 意图识别 → 冻结搜索Playbook → 类别混合搜索 → 实时去重 → 轻量门禁 → 新证据 → 实体纠偏与主角色识别 → 角色自适应评分 → Top 30

是否显著优于未针对本任务调试的Gemini Full单模型Web Search。

本实验同时回答：

1. 产品是否找到更多有效、合格和高价值公司；
2. 产品的主角色归类是否更准确；
3. 增益在英国和墨西哥是否同时存在；
4. 增益主要来自发现、门禁、补证还是评分；
5. 增益所需token、搜索额度、现金成本和运行时间；
6. 哪些搜索或评估环节存在低利用率、重复输出或能力溢出。

## 2. 实验单元与样本量

共有八个独立任务单元：

| 市场 | Distributor/VAD | Reseller/VAR | Retailer/E-tailer | SI/MSP |
|---|---:|---:|---:|---:|
| United Kingdom | 30 | 30 | 30 | 30 |
| Mexico | 30 | 30 | 30 | 30 |

每个实验臂在每个单元输出30个排序槽位：

- 每臂：240个槽位；
- 两臂：480个槽位；
- 不足30个的空缺槽位按0分处理，不做事后补齐。

## 3. 实验臂

### 3.1 对照组：`gemini-native`

- 固定模型：`gemini-3.6-flash`；
- 工具：Google Search grounding；
- 一次interaction内允许模型自主规划并执行多次搜索；
- 每个单元只有一次语义任务请求；
- 不追问、不补证、不根据输出重新提示、不人工纠正、不重排；
- 仅传输失败、429或5xx允许一次相同请求重试；
- 结构化解析失败允许确定性解析修复，不允许用新提示补内容；
- Gemini按原始输出顺序冻结最多30家公司。

### 3.2 实验组：`product-e2e`

使用当前冻结的生产策略：

- Kimi轻量意图识别每任务调用；
- 标准搜索Playbook与模板；明确复杂任务才升级Kimi K3；
- 类别自适应的多工具混合搜索；
- 双轨或多轨搜索间实时公司/域名去重；
- DeepSeek Flash轻量门禁，不升级Pro；
- Tavily只用于证据，不用于候选发现；
- 新证据获取、实体纠偏、主角色识别、研究深度路由；
- DeepSeek Flash主评分；仅预计总分变化至少8分或关键状态变化时升级；
- 角色自适应评分并输出Top 30。

实验在评分后停止：不生成合作路径、开发策略、开发邮件或联系人，不搜索Agent、Brand Owner或OEM/ODM机会。

产品臂可以按冻结的生产规则使用不同搜索工具、有限重试和已批准同级冗余。每次请求必须记录requested model/provider与actual model/provider。实验中不得为了改善结果临时调整策略。

## 4. 冷启动边界

允许读取：

- 版本冻结的Cudy产品、场景、客户和竞品知识；
- 版本冻结的搜索Playbook、混合搜索策略、证据政策和评分配置；
- 与具体候选公司无关的标准任务模板。

禁止读取：

- 英国或墨西哥历史候选公司记录；
- 历史公共证据库、网页内容缓存和历史评分；
- 用户/工作区对具体公司的角色、路径、评分或邮件修改记忆；
- 以前测评中的候选名单、证据和排名；
- 本次实验另一实验臂的任何输出。

使用独立experiment namespace和run ID。读路径审计发现禁用数据源即构成致命污染，run作废。

Gemini获得与Cudy知识库核心内容等价的精简产品说明，但不会获得产品混合搜索策略、角色评分细则或历史公司信息。

## 5. 市场和语言

英国使用英语和英国本地行业词。墨西哥以西班牙语为主、英语为补充。墨西哥公司不能仅因官网较简单、SEO较弱或公开信息较少而被当作无效；但无法建立公司身份、市场存在和目标业务证据的候选不能获得高分。

两臂接受相同的结构化任务语义。最终字段标准化，原始本地语言证据保留。

## 6. 主角色、去重与槽位

四类主角色定义：

- `distribution`：向下级渠道供货的Distributor/VAD；
- `resale`：面向B端客户销售或提供增值服务的Reseller/VAR；
- `retail`：面向C端消费者的Retailer/E-tailer；
- `si-msp`：面向B端项目、集成、部署或托管服务的SI/MSP。

同一实验臂内，同一公司只允许占用一个主角色槽位。跨类别重复时由证据支持的主角色决定归属，其他类别位置成为空缺；不得为了填满30家把同一公司重复计算。集团下不同国家法人只有在目标市场有可验证的独立运营时才分别保留。

原搜索通道只记录provenance，不能决定最终主角色。不使用“优先向上”。KA仅属于下级渠道账户标签，不适用于一级Distributor/VAD。

## 7. 统一评分

采用`config/lead-scoring/policy-v2.0.0.json`：

- 产品与应用场景匹配：50；
- 渠道/采购影响力：15；
- 同市场、同主角色内的规模与覆盖：15；
- 执行与赋能：10；
- 机会与风险：10。

产品匹配按候选最适合的已启用产品任务家族评估，不能因企业专注SMB而低于Broadline分销商。不同角色按其真实目标客户评估：SI/MSP面向有项目场景的B端客户，零售/电商面向C端消费者。超大型分销商的复杂渠道结构不是扣分理由，应进行深度补证。

统一状态阈值：

- `>=75`：高价值/可行动；
- `65–74`：合格；
- `<65`：低优先级或证据不足；
- 无效实体、错误市场、错误主角色、重复槽位、空缺槽位：实验效用0。

## 8. 统一评估，不做全量重复盲评

产品最终候选复用其本次运行已生成的证据与评分。Gemini最终列表中：

1. 与产品本次运行已补证对象重合者，复用同一份本次证据；
2. 本次运行尚无证据的Gemini独有最终候选，执行一次相同补证和统一评分；
3. 评分不得改变Gemini原始顺序；
4. 该费用记为`evaluation-overhead`，不归入任一实验臂；
5. 所有唯一公司最多形成一个本次证据档案和一个统一主评分。

只对最终槽位中的唯一公司补充评估，不对Gemini所有原始发现结果全量补证。

## 9. 独立盲审

主模型：`claude-opus-5`，较高推理强度，无Web Search，只读取冻结证据包。若预检不支持Opus 5，则在正式实验前整体改为`claude-opus-4-8`并重新冻结；正式盲审开始后不得混用模型。

首轮32家，每单元四家：

1. Gemini独有高排名；
2. 产品独有高排名；
3. 最接近65或75分边界；
4. 两臂重合但排名差异最大。

不足某一分层时按冻结的替换顺序使用同单元确定性随机样本。样本seed、选择脚本和输入哈希在解盲前固化。

盲审隐藏实验臂、工具、模型、原排名、产品评分和内部结论。盲审门禁：

- 主角色一致率 `>=95%`；
- 合格状态一致率 `>=90%`；
- 总分Spearman `>=0.70`；
- 平均系统性偏差绝对值 `<=5`；
- 平均绝对误差 `<=8`；
- 引用与结论对应率 `>=98%`。

首轮失败自动扩展到64家；再次失败则质量结论为`inconclusive`，不扩展到全量，不宣布产品胜出。

## 10. 主要指标

主指标`Slot Utility@30`：

```text
有效且主角色正确：utility = unified score
无效/错误角色/重复/空缺：utility = 0
cell utility = mean(30 slots)
macro utility = mean(8 cell utilities)
```

次要指标：有效率、主角色准确率、65+数量、75+数量、独有75+数量、NDCG@30、跨臂重合率、排名差异、工具原始发现贡献、进入补证率、完成评分率、进入Top 30率、市场/角色切片表现。

统计报告使用分层Bootstrap 10,000次，固定seed，同时报告效应量、95%区间和八个单元原始差异。不以单一p值替代实际效果门禁。

## 11. 产品胜出标准

必须同时满足：

1. 八单元宏平均效用至少高5分；
2. 至少6/8单元胜出；
3. 任一市场宏平均不得落后Gemini超过3分；
4. 任一单元不得落后Gemini超过5分；
5. 产品75+唯一候选更多；
6. 分层Bootstrap 95%区间下界大于0；
7. Claude独立盲审门禁通过。

运行时间不是胜负门禁。产品步骤更多且用户对时间不敏感，允许耗时明显高于Gemini。

## 12. 时间记录

Gemini记录请求开始到冻结列表的实际墙钟时间。产品分别记录：意图/规划、发现、轻量门禁、补证、纠偏/角色、评分/复核以及端到端总墙钟时间。

同时记录：

- 并发后的实际墙钟时间；
- 各提供商调用服务时间之和；
- 队列等待时间；
- 重试时间；
- 每条最终、有效、合格和高价值线索耗时。

两臂尽量在相近时间启动以减少Web索引变化，但不要求相近时间完成，不因产品较慢扣分，也不为了追平Gemini提前停止产品流程。仅保留操作安全所需的单请求timeout和重试上限。

## 13. 成本核算

三本独立成本账：

- `gemini-native-arm`；
- `product-e2e-arm`；
- `evaluation-overhead`：Gemini独有候选统一补证/评分与Claude盲审。

正式实验预检产生的实际API费用同样计入上述对应成本账和100美元硬上限，不作为免费或账外成本。

每次调用记录provider、requested/actual model、输入/输出/思考/缓存token、搜索/提取credits、请求数、延迟、重试、fallback、原始输出、有效输出、下游使用、丢弃原因和成本。

成本事件在每个已完成工作流阶段后立即写入；单元中途失败时，已完成单臂和已发生费用保留，重跑跳过已完成单臂。未完成产品单臂需要从臂起点重跑时，重复调用以独立事件后缀完整计费，不以去重掩盖重试成本。

同时报告：

- 官方标准价估算，不扣免费额度；
- 账户实际或预计现金支出，扣除可验证免费额度/套餐；
- 每请求槽位、唯一公司、有效公司、65+、75+、最终使用公司的单位成本；
- 各环节输入→有效输出→下游使用效率。

美元为主币种，人民币换算只作辅助，并冻结实验日汇率与来源。

## 14. 100美元预算门禁

全部实验相关现金支出硬上限：`USD 100`。

在累计预算达到以下阈值时必须生成成本复盘并向用户返回：

- 20美元；
- 40美元；
- 60美元；
- 80美元。

每次复盘包含：

- 已使用金额和预算比例；
- 三本成本账分布；
- 阶段、provider和模型分布；
- 已完成/预计完成的实验单元；
- 每最终/有效/65+/75+线索成本；
- 基于当前单元、角色和市场的完工成本预测及区间；
- 与预注册预算假设的偏差原因；
- 不影响结论的潜在优化选项。

如果任何时间预测完工成本可能超过100美元，立即发出成本预警并暂停下一项可选付费阶段，与用户确认是否优化实验设计。不得自行减少样本、降低盲审规模、跳过市场/类别或改变质量门禁。预计下一次必需调用将突破100美元时也必须暂停，不得超额。

## 15. 异常与停止规则

立即报告：模型版本漂移、usage缺失、连续429/5xx、fallback、单元不足30、重复率>70%、门禁淘汰率>60%、单位成本超过同类滚动中位数2倍、单元成本超过预测150%、引用对应率<98%、历史数据污染。

- 警告级：记录并按冻结规则继续；
- 可恢复异常：仅执行预注册有限重试；
- 影响实验有效性或预计超预算：暂停；
- 需要修改代码/Prompt/配置：当前run作废，修复后以新版本从头开始。

## 16. 随机化、并发和防泄漏

八个单元顺序由预注册seed确定。单元内两臂尽量同时启动，起始顺序按G→P/P→G交替。产品使用冻结的受控并发；不能人为把产品限制到Gemini耗时。

两臂结果冻结前互不可见。先冻结列表，再匹配、补证、评分、抽样、盲审；盲审结果冻结后才解盲。

## 17. GitHub与产物

专用分支：`experiment/search-e2e-uk-mx-v1`。付费实验前推送预注册commit并创建tag。每完成一个单元推送一次可恢复检查点。

提交内容包括协议、冻结配置/Prompt/Schema/费率、哈希manifest、结构化结果、成本快照、异常日志、盲审包与决定、最终报告和混合搜索优化分析。

不提交密钥、环境文件、个人联系方式、用户私有记忆、完整第三方网页或受版权保护的大段内容。原始响应保存在数据库/本地运行空间，Git只存结构化必要字段、短证据片段、URL和内容哈希。

## 18. 预检与正式启动

预检只使用合成输入或非英国/墨西哥实验任务数据，验证endpoint、模型ID、JSON Schema、usage字段、成本计算和写入链路，不产生实验候选，不属于试运行。

预检全部通过、预注册commit和tag已推送后，才生成正式run ID并执行八个实验单元。
