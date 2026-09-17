# KQ01 P2 文件、实体关系与来源验收

日期：2026-09-17

P2 新增 `knowledge_asset`、`knowledge_entity` 与 `knowledge_document_entity`，继承知识文档 ACL，并登记稳定 asset UUID、相对存储键、SHA-256、MIME、字节数、文档类型、版本和外发属性。现有 manifest 共登记 281 个文档资产关系；缺失源文件、缺失文档映射和公司/行业未登记文件均为 0。登记路径 embedding/model/search/SMTP 调用均为 0。

受控原件 GET 只接受 UUID，经会话、RLS和显式文档 ACL 查询后解析固定 `knowledge/` 根目录；拒绝绝对路径、`..`、UNC/盘符和真实路径逃逸。PDF/文本 inline，PPTX/XLSX 下载，支持单段 Range、`nosniff` 与 private/no-store；撤回、删除、文件变化和无权限不返回正文。知识库列表显示文档类型/版本和受控原件链接，没有 asset 时仍为已保存文本。

同内容的来源 metadata 变化现在只更新目录，不调用 embedding。现有 JSON 文本上传保持兼容；二进制上传没有伪装成 `File.text()`，将在 P3 提取作业合同完成后另设受控入口。验证包括路径/Range边界、类型检查、迁移重放和真实 manifest 登记；本阶段没有重新向量化或自动批准 manifest 外文件。
