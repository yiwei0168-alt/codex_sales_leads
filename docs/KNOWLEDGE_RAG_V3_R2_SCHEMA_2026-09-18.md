# KQ04 RAG v3 R2：schema 与全量 manifest

日期：2026-09-18。状态：R2 schema 已实施并在当前开发数据库验证；全量 manifest 已冻结并启动可恢复本地抽取，尚未完成或写入 release。

## 数据合同

Migration 083 新增独立 v3 release、按 shared/owner 隔离的资产 manifest、source revision、page/slide/sheet/document 终态、父子 chunk、chunk 行级实体绑定、embedding profile、chunk embedding、事实、人工复核队列和活动指针。Qwen 与 BGE 分别使用 `vector(1536)` 和 `vector(1024)` 及独立 partial HNSW，不能在同一列或同一距离计算中混用。

激活函数只接受 `validated` release，并在一个事务中检查：当前 scope 的每个 registered 资产都在 manifest、unit/chunk 数一致、每个 chunk 同时具备 Qwen/BGE、成功 datasheet 不得零 chunk、blank/review-required/failed 必须有人工结论、复核队列无 open 项。通过后才替换 scope pointer 和文档指针；旧 active 只标记 superseded，不删除。

## 实际验证

- `db:migrate` 实际应用 migration 083 和既有幂等迁移；PostgreSQL/pgvector 接受 schema 与两个 HNSW。
- 11/11 v3 表启用并强制 RLS；两种 profile 与激活函数存在。
- 纯门禁 7 项通过，覆盖 manifest 缺项、Qwen/BGE 各自缺失、零 chunk datasheet、未复核失败和 open review。
- 数据库 manifest 只从 `knowledge_asset` 生成：281 个 registered shared 资产、653,805,572 bytes，207 PDF、13 PPTX、61 XLSX；未使用 `datasheets[:22]` 或型号白名单。
- 内容哈希复核把 281 个逻辑资产去重为 221 个唯一物理源、651,285,512 个唯一物理 bytes；61 个逻辑 XLSX 资产共享唯一的 `Cudy products list.xlsx`，其余物理源不重复。全部数据库 SHA/bytes 与本地原件一致。
- manifest 保留每个 asset/document/entity/relation 绑定；共享 XLSX 被强制标记 `row-scoped-required`。行级构建器用 NFKC、首尾空白和连续空白规范化后精确匹配第一列型号，不作模糊包含；测试验证 `FS108D  V5.0` 可绑定 `FS108D V5.0`，同时不会带入相邻 WR3000 行，缺行时失败关闭。
- extractor v3.0.3 为 XLSX 额外保留 sheet/row/cell 精确坐标。全量 runner 以 source SHA 与 extractor version 检查点恢复，解析阶段不打开数据库事务，单文件失败后继续记录其余源。
- 首个 26 页探针成功：26 个 unit、31 个 chunk、24 success、1 个经确认 blank、1 个 candidate/review-required，Docling/本地总计 251,954 ms、零重试、零外部调用。
- release 入库器 dry-run 可按物理 artifact 还原逻辑资产、复核决定和行级实体关系；只有 221/221 artifact 齐备时 `--write` 才可创建或续写 building release。数据库事务中不等待 Docling，付费 Qwen 不在本阶段调用。
- 当前 v3 release 0、pointer 0；数据库业务写入、模型、embedding、搜索、SMTP、tokens、API credits 和现金费用均为 0。

## 未完成边界

全量 221 个物理源仍在本地抽取，source unit/release/chunk 尚未写库；事实和双向量均未完成。profile 中的 BGE 模型 revision 是构建前占位值，激活前必须替换为精确 revision/hash。migration、manifest 和单文件探针成功不代表 ACL 交叉用户夹具、恢复、回滚或生产查询已验收。
# R3/R5 partial implementation addendum — 2026-09-18

- The fact registry now covers default comparison profiles for routers, switches, APs, Mesh, CPE and accessories through generic deterministic rules, without model-specific answers.
- Comparison requests use a dedicated LangGraph node and return differences first plus a complete attribute table; unknown, candidate, conflict and version mismatch remain distinct.
- When a v3 pointer is active, facts and retrieval read only that release. ACL/entity filtering precedes four-lane RRF, and citations retain lane ranks and source coordinates.
- BGE-M3 is pinned to official revision `5617a9f61b028005a4858fdac845db406aefb181`. Its local service binds only `127.0.0.1`, refuses remote model URLs/runtime downloads and does not log body text.
- Qwen/BGE query vectors are cached and degraded independently; fact/full-text retrieval remains available if either or both vector lanes fail. Full release, vector, Recall@8 and activation gates remain pending.
- BGE local inference has now passed a real 1,024-dimensional normalized-vector probe using a 2,293,315,801-byte snapshot. The exact aggregate artifact hash is `4f2ef0a2c9b4250206e9ddc202a2bbe01718aacd2a06f87e3e09887b2a076c28`; migrations 084/086 pin both revision and artifact hash. Full-corpus BGE generation remains pending the completed shadow release.

# R2 full extraction addendum — 2026-09-18

The resumable run has completed 221/221 registered source paths with zero conversion failures. The inactive building release contains 281 source revisions, 1,820 logical units and 3,008/3,008 chunks; no active pointer exists. Migration 087 changes chunk identity to exact source revision so multiple registered revisions cannot overwrite one another. Unconfirmed OCR chunks are withheld at ingest (`unacceptedCandidateChunks=0`). Exact counts, retry evidence, fact totals, local BGE status and remaining gates are recorded in [the full extraction evidence](KNOWLEDGE_RAG_V3_R2_FULL_EXTRACTION_2026-09-18.md).
