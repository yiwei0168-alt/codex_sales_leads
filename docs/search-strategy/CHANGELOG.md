# 混合搜索策略版本记录

版本采用`主版本.类别确认数.规则修订`的文档化语义。进入生产实现前使用`discussion`状态；生产路由上线后再发布稳定版本。

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
