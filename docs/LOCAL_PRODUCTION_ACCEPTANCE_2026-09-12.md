# Local production acceptance — 2026-09-12

## 2026-09-13 实施阶段 24：补证/门禁公司归属及预算停止

落实 A06/A07/B21：普通补证及主角色补充搜索在真实请求前携带对应公司+国家的哈希归属；轻量门禁按当批实际输入公司记录，不把整池候选分摊到每批。并发子作用域隔离，归属不进入模型提示。生产门禁必须提供国家；无产品预算上下文的既有实验入口不改变。无效域名仍在原检查处跳过，不为了成本归属生成付费请求。

修复普通补证吞掉 BudgetDeniedError 的问题：预算阻止/未知费用停止直接上传，不伪装一般证据缺失继续评分。保留既有普通工具失败处理、模型、并发及搜索参数。沿用账本输入/有效输出/下游使用边界、token/API 额度、延迟、重试和丢弃原因；新增归属不产生额外支出，预算停止不能记为成功证据。优化机会：公司直接费用准确归属后再计算每条成本，避免把失败费丢弃或使用目标槽位作分母。

验证：722 tests /169 files、typecheck、生产 build 通过；新增测试覆盖并发归属隔离、门禁逐批输入、生产缺国家拒绝及预算停止不吞掉。没有新增真实模型/搜索/SMTP、数据库写入或费率放行；预算最后只读核验 USD12.324404/30。共享费用最终分摊、完整公司成本 UI、OpenRouter 费用上界/报告核销、P06 超大单公司恢复、真实 E2E 和最终采用遥测仍未完成。Goal 保持 active，非整体验收通过。

## 2026-09-13 A20 确认：OpenRouter 仅充值余额

用户已确认当前账号未配置 OpenAI/Anthropic BYOK，仅充值余额；覆盖阶段 23 的待确认状态。范围限当前账号，非所有部署默认保证；未来启用 BYOK 必须重新核验上游费用。A05 的完整且唯一匹配要求、历史未知预留、USD30 累计上限不变，账号确认不等于账单核销或网关验收通过。当前预算占用最后核验 USD12.324404，本次只更新确认文档，无新增付费/调用/费用观测，不虚构效率收益。后续先完成网关费用上界与完整报告适配，再进行真实业务验收。

## 2026-09-13 实施阶段 23：北京 Embedding 预算边界与响应完整性

继续 A02/A06/B21，不新增模型或冗余策略。官方北京区 text-embedding-v4 同步输入价为 CNY0.0005/千 token，最多 10 条、每条 8,192 token；参考 https://help.aliyun.com/zh/model-studio/text-embedding-synchronous-api 。版本 aliyun-embedding-bounds-v1.0.0 仅放行 HTTPS 北京 workspace maas 精确域名结构与 /compatible-mode/v1/embeddings，纯字符串输入、float 输出及受支持维度。国际区、其他模型、文件/稀疏/工具/额外字段、过期来源和超限请求均拒绝，不自动迁移端点。完整 10 条输入预算 CNY0.040960，以库内新鲜 ECB 汇率及 5% 缓冲预留 USD0.006412；不当作实际用量或账单，不假设免费额度。来源最迟 2026-09-20T00:00Z 失效。

新增向量完整性门禁：每个真实输入恰好返回一个唯一合法索引的有限数值向量，长度必须符合请求维度。缺条、重复、维度错误、无效数字或无法读取的响应不记成功；SDK 不能自动重放，未知费用和原用量保留。沿用原账本 inputTokens/outputBytes/latency/retries，失败 validOutputItems=0，丢弃原因为 incompleteModelOutput；检查结果消费于阻止错误数据下传，不冒充用户采用。模型 token/API 额度额外开销为 0。优化机会：复用已有响应验证，避免坏向量进入 RAG 后触发无效回答及补检索。

验证：719 tests /168 files 全部通过，typecheck、生产 build 通过。真实数据库只读验证当前配置匹配北京契约，Kimi/Embedding 共享有效 FX，累计验收占用仍 USD12.324404/30；新真实模型/付费搜索/SMTP=0，未写客户或预算记录。npm audit --omit=dev 与全量 npm audit 均 0 漏洞。GitHub 文档同步运行 34744359639 对 812c98e 成功，仅证明文档 CI，不等于业务 CI。

下一主线：OpenRouter 网关上界/可信报告、共享费用完成分摊、P06 单公司恢复、完整业务 E2E/最新鉴权 UI 及最终采用遥测。已核查 OpenRouter 当前官方目录：长上下文档位、缓存写入、premium 路由价格不能用最低展示价替代；公开观察不是新生产费率放行。官方 https://openrouter.ai/docs/cookbook/administration/usage-accounting 与 https://openrouter.ai/docs/faq 说明 credits 以 USD 计价，但 BYOK 可能上游另计；已向用户询问当前账号是否仅充值余额、无 BYOK，尚未答复，不假定。完整关联报告可核销原则不变，原 USD12 历史预留不追溯释放。没有更改模型、thinking、账号路由或付费配置。


## 2026-09-13 实施阶段 22：兼容评分入口独立输出上限

A19 用户已确认复核 8,192、裁决 12,000、备用评分 8,192，覆盖阶段 21 的待确认状态。分别以 LEAD_REVIEW_MAX_OUTPUT_TOKENS、LEAD_JUDGE_MAX_OUTPUT_TOKENS、LEAD_FALLBACK_SCORING_MAX_OUTPUT_TOKENS 配置。仅接入 OpenAI-compatible 适配器对应任务；不修改原生 DeepSeek 主评分、原模型、推理强度、升级条件或其他任务。OpenAI 模型使用 max_completion_tokens，其他兼容模型使用 max_tokens；显式上限不能被 extraBody 覆盖，完整请求预检包含该字段。

HTTP 正常但缺少完整停止标记、空内容、拒答或响应 JSON 无法读取均终止为未完成；长度截断即使 JSON 合法也不成功，不重试或切换备用模型。账本沿用原任务归因，显式完成契约只作用于兼容入口，不误判原生 Anthropic 响应。用量、延迟和未知预留保留，截断有效输出为 0、丢弃原因 incompleteModelOutput；未新增 token/API 请求来判定完整性，后续采用仍单独计数。

验证：全量 713 tests /166 files、typecheck、生产 build 通过；随后补充不可读取响应保护并重跑相关回归。无新增真实付费调用，累计占用 USD12.324404/30 不变。费用上界适配及整体验收仍待完成，设置输出限制本身不开放缺费率调用。优化机会：完成标记直接取已有响应，避免对不完整评分进行重复付费修复。


## 2026-09-13 实施阶段 21：文本输出上限及 Kimi 原币预留

用户确认 A18：RAG 回答 / 混合整合默认各 8,192 输出 token，搜索 playbook 默认 4,096；分别通过 RAG_ANSWER_MAX_OUTPUT_TOKENS、HYBRID_SYNTHESIS_MAX_OUTPUT_TOKENS、LEAD_PLAYBOOK_MAX_OUTPUT_TOKENS 配置。保持模型与 thinking 配置。请求使用 max_completion_tokens；HTTP 200 或有效 JSON 不等于完整输出，长度截断、拒答、空内容或缺失正常停止标记均不记成功，不自动重试。账本保留用量/费用并记录 incompleteModelOutput，不能释放未知费用。playbook 缓存纳入输出上限及完成契约版本，旧缓存不绕过新契约。

