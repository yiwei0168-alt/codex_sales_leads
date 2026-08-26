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

“规模大”是判断直接采购能力的代理信号，不是独立且绝对的分类标准。员工数、营业额或网站流量不能单独决定 VAD／VAR；应尽可能验证实际采购路径、品牌授权层级、下级渠道客户、批量采购能力及渠道项目。不同国家、品牌和产品线可能设置不同的合作门槛，因此同一家公司可能在某条产品线是 VAD，在另一条产品线是 VAR，分类时应保留市场和产品线范围。

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

# 参考依据

以下资料用于支撑行业通用边界；本文件中的产品操作规则以业务负责人确认口径为最终准则。

- Global Technology Distribution Council，About the GTDC：https://gtdc.org/about-the-gtdc/
- Global Technology Distribution Council，Distribution Economic Impact Guide：https://gtdc.org/resource/distribution-economic-impact-guide/
- Global Technology Distribution Council，Understanding the Channel：https://gtdc.org/wp-content/uploads/2021/09/Understanding-the-Channel_2100907.pdf
- Cisco，Distributors：https://www.cisco.com/site/us/en/partners/distributors/index.html
- Cisco，Westcon-Comstor VAD profile：https://www.cisco.com/c/de_de/training-events/events/it-sa.html
- Arrow ECS，Value-added services：https://www.arrow.com/globalecs/na/services/
- TD SYNNEX，Solutions Aggregation：https://www.tdsynnex.com/na/us/solutions-aggregation/
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
    policyVersion: "2026-08-26.2",
    confirmedRoles: ["Distributor", "VAD"],
    pendingRoles: ["VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP", "Commission Agent"],
    userConfirmed: true,
    temporalReviewRequired: false,
  },
  visibility: "shared",
} as const satisfies KnowledgeDocumentInput;
