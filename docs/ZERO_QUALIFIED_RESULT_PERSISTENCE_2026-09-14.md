# 零合格结果的产品 SQL 保存与费用归属

阶段119。使用 `node scripts/run-tsx.cjs scripts/verify-result-persistence.ts` 在隔离合成账号运行产品 `persistLeadWorkflowResult` 和真实 PostgreSQL 事务。原 CO/MX 两个有结果运行保留；另建 CL 目标1、候选0、评分0的运行，同一输入并发保存两次。没有搜索、模型、SMTP、原任务认领或真实费用。

CL 两次调用返回相同结果：合格0、交付新增/更新/角色变化均0；运行状态保存为 `completed`、`accepted_count=0`，评分和搜索结果行均0，未新增 CL 公司。这里的 `completed` 仅是持久化阶段状态，不能据此声称搜索耗尽或整个业务任务成功。实际停止原因仍须在图和页面的真实闭环中对账。

此运行建立一笔隔离合成 `task-shared` 预留5 micro-USD，处理公司集合明确为空。保存事务写入 `zero-company-task` 分摊：公司份额空、未分配5、来源5，守恒；`settled_micros` 保持未知，预算占用仍为5。原 CO/MX 的11/12预留仍各归其国家公司。三笔合成预留合计28 micro-USD，测试结束清理，真实 USD30 验收预算及历史未知账单均未更改。另一隔离用户不能读取运行事件，公司国家记录仍只有 CO/MX 两条。

验证：脚本退出0并输出 `Synthetic persistence fixture removed.`；`npm.cmd run typecheck` 和脚本 ESLint 均通过。工作流生成文档的图源码指纹随此前代码变化同步刷新，并以 `docs:lead-workflow:check` 核对。此为 A04、O03、A10 的合成输入到实际产品 SQL 的部分验收，不证明自然语言到真实公司、供应商账单、用户页面状态或市场最终填充率。
