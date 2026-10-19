# G09 验收准备的原件副本覆盖门槛

## 固定版本完整签名组合终态

固定 `69ed7f97cfccfd1155047b29ce2af22d45688fac` 的 Git archive 源码，设置 `MA24_CONFIGURED_COMBINED=1 MA24_DATABASE_TRUST=1` 执行 `node scripts/run-ma24-snapshot-check.mjs --transport-journal`，退出 0。下方“完整组合待运行”是本阶段先前记录，以此终态为准。

同一冻结计划的五类材料、实际编译 CLI 声明签发、两份签名原任务与八个评测臂的传输复核、完整持锁重建及新原件覆盖门槛通过。不可变附件实际读取，撤回来源后拒绝，恢复后同一副本清单通过。数据库信任登记禁用等待 readiness 外层事务提交，提交后新检查拒绝，恢复登记后可继续读取。缺少真实人工判定仍阻断，Skill 保持未启用。

组合包哈希 `13bc525a1e31e08ff40259808abff3ee5dee67fa82296080ca1a286286be358d`；冻结计划哈希 `5b3d04d19c9ce86bf5a674b3e6d24c6206586f6e283da6955c46260e3f38a2c7`。[固定终态证据](evidence/ma24-g09-canonical-original-composition-69ed7f97-2026-10-20.json)。临时数据库、网络和源码归档已清理，仅保留既有三个业务容器。

本组合在宿主固定源码/共享已安装依赖上运行，基础库到 135 加夹具列明的精确迁移（含 156/157），不等于当前全量 158 库或 Linux 采集镜像内的完整组合。总编排的 `completeCompositionVerified=false` 属于另一独立参数分支；此处以实际 `configuredSameFreezeFiveCategoriesVerified=true` 及终态退出 0 证明上述签名五类范围。模型、网络和计费适配仍为合成，实际模型调用 0；生产身份、完整来源保护、真实质量及最终启用均未验收完成。

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
