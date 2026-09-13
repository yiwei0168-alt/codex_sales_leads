# 用户修改优先与重新评估实际 SQL 验证（阶段94）

使用隔离用户、两国共享公司身份和合成搜索结果运行生产持久化适配器。先在哥伦比亚通过实际 `updateCompanyState` 将主角色设为 SI、账户等级设为 KA、阶段设为 Contacted，并写入私有分类记忆；再模拟另一运行经实际 `saveCompany` 保存该公司的新版机器评估。读取 `workspace_company_market` 原始记录及 `materializeCompanyMarket` 后，机器分数更新为 84，用户确认的 SI/KA/阶段/跟进行动保持优先，角色冲突留下 `assessmentNeedsRefresh=true`。墨西哥同一全局公司身份仍维持原分数 79、Distributor 与原修订号；另一用户看不到工作区记录。原并发结果保存、费用分摊、重放冲突及未知采用断言继续通过。

命令：`node scripts/run-tsx.cjs scripts/verify-result-persistence.ts`。输出确认两国、四个并发保存、14条产物事件、2条证据快照、6类冲突重放拒绝、用户修改合并与私有记忆1条；合成预留23 micro-USD只存在于隔离测试用户，结束时清理并输出 `Synthetic persistence fixture removed.`。类型检查、脚本 lint 与差异检查通过。0模型、搜索、真实费用或发信；不触碰现有待执行任务。

这证明实际数据库中的**用户修改与再评估合并规则**，不证明模型能正确解决角色语义冲突，也不替代真实业务运行、完整跨进程恢复或页面回归。节省、用户实际采用和真实延迟未知；优化机会是复用用户确认值，避免模型结果覆盖人工决定或为重复编辑再付费。
