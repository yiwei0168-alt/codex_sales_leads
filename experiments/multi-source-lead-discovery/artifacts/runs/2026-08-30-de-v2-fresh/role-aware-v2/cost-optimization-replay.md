# v2 成本优化回放（不调用模型）

- 候选公司：81
- 独立复核路由：79 → 76，减少 3.8%
- 复核证据载荷：3201344 → 1280542 字符，减少 60%
- finding 引用的当前证据保留率：100%
- 按路由比例线性估计，独立复核 token：4,528,395 → 4,356,431

## 解释

本结果只在冻结的 v2 主评分和当前证据快照上回放路由与证据包，不重新调用 DeepSeek 或高能力复核模型。
路由估计尚未计入证据压缩和 JSON Schema 去重带来的额外输入节省，因此不能替代真实账单；在没有网关费率表时也不换算货币。
成本控制没有修改评分权重、角色判断或合作路径语义，所有 finding 已引用的当前证据必须 100% 保留。

## 触发器变化

| 触发器 | 旧机制 | 优化机制 |
|---|---:|---:|
| conflicting-facts | 14 | 14 |
| deterministic-conflict | 16 | 16 |
| evidence-warning | 7 | 5 |
| identity-changed | 22 | 16 |
| low-confidence | 57 | 39 |
| material-alternative-paths | 53 | 34 |
| primary-role-unresolved | 30 | 30 |
| random-audit | 3 | 3 |
| scoring-anomaly | 74 | 26 |
| selection-boundary | 3 | 0 |
