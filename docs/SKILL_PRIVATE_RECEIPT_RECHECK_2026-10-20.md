# G09 私有回执最终复核

持锁材料准备已有任务日志、邮件行、时间线来源保护和材料重建。此次增加对实际消耗的历史/前瞻私有回执的显式二次读取：准备期间及策略计算后分别调用现有 `assertCurrentPrivateReplayMessages`，复核邮件完整载荷、清除状态、客户归档、时间线内容及客户列表范围/分页。复核在既有绑定租户事务内执行，不调用工具调度、IMAP 或模型。

回执内容保留在事务内的私有闭包；公开结果只返回复核标记和数量。第二次来源读取失败或覆盖数量变化，readiness 拒绝返回。未开放 Skill 自动启用，也未将 pending-production 来源提升为已认证。

## 已验证

- `node node_modules/vitest/vitest.mjs run src/lib/assistant/main/skill-private-receipt-check.test.ts src/lib/assistant/main/skill-locked-materials.test.ts src/lib/assistant/main/private-replay-guard.test.ts`：68 项通过。
- 新适配器测试调用真实私有来源守卫，模拟底层仓库；覆盖邮件清除、完整载荷变化、客户归档、列表分页、无关工具忽略及无效输出拒绝。
- readiness 编排测试覆盖策略计算后来源失效拒绝、覆盖数量变化拒绝，以及回执/闭包不外泄。
- 全项目 TypeScript `--noEmit --incremental false` 和四个变更源码文件 ESLint 退出 0。
- 首次 npx 受 PowerShell 策略阻止；直接 Node 的沙箱测试因临时缓存重命名 EPERM 未启动。窄范围提升后测试正常通过，未修改系统执行策略。

## 未验证与后续

本轮没有实库或固定镜像联合验收；仓库读取为模拟，没有修改业务数据或发起模型请求。完整来源生命周期、可信生产 runner/collector 认证、最终启用事务和真实五类质量仍待完成。现有 sourceRevocationsLocked、collectorProvenanceVerified、automaticActivation 均保持 false。继续 G01–G13；G14–G20 与内网上线暂缓。
