# MA24 长期记忆与无向量 RAG：实施与验收记录

## 冻结的旧路径

现有活动 v3 release 和 `knowledge_release_pointer_v3` 保持不变；本阶段不删除旧 chunk、向量或个人记忆。既有 [v3 激活记录](KNOWLEDGE_RAG_V3_ACTIVATION_2026-09-19.md)报告 Gold 仅 11/300，holdout 0/50 且锁定。活动 release 说明完整性门槛已通过，不说明答案与精确来源质量已验收。冻结的 [300 题设计](KNOWLEDGE_RAG_V3_R0_BASELINE_2026-09-18.md)保留 development 190、validation 60、holdout 50；PDF、PPTX、XLSX、跨文档、冲突、无答案须分别记录答案与来源坐标对照。本阶段没有人工补造 Gold。

2026-09-24 本机只读复核：活动 release 为 `rag-v3-shadow-2026-09-18`，ID `889a1b5b-9b45-4695-a9b1-e2f2415a028f`，激活时间 `2026-09-18T16:03:31.838Z`。`WR3000` v3 查询前三候选文档分别为 Cudy Wi-Fi Router Product Catalog（`c0930e07-2a17-473d-a2d8-3fb65db9e7a5`）、Cudy Product Catalogue（`993bc2cf-5dde-4d88-950e-5c4f5b947bcb`）及 WR3000 Datasheet V2.0（`2a2bbe72-9e86-40eb-8fdb-7cd07ceefba1`）。这是候选冻结，不是答案/引用质量判断；该查询输出的 `sourceLocation` 为 null，精确原文坐标仍待 Gold 人工补齐。

## 本阶段实际交付

- 迁移 106 增加逐文档版本、树节点、当前指针、双时间记忆观察与图谱 outbox。版本由 documentId + source SHA-256 + extractorVersion 唯一标识。当前指针只在事务内完整建树后切换。
- `indexExtractedDocument` 只接受已注册且来源/产物哈希一致的本地上传产物。其权限与来源失效检查针对 PostgreSQL 当前状态；PDF 页、PPTX 幻灯片、XLSX 工作表及原文块保留坐标。
- `searchDocuments`、`browseTree`、`readEvidence`、`aggregateDocumentSet` 提供只读的无向量接口。摘要不进入答案引用；`readEvidence` 只返回仍为当前版本且来源已注册的原文。
- 记忆观察不可覆写，业务时间未知以 NULL 保存，outbox 与观察同事务写入。自动抽取、Graphiti 投影和 Skill 自动启用尚未连接。

2026-09-24 增量接入：迁移 107 允许账号所有者写入自己的私有树，管理员仍负责共享树。二进制上传 worker 在本地抽取成功后自动登记私有资料并建树；共享资料保持管理员明确登记。新路径不调用 embedding。上传列表显示可检索状态、当前树版本与来源哈希。旧 v3 指针没有改变。合成 PDF 从注册到检索、重复登记、原文块坐标、跨账号拒绝和撤销后禁引均通过；此证据不代表真实复杂 PDF/PPTX/XLSX 的质量验收。

浏览器隔离回归在 1366×900 与 390×844 两个视口通过，上传分区显示“可检索”和当前版本，整页未因新增状态向下无限延伸。

## 后续发布门槛

新主路当前处于影子底座阶段。还需完成所有入口的逐文档增量处理、任务收据与 8 组证据/8 次导航预算、v3 候选回读、Graphiti 本机部署与 PostgreSQL 回退、记忆通知/撤销、Skill 影子测试及固定分页 UI。300 题人工答案与精确来源 Gold 和锁定 50 题未完成前不得切换生产主路。切换要求锁定集答案和引用正确数均不低于 v3，且长文档、跨文档、新增资料有可复核改善，正式事实和无答案题不得退步。权限泄漏或未确认正式事实发布阻断上线。

## 验证记录

2026-09-24：`tsc --noEmit` 通过；`node node_modules/vitest/vitest.mjs run src/lib/knowledge/vectorless.test.ts` 的 4 项安全/抽取用例通过；所改 TypeScript 文件 ESLint 通过；`npm run db:migrate` 在修复既有迁移 105 的可重复执行性后完整通过到迁移 106。数据库只读核查显示 4/4 新表启用并强制 RLS，当时树版本 0，人工 Gold 11/300、holdout 0/50。随后迁移 107 和 13 项相关测试通过，`verify-vectorless-upload-local.ts` 的本机合成端到端通过并清理测试资料；真实资料仍未进入新树。未运行的门槛不得记为通过。
