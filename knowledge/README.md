# Knowledge Upload Staging Area

本目录不预置行业、公司或产品事实。知识内容由用户自行上传和维护。

可将待导入的 UTF-8 文本文件临时放入以下目录：

- `knowledge/industry/`：行业知识、渠道结构、主要品牌、市场研究
- `knowledge/company/`：Cudy Technology 公司简介、产品线、当前业务、战略与经营资料
- `knowledge/product/`：Cudy Technology 产品信息、技术规格、兼容性、认证和使用限制

支持 `.md`、`.txt`、`.csv` 和 `.json` 文本文件。导入示例：

```powershell
npm run kb:ingest -- --type=industry --file=knowledge/industry/channel-structure.md --source-url=https://source.example/page
npm run kb:ingest -- --type=company --file=knowledge/company/cudy-profile.md --external-id=cudy-company-profile
npm run kb:ingest -- --type=product --file=knowledge/product/wr3000.md --external-id=cudy-wr3000 --product-id=WR3000
```

公司类文档在导入脚本中会自动标记为 `companyId=cudy-technology`。产品类文档的 `productId` 默认取 `external-id`。

原始内部文件可能包含敏感商业信息。本目录仅用于本地暂存，默认子目录内容已被 `.gitignore` 忽略，不会上传到 GitHub。

数据库最终包含三个独立知识集合：`industry`、`company` 和 `product`。产品批量处理使用 `npm run products:extract` 和 `npm run products:ingest`；第一阶段支持 `product/Cudy products list.xlsx` 以及 `product/Wi-Fi Router/*.pdf`。
