# A31 RAG 独立回答合同（阶段 245，2026-09-15）

## 用户确认与范围

用户明确要求：“为RAG建立独立合同”。本阶段将其登记为 A31。范围仅为 AI 销售助理在完成内部知识检索后，通过 OpenRouter Sol 生成带知识片段引用的 `rag-answer`；不改变查询 embedding、混合网页检索、市场计划、Terra 复核、Sol 裁决或邮件生成合同。具体费用和线形数值是根据当前产品请求与公开端点证据形成的实施边界，不伪造成用户逐项指定的业务数值。

A30 同时适用：只有 `sourceType` 明确标记为公开来源的知识片段可以进入外部回答请求。当前允许 `public-*`、`public-product-datasheet`、`public-url-import`、`official-website`、`official-platform-profile` 和 `independent-public`；内部培训材料、私人邮箱、内部维护文件及没有公开来源标记的上传内容不外发。问题和公开片段在外发副本中继续过滤邮箱、电话、凭据/私钥、证件号和支付卡号形态，本地知识不改写。

## 专用合同

`request-bounds-v1.12.0` 新增 `openrouter-sol-rag-answer-credits` / `openrouter-sol-rag-answer-text-v1`：

- OpenRouter credits，`openai/gpt-5.6-sol`，仅 `provider.only=["openai"]`，`allow_fallbacks=false`；
- `require_parameters=true`、`data_collection=deny`；
- 仅两条纯文本消息和一个非流式自由文本回答；不允许工具、插件、推理控制、特殊服务层、显式缓存参数或结构化输出参数；
- 使用当前 OpenAI 端点支持的 `max_tokens`，省略不支持的 `temperature` 和旧 `max_completion_tokens`；
- 请求最多 61,440 bytes，费用上界按最多 65,536 计费输入 token 留出消息封装余量，输出最多 8,192 token；
- 当前公开未折扣最大输入类别 USD 10/M、输出 USD 30/M，单次保守预留 **USD 0.901120**；2026-09-22 00:00 UTC 起未复核即过期。

与旧普通 Sol USD27.345252 全上下文上界相比，新上界降低 96.7047%，约为旧值的 1/30.35；这是更贴合请求边界的**保守预留差异**，不是实际现金节省或供应商账单。

## 验证

- 2026-09-15 05:59:40 UTC 只读公开 GET 核对 OpenAI 标准端点：支持 `max_tokens`，不列 `temperature`，支持 8,192 输出；响应 SHA-256 为 `5c1b83e08a4ecacb57a5fc529ebcacfe0c9716dd888706a1e85d0b90b781d581`。没有加载 API key、读取账号或调用推理。
- 生产 `ChatOpenAI` 配置的无网络捕获通过：OpenAI-only、8,192 `max_tokens`、无 temperature/max_completion_tokens/response_format，完整合成请求在 61,440-byte 边界内。
- 真实 PostgreSQL 合成验证写入并清理一条 USD0.901120 预留；错误线形在传输前拒绝，正确线形仅调用合成 transport 一次，相同请求再次执行被持久化防重放门禁拒绝。真实供应商调用为 0。
- 全量 1,069 项／213 文件测试、TypeScript、lint（0 error，11 个既有 warning）、生产构建、生成工作流文档一致性及生产依赖审计（0 漏洞）通过。

## 效率记录

输入包括 1 次公开端点 GET、1 次实际 SDK 无网络线形捕获、1 次 PostgreSQL 合成合同运行；三项均形成有效验证结果并用于本阶段验收。真实用户回答、客户下游使用和用户采用均为 0/未知。模型输入/输出 token、付费 API credits、现金费用和外部重试均为 0；没有丢弃模型业务输出。公开审计约 3.3 秒、SQL 合成约 2.0 秒、全量测试约 23.6 秒。优化机会是按实际 RAG 请求继续测量 token/字节比和引用有效率，并在有代表性质量证据前不降低 8,192 输出或更换模型。
