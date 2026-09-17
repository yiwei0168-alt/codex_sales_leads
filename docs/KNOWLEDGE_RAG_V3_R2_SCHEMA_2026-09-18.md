# KQ04 RAG v3 R2：schema 与全量 manifest dry-run

日期：2026-09-18。状态：R2 schema 已实施并在当前开发数据库验证；全量抽取与 release 构建未开始。

## 数据合同

Migration 083 新增独立 v3 release、按 shared/owner 隔离的资产 manifest、source revision、page/slide/sheet/document 终态、父子 chunk、chunk 行级实体绑定、embedding profile、chunk embedding、事实、人工复核队列和活动指针。Qwen 与 BGE 分别使用 `vector(1536)` 和 `vector(1024)` 及独立 partial HNSW，不能在同一列或同一距离计算中混用。

激活函数只接受 `validated` release，并在一个事务中检查：当前 scope 的每个 registered 资产都在 manifest、unit/chunk 数一致、每个 chunk 同时具备 Qwen/BGE、成功 datasheet 不得零 chunk、blank/review-required/failed 必须有人工作出结论、复核队列无 open 项。通过后才替换 scope pointer 和文档指针；旧 active 只标记 superseded，不删除。

## 实际验证

- `db:migrate` 实际应用 migration 083 和既有幂等迁移；PostgreSQL/pgvector 接受 schema 与两个 HNSW。
- 11/11 v3 表启用并强制 RLS；两种 profile 与激活函数存在。
- 纯门禁 7 项通过，覆盖 manifest 缺项、Qwen/BGE 各自缺失、零 chunk datasheet、未复核失败和 open review。
- 数据库只读 dry-run 从 `knowledge_asset` 唯一生成范围：281 个 registered 资产、653,805,572 bytes；207 PDF、13 PPTX、61 XLSX，当前均为 shared。未使用 `datasheets[:22]` 或型号白名单。
- 当前 v3 release 0、pointer 0；正文读取、数据库业务写入、模型、embedding、搜索、SMTP、tokens、API credits 和现金费用均为 0。

## 未完成边界

Docling 试点、依赖/model SHA 完整冻结、source unit 写入、全量 chunk、事实和双向量均未完成。profile 中的模型 revision 是构建前占位值，激活前必须替换为精确 revision/hash。migration 成功不代表 ACL 交叉用户夹具、恢复、回滚或生产查询已验收。