Kimi 官方大陆文本入口新增版本化人民币保守上界：完整上下文按未命中价加已配置输出上限计价，再使用库内新鲜 ECB 汇率及 5% 缓冲。仅明确模型和严格文本请求可用，费率/汇率过期或请求越界即阻止，不改变原模型、推理和输出配置。真实库只读验证 K2.6/4,000 上限 USD0.283612，K3/12,000 上限 USD3.470370；不是实际账单。费率配置 config/billing/kimi-text-bounds-v1.0.0.json 最迟 2026-09-20T00:00Z 失效。

验证：新增缓存变更前全量 708 tests /165 files、typecheck、生产 build 通过；lint 0 errors /11 既有 warnings。新增缓存回归另行执行。没有新增真实模型、付费搜索或 SMTP 调用；累计验收预算占用仍 USD12.324404/30。效率沿用逐次输入、用量、延迟、重试及下游采用记录；截断有效输出为 0，不虚构实际节省。优化机会：本地缓存汇率和完成契约检查无新增模型 token，避免截断结果触发付费重放。

整体仍未通过：OpenRouter 等剩余真实费率上界/可信账单适配、任务共享成本完成分摊、P06 单公司超限恢复及真实完整业务验收待完成。异常复核/裁决/备用评分额外上限尚待用户确认，本阶段不代为批准。


## 2026-09-13 实施阶段 20：费用观测独立分摊历史

在现有追加式 paid_cost_observation.metrics 中保存 cost-observation-allocation-v1：估算、服务商报告、发票各自按原请求公司输入生成守恒分摊，同时保留核销前/后 occupied 的独立分摊。不将五个口径或多个历史版本求和，不新建支出，不改变核销规则。verified-unbilled 保持原独立事件，不冒充零元发票；未知报告金额仍 null。来源是否完整、唯一匹配仍由已有独立字段表示，分摊本身不证明账单可信。

延迟观测读取被关联 reservation 中已存归属，不取当前任务的公司上下文，避免迟到发票串公司；旧记录缺失/格式不合法时保留全部未归属金额，不猜公司且不阻止合法核销。没有修改历史账单观测或给旧未知记录补造归属。复用现有 SQL 返回与追加写入，无新增数据库往返。

验证：701 tests /163 files、生产 build 通过；新增模块相关 13 项与 typecheck 通过。真实 SQL 052 合成验证六条追加观测逐条原金额=公司分摊合计、占用前后值一致、归属保持；原预留 100、估算 20、后续报告 10、发票 40、最终占用 40 分开保留，未叠加。并发核销只释放一次、未匹配仍保留、发票优先、超支仅暂停相关规则、追加历史不可修改均通过。审计合成行已清理，真实模型/搜索/SMTP=0；预算占用仍 USD12.324404/30。

效率边界：输入一笔已有请求的费用观测，有效观测与分摊存储各一组，生成/采用仅限账本；token/API 额度/本阶段付费成本为 0，延迟与重试沿用核销指标。优化机会：一次读取复用原请求归属，避免逐公司查询或让模型推断归属。实际发票接入真实性、任务共享完成分摊/完整处理公司集合、公司成本 UI、其他工具归属仍未完成，不代表整体通过。


## 2026-09-13 实施阶段 19：公司请求归属与预留分摊基础

落实 A07/A08 的前置事实：评分常规批次/单项修复/升级、主角色矫正常规/修复/升级、异常复核及裁决，在真实调用前记录本次实际输入的去重公司键。键采用规范域名 + 国家 SHA256；只记录身份键，不记录提示词、证据、联系人或凭证；跨国键独立。完整工作流使用 graphThreadId 的哈希区分用户新轮次，暂停恢复不生成新轮次。并发子作用域独立；同任务子入口继承归属，新 operation 不继承旧归属；实验无产品预算上下文时行为不变。输入域名矫正后的别名归并尚需完整身份映射，不伪造历史映射。

每次预留的同一 SQL 事务保存 costAttribution 和独立 reservationAllocation 字段，版本 company-cost-allocation-v1；按实际输入公司等分，无可靠逐公司 token 时不猜权重；微美元余数按键排序稳定分配，金额守恒。失败/未知请求同样保留原始输入归属，单项修复只归属该项。分摊 additionalSpendMicros=0，只增加原有一次预留。预留分摊不是实际发票成本，未更改核销/预算释放、模型输入、输出上限或并发。

纯算法分别支持 reservation/estimate/provider-report/invoice/occupied，禁止未知金额填零；未归属保持原金额，任务未完成不分摊，匹配轮次完成后按实际去重处理公司分摊，零公司保留全部任务成本。当前生产只接入以上具体模型入口的归属与预留分摊；未接入的搜索、补证工具等环节明确 unclassified，不假定 task-shared。A08 实际完整公司集合/完成钩子、其他四口径的持久化与公司成本展示仍待接入，不宣称费用分摊整体验收通过。

验证：697 tests /162 files、typecheck、生产 build 通过。真实 SQL 051 扩展验证同笔请求预留分摊 5+5=10、原占用仍 10、归属在外发前保存、并发/重放/租户隔离不变；仅合成审计行，已清理，不改客户数据。主评分模拟批内缺一项回归确认第二次请求只有待修复公司，遥测未进入模型 payload。本阶段新模型/付费搜索/SMTP=0，累计预算占用仍 USD12.324404/30。

效率：复用原预留记录，无额外模型 token、API 额度或付费调用，无新增数据库往返；沿用逐次请求输入输出量、用量、延迟、重试、丢弃原因与采用边界。分摊仅账本归属消费，不是用户采用。机会：补齐真实公司与请求对应后再计算逐公司成本，避免目标槽位或合格数作分母导致失真；归属字段不进入模型提示，避免额外 token。


## 2026-09-13 实施阶段 18：公共外币预算参考缓存

固定读取 ECB 官方 daily XML（https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml），无凭证、禁止重定向、15 秒超时、64 KiB 流式上限，拒绝实体声明及缺失/重复/非法报价与日期。USD/EUR ÷ CNY/EUR 用整数有理数换算；沿用 5% 仅预留缓冲与 72 小时新鲜度。来源仅有日期时保守取 UTC 零点，不因周末延长。该参考不是银行交易汇率、发票汇率，也不自行批准人民币模型费率。

迁移 053 在现有数据库新增独立公共参考快照、刷新状态、追加式观测表；不写个人知识、客户业务状态或账单。应用角色仅可追加快照/观测，不可覆盖历史。worker 运行时每 5 分钟检查到期状态，跨进程 advisory lock 保证单次刷新：成功间隔 24 小时，失败 1 小时；失败保留旧快照但不刷新其原始日期，过期读取返回空并继续阻止依赖该汇率的付费调用。没有启动 worker 执行用户待办，也没有部署云端定时器；worker 未运行时不宣称自动刷新。

