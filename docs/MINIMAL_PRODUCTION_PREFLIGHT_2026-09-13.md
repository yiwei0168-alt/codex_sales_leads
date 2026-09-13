# 最小真实闭环只读预检

阶段54，产品990c667，执行 `node scripts/run-tsx.cjs scripts/preview-minimal-production-acceptance.ts`，类型检查通过。只读核验既有隔离验收账号和当前费率，无供应商调用、账号修改或任务认领。

累计上限USD30，占用12.324404，剩余17.675596，未冻结。当前模型配置不变；目标1家公司首轮候选池2家。

| 必经或条件阶段 | 当前模型 | 当前单次保守预留USD |
|---|---|---|
| 轻量意图 | kimi-k2.6 | 0.283612 |
| 条件复杂计划 | kimi-k3 | 3.345151 |
| 知识嵌入 | text-embedding-v4 | 0.006412 |
| 市场计划 | openai/gpt-5.6-sol | missing-tariff，禁止调用 |
| 主角色/评分 | deepseek-v4-pro | 1.416561 |

可用规则到期2026-09-20T00:00:00Z，外币规则还受实时FX新鲜度约束。以上只是当前费率入口检查，未构造真实提示词，未验证完整请求契约、所有搜索/复核/备用路由、凭据或整次运行上界；不能相加后声称足够完成闭环。

代码证据：playbook.ts使用LEAD_PLANNER_MODEL或OPENAI_GENERATION_MODEL，当前后者为gpt-5.6-sol；其BudgetDeniedError直接上抛，不通过标准计划降级绕过门禁。因此当前不启动前置付费意图/嵌入来制造一个已知在市场计划阶段停止的验收。

下一必要工作是补齐当前OpenRouter模型和实际请求的完整费用上界。官方[Provider Routing](https://openrouter.ai/docs/guides/routing/provider-selection)支持provider.max_price限制输入/输出单价；[缓存说明](https://openrouter.ai/docs/guides/best-practices/prompt-caching)表明缓存收费具有供应商差异。仅凭max_price示例仍不足以认定已覆盖缓存、长上下文及当前路由的所有费用。此处只是后续核验线索，未改路由、费率或模型。

用户已授权的独立恢复、遥测和UI工作可继续；本项阻止当前真实闭环，不代表整个goal已无可推进工作。
