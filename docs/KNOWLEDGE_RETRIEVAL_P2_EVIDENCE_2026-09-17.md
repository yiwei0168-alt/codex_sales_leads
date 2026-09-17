# KQ01 P2 文件、实体关系与来源验收

日期：2026-09-17

P2 新增 `knowledge_asset`、`knowledge_entity` 与 `knowledge_document_entity`，继承知识文档 ACL，并登记稳定 asset UUID、相对存储键、SHA-256、MIME、字节数、文档类型、版本和外发属性。现有 manifest 共登记 281 个文档资产关系；缺失源文件、缺失文档映射和公司/行业未登记文件均为 0。登记路径 embedding/model/search/SMTP 调用均为 0。

受控原件 GET 只接受 UUID，经会话、RLS和显式文档 ACL 查询后解析固定 `knowledge/` 根目录；拒绝绝对路径、`..`、UNC/盘符和真实路径逃逸。PDF/文本 inline，PPTX/XLSX 下载，支持单段 Range、`nosniff` 与 private/no-store；撤回、删除、文件变化和无权限不返回正文。知识库列表显示文档类型/版本和受控原件链接，没有 asset 时仍为已保存文本。

同内容的来源 metadata 变化现在只更新目录，不调用 embedding。现有 JSON 文本上传保持兼容；PDF/PPTX/XLSX 已增加独立 multipart 入口，按扩展名、MIME、文件签名/OOXML容器类型和25 MB上限校验，原件保存到用户隔离的 `knowledge/uploads/<userId>/` 后创建 `knowledge_upload_job`。HTTP请求不等待解析，也不自动公开、索引或向量化；独立 `knowledge:process-uploads` worker 复用 P3 `layout-v2.0.0` 本地解析器，输出受控结构化产物并保留 pending/running/extracted/failed 状态、聚合指标和失败码。

迁移082已应用。29项知识/API回归、TypeScript和生产构建通过；空队列worker输入/输出均为0且无外部调用。真实44页产品目录PDF探针产生44个成功单元、1,895个结构块、0空白/待OCR/失败、0模型/embedding/搜索/SMTP调用。上传二进制不再经过 `File.text()`；页面显示最近提取作业，文本入口仍按原合同直接索引。manifest外文件仍不会自动批准为共享或进入活动索引。
