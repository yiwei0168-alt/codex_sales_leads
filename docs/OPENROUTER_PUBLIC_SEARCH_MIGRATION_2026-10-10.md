# 公开事实搜索 OpenRouter 迁移 — 2026-10-10

## 实现范围

MODESEL-06：新主 Agent public_fact_search 共用的 searchExternalWithGemini 已改为 OpenRouter chat/completions。保留公开资料提示、每次最多五个问题、低思考、12,000 输出上限、90 秒默认超时及最多三次 HTTP 429/5xx 尝试；不限制标准模式每任务搜索总次数。成功但不完整的响应不重试。

凭据只来自 OPENROUTER_API_KEY；地址必须是受信任网关。Gemini 型号保留原 GEMINI_SEARCH_MODEL 并补 google/ 前缀；默认 google/gemini-3.6-flash。公开模型目录读取已确认该型号存在，不代表真实调用验收。请求 require_parameters=true、data_collection=deny、allow_fallbacks=false，拒绝重定向。data_collection=deny 不等于零留存承诺。

固定 web engine=native。依照 [OpenRouter 官方搜索协议](https://openrouter.ai/docs/guides/features/plugins/web-search)，引用来自标准 URL annotations；不解析生成正文中的链接作为证据，也不采用凭据 URL、非 HTTP URL 或空引用。finish_reason 必须为 stop。

## 可观测性变化

旧 Google interactions 可返回实际搜索词；网关文档未保证同等字段。本次以原生搜索请求及网关 URL annotations 为来源收据，searchQueries=[] 同时保存 searchQueryStatus=not-provided、groundingSource=openrouter-url-annotations。这不是“实际零次搜索”，不伪造搜索词/查询次数，也不把正文陈述视为核实事实。旧综合器亦传递上述来源状态。原始响应仍由既有付费收据链处理，历史收据不修改。

网络复用统一 model-transport，Gemini 网关使用 MODEL_PROXY_URL；缺失/非本机代理失败，不静默直连。旧 GEMINI_PROXY_URL 不用于本入口。

## 验收

- 7 文件 39 项本地测试通过：网关协议/密钥、代理、完整结束、引用来源、错误脱敏、旧意图停用、业务工具和旧图回归。
- TypeScript、聚焦 lint、diff 检查及生产构建通过。
- 所有模型响应为本地模拟；无新增付费模型调用、发信或正式评分。

## 剩余迁移

客户发现 gemini-full/product 适配器仍在旧协议，下一阶段需同步恢复指纹和收据语义；本批不宣称已统一。

[OpenRouter 向量目录](https://openrouter.ai/api/v1/embeddings/models)本次查询未列出旧库 text-embedding-v4，不能仅改 API 地址或替换同维度模型。旧索引/向量保持原样；新模型须独立索引及同题对照，不自动触发全量重算或私有资料外发。冻结 Gold 和新 RAG 主路发布门槛不变。

部署结果：确认三类任务队列 queued/running 均为空后重载受影响的 Next、LangGraph 和主 Agent worker。父进程退出时 worker 子进程已自动退出，随后完成启动；3018 与 2024/ok 均 HTTP 200，三个服务错误日志为空。未改动 TUN/代理配置，未自动恢复旧任务。
