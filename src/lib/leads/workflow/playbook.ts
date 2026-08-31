import { ChatOpenAI } from "@langchain/openai";

import type { ChannelRole } from "@/lib/domain";
import type { LeadSearchPlan } from "@/lib/assistant/types";

import { leadMarketPlaybookModelSchema, type LeadMarketPlaybookModelOutput } from "./schemas";
import {
  ALL_CHANNEL_ROLES,
  CHANNEL_ROLE_FAMILIES,
  type ChannelRoleFamily,
  type LeadMarketPlaybook,
  type LeadRagCitation,
  type LeadSearchQuerySpec,
  type RolePriority,
} from "./types";

export const LEAD_PLAYBOOK_PROMPT_VERSION = "lead-playbook-v3.0.0";

const familyLabels: Record<ChannelRoleFamily, string[]> = {
  distribution: ["networking equipment distributor wholesaler importer", "value added distributor IT network"],
  resale: ["network equipment reseller VAR dealer", "SMB networking products reseller"],
  retail: ["network router switch retailer e-tailer", "consumer SMB networking electronics shop"],
  services: ["enterprise network system integrator installer MSP", "business WiFi switching infrastructure solutions provider"],
  isp: ["internet service provider WISP fiber operator", "telecom broadband network operator equipment procurement"],
};

function selectedRoles(plan: LeadSearchPlan): ChannelRole[] {
  const requested = plan.roles.filter((role): role is ChannelRole => ALL_CHANNEL_ROLES.includes(role as ChannelRole));
  return requested.length > 0 ? [...new Set(requested)] : [...ALL_CHANNEL_ROLES];
}

function selectedFamilies(roles: ChannelRole[]): Array<{ family: ChannelRoleFamily; roles: ChannelRole[] }> {
  return Object.entries(CHANNEL_ROLE_FAMILIES).flatMap(([family, members]) => {
    const selected = members.filter((role) => roles.includes(role));
    return selected.length ? [{ family: family as ChannelRoleFamily, roles: [...selected] }] : [];
  });
}

function deterministicPlaybook(plan: LeadSearchPlan, citations: LeadRagCitation[], warning?: string): LeadMarketPlaybook {
  const roles = selectedRoles(plan);
  const families = selectedFamilies(roles);
  const country = new Intl.DisplayNames(["en"], { type: "region" }).of(plan.countryCode) ?? plan.countryName;
  const rolePriorities: RolePriority[] = families.map(({ family, roles: familyRoles }, index) => ({
    family,
    roles: familyRoles,
    weight: plan.objective === "existing-distributor-growth" && family !== "distribution" ? 1.2 : family === "distribution" ? 1.05 : 1,
    reason: plan.objective === "existing-distributor-growth" && family !== "distribution"
      ? "Existing-market growth prioritizes uncovered downstream demand nodes."
      : index === 0 ? "Build or validate a reliable supply path while developing demand nodes in parallel." : "Cover a distinct route to market and customer-access pattern.",
  }));
  const searchQueries: LeadSearchQuerySpec[] = families.flatMap(({ family, roles: familyRoles }, familyIndex) =>
    familyLabels[family].map((label, queryIndex) => ({
      family,
      roles: familyRoles,
      query: `${label} ${country} official company networking`,
      priority: Math.min(10, familyIndex * 2 + queryIndex + 1),
    })));
  const productEvidence = citations.filter((citation) => citation.collection === "product" && citation.corroborated);
  const productAngles = [...new Set(productEvidence.flatMap((citation) => [
    ...citation.structuredFacts.filter((fact) => fact.status === "verified").map((fact) => `${fact.model}: ${fact.factValue}`),
    citation.title,
  ]))].slice(0, 8);
  return {
    marketHypothesis: `${plan.countryName} should be developed through a market-specific mix of supply, resale, retail, service and operator nodes. Candidate quality and public evidence determine the final mix; no role receives a fixed quota.`,
    productAngles: productAngles.length ? productAngles : ["Product positioning requires evidence review"],
    preferredCompanyTraits: ["active target-market presence", "networking-adjacent customer access", "credible purchasing or project influence", "observable execution capability"],
    exclusions: ["directories and list pages", "inactive or unverifiable entities", "companies without target-market presence", "unrelated consumer-only businesses"],
    rolePriorities,
    searchQueries,
    ragCitationIds: citations.map((item) => item.chunkId),
    generatedBy: "deterministic-fallback",
    warnings: warning ? [warning] : [],
  };
}

