# G09 运行等价性：源码确认的剩余差异

既有 MA24-06；G01–G13 当前范围不变。本文为实现审计，不新增用户规则，不授予运行资格或调用权限。

## 已复用的部分

普通任务与正式候选使用同一 `buildMainAgentGraph`，均同步写入已安装 PostgresSaver 协议，并由租约约束写入。候选使用隔离表和根线程，预算/轨迹与图通道一起保存。9428 的历史故障恢复、76169 的固定启动器终态复用，以及 73784 的前瞻故障恢复均已退出 0，分别有实际收据；这些结果不关闭下表的执行差异。

## 确认的差异及其影响

| 位置 | 当前实现 | 尚不能支持的结论 |
|---|---|---|
| `skill-runtime-candidate.ts` 的读取适配 | 历史/安全保留原快照结果；前瞻正式只读/独立审计/外发差分 14339、后续来源复核 78222 原生组合和公开资料许可/字节专项 59031 均通过；新包构建/测量及独立 TLS 22333 通过，整组恢复 60396 在运行 | 客户查询组合与公开资料组件各有范围；完整当前固定包组合、运行等价性、真实模型/质量仍未验收 |
| `skill-candidate-runner.ts` 的模型预算 | 现有 1–64 次、默认 8 的额度进入任务与审计，87 回归及 10694 文件信任专项通过；共享图为 80 步/递归 400。后补 UUID 查找小修有 11 项回归，旧保存机制仍按额度乘 32 | 不同额度/大小写别名并发竞争、最终新包完整组合待验；额外额度与冻结控制仍不同，不能宣称完整生命周期等价或提高调用额度绕过授权 |
| 安全边界 | 普通任务可吸收新指令和策略修订后重规划；候选校验固定来源/冻结，并在失效时拒绝继续 | 固定输入试验的拒绝行为与在线任务的重规划不同，需要明确资格所比较的范围，不能直接宣称全部生命周期相同 |
| 固定包实际执行 | 已完成任务可以经不可变启动器/runner 成功读取；首次模型执行与故障点仍来自合成测试编译件 | 不能证明固定生产入口完成了首次提供方调用或整个试验 |
| 最终资格生产者 | `evaluateLockedSkillAcceptanceReadiness` 组合了材料、签名、运行包和来源保护；未生成 `productionAgentEquivalent=true`，最终启用要求该字段为 true | 缺口包含实际接线，不仅是等待人工审核；不能只补布尔字段或放宽最终 schema |

## 下一步实现与验证顺序

1. 核对本轮前瞻实时只读执行的实际结果；任务前捕获、独立候选日志及相同账号/知识范围保持，所有新读取仍受来源、权限、任务租约和既有付费准入限制。[本轮接线](PROSPECTIVE_REGISTERED_READ_EXECUTION_2026-10-21.md)。
2. 验证已同步修改的独立审计和材料重建确实从权威候选日志重建实际读取并核对来源；不能把新响应直接加进旧快照后声称仍是原冻结输入。候选私有来源锁已单独验证，完整启用后的来源生命周期仍待补齐。
3. 核对预算、停止、控制和来源变化的比较合同，再接资格生产者；通过当前注册包、任务和来源的服务器证据派生资格，不接受调用方声明。
4. 在实际固定入口验证新读取、恢复防重复、权限/来源失效拒绝和最终合格夹具事务；真实质量、真实提供方身份及人工判断继续单列。

不因本审计启用 Skill、不发起真实或付费调用、不推进部署或 G14–G20。现有工程收据继续保留其各自范围。


2026-10-21 / Final composition acceptance: **37984 exited 0**, product `47be3168`, corrected fixture `6b4f51c9`, unchanged immutable main/collector packages. All 10 JSON records were inspected. Bound quotas, nondefault readback and case-variant UUID concurrent admission passed; the same freeze has five cases/eight ledger tasks. Live customer_timeline read, actual process termination, natural lease expiry/new-process recovery, preserved spec/capture/journals and no repeated completed HTTP steps passed, as did live-source revalidation, measured registration/provenance and fixed-launcher completed reuse. Temporary containers were removed; original three services remain. Whole-fixture production entrypoint/TLS, real model/provider/quality and activation are NOT established (actual model calls 0, qualification/activation false). Historical failed 9934 remains retained. [Evidence](evidence/ma24-g09-task-bound-execution-policy-2026-10-21.json).


2026-10-21 / Current source adds a completed-audit execution-policy comparison: declared quota, graph limits and observed decision/attempt receipt counts are bound into the projection hash; frozen/live-control and saved/live-read differences remain explicit. 25 tests, typecheck and module/fixture lint passed; targeted fresh graph/material database verification is pending. This source change is not in the accepted 47be3168 images; old 37984 remains version-scoped. No qualification/activation inferred. [Implementation and evidence](RUNTIME_POLICY_COMPARISON_2026-10-21.md).