验收：680 tests /160 files、生产 build 通过。真实 SQL 053 验证固定官方来源、并发最多一次 HTTP、重复命中缓存、应用身份不可更新快照；有效来源日期 2026-09-11，保留公共参考记录。汇率 USD/EUR=1.1592、CNY/EUR=7.7762，CNY1 加缓冲后向上预留 USD0.156524。新模型/付费搜索/SMTP=0，累计预算占用 USD12.324404/30 不变，实际账单未知。

效率边界：一次刷新输入项 1，验证成功输出 1，公共缓存写入消费 1；这不是实际付费调用采用。记录响应字节、耗时、重试 0、无效原因、利用率，模型 token/API 额度/付费成本均 0。机会：共享每日快照，避免各用户及每次模型调用重复查汇率。缓存读取/未到期检查不冒充新 HTTP；实际调用采用与最终用户采用仍需后续链路记录。

剩余主线：人民币完整请求费用上界与实际采用、其他服务商费率/账单核销、费率每周刷新与版本审批、A07/A08 费用分摊、P06 超大单家公司及备用重拆批、真实业务 E2E 与最终采用遥测；整体尚未通过。



## 2026-09-13 实施阶段 17：DeepSeek 完整请求上界与 V4.1 实际方法验收

最终回归：672 tests /158 files 全部通过，typecheck/生产 build 通过；lint 0 错误/11 既有警告。当前参考规则不是全接口计费覆盖，下面尚未通过的项目继续保留。

按已批准的保守上界原则实现 requestContract=deepseek-nonthinking-text-v1。仅 DeepSeek 官方 Flash Chat / Pro Anthropic 两种当前纯文本、非思考请求，严格白名单验证字段、消息结构、JSON 格式、8192 输出上限、61440 UTF-8 字节及无 query；工具、图片、额外字段、thinking enabled、其他网关/模型/协议拒绝后才可预留，未改变原模型生成配置。沿用各评分/补证更小的分阶段字节预检。

新版本 config/billing/request-bounds-v1.1.0.json 已由产品 policy 导入，保留旧空配置及候选方案历史。上界独立于本地 tokenizer：用大于等于官网 1M 的 1,048,576 输入 token 上限、峰值 cache-miss 和 8192 输出保守计算，Flash 每次 USD 0.324404、Pro USD 1.416561。来源为 DeepSeek pricing、create-chat-completion（输入+输出受上下文限制）及 guides/anthropic_api（max_tokens 支持）官方页，均于本阶段直接 HTTP 读取。验证日期保守取当日 UTC 零点，最迟 2026-09-20T00:00Z 失效，未实现自动刷新前过期仍阻止；其他接口缺费率继续阻止。

真实 V4.1 方法核验仅新增一次：输出 JSON 严格有效、reported model=deepseek-flash、官方 V41 本地编码与托管 prompt_tokens 均 155，输出 6，736 ms。只有一个合成样本，不宣称所有载荷的 tokenizer 等价或真实线索业务通过。scripts/verify-flash-v41-acceptance.ts 默认 preview；--run 以原验收 advisory lock/禁用无密码审计账户/原 USD30 上限/独立 stage 保存且跳过任何既有尝试，不重跑其他模型。最初非提升执行在实际模型前停止；后续获得系统权限完成隔离 Docker 后仅发送一次。

费用：原 USD12 保留，累计占用 USD12.324404、剩余 USD17.675596。调用的峰值全未命中 token 估算向上到微美元为 USD0.000054，已通过 append-only usage-estimate 写入真实账本（complete=false），不是实际账单；--reconcile-estimate 两次运行均复用原结果，零新增模型，零预留释放。实际账单未知，未将此估算用于核销。输入=1 合成请求，格式有效输出=1，方法验收消费=1，非销售线索最终采用；原 token/延迟/重试及边界观测保留。HTTP 次数=1、自动重试=0，未搜索/发送邮件。

本阶段代码 671 tests /158 files、typecheck/build 通过；新增 active-contract 限定测试另通过（最终全量结果见后补记录）。仍未整体验收：CNY 汇率生产刷新/其他完整费率及真实账单适配、费用分摊、P06 超大单家公司/备用重拆批、完整业务 E2E、最终采用链路。ECB 官方 XML 的 2026-09-11 观察已读到 USD/EUR=1.1592、CNY/EUR=7.7762，仅为预算参考来源，不是交易汇率或发票汇率，未据此放行 CNY 调用。优化机会：保守上下文预留明显大于实际 token 估算；完成可信核销/更紧且已核验的上界后减少占用，不能直接因单样本一致放宽。



## 2026-09-13 实施阶段 16：原生模型调用归因与官方费率证据

Kimi 意图轻量/规划、开发策略/独立策略/独立邮件/跟进、邮箱学习，以及 OpenRouter Claude 邮件修改入口新增 invocation 与逐次序号。复用现有提示版本，跟进和 Claude 反馈补标当前模板版本；只在本地异步上下文传递，不修改模型输入/模型/输出上限/重试或发送邮件。HTTP 原始用量、输入输出量、耗时、重试、丢弃原因沿用既有账本；真实下游采用未知时仍不填造。新模型调用/搜索/SMTP 均为 0。

667 tests /157 files、typecheck、生产 build 通过，29 项相关回归验证意图、Kimi/Claude 开发、邮箱及真实适配器的归因/预算停止；两个调用不混用 invocation，逐次序号不写入模型请求。全量通过不代表真实业务或美元成本降幅已验收。

费用来源现已补齐：读取 https://platform.kimi.com/docs/pricing/chat.md 原始 DocTable（不能把 JSX 表格整体当 HTML 标签删除）确认每百万 token，K3 CNY 2/20/100、K2.6 CNY 1.10/6.50/27，顺序为输入缓存命中/未命中/输出。与阶段 14 DeepSeek 峰值观察一起记入 config/billing/rate-observations-2026-09-13.json；参考观察不被产品计费 policy 导入，不激活付费，不核销历史预留。CNY 汇率、完整调用上界及账单真实性仍需核验，历史 USD 12/30 保持。

后续主线：完整费率/调用上界与原币账单核销、日/周刷新版本审批、A07/A08 费用分摊、P06 超大单家公司与备用重拆批、真实输入到持久结果 E2E、最终采用边界。P02 的 Gemini/搜索特有调用及账单字段仍需逐接口核验，不按 OpenAI 协议猜测。优化机会：复用同一有效费率来源快照，避免各入口重复查价；按真实批次保留失败费用与有效结果，避免只统计最后一次重试导致低估。



## 2026-09-13 实施阶段 15：SDK 预算停止与尝试归因

按 A06/B21 补齐一个实际漏洞：本地 OpenAI SDK 会将 transport 异常包装为连接错误并重试，LangChain 外层也可能重试；旧 playbook catch 会吞掉预算停止。新增调用级上下文，在首次 BudgetDeniedError 后锁住该次调用，SDK 后续重试不再进入预算/网络，并在调用出口恢复原错误。playbook 预算/未知付费异常向上抛出，普通非预算故障沿用既有降级。没有调低正常重试配置，没有改变模型、输入、thinking、输出预算或新增 Embedding 备用模型。

