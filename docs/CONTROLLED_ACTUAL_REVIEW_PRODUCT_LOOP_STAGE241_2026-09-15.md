# 阶段 241：实际复核 Agent 的同任务受控产品正结果闭环

本阶段执行阶段 239 的受控正结果层。一个隔离账号先通过产品 `processAssistantMessage` 的确定性降级路径处理两轮自然语言：首轮请求哥伦比亚 2 家分销商，次轮改为 1 家；旧提案取消，新提案确认、入队并认领。生产 LangGraph 使用真实 PostgreSQL checkpointer，在评分前受控暂停，恢复后只继续未完成节点，RAG、计划、发现、取证和校正均未重复。

取证、校正、主评分和复核分别走当前 `collectLeadEvidence`、`LeadEvidenceCorrectionAgent`、`LeadQualificationAgent`、`LeadAssessmentReviewAgent` 的实际序列化、Schema、证据 ID 和发布逻辑，外部传输替换为固定响应。复核以 100% 确定性审计触发，测试在 invoker 边界断言输入不存在 `totalScore`、`primaryScore` 或 `primaryAssessment`，因此主评分没有泄露给盲审；同意结果为 `secondary-confirmed`，保存一条租户/国家/候选/执行合同绑定的复核检查点，没有进入裁决。最终一条 completed/eligible 且复核完成的 Distributor 评估生成一条 handoff，只保存一家公司。

SQL 验收断言同一动作的 run 为 completed/accepted 1、国家 CO 公司 1、assessment 1、复核检查点 1、完成回执 1，第二用户读取为 0；7 micro-USD 合成预留按同一公司完整分摊。生产模式在临时端口 3031 通过任务 HTTP API、Chrome 1366×900 与 390×844 两个视口及页面刷新，均显示目标满足和最终保存，且无横向溢出。夹具、检查点、登录尝试、合成预算和临时服务均已清理；用户面向的开发产品继续在 3000 运行。

同一脚本在无 HTTP 的 SQL 模式和生产 HTTP/UI 模式分别通过；TypeScript、脚本 ESLint 与生成工作流一致性检查通过。阶段 240 的当前全量 1,058 项测试、生产构建和依赖 0 漏洞证据仍适用于未改变的产品运行代码；本阶段只扩展验收脚本和状态文档。

效率口径：自然语言输入 2、有效提案 2、下游使用计划 1、因修改取消旧提案 1；候选 1、有效校正 1、有效主评分 1、必要盲审 1、handoff 1、最终保存 1、回执 1，生产视口验证 2，实际用户采用未知。合成 Tavily search/extract 各 1、校正请求 1、评分请求 1、复核请求 1；真实模型/搜索请求、token、API credits、现金、付费重试和邮件为 0。SQL-only 运行约 1.2 秒，生产 HTTP/UI 运行约 7.1 秒，真实供应商延迟未知。优化机会是复用同一动作与复核检查点贯通 SQL/API/UI，避免重复评分或购买第二次复核。

这是受控产品层正结果通过，不证明固定响应的供应商语义、真实 Terra 兼容性、真实公司质量、真实账单或原计划整体验收完成。分歧裁决与补证、错类/重复/证据不足、复核失败、预算/未知费用反例、跨进程复核恢复和失败阶段进度仍按阶段 239 继续。
