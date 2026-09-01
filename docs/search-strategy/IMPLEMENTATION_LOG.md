# 混合搜索生产实施记录

本文把已确认策略映射到`main`分支的真实代码阶段。只有通过验证并推送的提交才记录为完成。

## 2026-09-01：阶段1——角色、意图与确定性路由契约

- 主分支提交：[`a4dfdcd`](https://github.com/yiwei0168-alt/codex_sales_leads/commit/a4dfdcd)
- 状态：已完成并推送；混合策略配置仍为`draft`，尚未替换生产发现执行器。
- 输入：用户自然语言、旧版`LeadSearchPlan`、已确认`0.9.0-discussion`策略。
- 输出：显式机会目标、覆盖模式、verified-only标记、Agent和Brand Owner正式角色、版本化类别/轨道/provider步骤。
- 确定性门禁：普通搜索移除Agent、Brand Owner和OEM/ODM；OEM/ODM固定为客户机会，不允许供应商寻源；历史v3工具榜继续只接受旧11角色。
- 成本控制：Tavily在草案发现策略中被禁止；相同provider/引擎/机制不能在一个轨道重复；特殊类别默认不产生搜索成本。
- 验证：67个测试文件、270项测试通过；TypeScript、ESLint和端到端文档校验通过。
- 当前使用效率：路由为纯确定性计算，新增token和API credit为0；尚无真实provider输出和下游采用数据，不能宣称生产搜索成本已下降。
- 下一阶段：接入统一provider适配器、实时候选注册表、缺口触发/停止与贡献事件；通过后才把策略从`draft`改为`active`。

## 2026-09-01：阶段2——统一provider、实时注册表与贡献Schema

- 主分支提交：[`e8613e6`](https://github.com/yiwei0168-alt/codex_sales_leads/commit/e8613e6)
- 状态：已完成并推送；模块仍未接入旧发现函数，因此没有新增生产调用或费用。
- provider：Gemini Full、Product Gemini、SearchAPI Google/Bing、Brave、Exa、Google Places。
- 统一输出：provider、engine、mechanism、category、track、rank、请求/重试、credits、模型token和延迟。
- 实时去重：根域名、Place ID和规范化公司名共享注册；保留首次发现及全部辅助发现；无官网Places实体不会直接进入评分。
- 数据库：新增逐provider调用和逐候选occurrence表，预留门禁、最终角色、eligibility、分数、展示/选择/采用及分数化贡献回写。
- 安全与成本：最多有限重试，不静默切换同机制provider，不保存密钥或原始provider响应；OEM任务只生成一条机会搜索链，不重复Brand Owner链。
- 验证：69个测试文件、280项测试通过；TypeScript、ESLint和端到端文档校验通过。
- 下一阶段：加入官网轻抓取+Flash轻量门禁，并把缺口触发、连续无增量停止和数据库贡献写入接到生产发现节点。

## 2026-09-01：阶段3——生产执行器、轻量门禁与下游贡献闭环

- 主分支提交：[`6c4a1ea`](https://github.com/yiwei0168-alt/codex_sales_leads/commit/6c4a1ea)
- 状态：已完成并推送；`cudy-hybrid-lead-search 1.0.0`已从`draft`切换为`active`，数据库迁移033已成功应用。
- 生产流向：Market Playbook → 类别/轨道路由 → 多provider小批次 → 共享实时注册表 → 直接官网轻抓取 → DeepSeek Flash轻量门禁 → Tavily定向补证 → 统一角色与评分。
- 触发与停止：core步骤先执行；后续异构索引/语义步骤仅在数量或覆盖仍有缺口时运行；同轨连续两批无新增价值或质量池达到任务目标时停止并记录原因。
- 门禁：模型只返回存在性、产品相关、目标类别、角色提示、缺证和固定机会/关系信号；不返回Confidence、评分、路径、策略或邮件。程序确定pass/hold/reject；模型故障hold，不升级Pro。
- 安全：官网轻抓取限制96KB、12秒、HTTPS和3次重定向，检查本地/私网/不可解析主机及不安全重定向；原provider响应、密钥和私有用户文本不持久化。
- 贡献闭环：逐调用记录输入、raw/normalized/new/duplicate/rejected、credits、provider模型token、延迟、重试、fallback和丢弃原因；逐occurrence记录首次/辅助发现和门禁；评分后回写主角色、资格、分数、展示/选择/采用和等额分数化贡献。
- 工作流遥测：发现阶段分别记录原始生成量、新增唯一公司和实际进入下游的候选量；低有效率、重复率或辅助贡献过低只生成优化建议，不自动改策略。
- 用户提示：前端确认文案和完成消息已改为“混合搜索+Tavily证据”，不再把Tavily描述为候选发现工具。
- 验证：71个测试文件、286项测试通过；TypeScript、端到端文档指纹、数据库迁移和Next.js生产构建通过；ESLint为0 error、12条既有warning。
- 成本口径：本阶段未执行付费真实搜索，输入/有效输出/下游采用/真实单位成本为`not-observed`；仅确认六类provider配置均存在。首次正式运行必须按策略版本1.0.0记录真实贡献和成本。