已接入 RAG Embedding（每个实际批次独立调用）、RAG 回答、混合答案整合、现有 LangChain playbook 四个入口。逐真实 HTTP attempt 记录 invocation/序号/任务/提示版本及原模型/网关/用量，非 HTTP 的 SDK 重试不冒充付费尝试；Embedding provider 标为 embedding-configured，不猜测实际厂商，实际网关另记。原生含 model 请求即使尚无完整 invocation 也加入既有 owner/任务/阶段请求指纹防重放，不把非模型轮询/表单套入。原始输入、邮件和凭证不落遥测；保存/下游采用仍维持已定义边界，不把 HTTP 成功当业务通过。

验证：665 tests /156 files、typecheck、生产 build 通过；lint 0 错误/11 既有警告。真实 OpenAI SDK 与 LangChain + 模拟 transport 验证未知只发送一次、预算拒绝零网络、正常可重试失败逐次归因、共享客户端跨用户隔离；playbook 预算错误不降级。真实 SQL 051 回归验证并发单次预留、未知锁、owner 隔离、非空用量与已报告失败的既有限制重试；合成记录清理。本轮真实模型/搜索/SMTP 新增 0，历史 USD 12/30 不变，实际账单未知。

本阶段未完成所有 P02 原生入口归因，未建立完整费率/账单适配，P06 超大单家公司恢复、费用分摊、真实业务 E2E 及最终采用链路仍待完成。优化机会：避免 SDK 在已停止调用上的无效本地等待；当前只阻止再次预留/外发，未静默更改 SDK 正常重试策略。实现依据本地 node_modules/openai/src/client.ts 和 @langchain/core/dist/utils/async_caller.js 的实际错误处理；官方 SDK 入口 https://developers.openai.com/api/docs/libraries 不替代本地行为测试。



## 2026-09-13 实施阶段 14：已批准 V4.1-Flash 门禁与计数方法纠正

阶段验证完成：657 tests /154 files、typecheck、生产 build 通过。Docker 固定源码/两套词表哈希检查及 16 组（两模型×两协议×四文本）断网合成测试通过，完整 Schema 均增加 token，重复编码一致，编码耗时 138 ms；不是托管账单对齐验收。模型/搜索/SMTP 新增调用仍为 0。

用户已明确批准 A12，覆盖阶段 13 的待确认边界。仅 discovery gate 默认/旧文本别名环境配置归一为 deepseek-flash；主评分及升级 Pro、thinking、8192 默认输出上限不变。Flash 缓存加入批准 epoch，旧 Flash 请求契约失效，Pro 契约不变；不宣称 epoch 固定了服务商的实际版本。环境密钥文件未修改、未提交。

官方固定 recipe 8cadfede7063c896b944e7bae05daa3549ae97ea 的 docs/tokenizer.md 指定 V4.1 使用独立 DeepseekV41Encoding + v41/tokenizer.json。因此离线诊断按模型选择编码器/词表，未知模型拒绝，构建校验两套词表哈希；旧 V4 统计不能证明新版计费。真实托管用量一致性仍待核验，离线成功不开放付费。

本轮直接读取 https://api-docs.deepseek.com/quick_start/pricing/ 成功（Web 阅读接口超时后用普通只读 HTTP 获取）：确认旧 Flash 别名退役映射 V4.1；当前 Flash 峰值每百万输入 cache-miss USD 0.30、输出 USD 1.20，Pro 分别 1.32、3.96。这里只记录来源观察，不生成付费规则或把 token 单价当完整调用上界。累计历史预留 USD 12/30 不变，实际账单未知。

当前验证：657 tests /154 files、typecheck 通过；隔离 tokenizer 镜像和生产构建验证继续中，后续结果另记。新增真实模型/付费搜索/SMTP 调用 0。输入/有效输出/下游使用/token/API/延迟/重试沿用既有 HTTP 与工作流观测，批准 epoch 不增加外部调用；离线诊断只输出合成案例计数与耗时，不计作真实线索产出。优化机会：先核验实际 serving revision 与可保守计费契约，再降低保守缓存 miss/预算占用，不以旧 V4 方法放行。其余未完成项保持阶段 13 列表，整体验收仍未完成。


## 2026-09-13 实施阶段 13：单项检查点、缓存校验与主线验收边界

评分与主角色补证在修复/升级前先保存同批已经独立完整校验的候选项；同级单项修复成功也绑定其真实单项请求。快照粒度始终是候选公司，依赖保留原始完整批次，不宣称整批完成；这取代早期仅完整批次才写任何单项快照的保守实现。同次回调避免重复写，写失败不重放成功模型。评分恢复命中一部分后，按剩余候选重新计算请求契约并有界读取修复快照，不把不同批次当作等价请求。

新增本地缓存结构校验（不改变传给模型的 JSON Schema）：完整字段、总分与子分、七个不同维度理由、角色、范围和当前引用/选定路径均检查；坏缓存不作为低分或有效命中。模型运行时也检查七个维度理由唯一。生成量、有效量与下游使用量不再把复用的旧结果混入本次新生成分母；复用量单列 metadata，跳过的复核不冒充新复核使用。仍不等于用户最终采用。

验证：655 tests /154 files、typecheck、生产构建通过；18 项桌面/手机隔离浏览器测试通过，预算测试已同步四口径折叠区并验证未知/覆盖率。16 组真实登录生产页面复验及账本 052 合成 SQL 回归通过、测试记录清理。生产依赖 audit 0 漏洞；lint 0 错误/11 既有警告。7492bd1 的 GitHub 文档同步成功（34715024773），不是完整测试 CI。最新运行时维度唯一校验补丁后再次完成全量 655 tests /154 files、typecheck/build/lint，全部通过（lint 保留上述 11 项既有警告）。

