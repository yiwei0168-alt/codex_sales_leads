import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { CHANNEL_ROLE_TAXONOMY_DOCUMENT } from "../src/data/channel-role-taxonomy";
import { getPool, tenantQuery } from "../src/lib/rag/db";
import { embedTexts } from "../src/lib/rag/openai-provider";
import { hybridSearch } from "../src/lib/rag/repository";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

interface StoredTaxonomy {
  external_id: string;
  title: string;
  visibility: string;
  source_type: string;
  authority_level: number;
  chunk_count: string;
  metadata: Record<string, unknown>;
  combined_content: string;
}

const verificationQueries = [
  "一级代理商 Distributor 是否必须有实体仓库和公开库存？",
  "佣金型 Agent 是否属于 Distributor 一级代理商？",
  "Distributor 和 VAD 能否评为 KA？",
  "VAD 和 VAR 应该怎样根据规模、采购能力和品牌直接采购关系区分？",
  "直接从品牌采购但主要服务最终客户的增值经销商属于 VAD 还是 VAR DVAR？",
  "VAR 是否必须同时属于 Reseller？",
  "Dealer 和 Retailer 什么时候可以同时标记？实体门店是否是 Dealer 必要条件？",
  "纯产品转售但没有技术增值的公司能否属于 Reseller？",
  "Retailer 和 E-tailer 是否默认同时标记 Reseller？",
  "什么样的实体场所可以证明候选公司是 Retailer？仓库和提货点算吗？",
  "有实体门店并且可以在自营网站直接下单应该标记哪些角色？",
  "没有独立官网只在当地 Marketplace 开店的公司能否成为 E-tailer？",
  "Marketplace 平台自营店和第三方卖家是否应该合并成同一条销售线索？",
  "只有社交媒体私信询价能否确认 E-tailer？",
  "SI 是否必须销售产品或者使用多个品牌？",
  "怎样区分 System Integrator SI 和 Installer？",
  "Installer 是否必须销售产品或拥有证书和独立官网？",
  "安装总包公司使用分包团队后还属于 Installer 吗？",
  "MSP 的必要条件是什么？一次性安装维修或产品保修算不算 MSP？",
  "没有公开 SLA 或主动监控的小型托管服务商能否认定为 MSP？",
  "MSSP 与 MSP 是什么关系？ISP SI Installer VAR 能否同时标记 MSP？",
  "ISP 是否必须拥有自建网络 ASN 和通信牌照？虚拟转售型 ISP 算吗？",
  "WISP 移动卫星企业和批发运营商是否都属于 ISP？纯客户转介算不算？",
  "ISP 套餐内出租 CPE 是否自动属于 Reseller？ISP 与 MSP Installer 怎样重叠？",
  "Commission Agent 和 Distributor Reseller 的核心区别是什么？Agent 会取得货权吗？",
  "Manufacturer Representative Referral Agent 和外包销售公司是否属于 Commission Agent？",
  "固定代理费或 Retainer 加佣金还能算 Agent 吗？Agent 能否同时是 SI Installer MSP ISP？",
  "Commission Agent 能否评为 KA？应该怎样评价代理商业价值？",
  "什么证据才能证明候选公司与 Cudy 主动网络设备业务相关？泛化 IT infrastructure 表述够吗？",
  "只做结构化布线和光纤施工的 Installer 能否通过 Cudy networking relevance 门槛？",
  "Networking relevance 和 product use-case fit 有什么区别？",
  "搜索摘要和模型生成的公司总结能否单独作为候选公司证据？",
  "候选公司官网错误或证据属于同名公司时 sufficient evidence 应该怎样判断？",
  "长尾小公司是否必须有多个独立来源交叉验证？LinkedIn Marketplace 或 Google Business 能否作为单一来源？",
  "合作路径没有采购上架报价选型或部署控制证据时最高能打几分？",
  "合作路径规则中，一级渠道重点验证品牌准入、直接采购、进口和下级供货；B2B 转售与项目服务分别验证什么？",
  "合作路径规则中，明确只安装客户自备设备的 Installer 为什么最高 2 分？现有伙伴关系标签是否加分？",
  "候选公司有多个真实角色但无法判断业务占比时是否必须选择 primary role？",
  "同一家公司能否同时通过多个搜索通道？通道准入是否要求该业务是主营业务？",
  "在多角色集合与搜索通道成员资格规则中，VAD 为什么必须满足 Distributor，安装工作为什么只确认 Installer 而不能确认 SI？",
];

