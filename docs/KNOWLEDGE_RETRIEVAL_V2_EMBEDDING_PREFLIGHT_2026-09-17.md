# KQ01 v2 向量生成启动预检

日期：2026-09-17

用户已明确回复“开始”，授权启动 v2 影子代的向量生成与通过验证后的原子激活；该授权不改变既有证据、权限、预算记录、失败停止或回退门禁。

本次只读预检确认目标 generation 为 `3917a242-724e-4e36-a1da-04c496a9df2d`（`shadow-layout-v2-2026-09-17`），状态为 `validated`，包含 102 个文档关系、10,871 个 v2 chunks、0 个可复用向量、10,871 个缺失向量，按每请求最多十个输入估算为 1,088 个 embedding 请求。

运行时配置检查显示 `EMBEDDING_API_KEY` 和 `EMBEDDING_BASE_URL` 均未配置，默认模型为 `text-embedding-v4`、维度 1536。因此没有发出任何 embedding、模型、搜索或 SMTP 请求，也没有产生 token、API credit、现金费用、重试、数据库激活或客户可见输出。该停止发生在供应商网络请求之前，不能将用户的启动授权解释为绕过缺失凭据或预算/费用审计。

恢复条件：在 Git 忽略的 `.env.local` 配置有效 embedding endpoint 和 API key 后，重新执行只读预检；随后以小批量受控运行，记录每批输入、有效向量、费用/未知费用、延迟、重试和弃用原因。仅当完整性、冻结质量评测和权限回归通过时，才以 `knowledge:reindex -- --apply --activate-generation=<UUID>` 原子激活；否则 generation 保持可回退的 `validated` 状态。

## 配置后的首批执行结果

用户确认本地配置完成后，受控读取确认 endpoint 已配置、模型为 `text-embedding-v4`、维度为 1536；密钥与完整 URL 未输出。为使 P7 的计划命令真正可执行，本阶段新增了受审计的 `--embed-generation` 路径：每次最多十个输入、每批供应商调用结束后才开始短数据库事务写入向量和恢复游标，并以 `knowledge_reindex_job` 记录 aggregate 输入、有效/下游向量、token、延迟、重试和未知现金费用。迁移 081 扩展了 job 的允许模式；激活命令现在拒绝仍缺向量的 generation。

随后以 `--batch-size=1 --max-chunks=1` 发起首批。成本门禁在网络传输前以 `missing-budget` 拒绝该请求：供应商请求、向量写入、模型/search/SMTP 调用、token、API credit、现金、重试、generation 激活和客户输出均为零。该次受阻输出用于确认预算缺口，并已保留失败 job 记录；不是供应商失败，不能自动重试或绕过费率/预算。恢复条件变为：在产品“任务中心 → 美元预算与预留”设置用户确认的累计预算，并确认嵌入模型有有效的已审核费率；再从新的 job 重新运行同一条命令（无需手工修改 generation）。
