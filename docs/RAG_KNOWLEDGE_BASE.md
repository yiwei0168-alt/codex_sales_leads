# RAG 知识库指南

## 数据边界

| 知识库 | 内容 | 固定范围 |
|---|---|---|
| 行业 | 行业知识、渠道结构、主要品牌、市场研究、术语与规则 | 用户上传，可按市场标记 |
| 公司 | 公司简介、产品线、当前业务、战略、区域覆盖、经营资料 | 品牌方固定为 Cudy Technology |
| 产品 | 产品信息、技术规格、兼容性、认证、生命周期、限制 | Cudy Technology 产品 |

这三类集合会由数据库迁移统一创建。公司知识库已经存在，集合标识为 `company`，品牌方固定为 `Cudy Technology`；它与渠道候选企业快照相互独立。

渠道发现页的 36 家公开候选企业是独立数据快照，不会进入公司知识库。

## 本地配置

1. 安装 Docker Desktop 和 Node.js 20.9+。
2. 复制 `.env.example` 为 `.env.local`。
3. 填写生成服务的 `OPENAI_API_KEY`，以及阿里云百炼的 `EMBEDDING_API_KEY` 和 `EMBEDDING_BASE_URL`；生产或共享环境必须更换 `KNOWLEDGE_ADMIN_TOKEN`。
4. 启动 PostgreSQL 并执行迁移。

```powershell
docker compose up -d
npm run db:migrate
npm run dev
```

所有 API Key 只在服务端读取，不使用 `NEXT_PUBLIC_` 前缀。Embedding 默认使用 Qwen `text-embedding-v4`，并显式输出 1536 维以匹配现有 pgvector Schema；生成模型通过 `OPENAI_GENERATION_MODEL` 配置。更换 Embedding 模型或维度后必须重建全部文档向量，并同步修改数据库向量维度。

## 上传方式

### 管理界面

进入“知识库 & RAG”，选择知识库、填写标题和来源 URL，选择文件，然后点击“上传并建立索引”。当前支持 UTF-8 `.md`、`.txt`、`.csv`、`.json`，单文档最多 2 MB。

开发环境在未设置 `KNOWLEDGE_ADMIN_TOKEN` 时允许本机上传；生产环境必须通过 Bearer Token 授权。Token 只保存在当前页面内存，不写入浏览器持久存储。

### 命令行

```powershell
npm run kb:ingest -- --type=industry --file=research.md --source-url=https://source.example
npm run kb:ingest -- --type=company --file=cudy-profile.md --external-id=cudy-profile-2026
npm run kb:ingest -- --type=product --file=wr3000.md --external-id=cudy-wr3000 --product-id=WR3000
```

### 批量建立产品数据库

产品数据库分成两层：

- `product_catalog`：从 `Cudy products list.xlsx` 提取的结构化型号、名称、类别和描述；
- 产品知识集合：从 Datasheet 提取的逐页文本证据，用于向量检索和有引用回答。

首轮 Wi-Fi Router 验证流程：

```powershell
python -m pip install -r requirements-product.txt
npm run products:extract
npm run db:migrate
npm run products:ingest
```

`products:extract` 不修改原始文件，生成内容位于 `knowledge/product/processed`。`products:ingest` 可以重复执行：结构化产品按型号更新，知识文档按型号和 Datasheet 版本幂等更新。

重复导入相同 `external-id` 和相同内容时会跳过。内容变化时会重新分块和生成向量，并在事务内替换旧 chunks。

## 推荐文档结构

用 Markdown 标题组织内容，便于保留语义路径：

```markdown
# WR3000
## Hardware
### Ethernet ports
...
## Wireless
### Supported standards
...
## Certifications
...
## Known limitations
...
```

产品规格必须写明版本、生效日期和来源。未知参数应明确写 `Unknown`，不要根据同类产品补写。

## 检索与回答

查询先生成向量，同时执行 pgvector cosine search 与 PostgreSQL FTS，使用 reciprocal-rank fusion 合并。只有超过 `RAG_MIN_SCORE` 的 chunks 会进入模型上下文。

候选 chunk 在排名前先执行可见性过滤：

- `visibility=shared`：公司维护的共享行业、公司和产品知识，对所有已登录用户可检索；
- `visibility=private AND owner_id=当前会话用户`：该用户上传或批准的私有知识；
- 其他用户的私有文档在 SQL `eligible` 阶段即被排除，不会参与向量相似度或全文排名。

共享与当前用户私有 chunk 进入同一套向量/关键词融合排序，然后统一经过最低分阈值和带引用回答。引用 metadata 会携带 `visibility`，便于后续界面区分共享来源与私人来源。

模型被要求：

- 只能使用检索上下文；
- 区分事实、建议和推断；
- 事实句使用 `[KB:chunk-uuid]` 引用；
- 资料不足或冲突时明确说明；
- 不编造公司业务、产品规格、价格、联系人或关系。

服务端会再次解析引用；没有有效 chunk UUID 的回答标记为 `Needs review`。

## 数据治理

- 内部经营资料上传前应确认访问授权和保密等级。
- 不上传个人敏感信息、私人联系方式、密钥或客户机密，除非已建立相应权限体系。
- 当前已实现服务端会话、知识文档 `owner_id`、共享/私有可见性和用户级查询日志；生产部署仍建议在数据库侧增加 RLS 作为纵深防御。
- 删除、版本管理和 PDF/DOCX 解析尚未实现，应在生产化阶段补充。
- Responses API 调用设置 `store: false`；仍需根据企业政策确认第三方模型数据处理要求。

## API

- `GET /api/knowledge/status`：三类知识库文档、chunk、向量统计和配置状态。
- `POST /api/knowledge/documents`：导入文本知识，生产环境要求 Bearer Token。
- `POST /api/rag/query`：执行混合检索与基于证据的生成。

Embedding 接入参考阿里云百炼 `text-embedding-v4` 的 OpenAI 兼容接口；生成接入使用 OpenAI SDK 的兼容服务端点。
