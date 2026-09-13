# 阶段110：Exa 与 Google Places 公开费率只读刷新

现行 Exa `exa-company-auto-text-search` 静态预留 USD0.027/次、Google Places `google-places-text-search-enterprise` USD0.035/次及共同的 2026-09-20T00:00Z 截止均保持不变。新增两条官方公开价来源到每日只读复核，与 Brave/Tavily 共用跨进程锁、追加式快照、漂移暂停和预算页面只读展示；没有新增搜索路由或付费准入。迁移059扩展来源/规则白名单，不更新历史费用。

[Exa 官方端点价格表](https://exa.ai/docs/reference/pricing)将 `/search` 标为 USD7/1,000请求（前10结果），超10结果 USD1/1,000结果，AI摘要 USD1/1,000页；独立 `/contents` 的正文按每内容类型 USD1/1,000页。当前产品是 `/search`、`type:auto`、`category:company`、最多20结果、`contents.text:true`，未请求摘要、deep或独立 `/contents`。原 USD0.027 上界没有降低；新增复核只比较公开计费单位与原请求边界。早期将20条正文按独立 `/contents` 另算并推测少预留的判断已撤回：官方表没有给当前 `/search` 另列这种费用。若未来请求参数或计费项变化，仍需重新核验完整上界。

[Google 全球 SKU 价格表](https://developers.google.com/maps/billing-and-pricing/pricing)将 Places API Text Search Enterprise（SKU `E967-44BC-B44D`）最高档标为 USD35/1,000事件；+ Atmosphere 是独立 SKU，当前 FieldMask 未请求。只读解析要求精确 SKU 与首档价格，不能拿免费额度、量价折扣或 Atmosphere 的价格替代。

真实 PostgreSQL 中迁移059重复应用两次通过，应用角色不能改公共快照。并发刷新只有新到期的 Exa 与 Places 各1次公开 GET，Brave/Tavily 仍复用原状态；付费预留、费用观测与预算占用均不变。Exa 的公开页140,359字节、458ms，状态 `validated/hold=false`。Places 首次官方请求返回 HTTP 200 但仅265字节，无法核实 SKU，816ms；状态 `review-required/hold=true`，**新 Places 预留暂停**。随后独立只读源检查读到正常价格表并与 USD35 基线一致，但既有暂停按安全规则不自动解除，保留人工复核入口。不能把这次短页解释为已证实涨价，也不能把独立成功检查冒充本次生产刷新已通过。账本只保存来源 SHA256、规范化价证/状态和聚合用量，不保存原网页或客户数据。

兼容与回滚：迁移059仅扩大公共来源/规则约束，旧应用仍能读写原有五条来源。若撤回此版应用，保留新增追加式快照和 Places hold，旧版不再刷新两条新来源；不要删除价证、清除 hold 或把059反向约束直接套在已有新来源行上。恢复新版后仍需人工复核 Places 才能放行。

[SearchAPI 官方价格页](https://www.searchapi.io/pricing)列出按套餐与标准/增强速度变化的价格和月费；当前产品没有已核准的 SearchAPI 完整费用上界或可核实套餐归属，该入口继续在付费门禁前停止，不从公开最低单价推断账号合同。其余模型费率、价格变更确认、真实供应商账单与 A11 最小真实闭环仍缺。

验证：962项测试/202文件、typecheck、生产构建、全库 lint 0错误/11既有警告；隔离账号本地生产桌面1366px/手机390px共64组 HTTP/Chrome 回归，四条费率状态从 API 到页面可见，Places 暂停文字一致，fixture 清理。真实搜索、模型和邮件调用为0；页面测试的1笔合成预留已清理。阶段业务搜索输入/输出/采用均0；新公共刷新输入2页、有效规范化输出1、预算只读下游使用1、丢弃短页1，两个免费 GET 的观测延迟合计1,274ms，模型token/API credits/现金0、付费重试0，利用率1/2。优化机会是稳定取得 Places 官方完整价证并人工核实短页原因；暂停保持期间不放行该来源。
