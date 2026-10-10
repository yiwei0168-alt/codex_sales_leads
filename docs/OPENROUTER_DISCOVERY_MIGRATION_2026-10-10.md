# 客户发现 Gemini 网关迁移 — 2026-10-10

## 范围与行为

落实 MODESEL-06：gemini-full（规划搜索）及 gemini-product（固定查询）均改用 OpenRouter chat/completions，共用上一阶段的 Gemini 原生 web 请求及引用解析器。保留原市场、公司数量和查询提示、120 秒默认超时、默认两次尝试和最多三次配置边界，不扩大搜索范围或自动启动旧任务。

配置只使用 OPENROUTER_API_KEY / OPENROUTER_BASE_URL。GEMINI_DISCOVERY_MODEL 优先于 GEMINI_SEARCH_MODEL，统一补 google/ 前缀，默认 google/gemini-3.6-flash。环境状态、实际请求和恢复依赖读取相同网关连接；不回退 Google 直连。Google Places、Exa、Brave、SearchAPI 是独立搜索服务，保持原调用方式。

原生 web 插件固定 engine=native，不自动改用 Exa；require_parameters=true、data_collection=deny、allow_fallbacks=false，禁止重定向，网络沿统一 MODEL_PROXY_URL 显式本地代理。数据收集限制不等于零留存保证。

## 结果、错误与恢复

候选 URL 仅来自完整回答中的有效 URL annotations。移除递归扫描整个响应/生成正文提取任意链接的旧方式。候选按现有 maxResults 截断，保留返回数量和超额数量；候选仍需后续证据核验与角色/评分流程。

网关不保证 Google 实际搜索词和搜索次数，groundingQueries 不写入、groundingCountSource=unknown；引用数量和用户查询都不能代替搜索次数。paidSearchCredits 保留既有适配器逻辑单位，不据此声称网关实际搜索用量或费用；真实上游收据沿原计费链保存。保留原始网关响应，恢复快照按原规则排除 rawResponse。

缺少引用、空正文、截断、内容过滤或非法响应均归为 invalid-response，保留调用次数、延迟和不可重试标记，不采纳为完成候选。HTTP 认证失败不重试，错误文字不再附带上游正文；其余既有瞬时失败策略保留。

恢复契约升级至 discovery-request-v5-gemini-openrouter-native，依赖摘要包含真实网关连接、账号密钥摘要及规范化模型。旧契约或账号/型号变化使恢复停止并提示核对已付费工作，不自动重放。旧任务和收据未改写。

## 验收

- 9 文件 87 项本地测试通过：两个入口、网关认证/隐私参数、有效引用、未知次数、候选数量、截断和缺失引用拒绝、错误脱敏、恢复依赖、去重、空结果、搜索门槛及付费归属回归。
- TypeScript 与聚焦 lint 通过；生产构建结果及部署结果见下方记录。
- 无新增付费模型请求、私有资料外发、邮件发送或正式评分发布。真实网关搜索与候选质量尚未验收。

剩余：旧 text-embedding-v4 远程向量的兼容迁移；旧数据及 v3 指针保留。旧意图依 MODESEL-15 继续停用，未切换 RAG 主路。

部署：生产构建通过，三类任务 queued/running 均为空后重载 Next、LangGraph、主 Agent 与 lead-workflow worker。3018 和 2024/ok 返回 HTTP 200，四项错误日志为空。显式代理设置未变，未启用 TUN，未恢复历史任务。
