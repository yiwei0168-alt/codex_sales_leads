# 阶段192：最小闭环搜索 HTTP 尝试次数上限

当前生产发现执行器通过 `createDiscoveryProvider(step.provider)` 构造四个入口，没有覆盖 `maxAttempts`；共享 `BaseProvider` 的默认值为2。为了让只读预检与实际默认请求重试合同保持同源，本阶段把默认值导出为 `DEFAULT_DISCOVERY_MAX_ATTEMPTS` 并由预检使用，未改变产品重试行为。

Colombia / Distributor / 目标1家的路线每轮四步、最多五轮。因此每入口最多5个被调度步骤，每步骤最多2次提供方 HTTP 尝试，即每入口最多10次、四入口合计最多40次**提供方 HTTP 尝试**。条件未触发、缓存/熔断或预算门禁拒绝会减少实际尝试；这不是已发生调用数。Brave、Exa、SearchAPI 的产品包装器不配置单独计费的 Google Search 工具调用，预检的 `billableGoogleSearchToolCallsAtMost` 记0；Gemini Full 的单次 Interaction 内部 Google Search 次数没有请求前可执行上限，继续记 `null`。测试注入可覆盖默认重试数，本结论仅适用于当前生产默认构造路径。

上界现在能区分路径调度与 HTTP 重试，但不能把 Gemini 内部搜索、SearchAPI 当前账号合同、Tavily Extract、条件复核/裁决、分阶段评分等费用算入完整运行。只读预检仍报 `checkedTariffsAvailable=false`、`totalRunBoundUsd=null`，预算占用 USD12.324404/30、余额 USD17.675596；本阶段提供方调用、任务认领、账户修改均0，A11仍未获付费准入。

验证：`src/providers/discovery.test.ts` 17/17、typecheck、两处修改文件的 ESLint 通过；只读预检输出四条各5步/10 HTTP尝试及 Gemini 工具数未知。输入1条合成计划，生成4条有效尝试上限并用于A11费用缺口分析；真实候选与下游合格数、用户采用、供应商延迟未知。模型 token、付费 API credits、现金、外部重试及邮件发送0；无业务输出丢弃。优化机会是先取得提供方可执行收费次数/价格合同，再使用本地上限计算完整保守预算。
