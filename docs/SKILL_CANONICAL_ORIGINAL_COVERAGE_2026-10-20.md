# G09 验收准备的原件副本覆盖门槛

## 实施范围

沿用 MA24-06 的审核、来源和启用边界，无新用户确认。`production-runner-pending-verification` 验收包在持锁 readiness 的第二次实际字节核对后，必须满足：所有附件原件、实际消耗知识回执的文件资产都已有经过字节校验的数据库不可变副本；两类数量分别相等，数量及清单哈希完整有效。只读挂载不替代副本，未捕获时要求使用既有显式原件保存入口。

零文件资产仍须有实际适配器返回的零数量与有效空清单哈希；数据库原生证据不虚构原件。合成工程包允许继续重建，但返回的覆盖 required/revalidated 均为 false。输出只有覆盖哈希，不含资产 ID、原文或回执正文。

这只是来源完整性的一个必要条件。来源撤销全覆盖、可信生产身份、真实质量、最终启用事务仍未完成；`sourceRevocationsLocked`、`collectorProvenanceVerified`、`automaticActivation` 继续为 false。

## 本阶段证据

- 51 项 `skill-locked-materials.test.ts` 定向测试通过，包括 readiness 实际接线、两类缺失各自拒绝、只读挂载不能绕过、缺失/非法清单和零文件边界。
- TypeScript、四个变更代码文件的定向 ESLint 与差异检查均退出 0。
- `node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --current-schema --web-image=ma24-pilot-web:96b7487e --acceptance-originals` 退出 0。
- 全新迁移 158 数据库，实际文件与来源锁下的附件/知识字节适配器：两文件可读但无副本时拒绝；显式捕获并删除文件后覆盖通过。跨账号、旧预览、文件损坏整组回滚、共享撤回、停用和冻结撤销仍拒绝；Skill 保持禁用。
- 新代码在宿主源码检查中运行。固定旧 Web 镜像仅用于基础登录/隔离 HTTP，不声称包含新代码；本轮未重复原件 HTTP/浏览器验收。
- 模型调用 0，纯合成来源，无人工判断或生产资格。临时数据库/Web/网络由脚本 finally 清理。结果文件：`tmp/ma24-acceptance-originals-database-result.json`。
- 当前完整五类签名组合待固定提交后运行；本轮组件夹具五个回放引用不是五类完整验收。

## 后续

固定本阶段代码后重跑完整签名组合，核对已有不可变附件能通过新门槛，而缺失真实人工判断仍阻断。之后继续可信来源类别与最终启用事务；不推进 G14–G20 或内网上线。
