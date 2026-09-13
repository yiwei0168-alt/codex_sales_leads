# Gemini 外部检索明确未完成结果处理（阶段93）

助手的混合问答原本要求确实调用 Google Search 且答案有网页引用，但同步 Interactions 响应即使明确 `status=incomplete`，只要仍含部分文字和引用就可能进入答案整合。现将明确非 `completed` 的响应留在技术未完成分支，不把部分答案视为已验证外部证据。已有输出上限、已发生费用与未知费用状态不清零，HTTP 成功后不自动重发。状态字段缺失的历史/合成响应沿用原解析契约；真实供应商状态完整性仍待业务验收。

[Google Interactions API](https://ai.google.dev/api/interactions-api-v1)列出 `completed`、`failed`、`cancelled`、`incomplete` 状态；[官方思考文档](https://ai.google.dev/gemini-api/docs/thought-signatures)说明输出上限包含思考 token，截断仍可能计费。本改动不改变费用上界或准入；Google Search 内部查询次数缺硬上限，产品付费门禁继续阻止该入口。

验证：合成响应含真实搜索步骤、部分文字和有效网页引用且 `status=incomplete` 时拒绝，调用次数1；定向9测试/2文件、全量893测试/195文件、类型检查、局部 lint、生产构建及生成文档检查通过。真实业务输入/有效输出/下游使用、token/API额度/现金均0；实际延迟、采用和节省未知。优化机会是避免截断证据被用户当作完成答案；真实模型及 UI 端到端仍待。
