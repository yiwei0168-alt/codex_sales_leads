# KQ01 P1 证据收紧与事实校验验收

日期：2026-09-17

## 实施结果

- 通用事实抽取现可区分小数链路速率与蜂窝代际，保留 `SFP+`，展开 `802.3af/at`，抑制英文/中文明确否定，并仅在 PoE 上下文含预算语义时提取瓦数。实现没有型号分支或 WR3000 特判。
- 引用只有在 UUID 属于本次已通过 ACL/外发筛选的证据集合时才有效。产品引用还必须包含非 `catalog_identity` 的 verified 属性；冲突、空引用、伪造引用和请求型号不一致均产生 `grounded=false`。
- 结构化事实不再按同类别挂接到其他型号文档；`corroborated` 不再由任意两个检索通道直接推出。
- 旧 `product_fact` 没有删除、改写或重嵌入。只读审计输出 64 个保守待重算 ID：小数速率疑似蜂窝误读 33、否定能力疑似正向事实 22、SFP+ 疑似降级为 SFP 9。该清单是候选审计队列，不表示 64 条都已人工判错；P4/P7 必须按来源修订重建。

## 验收边界

P1 是防错阶段，不宣称全库事实已经纠正，也不把 3,054 条历史 verified 事实接入快速直答。短标题切片缺陷仍被离线评测保留，按计划在 P3 解决。外部模型、embedding、搜索、SMTP、数据库写入和付费重嵌入均为零。

验证命令：

```powershell
npm.cmd test -- src/lib/rag/product-facts.test.ts src/lib/rag/service.test.ts src/lib/rag/tenant-isolation.test.ts
npm.cmd run typecheck
npm.cmd run knowledge:eval
npm.cmd run knowledge:audit-facts
```

只读事实审计每次输出完整 `recomputeIds` 与集合 SHA-256，便于 P4/P7 对同一候选集复核；本次集合 SHA-256 为 `6d3e738847018f272325558117032d43d7ec6a2ebd677239027b7d6df02baf50`。不在文档复制可随数据库代变化的 UUID 列表。
