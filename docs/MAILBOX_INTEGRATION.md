# 阿里邮箱私有学习接入

## 安全边界

邮箱接入采用每用户独立的只读 IMAP 连接。用户必须使用阿里邮箱生成的第三方客户端安全密码，不能使用产品登录密码。服务端固定连接 `imap.qiye.aliyun.com:993` 并启用 TLS。

- 邮箱连接、加密凭据、同步任务、增量游标、邮件和学习候选均包含 `user_id`。
- 所有读取与写入都从服务端会话取得 `user_id`，客户端不能指定数据所有者。
- 数据表使用 `(user_id, id)` 复合外键，阻止不同用户之间错误关联。
- IMAP 邮箱以只读方式打开；系统不修改已读状态、不移动或删除邮件、不下载附件、不发送邮件。
- 单封邮件最多读取 2 MB，正文最多保留 200,000 字符；附件内容不入库。
- 政策、客户信号和邮件模板先进入用户私有审核区。未经批准不会进入 RAG 或正式客户数据。
- 用户批准任一候选后，内容只写入该用户的私有知识文档与向量范围。
- 同步后的初筛完全在本地服务与数据库内完成，不调用 Kimi。只有用户明确勾选并授权学习的邮件才会发送到 Kimi；当前每批最多 5 封，模型默认 `kimi-k3`。
- 初筛会优先识别用户发出的邮件、用户参与的回复线程、直接发送给用户的邮件、产品型号、认证与业务信号，并降低自动通知、群发和过短内容的优先级。
- 产品识别词来自共享的 `product_catalog`，因此应先运行 `products:extract` 与 `products:ingest`，再对已有邮件执行重新筛选。

## 服务端配置

生成 32 字节 base64url 加密密钥：

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64url'))"
```

把输出保存到部署环境的 `MAILBOX_CREDENTIAL_KEY`，不要提交到 Git。密钥丢失后，已有邮箱安全密码无法恢复，只能让用户重新连接邮箱。

同时配置 Kimi 学习服务：

```dotenv
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-k3
```

执行迁移并重启服务：

```powershell
npm run db:migrate
npm run dev
```

## 阿里邮箱用户准备

1. 管理员允许目标账号使用第三方客户端，并开启 IMAP。
2. 用户在阿里邮箱网页端生成第三方客户端安全密码。
3. 用户登录产品后进入“邮箱学习”，输入自己的邮箱地址和该安全密码。
4. 首次同步默认读取最近一年、最多 200 封；后续使用每个文件夹的 UID 游标增量同步。

阿里邮箱官方配置说明：

- https://help.aliyun.com/zh/document_detail/36576.html
- https://help.aliyun.com/zh/document_detail/444269.html
- https://help.aliyun.com/zh/document_detail/606337.html

## 学习流程

```text
用户专属 IMAP 凭据
  → TLS 只读同步 INBOX / Sent
  → 用户私有 mailbox_message
  → 本地规则按互动 / 产品 / 认证 / 业务信号分为推荐、复核、忽略
  → 用户明确勾选并授权（每批最多 5 封）
  → Kimi-K3 按批提取政策 / 客户信号 / 可复用模板
  → 实时写入用户私有待审核区
  → 用户逐条批准或拒绝
  → 批准内容以 visibility=private + owner_id 进入该用户 RAG
```

同步进度保存在 `mailbox_sync_run`，逐邮件学习状态保存在 `mailbox_message.learning_status`。本地筛选结果保存在 `screening_score`、`screening_bucket`、`screening_reasons` 和 `thread_key`，可随产品目录更新后重新计算。前端每秒读取当前用户的状态和候选，因此学习尚未结束时也可以批准或拒绝已经生成的候选。

审核时可按需展开完整提取内容与来源邮件原文。来源正文只在点击展开后通过当前用户会话读取和服务端解密，不包含在定时状态轮询中。批准后的内容可在“知识库 & RAG → 邮箱学习知识”查看，并继续以 `visibility=private` 参与当前用户的检索。

筛选分值目前采用确定性规则：60 分及以上为“推荐学习”，35–59 分为“人工复核”，其余为“忽略”。用户发件、互动邮件流、产品型号和认证信息会加分；自动通知、群发以及没有实质内容的短回复会减分。相同线程中只要存在用户发出的邮件，其他参与邮件会被提升为互动线程。

## 数据库与隔离

- 原始邮件、连接凭据、游标、同步批次和候选位于独立的 `mailbox_*` 表，但与主知识库共用同一个 PostgreSQL 实例。
- 这是表级与行级逻辑隔离，不是独立物理数据库。所有邮箱表均强制携带 `user_id`，关键关联使用复合所有权外键。
- 未批准的邮件内容不会进入 `knowledge_document` / `knowledge_chunk`。
- 批准后只写入派生文本，不移动原始邮件；知识文档标记为 `visibility=private` 并绑定当前用户 `owner_id`。
- Kimi 是本地数据库之外的数据处理方。启用学习代表邮件正文会经 TLS 发送给配置的 Kimi API，部署前需确认公司对第三方模型的数据处理政策。

开放平台 API 适配器暂不作为默认连接方式，因为企业级 `client_credentials` 可能拥有跨邮箱读取能力，不能天然证明当前产品用户只拥有指定邮箱。
