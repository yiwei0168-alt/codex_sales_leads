# v3 代表性 A/B 与成本门禁

- 结论：FAIL
- 样本：9 家；每类 1–2 家（distribution=2，retail=2，services=2，isp=1，hybrid=2）
- 完成率：100%；战略候选召回：100%
- 重复运行主角色一致率：100%；eligibility 一致率：88.9%
- 重复运行 MAD：3.89（门禁 ≤3）
- 相对旧 v2 结果 MAD：13（诊断项；评分机制已按用户确认发生实质变化，不作为门禁）
- 有效证据引用率：100%；路径规则：100%；一级代理商 KA 错误：0
- 本轮实际评分 token：128,283，14,254/公司；相对上一轮 207 家优化实测 37,475/公司降低 62%，相对 81 家旧基线降低 89.1%
- 付费搜索历史实测：5.41 → 3.36 credits/公司，降低 37.8%；本轮冻结证据 A/B 未重新搜索。

Top-N 不参与正式产品升级门禁。本 A/B 只验证角色、资格、分数稳定性、证据、路径结构和成本。

| 公司 | 类别 | 主角色 | 首次 v3 | 重复 v3 | |Δ| | eligibility 一致 | 路径数 |
|---|---|---|---:|---:|---:|---|---:|
| TD SYNNEX Germany GmbH & Co. OHG | distribution | Distributor | 78 | 87 | 9 | 是 | 1 |
| Herweck AG | distribution | Distributor | 85 | 85 | 0 | 是 | 1 |
| JACOB Elektronik GmbH | retail | E-tailer | 81 | 84 | 3 | 是 | 1 |
| Tiger Technik | retail | E-tailer | 72 | 71 | 1 | 是 | 1 |
| CANCOM SE | services | SI | 83 | 79 | 4 | 是 | 1 |
| Kellner Telecom GmbH | services | Installer | 71 | 70 | 1 | 是 | 1 |
| DNS:NET Internet Service GmbH | isp | ISP | 66 | 78 | 12 | 否 | 1 |
| Bechtle AG | hybrid | Hybrid | 80 | 78 | 2 | 是 | 2 |
| Controlware GmbH | hybrid | Hybrid | 80 | 77 | 3 | 是 | 1 |
