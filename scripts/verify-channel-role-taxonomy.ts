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
