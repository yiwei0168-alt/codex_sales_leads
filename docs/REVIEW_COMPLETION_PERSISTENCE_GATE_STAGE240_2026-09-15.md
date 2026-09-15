# 阶段 240：必要复核完成后才允许最终发布

阶段 239 的代码审查确认了一个实际质量漏洞：`persistLeadWorkflowResult` 只按评分完成与 eligible 选择最终公司，没有把必要复核结果作为发布条件。这样，轻度触发条件下若独立复核返回 `review-failed`，主评分可能仍保持 completed/eligible 并被计入 qualified、accepted 和国家结果。该行为不符合既有 A28 质量闭环口径；本阶段没有降低角色、证据、评分或复核标准，也没有新增产品规则、模型路由或费用合同。

实现新增统一复核完成判定。最终可发布状态仅为 `not-required`、`secondary-confirmed`、`judge-resolved`；`review-failed`、`targeted-research-required` 和缺失复核记录都不能计入 qualified/accepted 或写入国家公司结果。未完成复核的 assessment 及其 review 仍保存在审计表中，避免丢失已完成主评分，也为后续基于检查点的安全恢复保留事实。PRD、README、LangGraph 工作流、确认规则实施状态、当前验收矩阵和效率台账已同步。

验证分两层：纯函数 6 项断言覆盖三种完成状态、两种未完成状态和缺失记录；`scripts/verify-result-persistence.ts` 使用真实 PostgreSQL/RLS/产品持久化链，输入 1 条 completed/eligible 合成评分和 1 条必要 `review-failed`，得到 assessment 审计 1、qualified 0、accepted 0、国家公司 0。原两国并发幂等、旧身份重放、空结果、成本分摊和租户隔离回归继续通过。全量 1,058 项/209 文件测试、TypeScript、变更文件 lint、Next.js 生产构建、生成工作流一致性检查和生产依赖安全审计（0 漏洞）通过。合成数据不代表真实公司质量或用户采用。

效率口径：本阶段质量反例输入 1、有效审计输出 1、下游最终公司使用 0，丢弃发布原因为必要复核未完成，审计利用率 1/1、发布利用率 0/1（预期门禁结果）；用户采用未知。外部模型/搜索调用、token、API credits、现金、付费重试和邮件均为 0，供应商延迟不适用；单元与 SQL 定向验证合计约 6 秒，全量测试约 27.6 秒。优化机会是把复核完成作为单一发布谓词复用，阻止无效公司进入国家结果和后续策略生成，同时保留主评分避免重复付费。阶段 239 的实际 `LeadAssessmentReviewAgent` 受控正结果、分歧裁决/补证、跨进程恢复、失败进度 API 及桌面/移动页面仍待继续，真实供应商链和账单验收未完成。