function plannerConfiguration(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = process.env.LEAD_PLANNER_API_KEY?.trim() || process.env.LINGYU_API_KEY?.trim() || "";
  const configuredBase = process.env.LEAD_PLANNER_BASE_URL?.trim();
  const openAiBase = process.env.OPENAI_BASE_URL?.trim();
  const baseUrl = (configuredBase || (process.env.LINGYU_API_KEY ? "https://lingyuapi.com/v1" : openAiBase) || "https://api.openai.com/v1").replace(/\/$/, "");
  return {
    apiKey,
    baseUrl,
    model: process.env.LEAD_PLANNER_MODEL?.trim() || process.env.OPENAI_GENERATION_MODEL?.trim() || "gpt-5-mini",
  };
}

function sanitizeModelPlaybook(
  output: LeadMarketPlaybookModelOutput,
  plan: LeadSearchPlan,
  citations: LeadRagCitation[],
  model: string,
): LeadMarketPlaybook {
  const allowed = new Set(selectedRoles(plan));
  const fallback = deterministicPlaybook(plan, citations);
  const rolePriorities = output.rolePriorities.flatMap((item) => {
    const roles = item.roles.filter((role) => allowed.has(role));
    return roles.length ? [{ ...item, roles }] : [];
  });
  const queries = output.searchQueries.flatMap((item) => {
    const roles = item.roles.filter((role) => allowed.has(role));
    return roles.length ? [{ ...item, roles, query: item.query.replace(/[\r\n]+/g, " ").trim() }] : [];
  });
  const coveredFamilies = new Set(queries.map((item) => item.family));
  const missingQueries = fallback.searchQueries.filter((item) => !coveredFamilies.has(item.family));
  return {
    marketHypothesis: output.marketHypothesis,
    productAngles: output.productAngles,
    preferredCompanyTraits: output.preferredCompanyTraits,
    exclusions: output.exclusions,
    rolePriorities: rolePriorities.length ? rolePriorities : fallback.rolePriorities,
    searchQueries: [...queries, ...missingQueries].slice(0, 20),
    ragCitationIds: citations.map((item) => item.chunkId),
    generatedBy: "langchain-model",
    model,
    warnings: missingQueries.length ? [`Planner omitted ${missingQueries.length} required role-family queries; deterministic coverage was added.`] : [],
  };
}

export async function buildLeadMarketPlaybook(plan: LeadSearchPlan, citations: LeadRagCitation[]): Promise<LeadMarketPlaybook> {
  const config = plannerConfiguration();
  if (!config.apiKey) return deterministicPlaybook(plan, citations, "Lingyu lead-planner credentials are not configured.");
  const model = new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    temperature: 0,
    maxRetries: 2,
    timeout: 90_000,
    streamUsage: false,
    configuration: { baseURL: config.baseUrl },
  }).withStructuredOutput(leadMarketPlaybookModelSchema, {
    name: "lead_market_playbook",
    method: "jsonSchema",
    strict: true,
  });
  const context = citations.map((item) => [
    `[KB:${item.chunkId}] (${item.collection}) ${item.title}`,
    `retrievalSignals=${item.retrievalSignals.join(",")} corroborated=${item.corroborated}`,
    `structuredFacts=${JSON.stringify(item.structuredFacts)}`,
    item.content,
  ].join("\n")).join("\n\n");
  try {
    const output = await model.invoke([
      {
        role: "system",
        content: [
          "You create an evidence-grounded market playbook for Cudy Technology's networking-channel development.",
          "Use only the supplied RAG context for Cudy product, company and industry claims.",
          "Product claims must be supported by a corroborated source and verified structured facts; omit conflicting or semantic-only specifications.",
          "The final candidate mix is quality-driven and has no fixed quota per role.",
          "KA is an account tier, never a channel role. ISP is a downstream role.",
          "Generate two concise web-search queries per requested role family where possible.",
          "Never include contact-person or email searches.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({ plan, allowedRoles: selectedRoles(plan), ragContext: context }),
      },
    ]);
    return sanitizeModelPlaybook(output, plan, citations, config.model);
  } catch (error) {
    return deterministicPlaybook(plan, citations, `LangChain playbook generation degraded safely: ${error instanceof Error ? error.message : String(error)}`);
  }
}
