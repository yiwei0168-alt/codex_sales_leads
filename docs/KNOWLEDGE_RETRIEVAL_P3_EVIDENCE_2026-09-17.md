# KQ01 P3 结构化提取与切片 v2 验收

日期：2026-09-17

P3 新增 `layout-v2.0.0` 中间格式、500-token 候选切片、来源修订和影子索引代。中间格式保留 page/slide/sheet、块类型、表格表头与行、合并区域、bbox（PDF可得）、抽取器版本及 success/blank/pending-ocr/failed 状态。旧 `chunkDocument` 和活动索引未替换。

真实抽样覆盖 36 份输入：27 PDF、7 PPTX、1 XLSX、1 合成受控文本；426 单元成功、12 空白、3 待 OCR、0 失败。35 份有登记原件映射到 95 个文档关系，生成 9,693 个无 embedding 的 v2 影子块；generation 状态为 `validated` 但未激活。共享 XLSX 关联多个分类文档，因此文档关系数高于源文件数。

最初 pypdf layout 探针会把双栏规格与左侧正文串到同一行，不能稳定恢复字段和值；最终 PDF v2 统一选用已安装的 PyMuPDF 坐标块，不叠加多个运行时解析框架。视觉抽查 FS1016 两页确认第二页为左右分栏规格表；v2 输出将字段和值保留为带 bbox 的独立块，避免原先的跨栏扁平串接。表格切片按完整行组拆分并重复表头/脚注，短 Beta 条款不再并入 Alpha。

本阶段外部模型、embedding、搜索、SMTP、API credits 和现金成本均为 0。3 个待 OCR 单元保持 pending，未伪记成无内容或成功。旧索引与历史引用仍可用。
