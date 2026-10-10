# 本地检索验收身份与一致性 — 2026-10-10

本阶段落实 MODESEL-16 的本地对照记录及 MA09 的冻结集不可用于调参边界。未依据 boundary-5-03/04 修改检索逻辑，也未修改冻结 Gold、旧判决、正式事实或生产检索排序。

## 已修正

旧预检输出顶层 profileKey/profileSha256 指向冻结四通道 v3，实际执行却是关闭 Qwen 的本地检索。原说明文档有降级提示，但机器字段不够明确。本次输出 receiptVersion=local-document-recall-v2，分别保存 frozenReferenceProfile 和 evaluatedProfile（独立 SHA-256）。实际三通道配置记录 Qwen 权重 0、BGE 固定修订/1024 维、候选 40、RRF k=60、结果 8，另记录查询预处理方法。

强制记录 fullFrozenBaselineExecuted=false、answerQualityValidated=false、preciseCitationValidated=false、releaseGateSatisfied=false。来源召回全部通过也不能由此标记答案或发布门槛通过。

每轮执行前后分别计算 Gold、冻结门禁、release 指针、可见资料状态/版本/权限、事实核验状态及待审状态的摘要；前后不一致则拒绝汇总，要求重新运行。该检查检测前后状态差异，不宣称整个长任务持有数据库同一事务快照。源代码提交、工作区是否有源码改动、运行时间和输入摘要一并保留；不输出私有原文或账号字段。

## 验证结果

- 10 项相关单测通过，包含实际/冻结配置分离、状态变化拒绝，以及原答案判分门禁回归。TypeScript 和聚焦 lint 通过。
- 真实本地只读对照再次为 42/44；输入前后摘要相同，外部模型调用 0。机器收据见 evidence/local-retrieval-receipt-v2-2026-10-10.json。收据来自提交前工作区，sourceDirty=true 如实保留；其代码改动随本阶段提交。
- 旧答案判分器只读回读：候选缺失 0，判决缺失 96；两路各已审 2 题，答案正确各 2、精确引用正确各 0；complete=false、holdoutNonRegression=false。Gold 无须重做。下一道 P4 PoE 的建议判决已交用户确认，尚未写入。

仅修改离线验收工具及记录，无生产运行时代码变化，无需重启服务。历史 2026-09-30 及 MODESEL-16 机器证据保留，不用新格式回写旧结果。
