# MA24 G15 双路径配置与调用边界草案（2026-10-14）

2026-10-16 运行日期门槛核对：专用运行器已在认领前及执行中的模型/工具边界重复核验当前 UTC 提示词日期。G15 预览现在将 `runPromptDateGateImplemented` 记为 `true`，运行绑定器要求冻结值与当前值一致并报告缺失门槛；日期变化仍直接拒绝。4 组 35 项定向测试、类型与 lint 通过，[v21 只读预览](evidence/ma24-g15-config-preview-2026-10-16-v21.json)匹配当前源码且模型准入仍为 `false`。[核对收据](evidence/ma24-g15-run-prompt-date-gate-2026-10-16.json)。

2026-10-16 更正：下方 v19“认领并绑定入口要求模型就绪”的记录已被本次修正取代。该底层入口只核对冻结配置与当前配置一致，允许在 `readyForModelCalls=false` 时认领并绑定隔离数据库合成任务；它不调用模型。专用 G16 运行器仍在认领前和每次模型/工具调用前检查 G15 模型准入。4 组 34 项定向测试、类型、lint 和隔离数据库认领验收通过，供应商调用 0 次。[更正收据](evidence/ma24-g15-g16-claim-binding-layer-correction-2026-10-16.json)和[v20 只读预览](evidence/ma24-g15-config-preview-2026-10-16-v20.json)记录当前实现；预览仍为 `readyForPaidEvaluation=false`。

2026-10-16 补充：专用任务的“认领并绑定”入口现在也在数据库领取前要求冻结/当前 G15 配置的模型准入结果为真；运行器共用该拒绝逻辑。匹配但未就绪的配置在直接入口被拒。4 组 34 项定向测试、类型和 lint 通过；[阶段收据](evidence/ma24-g15-preclaim-model-admission-2026-10-16.json)及[v19 只读预览](evidence/ma24-g15-config-preview-2026-10-16-v19.json)记录当前源码身份。v19 仍为 `readyForPaidEvaluation=false`，G16 真实双路调用未开放。

2026-10-16 补充：授权限额行现在通过账号、运行 ID 与冻结清单哈希只读回读，并与预览的四项上限及授权引用逐项比较；运行器在认领前和执行中重查。上限与授权身份写入后不可改，计数不可倒退。[回读收据](evidence/ma24-g15-authorized-cap-readback-2026-10-16.json)。[v18 只读预览](evidence/ma24-g15-config-preview-2026-10-16-v18.json)仍无授权引用或限额值，模型调用继续关闭。

2026-10-16 工程更新：整次独立测评现在有数据库预留时的四项共享硬限额，跨账号运行按同一冻结清单哈希计数；失效运行、缺少限额行及超限预留在网络发送前拒绝。[隔离克隆收据](evidence/ma24-g15-durable-evaluation-hard-limits-2026-10-16.json)。当前没有经过授权的限额行，费率及付费预检也未完成；[v17 只读预览](evidence/ma24-g15-config-preview-2026-10-16-v17.json)仍为 `readyForPaidEvaluation=false`，不开放 G16 双路模型运行。下文保留早期草案状态作为历史记录。

本文件由[只读配置预览](evidence/ma24-g15-config-preview-2026-10-14.json)和当前源码核对而来。它尚不是冻结快照、付费请求批准或 G16 运行入口。预览可用 `node scripts/run-tsx.cjs scripts/prepare-ma24-g15-config-local.ts` 重建；脚本只模拟工具可见性，不连接供应商或写数据库。

## 可比较的主 Agent 配置

- 暂以产品默认 `standard` 模式准备两侧：同一主 Agent 图、`agent-mode-prompts-v1.1.0` 模式规则、相同的模型路由顺序与备用策略。当前代码路由依次为 `anthropic/claude-sonnet-5.5`、`openai/gpt-6.1-sol`、`moonshotai/kimi-k3`，首输出/总时限为 30/120 秒。此为源码配置，不证明供应商当时可用或实际进程已加载。
- 每道题必须在同一账号、知识范围、来源版本和输入下分别运行。预览按 `industry`、`company`、`product` 范围生成两侧工具 ID、工具 Schema、产品 Prompt 的 SHA-256，并记录模式 Prompt、模型函数及 18 个关键源码文件哈希。两侧唯一新增的工具是七个 `vectorless_*` 只读工具；`company` 与 `industry` 范围基线各 3 个、候选各 10 个工具，`product` 范围分别 4 个和 11 个。候选须由全局影子开关和指定账号白名单同时放行，不能在正式账号上为了评测直接扩大权限。
- 候选每个会话最多保存 24 个文档候选、一次搜索、八次导航或集合操作、八次原文证据读取；v3 仅能补一次候选文档 ID，回答必须回读当前原文。超过预算要呈现部分结果及未查范围。这些是当前代码边界，仍需在完整主 Agent 运行中验证。

