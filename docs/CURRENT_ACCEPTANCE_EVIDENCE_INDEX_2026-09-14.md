# 当前验收方法、权限与提交索引（阶段203）

以[唯一当前验收矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)主体行作为“已实现范围／尚缺行为”的权威状态。本索引补齐每项的可追溯验证方法、执行权限、实际结果和既有证据提交；提交号在建索引时由 `git log -1 --format=%h -- <证据文件>` 核对。后续矩阵或索引的文档提交不改变原验证提交。历史报告写入时的状态与测试数继续保留，不能覆盖矩阵当前行。“通过”只表示该行注明的验证范围，不能替代真实 A11 闭环或整体验收。

| 项 | 验收方法与证据 | 执行权限和费用 | 当前实际结果 | 证据提交 |
|---|---|---|---|---|
| A01 状态对账 | [当前矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)逐行与阶段报告、代码和提交对账 | 只读文件与 Git | 当前矩阵已更新；后续仍随新证据维护 | `297cac9` |
| A02 费用上界 | [S01 请求／合同验收](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)及矩阵其余入口缺口 | 官方公开资料与合成传输；无新付费 | S01 单入口通过；其他入口严格合同仍缺 | `6c42485` |
| A03 核销 | [真实 SQL／合成报告核对](LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md) | 隔离 SQL；0 新供应商调用 | OpenRouter 非 BYOK 适配通过；首次真实业务账单及其他服务商未核 | `08631dc` |
| A04 公司成本 | [零合格及未分配费用 SQL](ZERO_QUALIFIED_RESULT_PERSISTENCE_2026-09-14.md)与矩阵分摊记录 | 隔离 SQL；合成预留清理 | 分摊守恒和未知费用保留通过；真实账单对账未完成 | `6fff87d` |
| A05 费率刷新 | [08:49 UTC 官方 FX 重试及失败分类](FX_STALE_SOURCE_OBSERVABILITY_2026-09-14.md)与现行价证门禁 | 无密钥官方 HTTP／只读状态；0 付费 | 官方 9 月 11 日源已过期，旧快照未更新，09:49:42 UTC 再试；付费门禁保持 | `4379192` |
| A06 P05 恢复 | [SearchAPI 有效账号与恢复身份](SEARCHAPI_ALIAS_RECOVERY_IDENTITY_2026-09-14.md)、[Gemini 模型身份](GEMINI_DISCOVERY_MODEL_RECOVERY_IDENTITY_2026-09-14.md)、[不可变恢复关联 SQL](PROCESSING_RECOVERY_APPEND_ONLY_ACL_2026-09-14.md) | 合成请求／检查点／隔离 SQL；0 付费 | 空白主值下实际备用账号或模型变化均会阻止旧付费缓存复用；真实业务中断恢复未全验 | `f465bb9`、`8c6bf6a`、`1dceea8` |
| A07 P06 超限 | [单来源受控折叠](P06_PHASE_SINGLETON_EXCERPT_FOLD_2026-09-14.md)及分阶段 SQL／测试 | 合成输入；0 模型调用 | 已支持长证据路径通过；任意不可折叠事实和真实模型语义未全验 | `c1ba3f2` |
| A08 采用遥测 | [遥测追加权限／聚合 SQL](WORKFLOW_TELEMETRY_AUDIT_APPEND_ONLY_ACL_2026-09-14.md)及矩阵 HTTP 证据 | 隔离双用户 SQL／本地 HTTP；0 付费 | 系统使用与未知采用分离通过；真实用户采用未验 | `979cfef` |
| A09 任务数量与停止 | [最新生产 Chrome](PRODUCTION_UI_REGRESSION_STAGE202_2026-09-14.md) | 隔离本地 Chrome；0 付费 | 桌面／手机68项中数量、缺口、停滞新旧口径通过；真实业务结果待 A11 | `72c0f08` |
| A10 无付费回归 | [当前代码测试与构建](SEARCHAPI_ALIAS_RECOVERY_IDENTITY_2026-09-14.md)、[当前构建 UI](PRODUCTION_UI_REGRESSION_STAGE202_2026-09-14.md) | 本地测试／构建／Chrome；0 付费 | 1,026 项测试、类型检查与构建及 68 项 Chrome UI 通过 | `f465bb9`、`72c0f08` |
| A11 最小真实闭环 | [实际 Gemini 模型预检](GEMINI_DISCOVERY_MODEL_RECOVERY_IDENTITY_2026-09-14.md)、[搜索 HTTP 上限](A11_DISCOVERY_HTTP_ATTEMPT_CEILING_2026-09-14.md)与矩阵完整费用缺口 | 真实付费仅在整次预检及累计 USD30 门禁放行后 | **未运行、未验收**；当前模型 `gemini-3.6-flash`，整次费用上界仍为 `null` | `8c6bf6a`、`c6c4241`（仅预检） |
| A12 可控故障 | [完成原子性 SQL](WORKFLOW_COMPLETION_ATOMICITY_2026-09-13.md)及预算拒绝合成回归 | 隔离 SQL／模拟故障；0 新付费 | 合成暂停、未知费和并发回执通过；真实在途付费失败链未全验 | `c4059d0` |
| A13 页面与业务 | [当前 Chrome 双视口](PRODUCTION_UI_REGRESSION_STAGE202_2026-09-14.md)和矩阵私有知识 SQL | 隔离账号／本地生产 HTTP；0 付费／发信 | 已测页面68项通过；真实跟进、RAG 采用及完整私有链路未全验 | `72c0f08` |
| A14 模型连通 | [原生产实测报告](LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md) | 先前已授权探针；本轮不重跑 | 五类服务商探针已通过，原 402 留历史 | `08631dc` |
| A15 SMTP | [原发送及用户收件确认](LOCAL_PRODUCTION_ACCEPTANCE_2026-09-12.md) | 先前已授权单次标记邮件；本轮不重发 | 连接、鉴权、发送／回执及用户确认收件通过 | `08631dc` |

本索引只追加审计指针，不重新执行模型、搜索、盲审或邮件，也不把提案、合成检查或提交号当成真实业务通过证据。当前 A11 的费用与外部账单缺口仍按矩阵主体行执行；全部必需项实测通过之前整体验收保持未完成。
