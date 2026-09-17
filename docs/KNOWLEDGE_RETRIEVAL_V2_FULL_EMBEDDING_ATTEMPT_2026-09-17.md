# KQ03 v2 剩余语料向量构建尝试

日期：2026-09-17。

用户明确确认：“我允许将剩余10861个知识库切片正文发送到阿里云百炼，并接受可能产生的费用”。确切范围为 generation `3917a242-724e-4e36-a1da-04c496a9df2d` 当时缺失的10,861个切片、阿里云百炼及可能费用；不授权其他供应商、模型或绕过预算/失败停止门禁。

全量可恢复任务启动后，第一个批次收到阿里云百炼 HTTP 403：`AccessDenied.Unpurchased`（`Access to model denied. Please make sure you are eligible for using the model.`）。任务立即停止，未自动重试，未激活影子代。此前成功写入的10个向量保留；本次全量任务没有新增有效或下游向量。该批请求是否产生供应商最小费用以百炼账单为准，本地不能把现金费用写为零。

恢复条件：在当前北京 workspace 购买/开通 `text-embedding-v4` 使用资格，确认 endpoint 与 API key 属于同一已开通 workspace，再重新执行只读缺失量检查和十项探针。不能通过换到未审查模型、忽略403或自动循环重试来推进。
