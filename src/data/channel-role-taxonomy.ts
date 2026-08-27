import type { KnowledgeDocumentInput } from "@/lib/rag/types";

const content = `# 销售线索候选公司角色分类标准

## 使用范围与字段边界

本标准用于网络与 IT 硬件销售线索搜索、候选公司分类、证据审查和结果解释。角色（channel role）、渠道层级（channel layer）、与 Cudy 的关系状态（relationship status）和商业价值等级（account tier）必须分开判断；不能用其中一个字段替代另一个字段。

- channel role 描述公司在交易链条中实际承担的功能，允许一家公司同时拥有多个角色。公开证据无法证明各业务占比时，不要求也不应强制选择 primary role。
- channel layer 描述其位于一级分销层还是下级渠道层。
- relationship status 描述其是待开发候选、已验证现有伙伴或其他关系；“Distributor”本身不表示已经与 Cudy 合作。
- account tier 是对下级渠道客户商业价值的分级。KA 只适用于 Downstream Channel 中的客户，不适用于 Distributor（一级代理商）或 VAD。

## 跨角色确认规则

### KA 适用边界

KA 是商业价值等级，不是渠道角色。仅当候选公司已被归入 Downstream Channel，且其本身是下级渠道客户时，才可根据商业价值评为 KA。Distributor（一级代理商）和 VAD 无论规模或战略价值多高，都不得标记为 KA；它们的价值应使用独立的一级渠道评价维度表达。

### Commission Agent 独立候选类型

佣金型 Agent 不属于 Distributor。Agent 通常代表委托方促成交易、通过佣金或代理服务费获得报酬，并且通常不取得货物所有权、不承担进销差价及主要库存风险。Agent 具有独立商业价值，应作为单独的候选公司类型纳入搜索体系；其完整定义、证据、边界及独立价值分级见下文已确认的 Commission Agent 角色。Agent 不适用下级渠道客户的 account tier／KA，应使用 agent_potential_tier。

### Cudy 销售线索的 Networking 相关性准入门槛

角色分类与 Cudy 销售线索准入必须分开判断。候选公司可以真实属于 SI、Installer、VAR、MSP 或其他渠道角色，但只有公开证据明确显示其实际销售、分销、选型、采购、设计、安装、部署、运营或维护主动网络设备，或者实施直接需要主动网络设备的 WLAN／LAN 项目时，才能通过 networking relevance 准入门槛。

主动网络设备包括路由器、网关、4G／5G CPE、无线 AP、Mesh、WLAN 控制器、Ethernet／PoE 交换机、Modem、室外无线及点对点无线设备和相关管理或安全能力。可通过准入门槛的强证据包括：候选公司官网或目录中的具体产品及在售页面；明确的分销或转售说明；明确承担 WLAN／LAN 设计、选型、BOM、采购、部署或运维；Omada、UniFi／Ubiquiti、MikroTik、D-Link、Ruckus、Aruba 等相关品牌伙伴关系；以及可验证的相关项目案例。

IT infrastructure、cloud connectivity、edge infrastructure、digital transformation、managed IT、IP solutions、system integration、network consulting、data center、broadcast IP、IT procurement 等泛化表述不能单独证明 networking relevance，必须同时出现具体产品、品牌、项目或业务动作。纯结构化布线、铜缆、光纤或弱电施工可以证明 Installer 角色，但在没有 AP、路由器、交换机或其他主动网络设备的选型、采购、安装或维护证据时，不通过 Cudy 销售线索的 networking relevance 门槛。

Networking relevance 只判断是否实质参与主动网络设备业务；product and use-case fit 继续独立判断其产品和场景与 Cudy 的接近程度。例如企业级网络安全 VAD 可以通过 networking relevance，但如果产品与 Cudy 的 SOHO／SMB 产品线重叠有限，product fit 仍可为低分。没有检索到主动网络设备证据时必须记录为“未证明／not demonstrated”，不能写成公司事实上“没有”或“无关”；在本产品当前搜索和测评中，“未证明”仍不能通过该项准入门槛。

### 证据来源、主体一致性与长尾单来源规则

证据充分性是质量门槛，不是机械的页面数量门槛。公司真实性、目标市场经营、Networking relevance、渠道角色和合作路径必须分别绑定到支持该判断的具体 URL 和原文摘录；一段泛化公司简介不能自动证明所有字段。搜索引擎摘要、搜索工具生成的 provider summary 和模型生成的公司总结只用于发现候选，不能单独作为事实证据。

候选公司名称、声称的官网域名和证据所指向的经营主体必须一致。提供了错误官网、证据属于同名公司或没有证据能够把声称的官网与候选主体对应起来时，sufficient evidence 不通过，应先纠正公司身份与官网。相同来源的多个页面、镜像转载、重复摘要和实质相同的摘录只按一份证据计算。

证据优先使用品牌方或候选公司官网的具体页面、品牌伙伴名录、政府或监管记录和可验证的官方 Marketplace 店铺，其次使用官方 LinkedIn 公司页、Google Business、行业协会及其他可审计公共来源。LinkedIn 官方公司页属于可用的一方公司资料，但可靠性通常低于公司自有官网。新闻、商业目录和数据商可以辅助验证；目录标签、搜索摘要或模型总结不能替代具体业务证据。

一条内容具体、主体明确的公司自有官网页面可以达到基本证据门槛，不要求为了数量重复寻找相同结论。没有直接官网证据的普通候选公司，原则上需要两个非重复的公共来源相互支持，或者继续标记为待核验；交叉验证的强度同时影响 evidence reliability，但不得用页面数量代替来源质量。

对长尾线索中的小公司放宽证据数量门槛，不要求多个独立证据交叉验证。只要一条来源能够明确对应经营主体，并具体展示相关产品、品牌、官方店铺、项目、安装服务或其他真实业务动作，即可通过基本证据门槛；来源可以是官方 Marketplace 店铺、官方 LinkedIn／社交公司页面、Google Business 类经营页面或其他具体且可审计的公共资料。该例外只降低准入所需的来源数量，不降低主体一致性、内容具体性、Networking relevance 和角色证据要求，也不会自动获得更高的 evidence reliability 分数。

小型长尾证据档案必须由系统根据非发现性证据确定，不能由模型自行声明，也不能用商业价值字段 accountTier=Long-tail 触发。confirmed-small-long-tail 需要一项直接的小型公司证据（明确 1–49 名员工、个体／独资经营形式或明确的微型企业身份）和一项长尾公开信息形态；probable-small-long-tail 需要至少两种不同的正面结构性信号（例如业主直接经营、明确的小团队、明确的有限经营地点、本地／区域服务范围、官方小型店铺或 Marketplace 经营页面）以及一项长尾信息形态。同一条主体明确的来源可以同时提供多个信号，这不构成多来源要求。

官方 Marketplace／平台经营页、Google Business 类页面、本地或区域经营表述、以及分散但可审计的公开经营足迹可以构成长尾信息信号。明确 250 人以上、全国性大型分支网络或大型企业集团足迹会覆盖小型长尾例外。搜索结果少、SEO 弱、网站简单、流量低，或者没有公开员工、营收、仓库和品牌信息，都不能单独或组合证明公司规模小；正面证据不足时必须保留为 standard／unknown。该档案只控制单来源准入例外，不参与产品匹配、角色、合作路径或证据可靠性评分。

### 合作路径证据与评分上限

合作路径评分衡量候选公司在实际合作中对采购、产品上架、订货、报价、选型、BOM、品牌推荐、部署或持续运营的可验证控制与影响，不等于渠道角色、Networking relevance 或公司规模。角色成立只能证明公司“是什么”，不能自动证明品牌可以怎样与其合作。

合作路径采用证据上限：没有明确证据证明任何采购、上架、报价、选型、BOM、品牌推荐或部署控制时，最高为 2；明确证明一项合作杠杆时最高为 3；证明两项或以上互补杠杆、但没有形成正在发生或完整可重复的路径时，最高为 4；只有证据证明正在发生的交易、产品上架、直接采购路径，或者完整且可重复的合作链时，才可为 5。

不同渠道使用不同路径证据：一级渠道重点验证品牌准入／直接采购／进口以及向下级 Reseller、Dealer、SI 或 Installer 的持续供货；B2B 转售重点验证采购、实际产品上架或订货、报价和品牌／产品推荐；项目服务重点验证设计、规格、BOM、品牌或产品选型、采购和部署责任。ISP／MSP 等运营型候选应验证设备选型或采购与部署、运营责任的组合。

明确只安装客户自备设备的 Installer，合作路径最高为 2。未公开采购来源、品牌选型权或 BOM 信息必须记录为 unknown，不能写成公司事实上没有这些能力；但未证明的能力也不能用于支持更高分。公司规模、员工数、营业额、覆盖范围或网站流量不能提高合作路径分数。

候选公司官网存在正在销售 Cudy 产品的具体页面、价格、SKU、库存或订购入口，可以作为实际合作路径已经成立的强证据；但“现有客户／现有伙伴”关系标签本身不加分，不能替代公开交易证据。合作路径 5 分仍必须来自可审计的实际业务路径，而不是关系状态字段。

### 多角色集合与搜索通道成员资格

候选公司可以同时记录多个由公开证据支持的角色，不要求为测评或产品输出强制选择一个 primary role。公开资料通常只能证明公司确实经营某类业务，不能可靠证明每类业务的收入、订单、员工或战略占比；系统不得根据网站篇幅、搜索排名、页面数量或模型印象推断“主营业务”或角色占比。

搜索通道准入采用成员资格判断：无论候选公司还具有哪些角色，也无论哪项业务占比更高，只要证据能够证明它确实经营提交通道允许的至少一种业务，该通道的角色准入就通过。同一候选公司可以因为不同的真实业务分别符合多个通道，但每个通道都必须有支持该项业务的对应事实证据，不能用另一角色或另一业务线的证据替代；长尾小公司的单来源规则继续适用。

一级渠道需要证明实际向下级渠道供货，或者具有明确的 Distributor／Wholesaler 身份；直接向品牌采购但服务最终客户不能据此进入一级渠道。VAD 必须同时满足 Distributor 条件和实质性技术增值，技术能力不能弥补下级渠道供货证据的缺失。

B2B 转售需要证明实际采购或转售产品。VAR 必须同时具有面向最终客户的实际转售和实质性技术增值；只有项目设计、集成或咨询但没有产品转售证据时，可以属于 SI，但不能仅凭技术能力确认 VAR。直接品牌采购的最终客户型增值转售商继续记录为 VAR／DVAR，而不是 VAD。

项目服务中，SI 需要承担方案、架构、组件协同、集成或整体项目结果；Installer 需要承担实际安装结果。只执行既定安装工作可以确认 Installer，但不能确认 SI。公司同时转售产品、设计方案并执行安装时，可以同时记录 Reseller／VAR、SI 和 Installer，只要每个角色都有相应证据。

证据只提示某角色、但没有证明该角色的定义性业务动作时，可以保留为 possible role／待核验角色，不通过相应通道准入。测评中的角色准确度改为“提交通道成员资格是否成立”，不再评价模型是否选择了唯一 primary role。

# 已确认角色

## Distributor（一级代理商）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：一级代理商／一级分销商。
- 英文规范名称：Distributor；当需要明确层级时使用 Tier-1 Distributor。
- 所属角色家族：distribution。
- channel layer：Tier-1 Distributor。

### 完整定义

Distributor 是以自身商业主体身份从品牌方、制造商或其授权上游采购产品，再向经销商、Reseller、VAR、SI、Installer、Retailer、E-tailer、MSP、ISP 等下级渠道伙伴进行转售或供货的公司。它处于品牌方与下级渠道之间，核心价值是组织并扩大间接销售渠道，而不是主要向最终消费者完成零售交易。

典型能力包括进口与合规处理、采购、库存或订单履约、物流、授信与融资、报价和结算、渠道招募与管理、产品培训、售前支持、市场拓展及联合营销。候选公司不需要公开证明其具备上述全部能力；这些能力用于增强判断置信度，而非逐项硬性准入。

### 必要判断条件

在公开证据足够的情况下，至少需要同时支持以下两项判断：

1. 公司以买方和转售方的商业身份经营相关产品，或者被品牌方／制造商明确列为 distributor、authorized distributor、wholesaler 等同类身份；
2. 其主要或具有战略意义的客户对象包含下级渠道伙伴，而不只是终端消费者或最终使用产品的企业。

如果只能确认公司销售产品，但不能确认其向下级渠道供货，则不能仅凭“产品丰富”“价格批发”或网站规模将其判定为 Distributor。

### 强证据与辅助证据

强证据按优先级包括：品牌方或制造商的官方 distributor locator／合作伙伴名录；候选公司官网明确自述 authorized distributor、technology distributor、wholesaler；面向 reseller／dealer 的开户、价格、订货或合作伙伴门户；可验证的下级渠道招募、授信、培训、售前支持或渠道营销项目。

辅助证据包括：进口记录、仓储与物流能力、区域覆盖、B2B 交易条款、批量采购、库存目录、履约能力以及多个品牌的分销授权。多个相互独立的辅助证据可以提高置信度，但不能掩盖商业身份或客户对象不清的问题。

### 仓库与备货规则

实体仓库、公开库存和本地备货是 Distributor 的强正面证据，但不是绝对必要条件。没有搜索到此类信息可能是公司未公开披露，也可能采用直发、第三方履约或轻库存模式。系统应把该项记录为“未知／未披露”，不得直接当作“不具备”，更不得仅因缺少该项而排除候选公司。

### 排除与边界

- Commission Agent：仅撮合交易、代表委托方行动、按佣金收费且通常不取得货权的主体，应分类为独立 Agent，而不是 Distributor。
- Retailer／E-tailer：主要面向最终消费者完成门店或在线零售交易的公司，不因销售多个品牌就成为 Distributor。
- Dealer／Reseller／VAR／SI／Installer／MSP：主要从上游采购后服务最终客户、交付项目或提供增值服务的下级渠道，不应仅因其也做 B2B 销售而判为一级代理商。
- Marketplace／目录站／比价站：仅提供第三方挂牌、流量或信息聚合，且不承担实际买卖与渠道供货职能的主体，不是 Distributor。
- Manufacturer／Brand：主要制造或拥有品牌的公司不因向渠道销售自有产品而自动成为 Distributor；只有其另有可验证的第三方分销业务时才可多角色标注。

### 多角色与通道成员资格

同一公司可以兼有 Distributor、VAD、Retailer、E-tailer 或其他角色。只要向下级渠道供货是可验证的真实业务，就可以记录 Distributor 并通过一级渠道成员资格，不要求证明它在公司全部业务中占比最高。若证据只支持下级转售或终端零售，则只能保留相应角色，不能确认 Distributor。

### 信息缺失与置信度

公开信息缺失必须与否定证据区分：“未找到仓库”“未找到授权页”只能记录为 unknown，不能写成“无仓库”或“无授权”。当商业身份、客户对象或渠道层级仍不清楚时，允许保留 Distributor candidate／待核验状态，并明确下一步需要核实的证据，不得为了填满分类而强制确定角色。

## VAD（Value-Added Distributor）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：增值型一级代理商／增值型一级分销商。
- 英文规范名称：Value-Added Distributor（VAD）。
- 所属角色家族：distribution。
- channel layer：Tier-1 Distributor。
- 角色关系：VAD 是 Distributor 的专业化子类型；标记 VAD 时必须同时标记 Distributor。

### 完整定义

VAD 是满足全部 Distributor 基础条件，并在普通采购、转售、物流和结算之外，向渠道提供可重复交付的专业技术、解决方案或渠道赋能能力的一级代理商。它通常具有较强的公司规模、采购能力和资金能力，能够达到品牌方对直接采购合作伙伴设置的规模要求及单笔订单 MOV（Minimum Order Value）要求，因而能够直接从品牌方或制造商采购，再向下级渠道供货。

VAD 的增值能力可以包括专职售前工程师或解决方案架构师、产品选型和方案设计、Demo／实验室／PoC、兼容性测试、配置与预集成、厂商认证培训、渠道技术培训、二线技术支持、售后支持、专业服务以及跨品牌解决方案组合。普通物流、融资、订货、基础市场活动或一般产品培训本身不足以证明 VAD；必须存在可验证的实质性技术或解决方案能力。

### 与 VAR 的核心边界

在本产品的业务分类中，VAD 与 VAR 的首要边界是采购层级及支撑该层级的规模和采购能力，而不是两者是否都提供“增值服务”。

- VAD 通常规模较大、购买和资金能力较强，能够满足品牌的直接合作及单笔订单 MOV 要求，主要直接从品牌方或制造商采购，因此属于一级渠道。
- VAR 通常规模及单次采购能力相对较弱，更可能从 Distributor／VAD 采购，再向最终客户转售并提供方案、集成、配置或其他增值服务，因此属于下级渠道。
- 候选公司的官网自述、公司定位以及品牌方对其身份的官方说明是重要判断依据。公司明确将自己定位为 value-added distributor、specialist distributor 或 VAR／solution provider 时，应结合其他证据优先采用其真实业务定位。

“规模大”是判断直接采购能力的代理信号，不是独立且绝对的分类标准。员工数、营业额或网站流量不能单独决定 VAD／VAR；应尽可能验证实际采购路径、品牌授权层级、下级渠道客户、批量采购能力及渠道项目。直接向品牌采购但主要服务最终客户、没有下级渠道供货职能的公司仍属于 VAR，可进一步标记为 DVAR／direct-buy VAR；直采本身不能把 VAR 自动归为 VAD。不同国家、品牌和产品线可能设置不同的合作门槛，因此同一家公司可能在某条产品线是 VAD，在另一条产品线是 VAR，分类时应保留市场和产品线范围。

### 必要判断条件

在公开证据足够的情况下，VAD 至少应满足：

1. 已满足 Distributor 的全部基础条件，并具有直接从品牌方或制造商采购的身份或能力；
2. 主要或具有战略意义的客户对象包括 Reseller、VAR、SI、Installer、MSP 等下级渠道伙伴；
3. 具有超出普通交易、物流、融资和基础营销支持的实质性技术或解决方案增值能力。

### 强证据与辅助证据

强证据包括：品牌方官方名录明确标注 VAD／value-added distributor／specialist distributor；候选公司官网明确自述其 VAD 定位并列出下级渠道计划；可验证的品牌直接授权和一级采购关系；专职技术团队、实验室、PoC、方案设计、预集成、认证培训或二线支持服务。

辅助证据包括：公司规模与营收、采购或融资能力、较高的单笔订单能力、批量库存、多个互补品牌组合、覆盖大量 reseller／solution provider 的伙伴网络，以及面向渠道的技术活动。辅助证据用于推断其满足品牌规模与 MOV 要求的可能性，但不能取代直接身份和业务路径证据。

### 最终客户项目与多角色

VAD 可以协助下级伙伴完成面向最终客户的售前、PoC、配置、安装或售后，也可能直接参与部分项目。是否同时标记 VAR 或 SI，应根据其是否以自身名义面向最终客户承担可验证的方案销售或项目交付来判断。只要其直接品牌采购、一级渠道供货和下级伙伴赋能能够被证明，就可以记录 VAD；不要求判断这些业务在公司全部业务中的占比。

### 信息缺失与置信度

品牌直接采购合同和 MOV 往往不会公开。未检索到合同、订单或采购金额只能标记为 unknown，不能直接推断候选公司从一级代理商采购。系统应综合品牌官方身份、公司自述定位、规模和资金代理信号、下级伙伴计划及技术能力确定置信度；当证据无法区分 VAD 和 VAR 时，应保留 VAD／VAR 待核验状态，并把实际采购来源和品牌授权层级列为优先核实项。

## VAR（Value-Added Reseller）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：增值经销商／增值转售商。
- 英文规范名称：Value-Added Reseller（VAR）。
- 所属角色家族：resale。
- channel layer：Downstream Channel。
- 角色关系：VAR 是 Reseller 的增值子类型；标记 VAR 时必须同时标记 Reseller。

### 完整定义

VAR 是采购并转售 IT 或网络产品，以自身名义向最终企业、机构或其他产品使用者报价、销售或开票，并在产品之外提供具有商业意义的技术、服务或解决方案增值的下级渠道客户。VAR 通常从 Distributor／VAD 采购；规模和采购能力较强、能够满足品牌直接合作及 MOV 要求的 VAR 也可以直接从品牌方采购。

典型增值能力包括技术咨询与产品选型、网络或解决方案设计、配置与预配置、跨产品组合、集成、安装部署、迁移、培训、技术支持、维护及面向特定垂直行业的定制化方案。增值服务必须是可验证的实际业务能力，不能只根据公司名称中出现 solution、technology 或 value-added 等词语判断。

### DVAR／direct-buy VAR

DVAR（Direct Value-Added Reseller）是 VAR 的直采子型，不作为与 VAR 并列的基础 channel role。公司直接从品牌方采购，但主要销售和服务对象仍是最终客户，且没有可验证的下级渠道供货职能时，应标记为 VAR 和 Reseller，并用 DVAR／direct-buy 或 supply model = Brand Direct 表达其采购方式，不得仅因直采、规模较大或单笔订单较高而归为 VAD。

只有当候选公司同时满足直接品牌采购、向下级渠道供货及实质性增值能力三个条件时，才归为 VAD；如果主要面向最终客户交付，则无论是否直采，基础角色仍是 VAR。

### 必要判断条件

在公开证据足够的情况下，VAR 至少需要满足：

1. 公司实际采购并转售相关产品，以自身名义参与报价、合同、开票或承担产品交易责任，而不是只介绍客户并收取佣金；
2. 主要客户对象是最终企业、公共机构、教育、酒店、运营商或其他实际使用解决方案的组织；
3. 除产品转售外，具有至少一种可验证且对客户结果有实质影响的增值能力。

### 强证据与辅助证据

强证据包括：候选公司官网明确自述 VAR／value-added reseller／solution provider；品牌方或 Distributor 的官方伙伴名录将其标为 VAR；官网展示由公司承担报价、方案设计、配置、安装、部署、培训、支持或维护；可验证的最终客户项目、案例研究、技术认证及专业服务目录。

辅助证据包括：面向企业客户的产品与服务组合、垂直行业专长、技术团队、服务台、项目案例、厂商认证、客户支持条款以及从 Distributor／VAD 获得的伙伴身份。多个辅助证据可以提高置信度，但简单的产品目录、购物车或“联系我们询价”不足以单独证明 VAR。

### 与相邻角色的边界

- Reseller：仅进行产品转售、增值服务很少或无法验证时，只标记 Reseller；VAR 必须同时标记 Reseller。
- VAD：VAD 必须直接向品牌采购并向下级渠道供货；VAR 主要服务最终客户。直采 VAR 使用 DVAR／Brand Direct 表达，不能仅凭直采归为 VAD。
- SI：SI 的核心是复杂系统、多个技术域或定制化项目的集成与交付；VAR 的核心仍包含产品转售和围绕产品增加价值。满足两组条件时允许同时标记。
- Installer：只承担安装施工、不负责产品方案和转售时，不属于 VAR；同时销售产品并提供安装时可以多角色标记。
- MSP：持续按订阅、合同或 SLA 运营客户系统时可以同时标记 MSP；一次性销售、配置或项目支持本身不构成 MSP。
- Commission Agent：只介绍客户，由品牌、运营商或其他供应方与客户签约开票，并按佣金获得报酬的主体属于 Agent，不是 VAR。

### 商业价值等级

VAR 属于 Downstream Channel，因此可以根据市场覆盖、客户质量、采购潜力、技术能力、增长性及合作价值评为 KA、Priority、Standard 或 Long-tail。是否为 DVAR、是否直采以及公司规模可以作为商业价值证据，但不能单独决定 KA。

### 信息缺失与置信度

没有公开采购来源时，应记录为 Distributor Supply／Brand Direct 待核验，不能强行推断。没有展示技术服务细节时，也不能把“未找到”写成“没有”；但由于实质性增值是 VAR 的定义条件，在缺乏足够证据时只能保留 VAR candidate／待核验，或暂时归为证据更充分的 Reseller。

## Dealer（经销商）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：经销商。
- 英文规范名称：Dealer。
- 所属角色家族：resale。
- channel layer：Downstream Channel。
- 角色关系：Dealer 是 Reseller 的本地化、交易型子类型；标记 Dealer 时必须同时标记 Reseller。

### 完整定义

Dealer 是从品牌方、Distributor／VAD 或其他合法上游采购产品，再以自身商业身份面向所在城市、区域或特定客户群进行转售的下级渠道客户。Dealer 通常依靠本地销售关系、特定品牌或品类专长、询价和报价、基础售后或专业客户服务开展业务，常见客户包括 SOHO、SMB、本地机构及个人专业用户。

Dealer 通常规模较小、覆盖本地或区域市场，但规模不是硬性门槛。它可以拥有门店、展厅、贸易柜台、本地库存、维修点或本地销售团队，也可以主要通过电话、拜访、社交媒体或询价方式销售。实体场所和公开库存是强证据，不是必要条件。

### 必要判断条件

在公开证据足够的情况下，Dealer 至少需要满足：

1. 实际采购并转售相关产品，以自身名义承担产品交易，而不是只介绍客户并收取佣金；
2. 业务具有本地、区域、品牌专营、品类专业或关系型经销特征；
3. 主要业务不是面向大众消费者的标准化线下零售。

Dealer 不要求具备 VAR 那样的实质性方案设计或集成能力。若可验证其同时提供专业咨询、方案设计、复杂配置或项目交付，可以同时标记 VAR；若主要承担安装施工，可以同时标记 Installer。

### 强证据与辅助证据

强证据包括：品牌方、Distributor 或行业组织的官方 dealer 名录；候选公司官网明确自述 dealer／authorized dealer／IT dealer／network equipment dealer；面向企业或专业客户的询价、批量报价、客户经理、贸易账户或本地经销服务；可验证的特定区域、品牌或品类经销业务。

辅助证据包括：本地销售团队、展厅、贸易柜台、维修点、库存、售后支持、社交媒体销售页面、当地商业目录和品牌陈列。多个辅助证据可以提高置信度，但目录站或地图平台仅将公司标记为 dealer 不能单独完成角色确认。

### 授权状态

“Dealer”描述业务角色，不自动表示获得品牌授权。只有品牌方、授权上游或可验证的正式伙伴资料能够支持 Authorized Dealer 状态；候选公司自称 authorized dealer 但没有独立证据时，应把授权状态标记为待核验。是否获得授权不作为 Dealer 的硬性准入条件。

### 与 Retailer 的边界及重叠规则

Dealer 与 Retailer 默认不重叠。Dealer 侧重专业或关系型转售、本地询价、企业／专业客户服务及品牌或品类经销；Retailer 侧重通过线下门店以公开价格向大众消费者销售标准化商品。

只有当同一候选公司同时存在可验证的转售业务和线下零售店时，才允许同时标记 Dealer 与 Retailer。例如在渠道结构混合的不发达市场，一家公司可能一方面向本地企业或其他客户开展询价、批量采购和经销业务，另一方面经营面向消费者的实体门店。仅仅拥有门店不应自动增加 Dealer，只有转售业务但没有大众线下零售也不应增加 Retailer。

### 与相邻角色的边界

- Reseller：Reseller 是更宽泛的转售角色；Dealer 必须同时标记 Reseller，但普通 Reseller 不一定具有 Dealer 的本地、专业或关系型经销特征。
- VAR：Dealer 不要求实质性技术增值；满足 VAR 的产品转售和增值条件时允许同时标记。
- Retailer：默认互斥，只有同时验证转售业务和线下大众零售业务时才双重标记。
- E-tailer：在线销售只表示销售渠道；具有 Dealer 核心业务且同时经营自有在线商店时可以多角色标记。
- Distributor／VAD：主要向下级渠道供货的一级渠道不应仅因本地存在销售点而标为 Dealer。
- Commission Agent：不取得货权、只撮合交易并获得佣金的主体不是 Dealer。

### 商业价值等级

Dealer 属于 Downstream Channel，可以根据客户质量、区域影响力、采购潜力、品类专长和增长性评为 KA、Priority、Standard 或 Long-tail。虽然 Dealer 通常规模较小，但不能仅凭公司规模预设其等级；在小型或不发达市场，具有强本地覆盖和客户关系的 Dealer 仍可能具有较高商业价值。

### 信息缺失与置信度

没有检索到实体门店、仓库、授权证书或库存只能记录为 unknown，不能当作否定证据。如果只能确认公司销售产品，却不能判断其面向大众零售还是专业／关系型转售，应暂时保留 Reseller 或 Dealer／Retailer 待核验，并优先核实客户类型、销售方式、是否存在企业询价／批量业务及是否经营线下零售店。

## Reseller（转售商）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：转售商／经销商（泛称）。
- 英文规范名称：Reseller。
- 所属角色家族：resale。
- channel layer：Downstream Channel。
- 角色关系：Reseller 是 VAR 和 Dealer 的基础父角色；标记 VAR 或 Dealer 时必须同时标记 Reseller。

### 完整定义

Reseller 是以自身商业身份采购产品或取得产品转售权，再向最终企业、机构或其他客户转售，并通过进销差价或附带服务获得收入的下级渠道客户。Reseller 购买产品的目的不是自身消费，而是再次销售；它通常以自身名义报价、销售、开票或承担客户交易责任。

Reseller 是基础转售角色，不要求具有 VAR 级别的技术或解决方案增值能力，也不要求实体门店、公开库存或品牌正式授权。只进行标准化产品转售、能够验证实际交易身份的公司也可以成立 Reseller。

### 必要判断条件

在公开证据足够的情况下，Reseller 至少需要满足：

1. 公司购买产品或取得合法转售权，目的是再次销售而不是自身使用；
2. 公司是交易中的实际卖方，以自身名义参与报价、订单、合同、开票、收款、履约或客户责任；
3. 主要销售对象是最终客户，而不是系统性地向大量下级渠道伙伴供货；
4. 商业收入来自产品差价或附带服务，而不是只介绍客户并获得佣金。

### 强证据与辅助证据

强证据包括：品牌方、Distributor／VAD 或行业组织的官方 reseller 名录；候选公司官网明确自述 reseller／IT reseller／authorized reseller；面向企业客户的报价、订单、开票、批量采购、贸易账户或销售条款；可验证的最终客户产品销售案例。

辅助证据包括：产品目录、品牌组合、询价表单、企业客户页面、采购或售后条款、客户经理、当地商业目录及公司自述。只有购物链接、品牌 Logo 或第三方目录收录不足以单独证明公司承担实际转售交易。

### 授权、库存与履约方式

“Authorized Reseller”描述授权状态，不是独立角色。只有品牌方、授权上游或可验证的正式伙伴资料能够确认授权；公司自述但缺少独立证据时应标记为待核验。

实体仓库、公开库存和自有配送不是 Reseller 的必要条件。采用 dropshipping、第三方履约或按单采购的公司，只要仍是客户交易中的实际卖方或 merchant of record，并承担报价、收款或客户责任，仍可分类为 Reseller。未披露库存和供应方式只能记录为 unknown。

### 与子类型及相邻角色的关系

- VAR：VAR 是提供实质性技术、服务或解决方案增值的 Reseller；标记 VAR 时必须同时标记 Reseller。
- Dealer：Dealer 是具有本地、区域、品牌专营、品类专业或关系型经销特征的 Reseller；标记 Dealer 时必须同时标记 Reseller。
- Retailer／E-tailer：作为独立零售角色，默认不自动标记 Reseller。只有同一公司另有明确的 B2B 转售、企业询价、批量报价或专业渠道业务时才允许重叠。
- Distributor／VAD：系统性地向大量下级渠道伙伴供货、组织间接渠道的一级渠道属于 Distributor／VAD；普通 Reseller 主要服务最终客户。
- Commission Agent：只介绍客户，由品牌方、运营商或其他供应商签约开票并按佣金获得报酬的主体不是 Reseller。
- Marketplace／目录站／比价站：仅提供第三方挂牌、流量或信息聚合且不承担实际卖方责任的主体不是 Reseller。

### 子类型未知时的使用规则

如果能够确认候选公司采购后向最终客户转售，但公开证据不足以判断其是否为 VAR、Dealer、Retailer 或 E-tailer，可以暂时只标记 Reseller。后续找到技术增值、本地经销、线下零售或线上零售证据后，再增加或调整具体角色，不能为了填满子类型而强行推断。

### 商业价值等级

Reseller 属于 Downstream Channel，可以根据客户质量、采购潜力、覆盖能力、产品相关性、增长性和合作价值评为 KA、Priority、Standard 或 Long-tail。纯产品转售不妨碍成为 KA，但技术增值、行业专长和客户关系可作为提高商业价值的证据。

### 信息缺失与置信度

缺少公开采购来源、库存或正式授权不构成否定证据；但系统必须确认候选公司确实承担转售交易。若只能确认其推广产品，却不能确认谁报价、签约、开票或收款，应保留 Reseller candidate／待核验，并优先核实 merchant of record、供应来源、客户对象及收入方式。

## Retailer（实体零售商）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：实体零售商／线下零售商。
- 英文规范名称：Retailer。
- 所属角色家族：retail。
- channel layer：Downstream Channel。
- 角色关系：Retailer 是独立零售角色，默认不自动标记 Reseller。

### 完整定义

Retailer 是通过面向公众开放的实体零售门店，以公开或标准化价格向个人及家庭消费者少量销售商品，并以自身名义承担收款、交付、退换货或售后责任的公司。在本产品的分类中，Retailer 专指具有消费者实体销售场所的零售业务；通过线上渠道完成的零售另以 E-tailer 表达。

Retailer 可以是全国或区域消费电子连锁、百货商场、超市、专业电子产品门店、电脑店或独立本地商店。网络设备或相关 IT 硬件必须是其实际经营的品类，不能仅因门店可能偶然销售电子产品就判定为相关 Retailer。

### 必要判断条件

在公开证据足够的情况下，Retailer 至少需要满足：

1. 存在可验证且面向消费者营业的实体零售门店、商场柜台或可现场购买的销售场所；
2. 主要客户包含个人或家庭消费者，核心销售模式具有明确的 B2C 零售属性；
3. 公司是实际卖方或 merchant of record，以自身名义完成销售并承担交易责任；
4. 候选公司在目标市场实际销售网络设备、IT 硬件或其他相关产品。

### 强证据与辅助证据

强证据包括：候选公司官网 Store Locator 和门店地址；品牌方官方零售商名录；门店商品目录、公开零售价、促销、到店购买或 Click & Collect；官方门店页面展示营业时间、联系方式及可现场购买的商品。

辅助证据包括：Google Places 等地图服务中的零售类别、营业时间、门店照片和消费者评价；商场目录、当地商业名录、社交媒体门店页面及第三方新闻报道。地图或目录信息可以支持小型零售商发现，但应尽可能与公司身份、商品类别及交易能力交叉验证。

### 实体场所判定

实体消费者零售场所是 Retailer 的必要条件。仓库、公司办公室、维修点、普通物流提货点或不能现场购买的 Showroom 不足以证明 Retailer。商场柜台、展厅或 Click & Collect 地点只有在消费者能够现场选择或完成购买时，才能作为实体零售证据。

如果没有检索到门店，不能断言公司没有门店；但在获得实体消费者销售场所证据前，不应确认 Retailer，只能保留 Retailer candidate／待核验。

### 与 E-tailer 的关系

拥有实体零售门店，同时经营能够浏览商品并直接下单的自营网站、应用或其他可验证在线商店时，应同时标记 Retailer 与 E-tailer。只有线上销售而没有实体消费者门店时，只标记 E-tailer。官网只有品牌展示、门店查询或询价表单而不能在线下单，不足以增加 E-tailer。

### 与 Dealer、Reseller 的边界

Retailer 与 Dealer 默认不重叠。Dealer 侧重专业／关系型转售、本地询价、企业或专业客户服务；Retailer 侧重通过实体门店面向大众消费者进行标准化零售。只有同一公司同时存在可验证的 B2B／专业转售业务和大众线下零售业务时，才允许同时标记 Dealer 与 Retailer，这种混合模式在渠道结构不发达的市场可能出现。

Retailer 默认不标记 Reseller。只有公司另有明确的 B2B 转售、企业询价、批量报价或专业渠道业务时，才同时标记 Reseller。单纯因零售商在法律意义上“买入再卖出”不能自动增加 Reseller 角色。

### Marketplace 与柜台边界

仅为第三方商家提供挂牌、流量、支付或撮合服务的 Marketplace 平台不是 Retailer。平台或其关联公司以自身名义经营的自营零售部分可以单独判断。商场内第三方品牌柜台应根据实际经营和交易主体判断，不能把整个商场或平台的角色自动赋给柜台经营者，反之亦然。

### 商业价值等级

Retailer 属于 Downstream Channel，可以根据门店数量、市场覆盖、客流、相关品类销量、采购潜力、品牌影响力和增长性评为 KA、Priority、Standard 或 Long-tail。全国或区域性消费电子连锁通常具有较高 KA 潜力；小型独立门店也可作为长尾线索，不能仅因网站流量低而排除。

### 信息缺失与置信度

没有公开库存、仓库或品牌授权不构成否定证据。门店信息可能只存在于地图、社交媒体或当地目录中，系统应允许使用多源证据确认小型零售商。如果只能确认线上销售，不能推断存在实体店；如果只能确认地址，则必须进一步判断该地址是消费者门店、办公室、仓库还是提货点。

## E-tailer（线上零售商）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：线上零售商／电子零售商。
- 英文规范名称：E-tailer／Online Retailer。
- 所属角色家族：retail。
- channel layer：Downstream Channel。
- 角色关系：E-tailer 是独立零售角色，默认不自动标记 Reseller。

### 完整定义

E-tailer 是主要通过网站、应用、Marketplace 商家店铺或具备结构化下单功能的社交商务渠道，向个人及家庭消费者销售商品，并以自身身份承担实际卖方责任的在线零售商。判断电子零售的核心是客户能够通过专门设计的数字渠道提交具有购买承诺的订单；付款和最终交付可以在线或线下完成。

E-tailer 不要求拥有独立官网。在 Amazon、eBay、Shopee、Lazada、Mercado Libre 等 Marketplace 上经营的独立商家店铺，以及使用 TikTok Shop、WhatsApp Catalog／Cart 等结构化购物功能的社交商务商家，只要能够解析到真实、可识别的经营主体并确认其承担实际销售责任，都可以成立 E-tailer。

### 必要判断条件

在公开证据足够的情况下，E-tailer 至少需要满足：

1. 消费者能够通过网站、App、Marketplace 店铺或结构化社交商务功能提交实际订单，而不只是查看商品或发送普通询价；
2. 候选公司是实际卖方或 merchant of record，控制商品、价格或交易条件，并承担订单、履约、退换货或客户责任；
3. 主要客户包含个人消费者，业务具有明确的 B2C 在线零售属性；
4. 候选公司在目标市场实际销售网络设备、IT 硬件或其他相关产品；
5. 店铺能够解析到真实公司、合法经营主体或具有稳定身份的独立商家，不能只是匿名、一次性或无法验证身份的卖家账号。

### 强证据与辅助证据

强证据包括：可直接浏览商品、价格并下单的自营网站或 App；Marketplace 的正式商家主页、店铺 ID、卖家法律信息及持续商品目录；结构化社交商务店铺；订单、配送、退换货和客户服务条款；平台标注的 official store／verified seller；品牌方官方线上零售商名录。

辅助证据包括：卖家评分、历史销量、评价数量、店铺开设时间、相关产品数量、社交媒体经营记录、第三方公司注册信息和支付／物流信息。评分和销量可以支持活跃度及商业价值判断，但不能替代卖家身份与交易责任证据。

### 普通私信与非结构化销售

只有 Facebook、Instagram、WhatsApp、电子邮件或其他普通私信询价，且需要人工逐条议价和确认订单的页面，不能单独确认 E-tailer。这些页面可以进入 Marketplace／social-commerce 搜索候选池，用于发现数字曝光较弱的小型商家；在确认稳定经营、商品目录、实际交易及卖方责任前，应标记为 E-tailer candidate／待核验。

### Marketplace 平台与第三方卖家

Marketplace 平台只为第三方提供流量、挂牌、支付、物流或撮合服务时，平台的中介业务本身不是 E-tailer。平台上的实际第三方商家应作为独立候选实体判断；平台经营自营官方店、以自身名义销售商品并承担交易责任时，其自营零售业务也可以成为独立销售线索。

平台自营官方店与每个第三方卖家必须生成相互独立的候选销售线索，不能把商品、店铺、销量、评价、联系人、公司信息或证据合并到同一条线索。平台纯线上自营店在本产品中标记 E-tailer；若平台或同一公司另有面向消费者的实体门店，则同时标记 Retailer。业务语境中可以把平台自营部门称为 retailer，但结构化 channel role 必须依据线上和线下渠道分别记录。

同一实际卖家在多个 Marketplace、多个店铺或自营网站出现时，应先进行公司实体解析和去重，再形成一条公司级候选线索，并把不同店铺保留为独立证据来源；不得因跨平台重复出现而重复计算候选公司。

### Marketplace 搜索要求

销售线索搜索必须支持独立的 Marketplace discovery lane，与普通网页搜索并行运行：

1. 根据目标国家识别当地主要综合 Marketplace、垂直电商平台和结构化社交商务渠道；
2. 使用目标产品类别、关键型号、竞品品牌、应用场景及当地语言同义词搜索相关商品；
3. 从商品结果提取实际 seller／store，而不是把 Marketplace 域名直接当作卖家公司；
4. 解析卖家主页、店铺 ID、经营主体、目标国家存在、相关商品、评分、销量和联系渠道；
5. 将第三方卖家、平台自营店和 Marketplace 运营方分离建模，并对跨平台同一公司进行实体去重；
6. 对身份不可验证或只有单个匿名商品的卖家保留为待核验，不进入正式合格线索。

这一搜索通道用于补足普通搜索引擎对小型、低流量、未做 GEO／SEO 的线上商家的覆盖不足。Marketplace 搜索结果只能提供发现和交易证据，仍需结合公司注册、官网、社交页面、品牌授权或其他独立来源进行候选公司验证。

### 履约方式与角色边界

使用 FBA、平台仓储、第三方物流或 dropshipping 不影响 E-tailer 分类，关键是谁是实际卖方及谁承担客户交易责任。仅进行联盟推广、导购或推荐并按佣金获得收入的主体属于 Agent／Publisher，不属于 E-tailer。

有实体消费者门店并经营可直接下单在线商店时，同时标记 Retailer 与 E-tailer；只有线上消费者零售时只标记 E-tailer。E-tailer 默认不标记 Reseller，只有公司另有明确的 B2B 企业账户、批量报价、专业转售或渠道业务时才同时标记 Reseller。主要通过在线系统面向企业采购的 B2B 转售公司优先归为 Reseller，其消费者线上零售业务成立时再增加 E-tailer。

### 商业价值等级

E-tailer 属于 Downstream Channel，可以根据目标市场销量、相关品类覆盖、店铺评分、评价数量、采购潜力、跨平台覆盖、增长性及合作价值评为 KA、Priority、Standard 或 Long-tail。小型 Marketplace 商家即使缺少高流量独立网站也可能具有商业价值，不能把网站流量或 SEO 能力作为硬性筛除条件。

### 信息缺失与置信度

平台可能隐藏卖家法律名称、销量、采购来源或联系方式。未披露只能记录为 unknown，不能推断为不存在。如果无法把店铺解析到稳定经营主体，或无法确认候选公司是实际卖方，应保留 E-tailer candidate／待核验并降低置信度，不得把平台运营方的信息补到第三方卖家记录中。

## SI（System Integrator）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：系统集成商。
- 英文规范名称：System Integrator（SI）。
- 所属角色家族：services。
- channel layer：Downstream Channel。
- 角色关系：SI 是独立的项目与专业服务角色，不要求同时标记 Reseller；产品转售、现场安装和持续运维分别通过其他角色表达。

### 完整定义

SI 是面向最终企业、政府、教育、酒店、工业或其他机构客户，把网络、计算、安全、软件、云平台、通信、布线或其他技术组件组合成可运行的整体解决方案，并承担方案设计、系统集成、测试、上线、验收或项目交付责任的公司。

SI 的核心不是销售多少产品，而是对客户需求、技术架构、多个组件或系统之间的协同以及最终项目结果承担方案级责任。SI 可以只提供咨询、设计和项目实施而不销售硬件；发生产品采购和转售时，再根据实际交易增加 VAR 与 Reseller。

### 必要判断条件

在公开证据足够的情况下，SI 至少需要满足：

1. 主要服务对象包含最终企业或机构客户，而不是仅向下级渠道供货；
2. 承担需求分析、方案设计、架构、系统连接、集成、测试、调试、迁移、上线、验收或项目管理中的方案级职责；
3. 工作涉及多个组件、子系统或技术层之间的协同，不能只是设备搬运、基础安装或单一产品转售；
4. 对整体解决方案能否按需求运行及项目交付结果承担明确责任。

### 多组件与品牌规则

SI 不强制要求多品牌。单一品牌方案也可以成立 SI，例如在同一厂商品牌下整合网关、交换机、无线 AP、控制器、安全策略、认证系统和云管理。必要的是多组件或多技术层的设计与协同，以及候选公司对整体方案和项目结果负责。

同时采用多个品牌、平台或技术域是强增信证据，但不能作为硬门槛。只安装一台路由器、摄像机、AP 或其他独立设备，不构成 SI。

### 强证据与辅助证据

强证据包括：候选公司官网明确自述 system integrator／systems integration／ICT integrator；完整项目案例展示需求、架构、多个组件、实施过程和客户结果；公开的设计、集成、测试、迁移、调试、验收或项目管理服务；品牌方或行业组织的官方 SI 伙伴身份。

辅助证据包括：解决方案架构师、网络工程师、项目经理等专业团队；厂商认证和技术资质；招投标或项目中标记录；面向特定行业的端到端解决方案；技术合作伙伴组合、实验室、PoC 和客户推荐。只有合作伙伴 Logo、泛化的“solutions”描述或员工职位不能单独完成 SI 判断。

### 与 VAR、Reseller 的边界

SI 不要求一定采购或转售产品，因此不自动标记 VAR 或 Reseller。SI 的核心是专业服务、系统协同和项目结果；VAR 的核心包含产品转售并围绕产品增加价值。

如果 SI 同时以自身名义采购并向客户销售设备或软件，且围绕产品提供实质性增值，应同时标记 SI、VAR 和 Reseller。如果仅代客户采购、提供采购建议或由其他供应商直接开票，则不能仅凭项目中使用产品增加 VAR／Reseller。

### 与 Installer 的核心边界

SI 与 Installer 的核心边界是是否承担整体方案、技术架构、系统协同和项目结果责任。Installer 主要按照既定设计执行布线、设备安装、基础配置、现场施工或更换任务；SI 负责决定系统如何设计、不同组件如何协同、如何验证客户需求及如何完成整体交付。

同一公司可以同时承担 SI 和 Installer。如果证据只支持现场施工或设备安装，不应推断 SI；如果同时有设计文档、复杂项目案例、集成测试、调试和验收责任，可以多角色标记。

### 与 MSP 及咨询公司的边界

SI 通常以阶段性项目设计和交付为核心；MSP 通过持续合同、订阅或 SLA 长期运营、监控和支持客户系统。SI 完成项目后继续承担持续托管服务时，可以同时标记 MSP。

只提供战略、管理或采购建议，不参与技术方案设计、系统集成或实施的普通咨询公司不属于 SI。咨询服务只有与可验证的技术架构或交付职责结合时才能支持 SI 判断。

### 商业价值等级

SI 属于 Downstream Channel，可以根据项目规模、客户质量、行业覆盖、技术深度、采购影响力、可复制方案、增长性和合作价值评为 KA、Priority、Standard 或 Long-tail。产品采购金额不是唯一价值来源；即使硬件由客户或其他伙伴采购，能够影响技术选型的大型 SI 仍可能具有较高商业价值。

### 信息缺失与置信度

项目架构、合同责任和客户名称可能因保密要求不公开。未找到详细案例不能直接认定公司没有 SI 能力；系统应综合服务目录、团队资质、招投标记录、合作伙伴身份及匿名案例进行判断。但如果无法验证多组件协同和方案级责任，只能保留 SI candidate／待核验，不能用“IT solutions”或“technology services”等泛化描述强行确认。

## Installer（安装服务商）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：安装服务商／网络安装商／弱电安装商。
- 英文规范名称：Installer。
- 所属角色家族：services。
- channel layer：Downstream Channel。
- 角色关系：Installer 是独立的现场施工与安装角色，不要求同时销售产品或拥有 SI 能力。

### 完整定义

Installer 是面向最终企业、机构、家庭或其他客户，在现场执行网络布线、设备固定与连接、基础配置、测试、调试、更换、维修或拆除工作，并对约定的安装质量和结果承担责任的公司、承包商或可验证的独立经营者。

Installer 的工作可以包括铜缆或光纤敷设、端接和测试，机柜安装，路由器、交换机、无线 AP、控制器、天线、CPE、摄像机、门禁或其他网络与弱电设备安装，设备配对、基础参数设置、覆盖或链路测试、安装验收及现场更换服务。基础配置、测试和调试可以作为安装工作的一部分，不会因此自动成为 SI。

需要特别区分“Installer 角色成立”和“适合作为 Cudy 销售线索”。纯结构化布线、铜缆、光纤或弱电施工公司仍可被正确分类为 Installer；但如果公开证据没有显示其选型、采购、安装或维护 AP、路由器、交换机等主动网络设备，则其 networking relevance 只能记为未证明，在 Cudy 销售线索搜索与测评中不通过相关性准入门槛。

### 必要判断条件

在公开证据足够的情况下，Installer 至少需要满足：

1. 实际提供客户现场的安装、施工、布线、设备部署、测试、调试、维修或更换服务；
2. 对安装合同、施工质量、现场安全或约定的安装结果承担责任；
3. 服务涉及目标产品或相关网络、通信、安防、弱电、AV、门禁或智能建筑领域；
4. 不只是在线指导、远程配置、产品销售或把客户介绍给第三方安装商。

### 强证据与辅助证据

强证据包括：官网或正式服务目录明确提供 network installation、structured cabling、Wi-Fi installation、low-voltage installation、CCTV installation 等服务；品牌方官方 Installer 伙伴身份；项目照片、安装案例、工程范围、测试报告或客户验收；承包商注册、当地法定许可、行业认证及可验证的现场技术团队。

辅助证据包括：Google Places 等地图服务中的安装商类别、服务区域和客户评价；社交媒体施工记录；当地行业协会、商业目录、招投标或分包记录；安装技术员职位及工具设备。地图或目录的单一类别标签不能独立完成确认，应尽量交叉验证公司身份、服务内容和实际项目。

### 总包与分包规则

公司与客户签订安装合同、组织和管理项目，并对安装质量和最终结果负责时，即使部分或全部现场工作由分包团队执行，仍可标记 Installer。系统应记录 subcontracted delivery 等履约信息，但不能因使用分包而否定安装角色。

如果公司只把客户转介绍给另一家安装商、由对方签约和承担结果，并按推荐或成交收取佣金，则属于 Commission Agent／Referral Agent，不属于 Installer。无法确认责任主体时，应把合同与验收责任列为优先核实项。

### 与 SI 的核心边界

Installer 主要按照既定需求或设计执行现场施工、设备安装、基础配置和测试；SI 对整体方案、技术架构、多个组件或系统的协同以及项目结果负责。只安装一台或一批设备可以成立 Installer，但不能因此推断 SI。

同一公司同时承担方案设计、系统集成、现场安装、测试和整体验收时，可以同时标记 SI 与 Installer。基础调试或按说明完成配置不足以单独证明 SI。

### 与 Reseller、VAR、MSP 的边界

Installer 不要求销售产品。如果同时以自身名义采购并向客户销售设备，则根据交易事实增加 Reseller；如果围绕产品提供实质性技术或解决方案增值，则增加 VAR。

一次性安装、保修期支持、故障返修或按次上门服务本身不构成 MSP。只有通过持续合同、订阅或 SLA 长期监控、维护或运营客户系统时，才增加 MSP。只提供远程配置、电话支持或在线培训而没有现场安装服务的公司不属于 Installer。

### 资质、实体场所与小型安装商

行业证书、电工资质、弱电许可、BICSI 或品牌技术认证是强增信证据，但法定要求因国家和施工类型而异，不作为全球统一硬门槛。实体门店、办公室、仓库、公开库存和独立官网同样不是 Installer 的必要条件。

个人经营者、小型安装团队及没有高流量网站的本地承包商，只要经营身份、服务区域和实际安装业务可验证，都应进入长尾候选池。搜索应结合 Google Places、品牌伙伴名录、承包商注册、行业协会、当地目录、项目照片、客户评价和结构化社交页面，避免只依赖 SEO 或大型公司网站。

### 商业价值等级

Installer 属于 Downstream Channel，可以根据项目数量与规模、客户质量、服务区域、相关产品影响力、技术能力、采购潜力、增长性和合作价值评为 KA、Priority、Standard 或 Long-tail。大型全国安装服务商可能具有 KA 价值；覆盖关键区域或垂直行业的小型团队也可能是高质量长尾线索。

### 信息缺失与置信度

未找到许可证、官网、门店或公开客户名称只能记录为 unknown，不能直接排除候选公司。但系统必须获得足够证据区分实际 Installer、普通产品卖家和 Referral Agent。如果只能看到“installation”关键词而无法确认公司业务、现场服务或责任主体，应保留 Installer candidate／待核验，不能把产品安装说明或内容页面误判为安装公司。

## MSP（Managed Service Provider）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：托管服务商／IT 托管服务商。
- 英文规范名称：Managed Service Provider（MSP）。
- 所属角色家族：services。
- channel layer：Downstream Channel。
- 角色关系：MSP 是独立的持续运营与托管服务角色，不要求同时销售产品；MSSP 是其安全托管子类型。

### 完整定义

MSP 是通过持续性服务关系，为最终客户承担部分或全部 IT、网络、云、安全、终端、服务器或应用环境日常管理与运行责任的服务商。其核心不是是否完成过一次安装或项目，而是在交付之后是否继续按约定管理、维护、监控、支持、保护或优化客户环境，并对相应服务结果承担责任。

持续关系可以通过月度或年度服务计划、订阅、托管合同、长期运维协议、SLA 或其他可重复服务安排建立。具体合同、计费周期或 SLA 不要求必须在公开渠道披露；它们是确认实际业务关系的证据，而不是网站披露层面的硬门槛。

### 必要判断条件

在公开证据足够的情况下，MSP 至少需要满足：

1. 服务具有持续性或周期性，而不是仅完成一次项目、安装、维修或咨询；
2. 对明确范围内的客户用户、设备、系统、网络、云环境或安全环境承担持续运营、维护、响应或管理责任；
3. 服务对象是最终客户的实际 IT 环境，而不只是销售硬件、软件许可证、互联网线路或提供产品保修；
4. 候选公司是面向客户的服务责任主体，或者能够验证其直接承担约定的服务结果。

主动监控是 MSP 的典型能力和强证据，但不是绝对必要条件。按月或按年提供的 Help Desk、Service Desk 或运维支持，即使没有公开证明主动监控，只要覆盖范围、服务时段或响应责任明确，并持续承担维护和问题处理责任，仍可认定为 MSP。只有预付工时、临时响应或按次收费，但不承担任何持续管理责任的支持包不构成 MSP。

### 典型服务范围

MSP 服务可以包括 Managed IT、Managed Network、Managed Wi-Fi、Managed Firewall、远程监控与管理、Help Desk／Service Desk、配置与补丁管理、固件升级、备份管理、设备和许可证生命周期管理、网络与云环境运维、事件响应、性能与容量优化、定期服务报告，以及终端、服务器、身份或应用管理。

Managed Security、MDR、SOC 服务、持续威胁监测和安全事件响应可归入 MSSP。MSSP 在本分类中是 MSP 的安全服务子类型；确认 MSSP 时必须同时标记 MSP，不把 MSSP 作为与 MSP 平级且互斥的基础角色。

### 强证据与辅助证据

强证据包括：官网明确提供 managed services、managed IT、managed network、managed Wi-Fi、managed security 等服务；月度或年度托管套餐；明确的 SLA、响应时间、覆盖范围或服务时段；持续监控、RMM、Help Desk、NOC／SOC、补丁和备份管理；定期报告、客户门户或服务评审；品牌方官方 MSP／MSSP 伙伴身份；能够证明长期运营责任的客户案例。

辅助证据包括：运维工程师和服务台团队、工单系统、远程管理平台、ITSM 流程、厂商认证、托管服务价格页、长期维护合同、客户评价及招聘信息。只有“IT support”“network support”“maintenance”等泛化文字，不能单独完成 MSP 确认，必须继续核实服务持续性和责任范围。

### 非必要条件与第三方履约

7×24 小时 NOC／SOC、自有 RMM 或 PSA 平台、自建数据中心、厂商高级 MSP 认证和自有全职运维团队都是强增信证据，但不作为普通 MSP 的绝对必要条件。小型 MSP 可以仅在约定服务时段运营，也可以使用第三方工具、云端平台、白标 NOC／SOC 或分包技术团队。

候选公司只要是面向客户的合同或服务责任主体，并对持续服务结果负责，即使部分后台工作由第三方完成，仍可标记 MSP。仅把客户转介给其他服务商、由对方签约和承担服务结果并收取佣金的公司，应归为 Commission Agent／Referral Agent，不属于 MSP。

### 排除与相邻角色边界

- 一次性安装、系统建设、迁移、配置、咨询或集成项目本身不构成 MSP。
- 单次维修、按次上门、产品保修、故障返修、普通售后或只有预付工时的临时支持本身不构成 MSP。
- 只出售硬件、软件许可证、云资源或互联网接入，而不承担客户环境持续管理责任的公司不属于 MSP。
- SI：负责方案设计和阶段性项目交付；项目完成后继续承担持续托管责任时，可以同时标记 SI 与 MSP。
- Installer：负责现场施工和安装；同时根据长期安排持续维护或运营客户系统时，可以同时标记 Installer 与 MSP。
- Reseller／VAR：MSP 不要求销售产品；以自身名义转售产品时增加 Reseller，围绕产品提供实质性增值时增加 VAR。
- ISP：仅提供连接或带宽属于 ISP，不自动成为 MSP；另外提供 Managed Network、Managed Wi-Fi、Managed Firewall、监控、配置和持续运维时，可以同时标记 ISP 与 MSP。

### 商业价值等级

MSP 属于 Downstream Channel，可以根据受管客户数量与质量、受管设备或站点规模、经常性收入、服务范围、续约能力、技术影响力、采购潜力、区域覆盖、增长性及合作价值评为 KA、Priority、Standard 或 Long-tail。即使硬件采购由客户或其他伙伴完成，能够长期影响设备选型、升级和替换决策的 MSP 仍可能具有较高商业价值。

### 信息缺失与置信度

未找到公开合同、SLA、计费周期、NOC／SOC、自有平台或厂商认证只能记录为 unknown，不能直接断定候选公司不是 MSP。系统应综合服务页面、套餐、责任描述、案例、客户评价、伙伴目录和招聘信息判断；如果只能确认一次性项目或泛化技术支持，不能标记 MSP。如果持续性和责任范围尚不清楚，应保留 MSP candidate／待核验，并把服务周期、受管范围、响应责任和合同主体列为优先核实项。

## ISP（Internet Service Provider）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：互联网服务提供商／互联网接入服务商。
- 英文规范名称：Internet Service Provider（ISP）。
- 所属角色家族：services／connectivity。
- channel layer：Downstream Channel。
- 角色关系：ISP 是独立的互联网连接服务角色；自建网络、虚拟转售和批发模式通过子类型及 supply model 区分。

### 完整定义

ISP 是以自身商业身份，向家庭、企业、机构或其他网络运营商提供公共互联网接入或互联网连接服务，并对客户的开通、计费、连接质量、支持或服务关系承担实质责任的公司。其核心是提供通往公共互联网、原则上连接到互联网几乎所有端点的连接能力，而不是仅安装网络、管理局域网或销售路由器。

接入技术不影响 ISP 基础角色。光纤、DSL、Cable、以太网宽带、固定无线、公共 Wi-Fi、移动网络和卫星连接均可成立 ISP；面向家庭、企业、机构、公共用户或其他运营商提供服务也均可成立，但应记录实际客户类型、网络范围和商业模式。

### 子类型与业务模式

ISP 至少可以细分为：

- Fixed Broadband ISP：通过光纤、DSL、Cable、以太网或其他固定接入提供互联网服务；
- WISP：通过固定无线、Wi-Fi、微波或其他无线网络向最终用户提供互联网接入；
- Mobile ISP／MNO／MVNO：通过移动网络提供互联网接入；
- Satellite ISP：通过卫星网络提供互联网接入；
- Business ISP：向企业提供商业宽带、DIA、专线互联网或相关连接服务；
- Virtual／Reseller ISP：采购上游批发网络或接入能力，以自己的品牌、合同及客户服务提供互联网接入；
- Wholesale ISP／Carrier：向其他 ISP、运营商或服务提供者销售 Internet Transit、Backhaul、批发宽带或其他互联网连接。

上述是 ISP 子类型或业务属性，不应在基础角色层制造互斥分类。同一 ISP 可以同时经营固定、无线、企业和批发业务，系统应保留产品、客户和覆盖区域范围。

### 必要判断条件

在公开证据足够的情况下，ISP 至少需要满足：

1. 实际提供公共互联网接入，或向其他运营商提供互联网连接、Transit、Backhaul 等批发连接能力，而不只是局域网、VPN、托管或安装服务；
2. 以自身名义向最终用户、企业客户或其他运营商提供服务；
3. 对客户合同、开通、计费、技术支持、服务质量或连接结果中的实质部分承担责任；
4. 不是只把客户介绍给另一家运营商，由对方签约、开票和承担服务结果后收取佣金。

### 自有网络、ASN 与牌照规则

自建光纤、基站、无线塔、核心网络、ASN、IP 地址资源和通信牌照是设施型 ISP 的强证据，但不作为全球统一硬门槛。ISP 可以租用其他运营商的最后一公里、光纤、无线网络或全部底层设施，也可以采购批发宽带后以自己的品牌提供服务。

没有自有网络的 Virtual／Reseller ISP，只要与客户建立自己的合同或可验证的服务关系，并承担开通、计费、支持和连接服务责任，仍应认定为 ISP。ASN 也可能属于普通企业、学校、云服务商或数据中心，不能单独证明 ISP；牌照要求因国家、技术和服务范围不同而异，未找到公开牌照只能记录为 unknown，不得自动排除。

### 强证据与辅助证据

强证据包括：国家或地区通信监管机构的 ISP／运营商／牌照名录；官网公开宽带套餐、覆盖区域、安装费、月费和服务条款；用户开户、账单、测速、故障申报或客户门户；明确的 Fiber、Broadband、Fixed Wireless、WISP、DIA、Internet Transit 或 Wholesale Internet 服务；能够证明候选公司承担客户服务责任的合同说明和客户案例。

辅助证据包括：ASN、IP 地址资源、网络节点、PeeringDB、BGP 路由、无线塔、频谱或施工许可、覆盖地图、地图平台类别、当地宽带目录、客户评价、安装照片及结构化社交页面。网络数据可以证明运营能力，但必须与商业服务、客户对象和候选公司实体进行交叉验证。

### 小型 WISP 与长尾搜索

小型、乡村或地区型 WISP 即使没有高流量网站、独立 ASN、公开牌照或完整在线订购系统，只要经营身份、覆盖区域、互联网套餐和客户服务能够验证，都应进入长尾候选池。搜索应结合监管名录、Google Places、当地宽带目录、覆盖地图、社区页面、结构化 Facebook 等社交页面、无线塔或安装照片和客户评价，不得只依赖 SEO、新闻流量或大型公司网站。

### 排除规则

- 酒店、咖啡馆、学校、商场或企业仅为自身访客、学生或员工附带提供 Wi-Fi，且不以互联网接入为独立对外服务时，不属于 ISP。
- 只安装路由器、AP、光纤、天线或布线的公司属于 Installer 候选，不因安装连接设备成为 ISP。
- 只管理客户 LAN、Wi-Fi、防火墙或云环境而不提供互联网连接的公司属于 MSP 候选，不属于 ISP。
- 只出售路由器、SIM 卡、充值、软件或云资源而不承担连接服务责任的公司不属于 ISP。
- 仅提供主机托管、数据中心、CDN、云服务、域名、电子邮件或 VPN，且不销售公共互联网接入或批发互联网连接的公司不属于 ISP。
- 只转介宽带客户，由实际运营商签约、开票和承担服务结果的公司属于 Commission Agent／Referral Agent，不属于 ISP。

专门经营公共热点网络，并以自身名义向用户或场地方提供互联网接入、计费和服务责任的公司可以认定为 ISP；普通场所为限定访客提供的附带 Wi-Fi 不可以。

### 与相邻角色的重叠

- MSP：ISP 除线路外持续管理客户网络、Managed Wi-Fi、Managed Firewall、设备、监控或运维时，可以同时标记 ISP 与 MSP；只提供连接或带宽不自动成为 MSP。
- Installer：ISP 自己承担客户现场布线、CPE、天线或无线设备安装责任时，可以同时标记 Installer；把安装外包且不承担安装结果时不自动增加 Installer。
- SI：ISP 另外设计并交付完整企业网络或多系统解决方案，并承担方案级结果时，可以同时标记 SI。
- Reseller／VAR：以自身名义销售并将路由器、AP、网关或其他产品所有权转移给客户时，增加 Reseller；围绕产品提供实质性技术增值时增加 VAR。套餐内仍归 ISP 所有、租赁、借用或仅作为服务终端部署的 CPE 不自动构成 Reseller。
- Retailer／E-tailer：实体营业厅或在线页面只办理连接服务，不自动构成产品零售；实际在线下或线上销售相关产品时，再分别按 Retailer／E-tailer 条件判断。
- Distributor：Wholesale ISP 销售带宽、Transit 或 Backhaul 不等于硬件一级分销；只有另有可验证的相关产品一级渠道供货业务时才增加 Distributor。

### 商业价值等级

ISP 属于 Downstream Channel，可以根据用户和站点数量、覆盖区域、网络扩张速度、企业客户比例、经常性收入、CPE 和网络设备采购量、设备选型控制力、用户增长、升级替换周期及合作价值评为 KA、Priority、Standard 或 Long-tail。大型全国运营商、区域 ISP 以及覆盖关键空白市场并快速增长的小型 WISP 都可能具有较高商业价值。

### 信息缺失与置信度

未找到 ASN、自有网络、牌照、公开合同或详细用户数量只能记录为 unknown，不能自动否定 ISP。系统应优先确认实际服务套餐、覆盖区域、客户关系、计费或支持责任及上游供给模式。如果只有“internet”“telecom”“broadband”关键词，或只能确认设备销售、安装和普通 Wi-Fi 服务，应保留 ISP candidate／待核验，不能强行确认。

## Commission Agent（佣金型销售代理）

### 状态与规范名称

- 状态：已由业务负责人确认。
- 中文规范名称：佣金型销售代理／商业代理。
- 英文规范名称：Commission Agent／Sales Agent／Commercial Agent。
- 所属角色家族：agency／intermediary。
- channel layer：Intermediary／Agency；既不是 Tier-1 Distributor，也不是采购产品的 Downstream Channel customer。
- 角色关系：Commission Agent 是独立候选公司类型，不能自动归入 Distributor、Reseller 或其他采购转售角色。

### 完整定义

Commission Agent 是受品牌方、制造商或其他供应商委托，以委托方利益在目标市场寻找客户、介绍商机、推广产品、协助报价、参与谈判或促成交易，并通过佣金、成功费、固定代理服务费、Retainer 或“基础服务费＋佣金”获得报酬的独立公司或可验证的个人经营者。

Agent 通常不购买产品、不取得货权，也不依靠进销差价盈利。产品交易主要发生在委托方与客户之间，库存、应收账款、产品定价、坏账、保修和主要履约风险通常仍由委托方承担。Commission Agent 的核心是代表、介绍和促成，而不是以自身商业主体身份买入后转售。

### 子类型与纳入范围

本分类统一包含：

- Sales／Commercial Agent：持续代表品牌或供应商开发客户和推进交易；
- Manufacturer’s Representative：在特定区域或行业代表一个或多个厂商；
- Independent Sales Representative：以独立外部销售身份代表委托方；
- Referral／Introducer Agent：系统性介绍合格 B2B 客户或项目机会，但通常不参与完整谈判；
- Outsourced Sales Agent：作为委托方的外部销售团队开展客户开发、跟进或谈判；
- Tender／Project Agent：帮助委托方获得当地招标、运营商、大型项目或关键客户机会。

Referral／Introducer Agent 必须具有可验证、可重复的 B2B 商机介绍业务。偶尔介绍一次客户的个人、普通联盟链接、优惠码推广者或泛化流量推广账号不作为正式 Commission Agent 候选。

本产品中的 Commission Agent 专指卖方侧销售代理。代表采购方寻找、筛选或购买供应商产品的 Buying／Sourcing Agent 不纳入此角色；如未来需要搜索采购影响者，应作为独立的 buyer-side influencer／procurement intermediary 类型设计。

### 必要判断条件

在公开证据足够的情况下，Commission Agent 至少需要满足：

1. 代表可识别的委托方，或以明确且可验证的代理业务模式开展销售活动；
2. 实际承担客户开发、商机介绍、市场代表、谈判、投标支持或促成交易职能；
3. 收入来自佣金、成功费、代理费、Retainer 或混合报酬，而不是主要依靠采购后加价转售；
4. 在所代理的交易中，不以自身经济主体身份取得产品货权并承担主要库存、应收账款、坏账和转售风险。

固定服务费或 Retainer 加佣金不影响 Agent 身份，报酬不要求完全按单笔成交佣金计算。代理合同和具体佣金比例通常不会公开；没有找到合同或佣金数字只能记录为 unknown，但至少需要代理服务模式、品牌代表关系、客户开发活动或其他证据支持。

### 货权、风险和履约边界

是否取得货权并承担库存与转售风险，是 Commission Agent 与 Distributor／Reseller 的首要边界。真实代理交易中，货权通常由委托方直接转移给客户，Agent 不拥有商品，也不承担依靠进销差价获利的主要商业风险。

保存样品或 Demo、临时保管委托方寄售库存、协助报价、收集订单、协调物流、提供市场信息、跟进客户、参与招投标或在授权范围内谈判价格，都不会自动改变 Agent 身份。实体库存、货物交付地点和发票流向是证据，但不能替代对真实货权、收益方式和风险承担的判断。

某些司法辖区的 commissionaire／undisclosed agent 可能以自己名义签订合同，但仍代表委托方且不承担商品所有权和主要商业风险。此类情况应根据真实交易安排判断，不能只看发票抬头或合同签署形式。

如果公司采购产品、取得货权、自行决定转售价，并承担库存、应收账款、坏账、退货或主要履约风险，该笔业务应分类为 Distributor、Dealer 或 Reseller，而不是 Agent。

### 多品牌、多角色与交易范围

一家公司可以针对品牌 A 担任 Agent，同时针对品牌 B 开展采购转售；也可以在一条产品线提供代理服务，在另一条产品线提供集成、安装或托管服务。分类必须按品牌、产品线、国家和实际交易模式判断，并分别保存证据，不能用公司整体名称强制选择单一角色。

- Reseller／Distributor：仅当存在不同品牌、产品线或明确分离的采购转售交易时与 Agent 同时标记；代理交易本身不增加采购转售角色。
- SI：既代表品牌获得商机，又以自身名义承担系统集成和方案结果时，可以同时标记。
- Installer：介绍商机之外，另行与客户签约并承担安装结果时，可以同时标记。
- MSP：另行向客户提供持续托管并承担运营责任时，可以同时标记。
- ISP：既代理其他运营商销售连接服务，又经营自己的互联网接入服务时，可以同时标记。

单纯把安装、托管或宽带客户转介给第三方并收取佣金，只标记 Commission Agent；只有自己承担对应服务责任时，才增加 Installer、MSP 或 ISP。

### 排除规则

普通广告、SEO、内容营销或数字营销公司，只有流量和联系人名单的 Lead Generation 平台，Affiliate、Influencer、优惠码推广账号，Marketplace、目录站和比价平台，以及只提供泛化咨询但不代表供应商开发客户的顾问，本身不属于 Commission Agent。

营销外包或销售外包公司如果实际代表委托方开展客户开发、持续跟进、谈判或销售推进，可以认定为 Outsourced Sales Agent；不能只根据 business development、marketing、consulting 或 representative 等关键词确认。品牌方自己的员工或内部销售代表不是独立候选公司，也不标记 Commission Agent。

### 强证据与辅助证据

强证据包括：候选公司官网明确自述 commercial agent、commission agent、manufacturer’s representative、independent sales representative 或 sales agency；厂商官方当地代表页面；公开 line card、represented manufacturers、territory 或行业范围；可验证的委托品牌、客户开发项目、代理协议说明、佣金／成功费模式或招投标代表身份。

辅助证据包括：商业代理或 Manufacturer Rep 协会目录、LinkedIn 公司和人员资料、展会与行业活动记录、招投标文件、公司注册业务范围、历史代理品牌、客户推荐、结构化社交页面及相关销售职位。只出现 agent、representative 或 business development 等通用词不能单独确认，必须排除房地产、保险、旅游、招聘等无关代理，并验证与 IT、网络、通信或目标产品市场的关系。

### 小型代理与长尾搜索

独立代理人、个人经营者和小型代理公司可以进入长尾候选池，不要求高流量网站、实体办公室、仓库或员工团队。系统必须能够验证经营身份，以及目标行业、区域覆盖、代表品牌、客户网络或真实代理活动中的至少一组有效证据；无法区分偶发介绍、普通顾问和专业代理时，应保留 Agent candidate／待核验。

搜索应组合当地语言中的 Commercial Agent、Commission Agent、Manufacturer’s Representative、Independent Sales Representative、Sales Agency、Outsourced Sales、ICT／Telecom Sales Agent、Local Representative、Tender Representative 和 Referral Partner，并结合厂商代表页面、行业协会、代理目录、LinkedIn、展会资料、招投标记录和公司注册信息交叉验证。

### 独立商业价值分级

Commission Agent 不是采购产品的下级渠道客户，因此不使用 account tier，也不评为 KA。系统使用独立字段 agent_potential_tier：

- Strategic：能够进入关键客户、运营商、政府项目或重要行业，并具备较强持续成交能力；
- Priority：有可验证客户网络、区域覆盖和相关产品经验，值得优先接触；
- Standard：代理业务真实，但覆盖、影响力或成交能力有限；
- Watchlist：代理身份、客户关系、利益冲突或实际能力仍待验证。

评价因素包括目标客户和决策人触达能力、区域与垂直行业覆盖、既有厂商和产品线、项目与招投标经验、商机质量和历史成交、技术理解和售前能力、市场声誉与合规风险、是否代理直接竞争品牌，以及是否能够持续开发而不是只提供一次性介绍。代理多个品牌或竞争品牌影响商业匹配度和优先级，但不否定 Agent 角色本身。

### 信息缺失与置信度

未找到公开代理合同、佣金比例、客户名称、办公室或仓库只能记录为 unknown，不能直接排除候选 Agent。系统必须区分“没有公开披露”和“证据显示其实际买断转售”。当货权、风险、报酬方式或委托关系不清楚时，应保留 Commission Agent candidate／待核验，并优先核实谁与客户签约开票、谁拥有货物、谁承担坏账和售后风险，以及候选公司的真实收入方式。

# 参考依据

以下资料用于支撑行业通用边界；本文件中的产品操作规则以业务负责人确认口径为最终准则。

- Global Technology Distribution Council，About the GTDC：https://gtdc.org/about-the-gtdc/
- Global Technology Distribution Council，Distribution Economic Impact Guide：https://gtdc.org/resource/distribution-economic-impact-guide/
- Global Technology Distribution Council，Understanding the Channel：https://gtdc.org/wp-content/uploads/2021/09/Understanding-the-Channel_2100907.pdf
- Cisco，Distributors：https://www.cisco.com/site/us/en/partners/distributors/index.html
- Cisco，Westcon-Comstor VAD profile：https://www.cisco.com/c/de_de/training-events/events/it-sa.html
- Cisco，Distributor Program terms（VAR／DVAR channel tiers）：https://www.cisco.com/c/dam/en_us/partners/distributor/01-14-2026-final-formatted-version-2hfy26-distributor-program-invest-terms-and-conditions.pdf
- Arrow ECS，Value-added services：https://www.arrow.com/globalecs/na/services/
- TD SYNNEX，Solutions Aggregation：https://www.tdsynnex.com/na/us/solutions-aggregation/
- TD SYNNEX，Connectivity partner models（VAR／Agent）：https://www.tdsynnex.com/na/us/connectivity/
- Hikvision，Dealer Partner Program and channel partner types：https://pro-av.hikvision.com/sg/about-us/company-profile/
- Hikvision Canada，Channel Partner Program：https://pro-av.hikvision.com/ca-en/Partners/
- U.S. Department of Veterans Affairs，Information for Resellers：https://www.va.gov/oal/business/fss/acronyms.asp
- HP，DesignJet specialist reseller transaction path：https://h41201.www4.hp.com/WMCF.Web/Dispatcher.aspx?action=terms&country=uk&language=en&ocugid=11535&program=11549&simdate=2026-01-31&wacp=20251214
- U.S. Census Bureau，Monthly Retail Trade definitions：https://www.census.gov/retail/mrts_general_faqs.html
- Eurostat，Retail trade turnover concepts：https://ec.europa.eu/eurostat/cache/metadata/en/sts_wrt_ts_esms_rs.htm
- OECD，The 2025 definition of e-commerce and guidelines for interpretation：https://www.oecd.org/en/publications/the-2025-oecd-definition-of-e-commerce-and-guidelines-for-interpretation_2254f1de-en.html
- UK Office for National Statistics，E-commerce glossary：https://www.ons.gov.uk/surveys/informationforbusinesses/businesssurveys/ecommerceglossary
- IBM，System integrator and solution provider roles：https://public.dhe.ibm.com/partnerworld/pub/svi/swg_svi_program_guide.pdf
- AWS，Services Partners：https://docs.aws.amazon.com/it_it/whitepapers/latest/how-customers-can-work-with-aws-and-our-apn-partners/apn-partners.html
- TP-Link，SolutionX partner types：https://partner.tp-link.com/gr/registration/apply.html%3Bjsessionid%3D4FF94AF0F15734BE6FD9599FF663D543
- Axis Communications，Resellers, system integrators and installers：https://www.axis.com/products/axis-ta4601
- AWS，Managed Services Provider Program：https://aws.amazon.com/partners/programs/msp/
- AWS，How Customers Can Work With AWS and Our APN Partners — Managed Service Providers：https://docs.aws.amazon.com/whitepapers/latest/how-customers-can-work-with-aws-and-our-apn-partners/managed-service-providers.html
- AWS，Managed Service Provider definition and ongoing lifecycle responsibility：https://aws.amazon.com/blogs/apn/more-value-greater-profitability-10-enhancements-to-the-aws-partner-experience/
- Cisco Meraki，Dashboard for Managed Service Providers：https://meraki.cisco.com/wp-content/uploads/2020/05/meraki_whitepaper_large_scale_deployments.pdf
- Microsoft，Azure Expert Managed Services Provider：https://partner.microsoft.com/en-US/partnership/azure-expert-msp
- EUR-Lex，Electronic communications services and internet access service definition：https://eur-lex.europa.eu/EN/legal-content/glossary/electronic-communications-services.html
- Regulation (EU) 2015/2120，Open internet access：https://eur-lex.europa.eu/eli/reg/2015/2120/oj/eng
- Ofcom，Internet Service Providers and Network Operators：https://www.ofcom.org.uk/siteassets/resources/documents/about-ofcom/foi/2023/october/internet-service-providers-isps-and-network-operators/%3Fv%3D330324
- Ofcom，General Authorisation Regime and systemless resellers：https://www.ofcom.org.uk/phones-and-broadband/accessibility/general-conditions-archive
- FCC，Wireless Broadband Internet Access Service Providers／WISP definition：https://docs.fcc.gov/public/attachments/DOC-390853A1.pdf
- BEREC，What is covered and protected by the Open Internet Regulation：https://www.berec.europa.eu/en/what-is-covered-and-protected-by-the-regulation
- BEREC，ISP retail and wholesale connectivity roles：https://www.berec.europa.eu/sites/default/files/files/news/bor_12_33_ip_ic_assessment.pdf
- European Union，Council Directive 86/653/EEC on self-employed commercial agents：https://eur-lex.europa.eu/legal-content/en/TXT/?uri=CELEX%3A31986L0653
- UK Department for Business and Trade，Working with agents and distributors：https://www.business.gov.uk/export-from-uk/learn/categories/prepare-sell-new-country/routes-to-market/when-use-agent-or-distributor/
- UK HMRC，What is an agent：https://www.gov.uk/hmrc-internal-manuals/vat-taxable-person/vtaxper35500
- UK HMRC，How to distinguish agency — title and risk factors：https://www.gov.uk/hmrc-internal-manuals/vat-taxable-person/vtaxper36820
- UK HMRC，Commissionaires overview：https://www.gov.uk/hmrc-internal-manuals/international-manual/intm441040
- UK Department for Business and Trade，When to use an agent or distributor：https://www.business.gov.uk/export-from-uk/learn/categories/prepare-sell-new-country/routes-to-market/when-use-agent-or-distributor/
- UK HMRC，INTM441080 Agents and distributors：https://www.gov.uk/hmrc-internal-manuals/international-manual/intm441080
- European Commission，Working paper on distributors that also act as agents：https://competition-policy.ec.europa.eu/document/download/a2a40192-9491-450d-8878-e7d1a17ce732_en
`;

export const CHANNEL_ROLE_TAXONOMY_DOCUMENT = {
  collection: "industry",
  externalId: "industry:channel-role-taxonomy",
  title: "销售线索候选公司角色分类标准",
  content,
  sourceType: "user-confirmed-operating-policy",
  authorityLevel: 5,
  language: "zh-CN",
  capturedAt: "2026-08-26T00:00:00+08:00",
  metadata: {
    topic: "channel-role-taxonomy",
    policyVersion: "2026-08-27.17",
    confirmedRoles: ["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP", "Commission Agent"],
    pendingRoles: [],
    userConfirmed: true,
    temporalReviewRequired: false,
  },
  visibility: "shared",
} as const satisfies KnowledgeDocumentInput;
