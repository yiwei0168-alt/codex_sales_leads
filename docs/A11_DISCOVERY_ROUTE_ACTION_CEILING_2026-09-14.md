# 阶段191：最小闭环搜索步骤上限逐入口对账

本阶段只读扩展 `scripts/preview-minimal-production-acceptance.ts`，将现行 Colombia / Distributor / 目标1家的搜索路径按入口列出调度上限。`MAX_DISCOVERY_ROUNDS=5`，当前 `distribution/strategic` 每轮由 Brave 核心、Exa 边际缺口、SearchAPI 第二索引缺口、Gemini Full 边际缺口四步组成。图每轮调用同一执行器，执行器从当前计划重新生成路径，因此最多20个**被调度的路径步骤**，每入口最多5个。条件不满足、缓存命中或熔断时，该步骤可能零付费。

| 入口 | 触发 | 最多调度步骤 | 当前严格费率 |
|---|---|---:|---|
| Brave | core | 5 | 静态单次上界 USD0.005 |
| Exa | marginal-gap | 5 | 静态单次上界 USD0.027 |
| SearchAPI | second-index-gap | 5 | 缺当前账号完整合同，账号配额报告0 |
| Gemini Full | marginal-gap | 5 | 缺请求前可执行的模型及服务端搜索次数上界 |

预检同时把各入口的 `paidAttemptsAtMost` 和 `serverSideToolCallsAtMost` 保留为 `null`：调度步骤数不能替代提供方重试、模型内部工具调用或实际收费次数。它没有为搜索、补证、校正、分阶段评分、条件复核与裁决计算整次上界。只读复核仍为 `checkedTariffsAvailable=false`、`totalRunBoundUsd=null`；累计占用 USD12.324404/30、余额 USD17.675596，供应商调用、任务认领及账户修改均0。A11真实付费闭环继续受整次预检和预算门禁阻止。

验证：预检输出4个入口各5步及总20步，typecheck、脚本 ESLint 均通过；人工对照 `graph.ts` 的轮次递增、`target-completion-policy.ts` 的5轮上限和 `hybrid-discovery-executor.ts` 的逐步调度。输入为1个合成计划，产生4条有效上限记录并全部用于费用缺口定位；真实候选、下游合格线索、用户采用及真实提供方延迟均未知。模型 token、付费 API credits、现金、付费重试和邮件发送0，未丢弃业务输出。优化机会是核定尚缺的严格合同与实际可收费尝试数，随后才计算整次保守预算。
