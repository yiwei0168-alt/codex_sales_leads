# 混合搜索策略决策记录

本文只记录已经与用户逐项讨论并确认的规则。日期均为2026-09-01。

## D001：全局搜索与下游边界

- 搜索策略必须永远适配后续补证、角色、评分、路径和开发工作流，不能产生provider专属的重复流程。
- 同一公司跨工具实时去重，只进入一次补证和评分。
- 搜索阶段不生成最终角色、分数、合作路径或开发内容。
- 相同搜索引擎且机制相同的工具默认不重复，除非存在可说明、可度量的特别能力增量。

状态：确认。

## D002：用户数量与停止条件

- 用户可以明确要求50家或100家；数量作为任务交付目标。
- 默认统计去重后的`eligible + 可展示research-required`；明确要求“已验证”时只统计`eligible`。
- `invalid`或重复实体不能凑数。
- 未达目标但连续两个不同批次/provider没有新增价值且无剩余可解决缺口时停止，报告实际数量和差额。
- 正式产品不以Top-N作为模型升级依据。

状态：确认。

## D003：轻量搜索门禁

- 采用确定性过滤、官网轻量抓取和DeepSeek V4 Flash批量语义门禁。
- 不使用Kimi或DeepSeek Pro执行候选门禁。
- 不确定候选进入`hold + Limited补证`，不直接判低分或无效。
- 门禁只输出紧凑语义字段和reason code。
- 官网轻抓取写入公共证据库，下游必须复用。

状态：确认。

## D004：Distributor / VAD

- 专用Gemini Full式规划搜索为核心。
- 不调用Product Gemini。
- Brave为第一异构索引补充，SearchAPI Bing和Exa按缺口调用。
- Google Places不用于一级分销主发现。
- Tavily移出常规发现层，统一用于证据获取；partner locator等来源型发现也在该层一次完成并复用。

状态：确认。

## D005：Reseller / VAR / DVAR

- 与Retailer/E-tailer拆分查询模板和结果通道。
- 全国/线上B2B轨道使用Product Gemini；此轨道不调用Gemini Full。
- 地方/区域轨道使用Google Places Local。
- 大数量任务可分批运行两轨，但实时去重，不固定全并行。
- Brave、SearchAPI Bing按索引缺口补充，Exa只处理专业语义页面缺口。
- Places候选先过轻量门禁；Tavily只在证据阶段工作。

状态：确认。

## D006：Retailer / E-tailer

- E-tailer以SearchAPI Google商品和购物意图查询为核心；Brave、SearchAPI Bing逐级补充。
- Product Gemini仅用于无法用精确查询表达的复杂语义条件，不与SearchAPI Google固定并行。
- 地方Retailer优先Places Local；全国连锁优先SearchAPI Google；只有另一类数据缺口时才组合。
- 默认合并同一集团门店；门店只作为覆盖证据。
- 消费者业务是合法目标，但必须有相关网络产品和真实销售能力。
- 纯第三方Marketplace或个人卖家不进入主候选池；有自营采购控制的平台可以进入。
- Tavily只在统一证据阶段工作。

状态：确认。

## D007：SI / MSP

- 一个候选类别，两条搜索轨道：全国/复杂项目与地方/SMB。
- 全国轨道以专用Gemini Full式规划搜索为核心；不调用Product Gemini，不固定调用SearchAPI Google。
- 地方轨道以Google Places Local为核心。
- Brave和SearchAPI Bing补索引，Exa只处理案例、solution和managed service页面缺口。
- Tavily只在统一证据阶段工作。
- 使用SI/MSP专用Flash轻量门禁。
- 两轨实时反馈和去重，避免对同一公司启动重复补证或评分任务。
- 搜索数量和轨道占比由用户目标决定，不设固定配额。

状态：确认。

## D008：真实贡献记录

- 后续真实搜索测评必须记录每个搜索环节各工具的发现贡献。
- 补证、角色和评分完成后，必须把真实质量结果回写到每个provider的候选来源记录。
- 记录独有候选、共同发现、门禁通过、证据可用、最终角色、最终分数、用户展示/选择和实际下游采用。
- 同时记录token、API credits、延迟、重试、丢弃原因和每个有效候选成本。

状态：确认并纳入测量规范。