## 目前阻断冻结的问题

1. 计划要求基线为本地 BGE＋全文＋已核实事实。[候选修复](evidence/ma24-g15-agent-bge-tool-2026-10-14.json)已给主 Agent 的 `knowledge_search` 加入 `ENABLE_MAIN_AGENT_LOCAL_BGE_SEARCH=1` 受控路径：仅调用回环本地 BGE，向 Qwen 槽传空、向 BGE 槽传本地向量，并使用受控全文查询；BGE 失败时保留本地全文/事实结果但明确返回 `partial`。[本地运行补证](evidence/ma24-g15-bge-runtime-read-2026-10-14.json)已恢复 8765 服务，并以公开开发问题验证工具到本地产品库的 BGE 排名结果；同题的脚本化主 Agent 图可完成检索和来源复核。无真实回答模型、持久任务/调用账本、独立题集或云调用。当前产品进程仍未加载该候选。两侧未来须使用同一受控配置，运行带真实模型与持久收据的完整主任务并确认来源和 lane；退化结果不能标成完整 BGE 基线。
2. G14 的独立来源、题目、Gold 答案与精确坐标尚未冻结。旧 300/50 题及开发原件不能填入新独立集。Gold 只在评分侧保存，生成输入只含问题和允许证据。
3. 预览的源码哈希不是完整依赖闭包，也没有生产构建身份。正式冻结需固定可重建的代码提交/构建、Prompt、Schema、模型路由、资料/题目/Gold 哈希；变更任何一项须建立新实验并保留旧结果。
4. 当前没有对新评测确定账号、数据范围、最大供应商请求数、每请求字节/输出 token 上限或美元硬上限。须在题量、路由和当前供应商费率核实后形成逐次可预留的持久调用清单，区分成功、失败、未知结果；未知结果先按收据恢复，不能盲目重试。旧冻结集与一次性授权不自动续用。需要新增付费或冻结解锁确认时，再提交完整快照和硬上限请求必要批准。

因此本草案的 `readyForPaidEvaluation` 为 `false`。G15 工程准备已开始，真实质量和运行验收均未通过。

2026 年 10 月 16 日本地 `npm run build` 已通过生产编译、TypeScript 与 26 个静态页生成；随后重建的 G15 预览含 289 个本地源码闭包文件，但 `runtimeBuildVerified`、`transitiveCodeClosureVerified` 和 `readyForPaidEvaluation` 仍为 `false`。[构建核查收据](evidence/ma24-g15-local-build-check-2026-10-16.json)。此结果只核对当前工作树，尚未绑定冻结构建或正式执行进程。

同日补强了源码闭包扫描：带第二参数的字面量 `import()` 现在会纳入依赖，非字面量动态导入及多参数 `require()` 会明确拒绝；新测试覆盖这两种边界。[定向核查收据](evidence/ma24-g15-import-closure-guard-2026-10-16.json)与 [v11 只读预览](evidence/ma24-g15-config-preview-2026-10-15-v11.json)记录当前指纹。扫描仍只证明受支持的本地导入可追踪，完整执行闭包和正式构建身份仍待验证。

## 同账号双臂工具隔离补验（2026-10-15）

G15 预览现以**同一白名单账号、同一 `ENABLE_VECTORLESS_AGENT_SHADOW=1` 开关**分别设置服务端 `evaluationArm=baseline/candidate`，而非用切换全局开关模拟两臂。`industry`、`company`、`product` 范围的基线工具数为 3/3/4，候选为 10/10/11；仅候选多出七个 `vectorless_*`。基线的工具发现、描述和执行路径均拒绝这些工具，定向测试 9 项、类型及 lint 通过。[工程收据](evidence/ma24-g15-g16-evaluation-arm-tool-isolation-2026-10-15.json)。该标识尚未由专用评测运行器绑定到持久任务，预览仍为 `readyForPaidEvaluation=false`。
