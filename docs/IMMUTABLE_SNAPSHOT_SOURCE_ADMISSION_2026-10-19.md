# G09 原件来源锁入口（2026-10-19）

## 实现

`revalidateLockedKnowledgeAssetBytes` 现自行调用 `withBoundTenantTransaction`，核对数据库角色、当前账号和事务身份；非空原件集合在查询元数据、文件或快照前调用实际 `lock_skill_knowledge_sources()`。来源 admission 留在调用者事务中直至提交/回滚，调用者不再需要依靠约定补上该锁。空集合仍验证账号事务，但不虚构文件要求。

原有完整材料层的锁顺序不变；内部重复取得同一 admission 可复用当前事务。该入口仅保护登记原件及其当前资料元数据，并不声称已完成全部业务来源撤销语义、生产身份或 Skill 启用事务。

## 验收

- 三个定向测试文件共 70 项通过，新增取得 admission 的先后次序及 admission 不可用时在源读取前拒绝。
- 类型检查及定向 lint 通过。
- 实际 MA11 合成克隆：初次显式 `--install-source-snapshots` 安装实际 148/149/156；随后不重装的最终验证共五组通过。
- 未绑定事务及账号不一致均拒绝；四类写入（撤销、共享转私有、哈希变化、删除）通过独立写连接触发，`pg_blocking_pids` 明确包含持有读取事务的实际 backend PID。锁内重复读取清单不变，提交后写入完成，下一事务拒绝旧来源。
- 原文件未创建；读取实际数据库快照，无模型、外部网络或业务库访问。夹具使用独立 UUID，清理后该快照数量为零。

命令：`npx tsx scripts/verify-immutable-snapshot-source-locks-clone.ts --install-source-snapshots`，后续复核可省略安装参数。[最终五组收据](evidence/ma24-g09-immutable-source-admission-2026-10-19.json)。

测试克隆中的实际迁移保留；合成账号、资料、资产和快照全部清理。快照清理使用管理连接在局部事务设置 `session_replication_role=replica`，只删除本次资产 UUID；这是特权夹具处置，不是应用删除能力，不能据此声称应用具备数据保留/清理功能，也不声称抵抗数据库管理员。

## 剩余

完整材料组合尚需在新版本验证；最新编译镜像仍固定于更早 3c17a4f0。生产来源资格、保留生命周期及最终启用事务未完成，自动启用保持关闭。