重要外部边界：本轮终于直接读到 [DeepSeek 当前官方页面](https://api-docs.deepseek.com/quick_start/pricing/)，旧 deepseek-v4-flash 已由 V4.1-Flash 服务；并非先前搜索索引中的 V4-Flash。只读核对本地配置：routine=deepseek-v4-pro、escalation=deepseek-v4-pro、discovery gate=deepseek-v4-flash。主模型/配置未改，付费规则仍为空。A11/B15 要求模型路由变更确认与方法重核验，不能以默认自动继续代替这个授权。待确认是否采用实际 V4.1-Flash 作为轻量门禁，并重新核验其版本/费用/缓存依赖，主评分 Pro 保持不变。

尚未完整验收：正式费率/完整调用上界与实际账单适配、日/周刷新及变更审批、费用分摊、P02 其余入口真实尝试归因、P06 超大单家公司分阶段恢复/备用重拆批、真实端到端及最终采用链路。检查点复用仍对身份变更/跨运行 ID、升级或备用模型保守 miss；不把本次修复宣称全部完成。真实模型/搜索/SMTP 新增调用 0，原验收预留 USD 12/30 保留，实际账单未知。优化记录：进一步降低保守 miss 和无用本地缓存查询，须先证明契约等价，不降低评分语义。

## 2026-09-13 实施阶段 12：结束原因、评分版本与有条件缓存命中率

逐 HTTP 观测新增受控结束原因和原始 thinking token 数值；DeepSeek/compatible 在每次尝试关联实际请求中的评分版本。其他已接入计费的模型 HTTP 请求至少记录请求模型/网关/端点，缺失 invocation、重试序号和提示版本仍为 null，不伪造。现有费用折叠区按评分版本/结束原因分组，不把截断混入正常完成记录。

输入命中率目前只支持 api.deepseek.com 的 Chat Completions：每条记录检查 prompt=hit+miss，组内所有尝试三个字段全覆盖，分母非零才计算加权 hit/prompt；其他协议/网关或缺失/不一致为不可计算，不转换为现金节省。依据 [DeepSeek 官方用量定义](https://api-docs.deepseek.com/api/create-chat-completion/)；新增 Claude thinking 字段依据 [官方 Messages 定义](https://platform.claude.com/docs/en/api/typescript/messages)，不将其叠加输出总量。

651 tests /154 files、typecheck/build 通过；真实 SQL 合成记录验证评分版本、结束原因、完整零命中率及未知输出字段，测试记录清理，无真实模型/搜索/邮件调用。汇总复用既有 SQL，无模型步骤增加。优化机会：逐网关核验其他缓存协议再扩展比率；补齐其余入口的真实 invocation/重试归因，不能直接按兼容格式推断语义。真实业务成本和模型质量仍待验收。

## 2026-09-13 实施阶段 11：费率过期与外币预留保护

已接入 7 天费率有效期上限及促销截止即时失效；显式外币上界必须有原币金额、来源/日期/版本和精确有理数汇率，最长 72 小时有效，未来/缺失/无效汇率拒绝。用整数精确换算、加 5% 预留专用缓冲并向上取整；配置的美元上界不足时拒绝。原币上界、汇率快照及缓冲与原预留单次写入，不增加模型或数据库写步骤，不把缓冲加入实际发票。

648 tests /153 files 与 typecheck 通过，覆盖过期/促销边界、原币保存、微金额向上取整、不足缓冲拒绝。全局 rules 仍为空，无新增真实付费。来源读取本轮 DeepSeek 页面直接获取超时，搜索索引有不同日期价格，不能据旧快照静默开放规则；Kimi 官方价格入口可读但表格未返回具体金额。官方来源仍以 https://api-docs.deepseek.com/quick_start/pricing/ 和 https://platform.kimi.com/docs/pricing/chat 为准。

本阶段只是已确认时效门禁与原币预留基础，不是汇率每日自动抓取/费率每周刷新、版本审批或真实账单原币核销全部完成。优化机会：单次只读刷新服务同币种调用共用缓存；刷新失败只沿用仍有效版本，禁止放宽过期校验。聚合遥测沿用原调用预留、拦截、token/API/耗时/重试和采用边界，无新增外部付费调用。

## 2026-09-13 实施阶段 10：逐候选输出校验与同级恢复

补证与评分不再因 JSON-valid 批次中的一项 Schema 错误而整批修复：逐项使用原完整 Schema 校验，只采纳唯一且属于请求的 candidateId，重复 ID 全部拒绝、陌生 ID 不采用；缺失/无效项走已有单次同级修复，补证漏项不再直接 Pro 升级。单公司修复/升级也要求完整唯一 ID 对应，不拿数组第一项替换目标公司。语义升级仍须原有实质变化门禁，不增加重试次数、搜索或输出预算。完整批次缓存仍只接收完整原批次，未把部分结果冒充完整命中。

批次 usage 新增聚合输入、Schema 有效项、无效项、缺失项、完整状态；并非最终用户采用，沿用原逐调用 token/成本/耗时/重试观测。优化机会：进一步保存修复期间暂停前的单项检查点；目前仅保证同次正常恢复不重跑有效同批公司，跨中断部分恢复与超大单家公司处理仍待完成。

验证：643 tests /152 files、typecheck 通过；测试证明一好一坏仅重试坏项、补证漏项不升级、重复/陌生 ID 不误用。阶段 9 生产构建已在 3100 重启，16 组真实登录桌面/手机回归通过，合成数据已清理，零真实模型/搜索/SMTP。本阶段 agent 改动尚待最终生产构建回归，不据此宣称真实评分质量或美元降幅。

## 2026-09-13 实施阶段 9：账本核销与四口径展示

迁移 052 已在同一应用数据库完成加法式应用：保留历史预留，新增估算/发票/核销/当前占用及只追加的成本观测、owner 隔离的费率暂停记录。完整且唯一匹配的可信报告才调整占用差额；估算、原始 HTTP usage、缺失或歧义报告不释放。发票优先于后来的普通报告，更正追加记录，重复来源幂等且冲突拒绝。报告超界保守增加占用并暂停该用户对应费率版本，不新冻结整个账户；历史冻结不擅自解除。

用户/任务预算折叠区分别展示历史预留、当前占用、Token 估算、服务商报告、发票核验及覆盖次数，不相加，不将缺失当零。核销仅提供内部可信适配边界，不向 HTTP 用户或模型开放金额/完整性授权；服务商账单真实性、原币/汇率和正式适配器仍待完成，因此现有未知账单不自动释放。

验证：638 tests /151 files、typecheck、生产 build 通过；verify-cost-reconciliation.ts 真实 SQL 验证估算/歧义保留、并发单次释放、发票优先、不可修改历史、超界规则隔离和非空费用汇总，verify-paid-replay-guard.ts 再次通过。合成用户与记录已清理，无真实模型、搜索或邮件调用。观测记聚合输入/输出/核销采用、零外部成本与重试、耗时及未核销原因；不是新增支出。复用原汇总查询，未增加模型步骤。优化机会：接入可核验且唯一匹配的真实账单适配，降低无必要的长期占用；不得拿 Token 估算释放预留。

尚未整体通过：正式费用上界/汇率费率与真实业务验收、成本分摊、P02 完整观测、P06 超大单家公司与部分输出恢复继续推进。当前新增页面仅静态测试与构建通过，最新生产浏览器复验待执行。


## 2026-09-13 实施阶段 8：持久请求防重放

迁移 051 为原账本添加可空 request_fingerprint 和 owner/operation/stage 索引，不改历史金额。已接入 ModelAttemptContext 的 DeepSeek/compatible 产品请求对 HTTP 方法、端点及完整 body 做 SHA-256；只改费率不能绕过防重放。与预留共用用户行锁，在发送前阻止同任务/环节中相同请求的在途、未知、超界或 HTTP 成功记录。已报告费用且 HTTP 失败仍可按既有有限重试规则再次预留；不增加重试权限。未接入上下文的轮询/普通工具请求不启用此指纹保护，避免误拦正常轮询。旧无指纹记录不能推定匹配，新用户/新任务仍隔离；跨任务通用复用继续依赖结果缓存。

`verify-paid-replay-guard.ts` 只应用 051、核对迁移与应用数据库同址后，用两名临时合成用户实测并发单预留、未知后拒绝、RLS 隔离、非空用量汇总、已报告失败再次预留；全部通过，测试记录已清理。全量 629 tests /149 files、typecheck 通过；真实模型/API/邮件调用 0。指纹与原预留单次 insert，避免额外 update；新增阻止事件只说明本次新传输未发生，不将历史未知费用算零。仍待已核验账单核销、受影响规则冻结范围、真实费用上界/模型验收与 P06 超大/部分输出处理，不能标记全部验收完成。

并行只读验收：`npm audit --omit=dev --audit-level=moderate` 为 0 个已报告漏洞；GitHub 文档同步在 fd1a116 成功（run 34712289304）。这不是完整云端测试 CI 或开发依赖审计证明。


## 2026-09-13 实施阶段 7：未知付费传输不自动重试

后续补齐：响应体读取中断同样归为未知付费结果，区别于完整结果返回后的账本写入失败。现有 626 项全量测试通过，新增流中断测试后 12 项 transport 测试与 typecheck 通过。Lint 发现阶段 1 遗留未用 policy import，已删除；其余 11 项旧警告不改。下文“响应体中断仍待完成”已由本补充取代，HTTP 完整但模型输出缺失/截断等仍待核对。

A06/B25：产品预算作用域中，HTTP transport 抛错发生在预留之后，现记录未知费用/用量/输出、失败传输耗时并抛出 `PaidCallOutcomeUnknownError`。错误沿现有预算停止通道直达工作流，不触发 DeepSeek 自带重试或 resilient 备用切换；不能用未知占用为备用腾预算。未把这类已尝试传输记成调用前拒绝的零费用事件。实际未发送也可能被保守视为未知，需可核验来源再核销；不静默释放。未改独立 CLI 实验的单独授权计费策略。

11 项 transport 单元测试和 typecheck 通过，包括真实 provider 包装层三次重试配置下只传输一次、备用零次、预留一次且费用为 null。验证是 mock 网络，无真实费用。剩余：响应体中断/未完成模型输出、跨进程未知请求锁、已验证未计费失败的核销机制仍需完成；此阶段不等于账本验收全部通过。


## 2026-09-13 P05/P06 实施阶段 6：国家隔离评分缓存与批次保存

验证：625 tests / 149 files、typecheck 和生产构建通过。准确指标名为 `batchCacheSaveAttempts`（回调尝试数，不冒充实际写入行数）；下面方案描述中的 completedBatchWrites 名称已替换。

复用现有 `lead_assessment_cache`，没有新建重叠存储。依赖 v2 加入国家名/代码、完整主模型请求契约（含批次/顺序/模型/端点/Schema/私有输入）、身份、证据 URL/标题/正文/有效状态和矫正说明；继续按 user/workspace 的 RLS 隔离。缺国家或完整契约的历史缓存不命中。只有完整、ID 一一对应的主模型常规输出在标准化完成且无需升级后才赋予可写契约；备用/升级/修复对象保守不共享。此缓存不改用户手动覆盖字段，费用未知不阻止复用已验证结果，也不释放费用预留。

评分 worker 每批完成后立即请求现有缓存保存，不等待所有批次结束；最终阶段避免重复写同一批。可选缓存写入失败记录聚合标志/警告并保留本次评分，不能触发模型重放。测试验证前批回调在后批预算暂停前完成、存储回调失败不重放、缺费用仍保留有效输出契约、国家/来源/请求依赖变化。该机制不是跨进程任务锁或完整批内部分响应恢复；未知传输、升级结果恢复、单家公司超限处理仍待完善。统计沿用 cacheHits/cacheMisses，增加 completedBatchWrites/cachePersistenceFailed，真实节省未测。无新增模型/API 调用。


## 2026-09-13 P02 实施阶段 5：成本页缓存观测

本阶段全量回归：619 tests / 149 files 与 typecheck 通过。

现有用户预算/任务预算折叠区增加模型用量观测，无新页面或模型调用。服务端按 owner、可选任务及 stage/provider/requestedModel/reportedModel/promptVersion/gateway/endpoint 分组，只返回白名单字段的已报告合计与覆盖尝试数。未知为 null，显式零保留；未把输入与缓存字段机械相加，未把观测量推成现金折价，也未把 HTTP 响应等同下游采用。UI 只传序列化类型，不引入数据库或服务端凭据模块。后续优化：版本/路由组长期增多时增加分页或预聚合，不在页面加载触发付费计算。

8 项针对性测试、类型检查及生产构建通过。localhost:3100 的生产模式真实登录/UI/数据库检查 16 组通过（1366/390px、GB/MX、预算观测空值、停用用户拒绝），手机观测截图已复核。首次失败为 Playwright 独立 HTTP 客户端在本地 HTTP 下未按浏览器 Secure Cookie 行为发送会话；验收脚本改为真实浏览器 fetch 后通过，产品安全 Cookie 未降低。仅合成测试用户，完成后清理，真实模型/搜索/SMTP 调用 0。此阶段只验证空观测 SQL 与合成字段渲染；非空真实服务商账单/缓存率、全部 provider 归因、评分版本与核销仍待验收。


## 2026-09-13 P05 实施阶段 4：公共角色缓存依赖收紧

验证：615 tests / 147 files 与 typecheck 通过；新增完整请求依赖/未知契约/输入变化测试。本阶段未执行真实 SQL 缓存验收或付费调用。

主角色快照读取/写入要求完整主模型请求契约：DeepSeek 实际序列化体、模型、端点、Schema、提示版本、生成参数、全部批成员/顺序及 evidenceIds 的 SHA-256。依赖 v2 另含公司身份、官方 URL、输入角色/类别、缺失证据、国家/目标和证据顺序/标题/内容哈希/来源。旧缺失契约记录保留但不命中；无可靠契约的 provider 不启用此缓存。只记录完整、候选 ID 一一对应且未切换模型/备用 provider 的常规批次结果；升级/修复/合并生成的新对象保守不写，避免归因冒充。

此版本为了安全保留原始 ID 参与请求哈希，因此跨运行 ID 变化会 miss；既有引用重绑定工具保留，但不据此假定完整请求等价。缓存命中可能暂时降低，未测真实节省率。复用仍在现有公共证据库，未引入私有评分/路径跨用户共享。已有 cacheHits/cacheMisses、逐调用用量/字节/耗时/重试及下游未知口径沿用；本地哈希不调用模型，费用 0。后续待验收：证据 ID 可证明等价替换、评分/路径租户国家隔离持久缓存、跨进程幂等和未知费用恢复。阶段 4 不等于 P05 全部完成。


## 2026-09-13 P06 实施阶段 3：完整请求字节预检

验证：全量 611 tests / 146 files、typecheck、生产构建通过。新增 5 项边界测试覆盖 UTF-8、完整 Schema、输入转义、两种 DeepSeek 实际载荷一致性、两类 provider 超限零传输。真实业务/数据库恢复与浏览器仍不包含在此结论内。

补证/评分拆批现使用与 DeepSeek 实际发送相同的序列化器，包含 system、完整 Schema、evidenceIds、转义及 UTF-8 字节。上限补证 36,864、仅评分 57,344、评分含路径 61,440；保留最多 5 家及更小调用者限制、既有字符软限制、原顺序和并发。所有常规批次先完成本地预检；超大单家公司明确抛出不可重试暂停错误，不截断或生成低分。DeepSeek 和 compatible 最终发送前再次校验，备用请求独立检查实际序列化体积。没有改输出 token/thinking，没有自动搜索或模型压缩。

本阶段是 P06 部分实现：单家公司压缩/分阶段恢复、批内成功结果持久恢复及备用模型自动重新拆批尚未完成。常规批次预检避免本阶段先付费后发现超限，但既有补证搜索及之前阶段的 checkpoint 不等于批内完整幂等。新流程字节统计不等于可信 token/美元计费上界，空费率门禁不变。遥测沿用逐尝试输入/输出字节、用量、耗时、重试及未知下游采用；新增步骤仅本地序列化，无模型/API 费用。后续优化记录：备用载荷与批次持久恢复仍需完善，不能声称成本节省率或完整验收通过。

## 2026-09-13 stage 2b: attribution, local-only

Verification: 606 tests / 145 files passed; after correcting a test-only task literal, typecheck and both attribution tests passed again. Production build/browser and real paid acceptance have not been rerun in this stage.

DeepSeek/compatible transports now attach isolated invocation/attempt and prompt/model routing metadata to reservations. Requested and response-reported models remain distinct; no arbitrary response metadata or URL parameters are retained. Synthetic tests cover context isolation and actual retry wrapper linkage. No live calls or budget reset. Score-version attribution, other providers, aggregation/UI, P05/P06 and billing gates remain outstanding.

## 2026-09-13 stage 2a: partial P02, not final acceptance

Per-attempt cache/reasoning numeric source fields now persist in existing reservation JSON metrics. Twelve targeted tests and typecheck pass, including failed/successful attempts, null versus zero, malformed fields and no raw private payload retention. No real provider/search/SMTP calls or tariff changes. Pending P02 attribution/aggregation/UI, P05, P06 and all unresolved billing/production gates remain open; cumulative acceptance budget is not reset.

## 2026-09-13 implementation stage 1, local checks only

Production build also passed (16 static pages generated); no new authenticated browser run or real model quality check is claimed. This preserves the local-only deployment scope.

P06 now confirmed; all six proposals are authorized for implementation. P01 stable-prefix ordering and P03 deterministic model-policy projection implemented; P04 output Schema retained. 596 tests / 142 files and typecheck pass, no paid model/search/SMTP calls. This is not a new provider tariff, cache-hit proof or business quality pass. P02/P05/P06, ledger reconciliation and the remaining acceptance gate table below still require completion; its earlier pending-confirmation statements are historical.

## 2026-09-13 acceptance-led completion plan

User directs completion of P03–P06 alongside remaining acceptance work, then acceptance as the primary workstream. Existing item-by-item confirmation remains: P01/P02 approved but not implemented; P03–P06 must be confirmed before unified product edits. Do not extend scope to new optional optimizations. The table is a current gap index, not fresh execution evidence; historical failures below are retained.

| Gate | Current state | Completion evidence required |
|---|---|---|
| Provider connectivity / SMTP | All five provider probes have passed at least once; SMTP send and user-reported inbox receipt passed. | Keep original failure/probe receipts; no repeat merely to recreate passing evidence. This does not certify business-agent quality. |
| Paid request bounds | Not passed: global policy remains empty; frozen local token counts are observations, not universal hosted billing bounds. | Approved versioned endpoint/model/rate bounds, full-body enforcement including single-company overflow, allowed/denied boundary tests and scoped real validation; no missing-rate bypass. |
| Ledger / reconciliation | Partial infrastructure; newly approved accounting rules not fully implemented/verified. | Separate reservation/estimate/provider report/invoice; per-attempt ownership, unknown-cost retention, correct release/append-only corrections, FX freshness and budget concurrency tests. No double counting. |
| Real product workflow | Not fully accepted; transport probes and synthetic UI tests do not cover it. | Minimal bounded user-input-to-persisted-result run using real agents after tariff approval, verify country/role/evidence/score and failure/resume reuse. Keep cumulative USD 30 cap and old reservations; no expanded search experiment. |
| Final downstream adoption telemetry | Incomplete; some values remain unknown. | Define generated/valid/saved/downstream-used boundaries, owner/country attribution, retry/discard/latency/cost fields; exercise relevant UI actions and prove no duplicate or invented adoption. |
| Dependency audit / GitHub CI | Latest retrieval previously blocked by external TLS/EOF; not a current pass. | Fresh successful audit and applicable CI evidence, or explicit separately reviewed unresolved findings. |
| Local production final regression | Prior checks passed, but future implementation changes require rerun. | Relevant unit/type/build checks and local authenticated UI/business acceptance; update this report with exact versions, results, costs, remaining exceptions. Cloud deployment remains out of scope. |

Scope and proposals: [P03–P06 review](FIXED_PROMPT_CACHE_REVIEW_2026-09-13.md), [confirmed rules](CONFIRMED_PRODUCT_RULES.md). Confirmed optimizations must be mapped to the gates they support; no optimization percentage substitutes for an acceptance pass.

## Latest user-confirmed policy checkpoint

User confirmed receipt of the previously authorized SMTP test; inbox receipt is now user-confirmed, not independently inspected. Preserve the earlier SMTP failures and send record as historical evidence; no additional send was made.

See [confirmed rules A01–B10](CONFIRMED_PRODUCT_RULES.md) for the complete newly approved ledger, FX, release, retry, and request-bound policies. Offline reconstruction of 207 frozen German candidates measured maximum request bodies of 33,496 / 50,567 / 54,383 bytes for correction / score-only / score-and-paths. The user approved initial bounds of 36 / 56 / 60 KiB. Qualification used a standard playbook without original RAG/private memory; this is not historical token replay or a production maximum proof. Zero provider calls or fees. The existing oversized-singleton guard gap remains unimplemented; policy confirmation is not an acceptance pass. Global product tariffs are still empty; USD 12 historical probe reservations under the USD 30 ceiling are unchanged, invoice total remains unknown.

## Update: user-confirmed single SMTP send passed; inbox pending

The user explicitly confirmed one marked test email to the designated recipient. The product's real `sendOutbound` workflow returned `sent`, `reused:false`; receipt persistence, sent timestamp and encrypted-payload readback checks all passed. No model calls or automatic resend. The dedicated synthetic company and receipt remain for audit; no real customer was marked contacted. Recipient inbox delivery is **not yet confirmed** and must not be inferred from SMTP acceptance. No recipient address, sender identity or message content is committed here. Earlier send-pending statements below are historical.

## Update: SMTP connection fix and authentication passed

System `dns.lookup` returned four working server addresses; `dns.resolve4` returned a different unreachable address. Nodemailer preferred the latter and timed out at CONN. All four system-resolved addresses passed unauthenticated TCP/TLS/SMTP checks; no mailbox credential was used during that diagnosis.

After user approval, the product now establishes TLS using system resolution and passes the secured socket to Nodemailer. DNS is bounded to 5 seconds; at most four distinct addresses, 5 seconds each. Only transient transport errors allow address switching before handoff. Original SMTP hostname remains the TLS servername and certificate verification stays mandatory; no IP is hardcoded. No address switch/replay occurs after handoff, authentication or uncertain delivery.

Real authentication using saved credentials and the new product connector **passed in 504 ms**. No mail sent, no database writes, no model calls. Typecheck, production build, 16 targeted mail tests and the full 591-test / 140-file regression passed. Real email send/receipt/delivery acceptance is still pending user confirmation; successful authentication is not delivery. Prior SMTP failures below are historical.

## Update: DeepSeek post-recharge recheck passed

After the user confirmed recharge, one explicitly selected DeepSeek-only probe returned HTTP 200 and valid JSON in 1719 ms: 102 input / 27 output tokens. The conservative peak/cache-miss estimate is USD 0.00024156; provider-reported invoice cost remains unknown. Official rates were rechecked at https://api-docs.deepseek.com/quick_start/pricing/. This Saturday is off-peak (half peak rates); without cache detail the off-peak cache-miss estimate is USD 0.00012078, not an invoice.

Five of five provider contracts now have a successful probe, while the original HTTP 402 receipt remains retained. Cumulative reservation is USD 12 / 30, USD 18 remaining. No other provider was called. `--deepseek-recharge-recheck --run` uses the fixed stage `deepseek-text-recharge-recheck-1`; repeat execution reuses the recorded result and sends nothing. Original default run still reports its historical failed stage; use this update for the latest acceptance verdict. SMTP, broad production tariff coverage and business E2E gates below are unchanged and await item-by-item user discussion.

## Scope and verdict

Local production build only; no cloud deployment. Code/build and bounded authenticated UI checks pass. **Overall live-service acceptance is partial, not a release certification.** DeepSeek returned HTTP 402; SMTP connection verification failed. Existing broad product tariff policy remains fail-closed with no approved rules. Synthetic provider probes do not certify complete RAG, scoring, search or email-generation business workflows.

User authorized a cumulative USD 30 ceiling, official provider rates with OpenAI reference pricing if unavailable, and one marked SMTP test using the connected mailbox and designated recipient. No recipient, credential, real mailbox content or private endpoint is stored in this report.

## Verified results

- 586 unit/domain tests across 139 files; TypeScript and production build pass.
- 18 isolated browser tests and 14 authenticated desktop/mobile check groups pass against the local production server. The latter include real login, GB/MX detail/map, task budgets, and disabled-user session rejection. Synthetic UI fixtures were removed; customer records were not modified by these checks.
- Application-role database/UI contracts pass, including transactional tenant-isolation checks rolled back after verification.
- ESLint: zero errors, 11 pre-existing warnings. Fresh npm vulnerability audit and GitHub CI retrieval failed due to external TLS/EOF errors; prior audit results are not represented as a current successful audit.
- Authentication fixes: reject malformed login bodies before account lookup; require active account status for every session resolution.
- Kimi K3 calls use `max_completion_tokens` and omit fixed temperature. Billing refuses K3 requests containing only obsolete `max_tokens`. K2.6 retains its supported output field. Official source: [Kimi K3 guide](https://platform.kimi.com/docs/guide/kimi-k3-quickstart).

## Live model contracts and costs

One fixed synthetic text/embedding request per stage, zero automatic retries, no searches/tools/media/customer data. Successful output is checked as JSON or a finite embedding vector of the configured dimension. These are transport/schema checks, not business-quality evaluations.

| Stage | Result | Input/output tokens | Rate-derived estimate | Provider-reported USD |
|---|---|---:|---:|---:|
| OpenRouter `openai/gpt-5.6-sol` | HTTP 200; valid; 2.576 s | 25 / 10 | $0.0004675, conservative provider-table rates | $0.00015 |
| DeepSeek `deepseek-v4-pro` | HTTP 402; 1.724 s | Unknown | Unknown | Unknown |
| Kimi `kimi-k2.6` | HTTP 200; valid; 9.597 s | 26 / 114 | $0.00596, OpenAI reference only | Unknown |
| Kimi `kimi-k3` | HTTP 200; valid; 6.693 s | 104 / 83 | $0.00519, OpenAI reference only | Unknown |
| Aliyun `text-embedding-v4` | HTTP 200; valid; 1.883 s | 5 / 0 | CNY 0.0000025 | Unknown |

Actual invoice total is **unknown**. Do not add conservative rate estimates to reported cost as if both were charges. Kimi reference subtotal is $0.01115; embedding stays in CNY without an invented exchange rate. HTTP 402 is a billing/access failure, not proof of zero charge or of model quality.

Rate sources reviewed on 2026-09-12:

- [OpenRouter Sol](https://openrouter.ai/openai/gpt-5.6-sol): provider-specific prices vary; the probe estimate uses the reviewed upper displayed input/output rates of $5.5/$33 per million, not the promotional headline price. Returned `usage.cost` is separately retained, not called an audited invoice.
- [DeepSeek official rates](https://api-docs.deepseek.com/quick_start/pricing/): V4 Pro peak cache-miss input/output $1.32/$3.96 per million. No estimate possible for the failed response.
- [Kimi pricing](https://platform.kimi.com/docs/pricing/chat): actual numeric table could not be recovered from the fetched page. Following user authorization, use [OpenAI standard reference](https://developers.openai.com/api/docs/pricing), $10/$50 per million, explicitly **not Kimi actual rates**.
- [Aliyun embedding](https://help.aliyun.com/zh/model-studio/text-embedding-v4): Beijing real-time CNY 0.5 per million input tokens.

Budget implementation: a disabled, passwordless synthetic audit identity stores the USD 30 cumulative ceiling separately from the real user's budget. Every attempt reserves $2 before network I/O; five attempts occupy **$10**, leaving **$20**. This intentionally large reservation applies only to fixed small single-text probes (at most 8192 request bytes/4096 output tokens, no tools); it is not a general provider tariff. Policies expire on September 19. Server-only scoped policies do not change global product rules. Failed/unknown attempts retain reservations; rerunning skips all previous attempts including failures. A database advisory lock prevents concurrent copies. No automatic budget increase or release.

`scripts/verify-live-model-budget.ts` previews without `--run`; `--run` executes only missing stages. Resuming now makes no paid calls and still exits nonzero for the failed DeepSeek stage. Do not delete its reservations to retry. A new explicitly bounded retry stage must retain historical occupancy.

## SMTP

Connected mailbox count: one. Two connection-verification attempts failed with ESOCKET and ETIMEDOUT (including an escalated network attempt). No outbound receipt exists for the dedicated synthetic test company; sending was not reached. Inbox delivery is unverified. Do not mark SMTP as passed or retry blindly.

The clearly marked synthetic company node is retained for audit. The script uses a deterministic send idempotency key and no customer node. `scripts/verify-live-smtp.ts --status` is read-only; `--send` requires the authorized recipient in local environment. It logs phase/error class only, never SMTP raw errors or addresses.

## Remaining release gates / resume

1. Restore DeepSeek billing access; investigate SMTP host/port/TLS connectivity and account SMTP availability. Do not rotate credentials or change provider silently.
2. Complete broad per-endpoint request bounds (including tool/search costs), production workflow acceptance and invoice reconciliation. Global empty policy intentionally still blocks paid product calls; the isolated successful probes do not unlock them.
3. Complete final-user adoption telemetry where still unknown; do not label an HTTP success as downstream business adoption. Probe adoption here means only validator consumption.
4. Retry dependency audit / GitHub CI checks when external connectivity permits. Future ECS deployment additionally needs HTTPS/reverse-proxy trust, secrets, workers, backup/restore and operational monitoring acceptance; not in this local deployment scope.

No expanded search experiment, evidence refresh, real customer outreach or cloud deployment was performed.
