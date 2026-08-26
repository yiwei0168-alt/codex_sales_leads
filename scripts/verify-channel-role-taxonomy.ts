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
