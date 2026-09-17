# KQ01 P7 — 缓存、遥测与可回退重建验收

日期：2026-09-17。状态：实现与本地数据库迁移完成；影子代仍为 validated，未激活。

## 实现结果

- 新增成功结果专用的进程内缓存与并发合并。query embedding 键包含 user/ACL scope、过滤器、归一化问题、活动语料 revision、属性别名版、embedding 模型和维数；证据包键另含 top-k。失败与空证据不缓存，任意生成答案不缓存。
- 证据包命中后重新查询当前 chunk ACL；权限撤销或文档停用会从缓存结果删除。语料更新时间/活动代变化使旧键自然失效。
- `knowledge-workflow` 的所有终态由 `trackedOperation` 记录输入、有效输出、下游未知、reasonCode、cacheHit、token/费用边界、延迟、重试与弃用原因；trace 仍不加入正文。
- 新增 `knowledge_reindex_job` 追加式记录和 `knowledge:reindex`。默认 dry-run；代切换必须提供 UUID 和 `--apply`，在短事务/advisory lock 内切换并保留上一代。支持 batch-size/resume-after 参数，重建规划不在数据库事务中等待模型。

## 真实 dry-run

迁移 080 已应用。dry-run 读取 1 个 validated 影子代：102 个文档关系、10,871 个 v2 chunks、可复用向量 0、缺失向量 10,871，估算同步 embedding 请求 1,088，现金费用未知；写入、模型、embedding 调用均为 0。该结果明确阻止在未知费用下自动激活或全量重嵌入。

缓存/检索/指标针对性回归 8 文件、30 项通过，1.66 秒；TypeScript 检查通过。离线输入 30 项断言，有效及下游门禁使用 30。真实用户采用、生产缓存命中率和供应商 P95 未知。没有搜索、SMTP、provider token/API credit、现金或付费重试。

## 后续受控执行结果

在KQ02/KQ03明确披露与费用授权、预算配置和充值完成后，可恢复命令仅为缺失切片生成向量。最终dry-run确认102个文档关系、10,871个切片、10,871个可用向量、缺失0；冻结离线评测200/200、知识/RAG 48项测试及TypeScript检查通过后，generation `3917a242-724e-4e36-a1da-04c496a9df2d` 已原子激活。完整调用量、token、延迟和未知现金费用见[全量执行证据](KNOWLEDGE_RETRIEVAL_V2_FULL_EMBEDDING_ATTEMPT_2026-09-17.md)；本节保留初始dry-run作为执行前基线，不将其改写成当时已激活。
