# 阿里邮箱私有学习接入

## 安全边界

邮箱接入采用每用户独立的只读 IMAP 连接。用户必须使用阿里邮箱生成的第三方客户端安全密码，不能使用产品登录密码。服务端固定连接 `imap.qiye.aliyun.com:993` 并启用 TLS。

- 邮箱连接、加密凭据、同步任务、增量游标、邮件和学习候选均包含 `user_id`。
- 所有读取与写入都从服务端会话取得 `user_id`，客户端不能指定数据所有者。
- 数据表使用 `(user_id, id)` 复合外键，阻止不同用户之间错误关联。
- IMAP 邮箱以只读方式打开；系统不修改已读状态、不移动或删除邮件、不下载附件、不发送邮件。
- 单封邮件最多读取 2 MB，正文最多保留 200,000 字符；附件内容不入库。
- 政策、客户信号和邮件模板先进入用户私有审核区。未经批准不会进入 RAG 或正式客户数据。
- 用户批准政策或模板后，内容只写入该用户的知识文档与向量范围。

## 服务端配置

生成 32 字节 base64url 加密密钥：

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64url'))"
```

把输出保存到部署环境的 `MAILBOX_CREDENTIAL_KEY`，不要提交到 Git。密钥丢失后，已有邮箱安全密码无法恢复，只能让用户重新连接邮箱。

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
  → 确定性候选分类
  → 用户审核
  → 政策/模板进入该用户 RAG；客户信号保留为该用户确认数据
```

开放平台 API 适配器暂不作为默认连接方式，因为企业级 `client_credentials` 可能拥有跨邮箱读取能力，不能天然证明当前产品用户只拥有指定邮箱。
