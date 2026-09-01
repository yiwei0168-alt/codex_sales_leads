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
