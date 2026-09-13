# 阶段117：SearchAPI 账号只读计费证据核查

2026-09-13 20:55 UTC 使用当前产品配置的凭据对官方 `GET /api/v1/me` 做一次只读请求。仅保留白名单聚合字段：HTTP 200、`current_month_usage=0`、`monthly_allowance=0`、`remaining_credits=0`、`hourly_rate_limit=200000`，订阅起止字段未同时出现。未保存 API key、原始响应、账号标识或任何搜索内容。

官方[Account API 文档](https://www.searchapi.io/docs/account-api)把这些字段定义为用量、额度、小时限制及订阅期间；它没有提供可唯一核定账号套餐价格或速度档的字段。因此本次观测不能证明当前账号有何付费合同，也不能以零额度推断历史费用为零。阶段116的 `missing-tariff` 门禁保持，不解除、不切换搜索路由。实际搜索请求0、候选0、有效输出0、下游使用0、用户采用未知；产品付费预留、模型 token、搜索 credits 和现金记录增量0。外部只读请求1次、重试0，本地总耗时约1秒；未来合同核实需要账号条款/发票或其他可审计证据。
