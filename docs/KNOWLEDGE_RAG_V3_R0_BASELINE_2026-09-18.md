# KQ04 RAG v3 R0：真实失败与评测基线

日期：2026-09-18。状态：R0 部分完成；不构成 R1–R7 或 v3 发布验收。

## 完成内容

- 评测合同升级为 `knowledge-eval-v3-baseline`：300 条，250 条基础、50 条边界，development/validation/holdout 分别 190/60/50；同一产品对的 `sourceGroup` 只出现在一个集合。
- 基础集使用 50 个实际目录型号种子；“WR3000和WR6500H的区别”是唯一一条该型号对回归，没有答案特判。
- 离线评测实际执行知识动作、精确实体、属性和比较模式解析。增加“区别、差异、不同、对比、比较、versus、vs、difference”，无显式属性时选择 `category-default`。
- `KnowledgeRequest` 增加解析实体/版本、比较模式和 profile；ACL 范围内的实体 ID 仍留给 repository 解析。
- 新增 `knowledge:diagnose`，只输出查询哈希、解析元数据、事实聚合与候选 ID/rank，不输出查询正文或知识正文，不调用外部模型。
- 官方 Docling Skill 已从 `docling-project/docling` 安装为开发指引；本轮未安装产品 Python 运行依赖、未下载模型、未处理正文。

## 验证结果

- 300/300 顶层知识路由；250/250 基础动作；250/250 基础实体；300/300 全部实体。
- 50 条边界的动作匹配 20 条，30 条上下文、未知实体、无实体术语或权限语义差异保留为后续实现输入。
- 答案和精确来源坐标经人工复核的 gold 为 0；因此不能声称已经有 300 条真实答案 gold。
- 查询 `WR3000和WR6500H的区别` 解析为两个实体、`compare-facts`、`default-profile/category-default`。真实只读数据库诊断的 verified/conflicting 事实、旧 `knowledge_chunk` 词法候选和活动结构化代词法候选均为 0。Qwen/BGE dense 均未运行。
- 聚焦 14 项测试、TypeScript 和离线评测通过。所有模型、embedding、搜索、SMTP 调用、tokens、API credits、现金成本和重试为 0。

## 未完成边界

R0 的人工答案/引用 gold、至少 50 型号的来源坐标审阅仍未完成。R1 Docling 30 份试点、R2 v3 schema/全量抽取、R3 事实、R4 双向量、R5 生产检索、R6 UI/复核、R7 全量门禁/切换均未完成。v2 继续服务；本阶段没有数据库写入、release 激活或付费授权。
