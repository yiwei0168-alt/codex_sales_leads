# v3 代表性样本成本与质量门禁（精确缓存修复后）

- 结论：PASS
- 方法：9 家代表性样本的首次评分为真实模型调用；重复臂使用精确依赖指纹缓存，不是第二次模型调用。
- 首次完成率 100%，战略候选召回 100%，证据引用与路径规则均为 100%。
- 重复臂：主角色一致率 100%，eligibility 一致率 100%，MAD 0（门禁 ≤3），模型请求/token/付费搜索均为 0。
- 首次评分：128,283 token，14,254/公司；相对上一轮 207 家实测降低 62%，达到再降 40% 的目标。
- 付费搜索历史实测：5.41 → 3.36 credits/公司，降低 37.8%，达到至少 30% 的目标；冻结证据 A/B 未产生新付费搜索。
- 修复前的无缓存重复运行是 88.9% eligibility、MAD 3.89，主要由 DNS:NET 的路径遗漏引起。它证明不能依赖 temperature=0 获得稳定结果，因而改为严格依赖失效缓存。
- 缓存边界：证据内容/新鲜度、纠正事实与主角色、评分配置及校验和、Prompt 版本、任务目标或用户路径记忆任一变化，只使受影响候选失效并重新评分。
- 全 Pro 诊断未通过（完成率 77.8%、MAD 22.56），因此不采用全量高能力模型；仅在预计改变总分至少 8 分或关键状态、且问题可解决时升级。

| 公司 | 类别 | 主角色 | 首次分 | 缓存重放分 | MAD贡献 | eligibility一致 |
|---|---|---|---:|---:|---:|---|
| TD SYNNEX Germany GmbH & Co. OHG | distribution | Distributor | 87 | 87 | 0 | 是 |
| Herweck AG | distribution | Distributor | 85 | 85 | 0 | 是 |
| JACOB Elektronik GmbH | retail | E-tailer | 84 | 84 | 0 | 是 |
| Tiger Technik | retail | E-tailer | 71 | 71 | 0 | 是 |
| CANCOM SE | services | SI | 79 | 79 | 0 | 是 |
| Kellner Telecom GmbH | services | Installer | 70 | 70 | 0 | 是 |
| DNS:NET Internet Service GmbH | isp | ISP | 78 | 78 | 0 | 是 |
| Bechtle AG | hybrid | Hybrid | 78 | 78 | 0 | 是 |
| Controlware GmbH | hybrid | Hybrid | 77 | 77 | 0 | 是 |
