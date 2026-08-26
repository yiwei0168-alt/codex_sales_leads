import type { KnowledgeDocumentInput } from "@/lib/rag/types";

const content = `# 销售线索候选公司角色分类标准

## 使用范围与字段边界

本标准用于网络与 IT 硬件销售线索搜索、候选公司分类、证据审查和结果解释。角色（channel role）、渠道层级（channel layer）、与 Cudy 的关系状态（relationship status）和商业价值等级（account tier）必须分开判断；不能用其中一个字段替代另一个字段。

- channel role 描述公司在交易链条中实际承担的功能，允许一家公司同时拥有多个角色，但必须根据主要业务和当前搜索任务选择 primary role。
- channel layer 描述其位于一级分销层还是下级渠道层。
- relationship status 描述其是待开发候选、已验证现有伙伴或其他关系；“Distributor”本身不表示已经与 Cudy 合作。
- account tier 是对下级渠道客户商业价值的分级。KA 只适用于 Downstream Channel 中的客户，不适用于 Distributor（一级代理商）或 VAD。

## 跨角色确认规则

### KA 适用边界

KA 是商业价值等级，不是渠道角色。仅当候选公司已被归入 Downstream Channel，且其本身是下级渠道客户时，才可根据商业价值评为 KA。Distributor（一级代理商）和 VAD 无论规模或战略价值多高，都不得标记为 KA；它们的价值应使用独立的一级渠道评价维度表达。

### Commission Agent 独立候选类型

佣金型 Agent 不属于 Distributor。Agent 通常代表委托方促成交易、按佣金获得报酬，并且通常不取得货物所有权、不以自身名义承担进销差价及主要库存风险。Agent 具有独立商业价值，应作为单独的候选公司类型纳入搜索体系。其完整纳入条件、证据标准、排除规则及商业价值分级方式需要在 Agent 角色的专项讨论中确认；在确认前不得把 Agent 自动归入 Distributor，也不得默认其适用 KA。

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

### 多角色与 primary role

同一公司可以兼有 Distributor、VAD、Retailer、E-tailer 或其他角色。只有当向下级渠道供货是其主要业务，或在目标国家和目标产品线上构成具有战略意义的独立业务时，才把 Distributor 设为 primary role。若证据只支持下级转售或终端零售，应保留相应角色并降低 Distributor 判断置信度。

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

VAD 可以协助下级伙伴完成面向最终客户的售前、PoC、配置、安装或售后，也可能直接参与部分项目。是否同时标记 VAR 或 SI，应根据其是否以自身名义面向最终客户承担经常性的方案销售或项目交付来判断。只要其直接品牌采购、一级渠道供货和下级伙伴赋能仍构成核心业务，就可以保留 VAD 为 primary role。

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
    policyVersion: "2026-08-26.7",
    confirmedRoles: ["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer"],
    pendingRoles: ["SI", "Installer", "MSP", "ISP", "Commission Agent"],
    userConfirmed: true,
    temporalReviewRequired: false,
  },
  visibility: "shared",
} as const satisfies KnowledgeDocumentInput;
