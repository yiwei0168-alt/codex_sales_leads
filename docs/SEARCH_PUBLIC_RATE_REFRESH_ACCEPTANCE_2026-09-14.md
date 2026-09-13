# 阶段108：Brave/Tavily Search 公开费率只读复核

现行 `brave-standard-web-search` 和 `tavily-standard-search` 的静态上界分别为 USD0.005/次与 USD0.016/次。本阶段实际 GET [Brave 官方 Search API 价格页](https://brave.com/search/api/)的 Search Plan 结构化报价，以及 [Tavily 官方 Credits & Pricing](https://docs.tavily.com/documentation/api-credits) 的 Markdown 版本：Brave Search 为 USD5/1,000请求；Tavily Pay-as-you-go 为 USD0.008/credit，basic 1、advanced 2 credits。公开免费额度及较低订阅价未用于减少预留。冻结[只读字段基线](SEARCH_PUBLIC_RATE_BASELINE_2026-09-14.json)，未更改现有静态合同金额、请求参数、搜索供应商路由、核验日期或到期时间。

迁移 `058_search_public_tariff_reference.sql` 把两条来源加入现有追加式公共快照、状态与观测约束。worker 在原五分钟维护机会检查是否到期，成功复核后每来源24小时再查；跨进程事务锁合并并发，暂时故障一小时后重试。只对比 Brave **Search Plan**，不把 Answers 的请求加 token 报价混用；Tavily 只取 Search basic/advanced 的 credit 数及公开最高 Pay-as-you-go 单价，不混入 Extract/Research。价格或用量变化、非完整/非对应内容时仅将受影响规则设为 `review-required`，旧 hold 粘性保留并阻止新预留；429/5xx/传输故障设 `unavailable` 并保留旧快照及 hold。预算 API 与页面只读状态，不能通过刷新页面重新定价或放行。

真实 PostgreSQL 验证 `scripts/verify-search-rate-refresh.ts` 将迁移重复执行两次，通过应用角色权限检查和账本对账。Brave/Tavily 当前均 `validated`、hold=false，下次检查24小时后；两次并发刷新最多各1个公开 GET，紧随重复0。后续独立只读源检查又各GET一次，交叉核对Brave结构化报价与可见价格卡、Tavily价格文字与表格，两源仍一致；该检查不写账本。应用角色不能修改公共快照，预算占用、付费预留及费用观测前后相同。只持久化页面 SHA256、规范化单价/credit 字段及聚合观测，不保存网页原文、客户查询、凭据或邮件。静态规则仍以 2026-09-20T00:00Z 为截止，当前状态不能替代届时完整请求与预算门禁。

验证：954项测试/202文件、类型检查和生产构建通过；全库 lint 0错误/11既有警告，生产依赖审计0高危。隔离账号的本地生产服务完成桌面1366px、手机390px共64组真实HTTP/Chrome检查，包含 Search 费率 API 到页面、预算只读刷新、国家/用户隔离、任务与恢复及原有回归。fixture 已清理、服务关闭；页面仅产生并清理1笔合成预留，真实搜索/模型付费调用0、真实邮件0。

效率口径：公开页输入2、规范化有效输出2、预算只读下游使用2；初次账本公开 GET2、紧随重复0；独立源交叉检查 GET2，模型 token/API credits/现金0，业务候选和用户实际采用0。每来源抓取延迟、响应字节、重试、丢弃原因由 `billing_tariff_refresh_observation` 独立记账，不把公共抓取当作搜索业务用量。优化机会是跨任务复用每日来源观测，并在价格漂移时先停预留。剩余三个搜索入口及其他模型费率刷新、价格变更确认、供应商可信账单和 A11 最小真实闭环仍缺；没有新市场实验或冻结哥伦比亚重跑。
