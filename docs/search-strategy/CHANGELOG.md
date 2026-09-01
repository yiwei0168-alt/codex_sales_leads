# 混合搜索策略版本记录

版本采用`主版本.类别确认数.规则修订`的文档化语义。进入生产实现前使用`discussion`状态；生产路由上线后再发布稳定版本。

## 1.0.0 - 2026-09-01

- `main@6c4a1ea`将确认的类别路由接入生产LangGraph发现节点，策略状态改为`active`。
- 增加小批次多provider执行、共享实时去重、质量池和连续两批无价值停止。
- 增加有边界的官网轻抓取与DeepSeek Flash最小门禁；程序决定pass/hold/reject，禁止Pro升级。
- Tavily从生产候选发现移除，仅保留统一定向补证和Extract职责。
- 完成逐调用、逐occurrence和最终评分/展示/下游采用的贡献回写闭环。
- 数据库迁移033已应用；286项测试、类型检查、文档校验、生产构建通过。
- 真实成本与质量仍为`not-observed`，等待首次正式策略1.0.0运行。

## implementation-checkpoint-3 - 2026-09-01

- `main@6c4a1ea`完成混合执行器、轻量门禁、生产接线和贡献回写。
- 发布端到端工作流定义2.1.0及同步效率台账。
- provider配置预检全部通过，但未以预检名义产生付费搜索调用。

## implementation-checkpoint-1 - 2026-09-01

- `main@a4dfdcd`完成Agent、Brand Owner和OEM/ODM显式意图门禁。
- 增加版本化混合搜索路由配置及Schema，但保持`draft`，未提前替换生产发现层。
- 增加Brand Owner/Agent角色评分卡和历史v3工具榜隔离边界。
- 全量270项测试、TypeScript、ESLint和端到端文档校验通过。

## implementation-checkpoint-2 - 2026-09-01

- `main@e8613e6`增加六类生产搜索provider适配器和Google/Bing引擎区分。
- 增加跨工具实时候选注册表及首次/辅助发现记录。
- 增加provider调用与candidate occurrence数据库贡献Schema。
- 模块保持未激活，真实搜索成本和质量记为`not-observed`。
- 全量280项测试、TypeScript、ESLint和端到端文档校验通过。

## 0.9.0-discussion - 2026-09-01

- 确认Brand Owner / Product Company为正式、显式启用的候选主角色。
- 明确Brand Owner与Distributor、Retailer、ISP及OEM制造供应商的角色边界。
- 复用OEM/ODM分级搜索工具链和一次Flash调用，分别生成角色状态与机会状态。
- 新增Brand Owner专用轻量门禁和统一100分下的角色评分卡。
- 取消Other泛化候选搜索类别；未决角色使用`research-required + role-unresolved`。
- 保留“其他合作模式”作为路径类型，并确立新主角色的版本化扩展规则。
- 完成当前全部候选类别和机会搜索目标的逐项讨论，生产代码仍待按确认方案实施。

## 0.8.0-discussion - 2026-09-01

- 确认OEM/ODM是显式启用的客户机会搜索目标和潜在合作路径，不是公司主角色。
- 明确产品只搜索可能采购Cudy定制/白牌方案的客户，完全排除面向Cudy的制造供应商寻源。
- 采用SearchAPI Google精确召回、Gemini Full条件式语义升级的分级搜索架构。
- 明确Product Gemini、Places、Brave、Bing、Exa、Tavily及PDF提取的职责边界。
- 新增OEM/ODM机会专用Flash门禁、固定信号Schema及搜索到路径/开发Agent的数据流。
- 继续按候选实际主角色评分，不建立第二套总分或重复路径加分。
- 新增机会信号的数量、停止条件、真实贡献和下游采用回写要求。

## 0.7.0-discussion - 2026-09-01

- 确认Agent/Manufacturer Representative为独立候选主角色及独立搜索策略。
- Agent默认关闭，只有用户明确要求搜索该类销售线索时才启用，不能用于给其他类别凑数。
- 默认采用SearchAPI Google精确查询和权威代理名录；Product Gemini不调用，Gemini Full仅处理复杂多条件任务。
- Brave、Bing、Exa和Places只按各自明确缺口条件调用。
- 新增Agent专用Flash门禁，以及搜索阶段与下游商业关系核实的职责边界。
- 确认Agent规模仅在同类中横向比较。

## 0.6.0-discussion - 2026-09-01

- 确认ISP战略型/全国型与区域ISP/WISP双轨策略。
- 战略轨道采用Gemini Full式规划搜索，区域轨道采用SearchAPI Google和权威来源。
- Places、Brave、Bing和Exa仅按地方覆盖、异构索引或专业技术页面缺口调用。
- 新增ISP专用Flash轻量门禁，区分运营商、代理、零售、比较网站、施工商和纯Hosting公司。
- 权威HTML/PDF统一进入证据阶段，按价值门禁和分级提取方案复用。
- 明确搜索阶段只记录疑似实体关系，不深入判断；后续Agent核实，确定性程序归并和计数。
- ISP与其他轨道共享候选注册表、公共证据和任务租约，Tavily继续只用于证据阶段。

## 0.5.0-discussion - 2026-09-01

- 确认Installer地方/区域与全国/专业双轨策略。
- 地方轨道采用Places Local，全国轨道采用SearchAPI Google。
- Brave、Bing和Exa只按索引或专业页面缺口调用。
- 确认Installer专用Flash门禁，以及安装客户指定设备不构成角色拒绝。
- Installer与SI/MSP共享候选注册表、官网内容和任务租约。
- Tavily继续统一归入证据阶段。

## 0.4.0-discussion - 2026-09-01

- 确认SI/MSP全国/复杂项目与地方/SMB双轨策略。
- 增加双轨小批次实时反馈、共享候选注册表、任务租约和去重约束。
- 全国轨道采用Gemini Full式规划搜索；地方轨道采用Places Local。
- 明确Brave、Bing、Exa和Tavily的条件式职责。
- 新增真实搜索贡献和下游质量测量规范。

## 0.3.0-discussion - 2026-09-01

- 确认Retailer与E-tailer独立模板和机制。
- E-tailer采用SearchAPI Google商品/购物意图核心，Brave和Bing逐级补充。
- Retailer按地方门店或全国集团分别选择Places Local或SearchAPI Google。
- 确认集团/门店归并、自营Marketplace和消费者目标规则。
- 确立“相同引擎及机制默认不重复”的全局原则。

## 0.2.0-discussion - 2026-09-01

- 确认B2B Reseller/VAR/DVAR与零售电商拆分。
- 全国/线上B2B使用Product Gemini，地方/区域B2B使用Places Local。
- 确认Places候选的确定性过滤、官网轻抓取和Flash语义门禁。
- 确认门禁不升级Pro，未知进入Limited补证。

## 0.1.0-discussion - 2026-09-01

- 确认Distributor/VAD以专用Gemini Full式规划搜索为核心。
- 删除同任务Product Gemini重复调用。
- Tavily从常规发现层移动到统一证据层。
- 确认用户数量目标、非Top-N生产触发和连续无增量停止规则。
- 确认所有provider统一去重、同一公司只评分一次。
