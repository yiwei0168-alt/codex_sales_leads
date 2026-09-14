# 阶段143：当前校正 Agent 进入正结果图与产品 SQL

在阶段142的隔离合成哥伦比亚任务中，校正节点改由现行 `LeadEvidenceCorrectionAgent` 执行。模拟提供方只返回与本轮官方证据对应的结构化响应，实际请求由现行 Agent 准备并以当前 DeepSeek 契约序列化；外部传输被禁止。当前校正 Agent 收到1家公司、1条官方证据，形成身份、哥伦比亚存在、网络产品、Distributor 主角色、产品家族和商业行动共6条有证据支持的事实，完成状态为 `completed`，主角色家族为 `distribution`。没有触发补充搜索。随后现行评分 Agent 使用本次校正的事实 ID 和证据引用生成请求，完成五项资格门禁、评分及精确缓存，图交接并在产品 SQL 保存1家公司，目标1/合格1，停止原因为 `target-met`。

验收沿用实际助手服务的两轮中文输入与目标2改1的确定性降级、评分前 PostgreSQL 检查点、同进程恢复、任务回执和隔离账号。SQL 核对校正/评分/交接/公司与评估各1，前置阶段不重跑，7 micro-USD 仅为合成夹具预留且完整归属公司；清理后全局合成公司残留0。另在本地生产服务以 Chrome 桌面1366×900和手机390×844复核任务页面，刷新后结果一致。原账号只读预算为 USD12.324404/30，6笔历史未知账单仍保留，真实提供方调用、真实 token/API credits、现金费用和发信均为0。

这证明现行校正及评分 Agent 对受控结构化响应的接线、引用与确定性门禁，不能证明真实模型的语义判断、搜索覆盖、冻结盲审修复、填满50家或 A11 真实付费闭环。发现与补证、市场计划及复核仍使用阶段夹具；同进程故障不等于在途付费请求的跨进程恢复。真实用户采用和供应商延迟未知。

验证：`node scripts/run-tsx.cjs scripts/verify-positive-result-graph-sql.ts --assistant-fallback --pause-resume --actual-score-agent --actual-correction-agent` 的 SQL 与本地生产双视口模式通过；`npm.cmd run typecheck`、`npx.cmd eslint scripts/verify-positive-result-graph-sql.ts` 通过；只读预算核对通过。
