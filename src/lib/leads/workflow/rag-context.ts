import { embedTextsWithUsage, type EmbeddingCallUsage } from "@/lib/rag/openai-provider";
import { hybridSearch } from "@/lib/rag/repository";
import type { LeadSearchPlan } from "@/lib/assistant/types";

import type { LeadRagCitation } from "./types";

const ROLE_PRODUCT_TERMS: Partial<Record<LeadSearchPlan["roles"][number], string[]>> = {
  Distributor: ["Wi-Fi Router", "Mesh Solution", "Switch"],
  VAD: ["Business Wi-Fi", "Managed Switch", "Cloud management"],
  VAR: ["Business Wi-Fi", "Access Point", "PoE"],
  Dealer: ["Wi-Fi Router", "Mesh Solution", "4G LTE"],
  Reseller: ["Wi-Fi Router", "Mesh Solution", "USB Adapter"],
  Retailer: ["Wi-Fi Router", "Mesh Solution", "Wi-Fi Repeater"],
  "E-tailer": ["Wi-Fi Router", "Mesh Solution", "USB Adapter"],
  SI: ["Access Point", "Managed Switch", "PoE", "Cloud management"],
  Installer: ["Access Point", "PoE", "Wireless Bridges"],
  MSP: ["Cloud management", "Managed Switch", "Business Wi-Fi"],
  ISP: ["GPON", "4G LTE", "TR-069 family", "Wi-Fi Router"],
};

function structuredProductTerms(plan: LeadSearchPlan): string[] {
  return [...new Set(plan.roles.flatMap((role) => ROLE_PRODUCT_TERMS[role] ?? []))];
}

function questions(plan: LeadSearchPlan): Array<{ collection: LeadRagCitation["collection"]; question: string; limit: number }> {
  const roleText = plan.roles.join(", ");
  return [
    {
      collection: "product",
      question: `Which Cudy networking product families, use cases, certifications and customer needs are most relevant when developing ${roleText} in ${plan.countryName}?`,
      limit: 6,
    },
    {
      collection: "company",
      question: `Which Cudy company, brand, manufacturing, OEM ODM, channel support and global execution capabilities matter for partners in ${plan.countryName}?`,
      limit: 4,
    },
    {
      collection: "industry",
      question: `Which networking channel structures, go-to-market practices, compliance requirements and market-development criteria matter for ${roleText} in ${plan.countryName}?`,
      limit: 6,
    },
  ];
}

export async function retrieveLeadRagContext(userId: string, plan: LeadSearchPlan,
  options: { onEmbeddingUsage?: (usage: EmbeddingCallUsage[]) => void | Promise<void> } = {}): Promise<LeadRagCitation[]> {
  const specs = questions(plan);
  const embedded = await embedTextsWithUsage(specs.map((item) => item.question));
  await options.onEmbeddingUsage?.(embedded.usage);
  const embeddings = embedded.embeddings;
  const groups = await Promise.all(specs.map(async (spec, index) => {
    const chunks = await hybridSearch(userId, spec.question, embeddings[index], {
      collections: [spec.collection],
      market: spec.collection === "industry" ? plan.countryCode : undefined,
      minAuthority: 1,
      structuredProductTerms: spec.collection === "product" ? structuredProductTerms(plan) : undefined,
    }, spec.limit);
    // Market-specific industry material is optional. Retry without the market
    // filter when a new country has no dedicated documents yet.
    const usable = chunks.length > 0 || spec.collection !== "industry"
      ? chunks
      : await hybridSearch(userId, spec.question, embeddings[index], { collections: [spec.collection], minAuthority: 1 }, spec.limit);
    return usable.map((chunk): LeadRagCitation => ({
      chunkId: chunk.id,
      collection: chunk.collection,
      title: chunk.title,
      content: chunk.content.slice(0, 1_800),
      sourceUrl: chunk.sourceUrl,
      score: chunk.score,
      retrievalSignals: chunk.retrievalSignals,
      corroborated: chunk.corroborated,
      structuredFacts: Array.isArray(chunk.metadata.structuredFacts)
        ? chunk.metadata.structuredFacts as LeadRagCitation["structuredFacts"] : [],
    }));
  }));
  return groups.flat();
}
