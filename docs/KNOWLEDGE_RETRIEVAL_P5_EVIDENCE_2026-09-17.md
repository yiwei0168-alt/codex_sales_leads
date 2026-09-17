# KQ01 P5 — 共享 LangGraph 知识工作流验收

日期：2026-09-17。状态：已实现并通过离线回归；真实供应商语义与真实用户采用仍未知。

## 实现结果

- 新增独立 `knowledge_workflow` 根图和可展开 `knowledge_business_flow`：请求分类后分别进入受控原件、已验证事实或复杂解释分支。
- 助手与知识页共用同一知识图；知识页 API 通过独立 LangGraph SDK 调用，不在 Next.js 内保留第二套 runner。
- 原文件只返回受控 asset 链接并执行 owner/shared ACL；唯一 verified 事实使用模板直答。二者均不要求 embedding 或回答模型配置。
- 冲突、歧义、缺实体/属性和无唯一 verified 事实返回稳定 `reasonCode`，不猜版本、不使用 candidate/rejected 事实。
- 复杂解释保留原 RAG 合同；混合研究仍只把原有 disclosure 筛选后的公开证据交给外部综合模型。
- 资料链接、事实引用、结果类型与原因写入助手消息 metadata 和知识页响应，刷新后可继续渲染。
- Kimi 意图合同增加知识动作/实体/属性提示，但服务端仍按注册表、实体库和 ACL 校验；没有型号专用分支。

## 验证与效率

针对性回归 8 文件、50 项通过；typecheck 通过；lint 0 error、11 个既有 warning。xray 显示助手内嵌四个真实知识节点，独立知识根图也公开校验、三分支和发布节点。离线输入 50 项断言，有效及下游使用 50；资料/事实模拟成功路径 embedding 和回答生成均为 0。provider token、API credit、现金成本、搜索、SMTP 和付费重试均为 0；Vitest 3.64 秒。真实用户采用未知。P6 继续优化复杂解释的召回和证据窗口。