try {
  const rows = await tenantQuery<StoredTaxonomy>(OWNER_USER_ID,
    `select d.external_id, d.title, d.visibility, d.source_type, d.authority_level,
            count(ch.id)::text as chunk_count, d.metadata,
            string_agg(ch.content, E'\n' order by ch.chunk_index) as combined_content
       from knowledge_document d
       join knowledge_collection c on c.id = d.collection_id
       join knowledge_chunk ch on ch.document_id = d.id
      where c.slug = $1 and d.external_id = $2 and d.owner_id = $3 and d.status = 'active'
      group by d.id`,
    [CHANNEL_ROLE_TAXONOMY_DOCUMENT.collection, CHANNEL_ROLE_TAXONOMY_DOCUMENT.externalId, OWNER_USER_ID],
    "admin",
  );

  const stored = rows[0];
  if (!stored) throw new Error("Channel role taxonomy was not found in the shared knowledge database");

  const requiredText = [
    "不适用于 Distributor（一级代理商）或 VAD",
    "佣金型 Agent 不属于 Distributor",
    "不是绝对必要条件",
    "不得直接当作“不具备”",
    "标记 VAD 时必须同时标记 Distributor",
    "首要边界是采购层级及支撑该层级的规模和采购能力",
    "普通物流、融资、订货、基础市场活动或一般产品培训本身不足以证明 VAD",
    "DVAR（Direct Value-Added Reseller）是 VAR 的直采子型",
    "标记 VAR 时必须同时标记 Reseller",
    "直采本身不能把 VAR 自动归为 VAD",
    "Dealer 与 Retailer 默认不重叠",
    "同时存在可验证的转售业务和线下零售店",
    "是否获得授权不作为 Dealer 的硬性准入条件",
    "只进行标准化产品转售、能够验证实际交易身份的公司也可以成立 Reseller",
    "Reseller 是 VAR 和 Dealer 的基础父角色",
    "作为独立零售角色，默认不自动标记 Reseller",
    "实体消费者零售场所是 Retailer 的必要条件",
    "仓库、公司办公室、维修点、普通物流提货点或不能现场购买的 Showroom 不足以证明 Retailer",
    "应同时标记 Retailer 与 E-tailer",
    "E-tailer 不要求拥有独立官网",
    "必须生成相互独立的候选销售线索",
    "不能单独确认 E-tailer",
    "销售线索搜索必须支持独立的 Marketplace discovery lane",
    "SI 不强制要求多品牌",
    "SI 不要求一定采购或转售产品",
    "SI 与 Installer 的核心边界是是否承担整体方案、技术架构、系统协同和项目结果责任",
    "基础配置、测试和调试可以作为安装工作的一部分",
    "即使部分或全部现场工作由分包团队执行，仍可标记 Installer",
    "不作为全球统一硬门槛",
    "MSP 是通过持续性服务关系",
    "主动监控是 MSP 的典型能力和强证据，但不是绝对必要条件",
    "只有预付工时、临时响应或按次收费，但不承担任何持续管理责任的支持包不构成 MSP",
    "确认 MSSP 时必须同时标记 MSP",
    "仅提供连接或带宽属于 ISP，不自动成为 MSP",
    "未找到公开合同、SLA、计费周期、NOC／SOC、自有平台或厂商认证只能记录为 unknown",
    "自建光纤、基站、无线塔、核心网络、ASN、IP 地址资源和通信牌照是设施型 ISP 的强证据，但不作为全球统一硬门槛",
    "没有自有网络的 Virtual／Reseller ISP",
    "WISP：通过固定无线、Wi-Fi、微波或其他无线网络向最终用户提供互联网接入",
    "只转介宽带客户，由实际运营商签约、开票和承担服务结果的公司属于 Commission Agent／Referral Agent，不属于 ISP",
    "套餐内仍归 ISP 所有、租赁、借用或仅作为服务终端部署的 CPE 不自动构成 Reseller",
    "Wholesale ISP 销售带宽、Transit 或 Backhaul 不等于硬件一级分销",
    "Commission Agent 的核心是代表、介绍和促成，而不是以自身商业主体身份买入后转售",
    "Referral／Introducer Agent 必须具有可验证、可重复的 B2B 商机介绍业务",
    "本产品中的 Commission Agent 专指卖方侧销售代理",
    "固定服务费或 Retainer 加佣金不影响 Agent 身份",
    "是否取得货权并承担库存与转售风险，是 Commission Agent 与 Distributor／Reseller 的首要边界",
    "单纯把安装、托管或宽带客户转介给第三方并收取佣金，只标记 Commission Agent",
    "Commission Agent 不是采购产品的下级渠道客户，因此不使用 account tier，也不评为 KA",
    "agent_potential_tier",
    "角色分类与 Cudy 销售线索准入必须分开判断",
    "实际销售、分销、选型、采购、设计、安装、部署、运营或维护主动网络设备",
    "泛化表述不能单独证明 networking relevance",
    "纯结构化布线、铜缆、光纤或弱电施工可以证明 Installer 角色",
    "product and use-case fit 继续独立判断",
    "未证明／not demonstrated",
    "Installer 角色成立",
    "证据充分性是质量门槛，不是机械的页面数量门槛",
    "provider summary 和模型生成的公司总结只用于发现候选",
    "候选公司名称、声称的官网域名和证据所指向的经营主体必须一致",
    "镜像转载、重复摘要和实质相同的摘录只按一份证据计算",
    "LinkedIn 官方公司页属于可用的一方公司资料",
    "一条内容具体、主体明确的公司自有官网页面可以达到基本证据门槛",
    "对长尾线索中的小公司放宽证据数量门槛，不要求多个独立证据交叉验证",
    "该例外只降低准入所需的来源数量",
    "合作路径评分衡量候选公司在实际合作中对采购、产品上架、订货、报价、选型、BOM、品牌推荐、部署或持续运营的可验证控制与影响",
    "没有明确证据证明任何采购、上架、报价、选型、BOM、品牌推荐或部署控制时，最高为 2",
    "明确证明一项合作杠杆时最高为 3",
    "证明两项或以上互补杠杆",
    "才可为 5",
    "一级渠道重点验证品牌准入／直接采购／进口",
    "B2B 转售重点验证采购、实际产品上架或订货、报价和品牌／产品推荐",
    "项目服务重点验证设计、规格、BOM、品牌或产品选型、采购和部署责任",
    "明确只安装客户自备设备的 Installer，合作路径最高为 2",
    "但“现有客户／现有伙伴”关系标签本身不加分",
    "不要求为测评或产品输出强制选择一个 primary role",
    "不得根据网站篇幅、搜索排名、页面数量或模型印象推断“主营业务”或角色占比",
    "搜索通道准入采用成员资格判断",
    "只要证据能够证明它确实经营提交通道允许的至少一种业务",
    "长尾小公司的单来源规则继续适用",
    "技术能力不能弥补下级渠道供货证据的缺失",
    "只有项目设计、集成或咨询但没有产品转售证据时，可以属于 SI",
    "只执行既定安装工作可以确认 Installer，但不能确认 SI",
    "possible role／待核验角色",
    "不再评价模型是否选择了唯一 primary role",
  ];
  const missingText = requiredText.filter((fragment) => !stored.combined_content.includes(fragment));

  const retrievalChecks = [];
  for (const question of verificationQueries) {
    const [embedding] = await embedTexts([question]);
    const matches = await hybridSearch(
      OWNER_USER_ID,
      question,
      embedding,
      { collections: ["industry"] },
      5,
    );
    const taxonomyMatch = matches.find((match) => match.metadata.topic === "channel-role-taxonomy");
    retrievalChecks.push({
      question,
      matched: Boolean(taxonomyMatch),
      rank: taxonomyMatch ? matches.indexOf(taxonomyMatch) + 1 : null,
      score: taxonomyMatch ? Number(taxonomyMatch.score.toFixed(4)) : null,
      headingPath: taxonomyMatch?.headingPath ?? [],
    });
  }

  const result = {
    stored: {
      externalId: stored.external_id,
      title: stored.title,
      visibility: stored.visibility,
      sourceType: stored.source_type,
      authorityLevel: stored.authority_level,
      chunkCount: Number(stored.chunk_count),
      metadata: stored.metadata,
    },
    missingRequiredText: missingText,
    retrievalChecks,
  };
  console.log(JSON.stringify(result, null, 2));

  if (
    stored.visibility !== "shared"
    || stored.source_type !== CHANNEL_ROLE_TAXONOMY_DOCUMENT.sourceType
    || stored.authority_level !== CHANNEL_ROLE_TAXONOMY_DOCUMENT.authorityLevel
    || missingText.length > 0
    || retrievalChecks.some((check) => !check.matched)
  ) {
    process.exitCode = 1;
  }
} finally {
  await getPool().end();
}
