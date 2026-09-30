# MA24 PPTX/XLSX 补充来源验收

两道补充题独立于已冻结的 300 题语料，状态是助手核对原件后的样本，不记为新增人工 Gold 或锁定集回答质量通过。[题目、答案和坐标](evidence/ma24-supplemental-format-cases-2026-09-30.json)、[只读审计](evidence/ma24-supplemental-format-audit-2026-09-30.json)。

- PPTX：《产品通用功能_Ivy》原件第 12 张幻灯片列出无线路由、AP、扩展器、WISP、Client 五种模式。Docling 本地转换完成，但该 PPTX 的 Markdown 输出中文乱码；因此逐项用原始 PPTX 的 `slide12.xml` 和当前知识树原文确认，不把乱码内容当证据。原检索对不同中文问法漏检；无型号且原检索为空时，受限中文四字片段回查当前原文后有 9 份候选，包含目标资料。正式引用由当前 `readEvidence` 回读该页块。
- XLSX：《Cudy products list.xlsx》原件 `Price List` 工作表第 329、330 行分别列 SM10GMA-03 与 SM10GMA-03H。两行都是 10G SFP+、LC MMF、300M、850nm；后者另标注 `Compatible with HP`。本地 Docling 转换和原始单元格独立核对，当前树保留工作表名和行号；两个原文块可按权限和当前哈希回读。该标注不能外推为其他设备的兼容性。

中文片段回查仅在原检索无候选、问题没有明确型号时执行，最多取 32 个四字片段和 24 份文档，仍复用 PostgreSQL 的权限、活动版本及来源校验。冻结 300 题的文档级来源覆盖保持 development 163/172、validation 51/54、holdout 41/44；澄清、无答案、拒绝合计 30 题无候选。未按 holdout 结果调参。上述数字不代表答案正确率或精确引用正确率，正式主路仍未切换。
