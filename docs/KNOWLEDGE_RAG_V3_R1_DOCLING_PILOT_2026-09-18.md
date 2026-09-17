# KQ04 RAG v3 R1：Docling 本地试点

日期：2026-09-18。状态：30 份固定样本已完成结构化解析；R1 质量门禁仍为未通过。

## 固定运行合同

- 隔离环境固定 Docling 2.126.0、Docling Core 2.97.0、Docling Parse 7.20.0、RapidOCR 3.9.2、ONNX Runtime 1.30.0、Torch 2.14.0 与 Transformers 5.17.0。
- 本地模型与 tokenizer 共 38 个非 cache 文件、943,416,223 bytes，按相对路径、NUL 分隔符和逐文件 SHA-256 计算的聚合 SHA-256 为 `4b210e541e4d72b25c13b6027d4e92f737acedd0c0a569b9076a9273c4f8f6a3`；TableFormer 固定 `v2.3.0/fc0f2d45e2218ea24bce5045f58a389aed16dc23`。
- 标准 pipeline 使用 accurate TableFormer、RapidOCR 中文/拉丁字符模型和 HybridChunker。Windows 中文用户目录会使默认 threaded docling-parse 原生后端报路径编码错误，因此配置显式使用官方单线程 `DoclingParseDocumentBackend`。
- 提取器拒绝 URL，`enable_remote_services=false`，普通运行只接受已下载的本地模型；正文未发送给模型下载源或任何回答/embedding 服务。

## 实际试点

固定 manifest 包含 20 PDF、9 PPTX、1 XLSX，覆盖公司、行业、catalog、路由器、交换机、AP、CPE、蜂窝、GPON、PoE、USB 与配件资料。30/30 文件转换成功，共记录 423 个 page/slide/sheet unit、577 个 chunk，Docling 转换耗时合计 1,155,022 ms，重试为 0。

WR3000 与 WR6500H 均为 7/7 页非空，分别生成 13 和 15 个 chunk。复杂产品 catalog 的 44 页生成 174 个 chunk，XLSX 生成 72 个 chunk，证明试点没有只覆盖短数字 PDF。

## 视觉复核与未通过项

- 已将 13 个 PDF 页面和 16 个 PPTX slide 全部渲染检查。29/29 均含有规格表、网络拓扑、认证说明、产品图或封面内容，真实空白为 0；它们是 extraction incomplete，而不是 blank。通用 extractor v3.0.2 对 PDF 使用低分辨率可见像素检测，对 PPTX/XLSX 使用结构内容检测，将“无文本但非空”的 unit 标为 `review-required`，随后用同一固定 RapidOCR 模型进行本地高分辨率二次识别。26/29 unit 共恢复 9,068 字符候选证据，三项未恢复内容是装饰封面/logo；P5 页面恢复出 `4 x Gigabit Ethernet Ports`。所有二次 OCR 内容仍标记 candidate，该自动分类不等于用户人工确认，schema 激活函数仍会阻止它们静默激活。
- 复杂 catalog 有 23 个 chunk 超过目标 500 tokens，最大 509；这是“约 500”边界证据，仍需在表格完整性与检索粒度之间人工验收。
- 还没有完成与旧 PyMuPDF 结果的逐页视觉对照，也没有对字段、行列、单位、标题和阅读顺序评分。因此不能把 30/30 conversion success 写成 R1 质量通过，更不能据此启动全库 embedding。

模型/回答/embedding/search/SMTP 外部业务调用、provider tokens、API credits 和已知现金费用均为 0。本地 CPU、存储、模型下载带宽和人工复核成本保持 unknown。
