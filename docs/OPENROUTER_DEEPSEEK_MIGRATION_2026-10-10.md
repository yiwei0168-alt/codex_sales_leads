# DeepSeek 业务适配器迁入 OpenRouter

## 范围

MODESEL-05/06：研究、证据纠正、评分和联系人核验共用的 DeepSeekProvider 统一调用 OpenRouter `/api/v1/chat/completions`。配置来自 OPENROUTER_API_KEY / OPENROUTER_BASE_URL；旧 DEEPSEEK_API_KEY / BASE_URL 不再作为生产连接来源。显式构造参数的地址同样必须是可信网关。

`deepseek-flash` 历史别名映射至 `deepseek/deepseek-v4-flash`，其他 DeepSeek 型号补全 `deepseek/` 前缀。型号参考 [Flash](https://openrouter.ai/deepseek/deepseek-v4-flash)、[Pro](https://openrouter.ai/deepseek/deepseek-v4-pro) 官方目录；保留原默认关闭思考的配置，旧显式非 Anthropic Pro 配置的开启思考语义通过网关 reasoning 参数表达。旧传输设置不再改变目标协议或地址。没有进行真实模型兼容性测试。

保留原结构化评分 Prompt、证据 ID、JSON Schema 提示、温度、输出上限及请求大小约束。provider 参数要求支持指定参数、禁止数据收集并关闭自动 fallback，拒绝重定向。非完整结束标记不采纳，HTTP 错误仅保留状态码。调用上下文和实际提供方归属 openrouter；逻辑 adapter id=deepseek 保留用于既有任务路由，真实上游信息继续由付费收据记录。

缓存版本改为 deepseek-openrouter-cache-v2；请求大小预检、缓存及付费重放指纹均覆盖实际网关序列化内容。共用大小计算器仍支持其他模型估算，实际 DeepSeek 发送前强制校验模型归属。旧缓存、收据和向量不删除；新请求不能以旧直连指纹当作已完成。历史不确定调用不得因本次部署自动重放。

默认恢复适配器不再把同一 DeepSeek 网关作为自己的备用，保留原获准的其他模型路由和数据范围。环境配置的自定义备用也统一使用网关连接及隐私参数，不再采用独立供应商地址/密钥；其模型 ID 必须与网关目录匹配，不能假定旧供应商别名可用。

## 验收

- 7 个 provider 文件 43 项：网关 URL、密钥、完整结束标记、错误处理、模型归属、请求字节数/指纹、缓存变更、分批限制、调用归属与备用回归。
- 6 个业务文件 63 项：评分、分阶段计划与综合、超长单公司分块、联系人核验。初次回归发现共用请求大小计算器拒绝其他模型标识，已将强制归属校验移至实际发送边界后全部通过。
- 类型检查和聚焦 lint 通过。全部使用本地模拟传输，无新增付费调用、真实评分发布或邮件外发。

## 后续与回滚

部署：生产构建通过。三类任务队列 queued/running 均为空后重载产品、LangGraph 和三个 worker；3018 与 2024/ok 均返回 HTTP 200，五项错误日志为空。未启用 TUN，未自动重放历史任务。

Google grounding 与远程向量入口仍待迁移，不能把本阶段标为全量统一完成。旧意图识别保持停用。回滚回退本提交并在任务安全边界重载，保留任务和收据，不自动重做模型调用。
