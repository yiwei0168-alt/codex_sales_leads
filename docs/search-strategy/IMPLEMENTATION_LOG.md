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
