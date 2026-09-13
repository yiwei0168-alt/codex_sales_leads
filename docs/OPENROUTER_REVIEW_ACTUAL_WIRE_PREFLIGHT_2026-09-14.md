# OpenRouter 条件复核实际请求预检（阶段132）

本阶段用隔离合成候选触发当前 `LeadAssessmentReviewAgent` 的二次复核和分歧裁决，拦截 `fetch` 并记录两个实际序列化请求。没有真实供应商请求、预算预留、真实模型输出或账单。当前用户确认的账号仅使用 OpenRouter credits、无 BYOK；S01 市场计划路由仍待确认，本阶段未改路由或费率。

| 入口 | 当前发送体 | 现行费用门禁 |
|---|---|---|
| Terra 二次复核 | `openai/gpt-5.6-terra`，`reasoning.effort=medium`，严格 JSON schema，`max_completion_tokens=8192`，`provider.require_parameters=true`、`data_collection=deny` | `missing-tariff` |
| Sol 分歧裁决 | `openai/gpt-5.6-sol`，`reasoning.effort=high`，严格 JSON schema，`max_completion_tokens=12000`，相同 provider 约束 | `request-out-of-bounds`：现行 Sol 合同只覆盖 4096 输出 token |

两个捕获请求的字节数均不超过现行 Sol 合同的 61,440 字节阈值；Terra 仍无获准合同，不能据此视为可付费。请求均无 tools、plugins 或 `max_tokens`。二次复核传输内容未包含主评分值；发生实质分歧后才形成匿名 A/B 裁决输入。返回内容由本地模拟，测试只证明当前产品构造出的传输字段和费用拒绝状态，不证明 OpenRouter 端点实际接受该请求、模型语义质量或可信账单。阶段95/99的公开价格上界仍只是候选合同，不在此准入。若后续增补费率，必须按捕获的完整请求、官方可用端点和预算重新核定。

验证：`npm test -- src/lib/leads/workflow/assessment-review-agent.test.ts` 8/8。测试在无产品费用作用域下使用拦截传输，只对捕获字节运行现行 `quoteRequest`；它不代替实际费用作用域的预留测试。A11 自然语言至合格公司仍未验收，累计 USD30 门禁和六笔历史未知账单保持原状。
