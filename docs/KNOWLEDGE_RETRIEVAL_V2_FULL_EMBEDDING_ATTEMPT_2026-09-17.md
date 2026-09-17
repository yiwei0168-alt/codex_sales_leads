# KQ03 v2 剩余语料向量构建尝试

日期：2026-09-17。

用户明确确认：“我允许将剩余10861个知识库切片正文发送到阿里云百炼，并接受可能产生的费用”。确切范围为 generation `3917a242-724e-4e36-a1da-04c496a9df2d` 当时缺失的10,861个切片、阿里云百炼及可能费用；不授权其他供应商、模型或绕过预算/失败停止门禁。

全量可恢复任务成功完成265个十项批次后，下一批收到阿里云百炼 HTTP 403：`AccessDenied.Unpurchased`（`Access to model denied. Please make sure you are eligible for using the model.`）。任务随即停止，未自动重试，未激活影子代。本次新增2,650个有效且写入的1536维向量，供应商报告累计637,480输入tokens和216,463ms调用延迟；与此前10个合计现有2,660个向量，剩余8,211个，估算还需822次请求。现金费用仍以百炼账单为准，不能写为零。

恢复条件：核对当前北京 workspace 的 `text-embedding-v4` 资格/额度为何在265批后转为 `AccessDenied.Unpurchased`，并确认 endpoint 与 API key 属于同一已开通 workspace；修复后从缺失向量集合继续，不重算已写入的2,660个向量。不能通过换到未审查模型、忽略403或自动循环重试来推进。
