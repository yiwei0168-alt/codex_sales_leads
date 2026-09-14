# 阶段144：现行补证函数进入正结果图

在阶段143的隔离合成哥伦比亚任务中，发现节点只给出1家公司身份且初始证据为空；补证节点调用现行 `collectLeadEvidence`。脚本为本轮随机公司域名拦截 Tavily `search` 和 `extract` 方法，各返回1条受控官方页面结果。现行函数实际生成限定该域名的基础搜索请求、筛选同域结果、提取正文、计算稳定证据 ID 与内容哈希，并将1条新鲜官方证据交给现行校正 Agent。校正 Agent 引用同一条本轮证据完成 Distributor 主角色和6条支持事实，现行评分 Agent 再引用校正事实完成评分及精确缓存；图交接、产品 SQL 和本地生产页面最终保存1家公司，目标1/合格1。

搜索与提取各为1次**模拟方法调用**，没有真实 Tavily HTTP、API credits 或现金费用，也没有校正阶段额外补证。任务在评分前按现有受控故障暂停、从 PostgreSQL 检查点同进程恢复；知识、计划、发现、补证和校正各执行1次且恢复不重跑。产品 SQL 中评估、国家公司、交接和任务回执各1；本地生产 Chrome 桌面1366×900、手机390×844刷新后一致。7 micro-USD 是合成夹具预留，全额归属该公司；清理后合成公司残留0，原 USD30 账号预算和6笔历史未知账单不变。

这验证现行补证函数对受控搜索与提取响应的接线、证据身份和下游引用。发现、市场计划、供应商响应和模型语义仍为夹具或确定性降级；不证明真实搜索覆盖、模型正确率、冻结盲审修复、填满50家、可信账单或 A11 真实付费闭环。真实用户采用、供应商延迟及节省金额未知。

验证：`node scripts/run-tsx.cjs scripts/verify-positive-result-graph-sql.ts --assistant-fallback --pause-resume --actual-score-agent --actual-correction-agent --actual-evidence-collector` 在 SQL 和本地生产双视口两种模式通过；不带新选项的阶段143模式回归通过；`npm.cmd run typecheck` 和定向 ESLint 通过。未运行真实搜索或付费请求。
