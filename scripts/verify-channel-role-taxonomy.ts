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
