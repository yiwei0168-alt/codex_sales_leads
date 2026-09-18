# RAG v3 R6 管理端复核中心验收

## 结果

“知识库 & RAG”页面的 shadow release 状态卡下已增加管理员复核中心。事实复核和 Gold 审核共用证据优先的工作台，但保存到独立、版本化的审计记录。普通成员调用读写 API 均返回 403；页面刷新不会执行模型、embedding、搜索或外部传输。

事实复核从 `knowledge_review_queue_v3` 分页读取，按冲突优先排序，可按原因、型号、属性和文档筛选。右侧只返回管理员核对所需的有界证据摘录、来源 SHA、版本、页/slide/sheet/表格坐标及受 ACL 保护的原件链接。决定包括：确认为 verified、保留 candidate、拒绝、纠正后 verified；纠正同时保留审核备注和 correction JSON。已处理项使用行锁和 `status='open'` 前置条件防止重复覆盖。

Gold 审核覆盖冻结的 300 条 `knowledge-eval-v3-baseline`：development 190、validation 60、holdout 50。每条记录绑定 case SHA-256、人工答案、来源 SHA-256、页/slide/sheet、可选表格行、审核人、时间和递增 revision。需要证据的 route/insufficient-evidence 项至少填写一个来源；clarify/deny 可以用审核备注说明无需来源。开发集和验证集 250/250 完成并显式冻结 `rag-v3-rrf-v1.0.0` 配置哈希前，holdout API 和 UI 都保持锁定。

Migration 088 已应用，并在 release 状态变为 active 前额外强制：300/300 Gold、50/50 holdout、holdout 冻结记录均存在。原有全部资产、双向量和开放事实复核门禁不变。

## 验收证据

- 聚焦合同：5 个测试文件、23 项测试通过，覆盖管理员鉴权、输入校验、事实决定映射、陈旧决定拒绝、Gold 来源坐标和 release Gold 门禁。
- 真实 PostgreSQL：migration 088 应用成功；read-only release 验证显示 1,029 个事实待复核、Gold 0/300、holdout 0/50 且锁定，活动指针为 0。
- 隔离浏览器：1366×900 和 390×844 均通过事实队列、Gold 进度、holdout 锁定和无横向溢出检查；使用临时管理员和工作区，清理夹具，审核决定写入 0。
- 外部模型、embedding、搜索、SMTP、provider token、API credit 和现金成本均为 0；本地测试与人工审核成本未知。

当前状态不是质量验收完成：管理员仍需在页面中处理 1,029 条事实及 300 条 Gold；完成后才可执行 Recall@8、答案/引用质量及原子激活门禁。
