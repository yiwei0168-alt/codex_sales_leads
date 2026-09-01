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

## D009：Installer

- 地方/区域Installer以Google Places Local为核心；全国、多地区或专业Installer以SearchAPI Google为核心。
- Brave和SearchAPI Bing按索引缺口补充；Exa只处理案例和专业服务页面缺口。
- Gemini Full和Product Gemini不固定调用；复杂任务使用Gemini Full时不再固定调用SearchAPI Google。
- 使用Installer专用DeepSeek V4 Flash轻量门禁。
- 只安装客户指定设备仍可通过角色门禁，采购影响由后续评分处理。
- Installer与SI/MSP共享实时候选注册表、官网内容和任务租约。
- Tavily只在统一证据阶段执行搜索和Extract。

状态：确认。

## D010：ISP / WISP / 区域电信

- ISP分为战略型/全国型/复杂运营商与区域ISP/WISP两条搜索轨道。
- 战略轨道以专用Gemini Full式规划搜索为核心；不调用Product Gemini，也不固定调用SearchAPI Google。
- 区域轨道以SearchAPI Google和主管机构/运营商名录等权威来源为核心；Places Local只补地方覆盖或本地实体缺口。
- Brave和SearchAPI Bing按异构索引缺口调用；Exa只补技术、CPE、网络和专业页面。
- 权威HTML/PDF在统一证据阶段做价值门禁和分级提取，候选写入同一注册表，不建立独立补证或评分流程。
- 使用ISP专用DeepSeek V4 Flash轻量门禁，区分实际运营商与代理、零售、比较网站、施工商和纯Hosting公司。
- 搜索阶段只结构化记录品牌、集团、法律实体、区域运营主体等疑似关系和来源，不做深入关系、采购主体或最终归并判断。
- 后续证据与角色Agent核实关系，确定性程序再完成实体合并、运营/采购主体选择与计数。
- ISP与其他轨道共享候选注册表、公共证据和任务租约；Tavily只在统一证据阶段工作。

状态：确认。

## D011：Agent / Manufacturer Representative

- Agent作为独立候选主角色，不并入Distributor、Reseller或咨询公司。
- 该类别默认关闭；只有用户明确要求搜索Agent销售线索时才加入搜索计划，不能用于给其他类别凑数。
- 默认以SearchAPI Google精确查询和行业协会/商业代理/品牌代表等权威名录为核心。
- Product Gemini不调用；Gemini Full只处理模板难以表达的复杂多条件任务，调用后不固定重复SearchAPI Google。
- Brave和SearchAPI Bing只补索引，Exa只补品牌代理、territory和portfolio等专业关系页面。
- Places不作为核心，仅在用户明确要求本地代理且存在地区缺口时调用并经过Agent专用Flash门禁。
- 门禁区分目标行业销售代理与Distributor、Reseller、咨询顾问，以及房地产、保险、招聘、旅行、物流报关和AI Agent等歧义类别。
- 搜索阶段只结构化记录疑似代表品牌、地区、行业和代理模式；协议真实性、排他性、库存和采购关系由后续证据与角色Agent核实。
- Tavily只在统一证据阶段工作；同一公司只补证和评分一次。
- 数量任务通过合法行业词、当地法律角色词、名录和地区批次扩展，不用错误类别凑数。
- Agent规模只在Agent同类内比较，不因缺少库存、仓库或下级渠道而天然低于Distributor。

状态：确认。

## D012：OEM/ODM客户机会

- OEM/ODM不是公司主角色，而是显式启用的销售机会搜索目标和潜在合作路径；候选保留其实际主角色。
- 本产品只搜索可能采购Cudy定制/白牌方案的客户，不搜索为Cudy提供设计、制造或供应服务的OEM/ODM供应商。
- SearchAPI Google先召回可精确表达的机会信号；Gemini Full仅补普通查询无法解决的复杂语义或隐性机会缺口。
- Product Gemini和Places不调用；Brave、Bing和Exa只按异构索引或专业页面缺口调用。
- Tavily和PDF正文提取只在统一证据阶段工作。
- 使用OEM/ODM机会专用Flash门禁；不能解决的商业关系进入`hold`，不在门禁升级高能力模型。
- 搜索只保存固定类型的显式/间接机会信号、来源、疑似实体关系和缺失证据，不输出Confidence、最终角色、路径或分数。
- 后续证据与角色Agent核实信号和公司主角色，按主角色执行统一评分；路径Agent独立决定是否生成OEM/ODM路径。
- 不建立OEM/ODM第二套总分，不把路径适配度重复叠加到100分总分；规模仍在同一主角色内比较。
- 数量按去重公司计，方向错误、只有泛化关键词或无采购控制的候选不能凑数；连续两个批次/provider无有效增量时停止。
- 搜索、补证和评分完成后回写每个provider的有效机会信号、最终采用、成本、延迟、重复和丢弃原因。

状态：确认。
