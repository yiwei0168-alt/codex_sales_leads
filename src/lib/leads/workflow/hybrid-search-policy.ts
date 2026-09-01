import { createHash } from "node:crypto";
import { z } from "zod";

import rawPolicy from "../../../../config/lead-search/hybrid-search-v1.0.0.json";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import type { ChannelRole } from "@/lib/domain";

export const DISCOVERY_PROVIDER_IDS = [
  "gemini-full", "gemini-product", "searchapi", "google-places", "brave", "exa",
] as const;
export type DiscoveryProviderId = typeof DISCOVERY_PROVIDER_IDS[number];
export const SEARCH_CATEGORY_IDS = [
  "distribution", "resale", "retail", "si-msp", "installer", "isp", "agent", "brand-owner",
  "oem-odm-opportunity",
] as const;
export type LeadSearchCategory = typeof SEARCH_CATEGORY_IDS[number];

const providerSchema = z.enum(DISCOVERY_PROVIDER_IDS);
const stepSchema = z.object({
  provider: providerSchema,
  engine: z.enum(["google-grounded", "google", "bing", "google-places", "brave", "exa"]),
  mechanism: z.string().min(2).max(80),
  trigger: z.enum([
    "core", "index-gap", "second-index-gap", "semantic-gap", "complex-semantic-gap", "web-gap",
    "local-gap", "explicit-local-gap", "technical-gap",
  ]),
});
const categorySchema = z.object({
  tracks: z.record(z.string().min(2), z.array(stepSchema).min(1)),
});
export const hybridSearchPolicySchema = z.object({
  policyKey: z.string().min(2),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  strategyDocumentVersion: z.string().min(3),
  status: z.enum(["draft", "active", "retired"]),
  maxConsecutiveNoValueBatches: z.number().int().min(1).max(5),
  defaultBatchSize: z.number().int().min(1).max(20),
  maxBatchSize: z.number().int().min(1).max(20),
  discoveryForbiddenProviders: z.array(z.string()).min(1),
  explicitOnlyCategories: z.array(z.enum(SEARCH_CATEGORY_IDS)),
  categories: z.record(z.enum(SEARCH_CATEGORY_IDS), categorySchema),
}).superRefine((policy, context) => {
  for (const category of SEARCH_CATEGORY_IDS) {
    if (!policy.categories[category]) context.addIssue({ code: "custom", path: ["categories", category], message: "Missing category" });
  }
  for (const [category, definition] of Object.entries(policy.categories)) {
    for (const [track, steps] of Object.entries(definition.tracks)) {
      if (steps[0]?.trigger !== "core") context.addIssue({ code: "custom", path: ["categories", category, "tracks", track], message: "First step must be core" });
      const seen = new Set<string>();
      for (const [index, step] of steps.entries()) {
        if (policy.discoveryForbiddenProviders.includes(step.provider)) context.addIssue({
          code: "custom", path: ["categories", category, "tracks", track, index, "provider"],
          message: `${step.provider} is forbidden in discovery`,
        });
        const identity = `${step.provider}:${step.engine}:${step.mechanism}`;
        if (seen.has(identity)) context.addIssue({ code: "custom", path: ["categories", category, "tracks", track, index], message: "Duplicate search mechanism in one track" });
        seen.add(identity);
      }
    }
  }
});

export type HybridSearchPolicy = z.infer<typeof hybridSearchPolicySchema>;
export const ACTIVE_HYBRID_SEARCH_POLICY: HybridSearchPolicy = hybridSearchPolicySchema.parse(rawPolicy);

const DEFAULT_ROLES: ChannelRole[] = [
  "Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP",
];
const agentRequest = /销售代理|商业代理|制造商代表|manufacturer(?:'s)? representative|sales agent|handelsvertretung/i;
const brandRequest = /品牌商|品牌公司|自有品牌公司|brand owner|product company/i;
const oemRequest = /\bOEM\b|\bODM\b|private[- ]?label|white[- ]?label|白牌|贴牌|定制(?:产品|硬件|路由器|CPE)/i;

export interface NormalizedLeadSearchPlan extends LeadSearchPlan {
  opportunityTargets: Array<"OEM/ODM">;
  coverageMode: "auto" | "local" | "national" | "mixed";
  verifiedOnly: boolean;
}

export interface HybridSearchRouteStep {
  category: LeadSearchCategory;
  track: string;
  sequence: number;
  provider: DiscoveryProviderId;
  engine: z.infer<typeof stepSchema>["engine"];
  mechanism: string;
  trigger: z.infer<typeof stepSchema>["trigger"];
  invocationReason: string;
}

export function normalizeLeadSearchPlan(plan: LeadSearchPlan): NormalizedLeadSearchPlan {
  const explicitAgent = agentRequest.test(plan.userRequest);
  const explicitOem = oemRequest.test(plan.userRequest);
  const explicitBrand = brandRequest.test(plan.userRequest) || explicitOem;
  const requested = plan.roles.length ? plan.roles : DEFAULT_ROLES;
  const roles = [...new Set(requested.filter((role) => (role !== "Agent" && role !== "Brand Owner")
    || (role === "Agent" && explicitAgent) || (role === "Brand Owner" && explicitBrand)))];
  return {
    ...plan,
    roles: roles.length ? roles : explicitAgent ? ["Agent"] : explicitBrand ? ["Brand Owner"] : DEFAULT_ROLES,
    opportunityTargets: explicitOem ? ["OEM/ODM"] : [],
    coverageMode: plan.coverageMode ?? "auto",
    verifiedOnly: plan.verifiedOnly ?? false,
  };
}

function dualTracks(mode: NormalizedLeadSearchPlan["coverageMode"], targetCount: number, national: string, local: string): string[] {
  if (mode === "local") return [local];
  if (mode === "national") return [national];
  if (mode === "mixed" || targetCount >= 50) return [national, local];
  return [national, local];
}

function selectedCategoryTracks(plan: NormalizedLeadSearchPlan): Array<[LeadSearchCategory, string[]]> {
  const roles = new Set(plan.roles);
  const selected: Array<[LeadSearchCategory, string[]]> = [];
  if (roles.has("Distributor") || roles.has("VAD")) selected.push(["distribution", ["strategic"]]);
  if (roles.has("VAR") || roles.has("Dealer") || roles.has("Reseller")) {
    selected.push(["resale", dualTracks(plan.coverageMode, plan.targetCount, "national-b2b", "local-b2b")]);
  }
  if (roles.has("Retailer") || roles.has("E-tailer")) {
    const tracks: string[] = [];
    if (roles.has("E-tailer")) tracks.push("etail");
    if (roles.has("Retailer")) {
      if (plan.coverageMode === "local") tracks.push("retail-local");
      else if (plan.coverageMode === "national") tracks.push("retail-national");
      else if (plan.coverageMode === "mixed" || plan.targetCount >= 50) tracks.push("retail-national", "retail-local");
      else tracks.push("retail-national");
    }
    selected.push(["retail", [...new Set(tracks)]]);
  }
  if (roles.has("SI") || roles.has("MSP")) {
    selected.push(["si-msp", dualTracks(plan.coverageMode, plan.targetCount, "national-complex", "local-smb")]);
  }
  if (roles.has("Installer")) {
    const tracks = plan.coverageMode === "national" ? ["national-professional"]
      : plan.coverageMode === "mixed" || plan.targetCount >= 50 ? ["local-regional", "national-professional"]
        : ["local-regional"];
    selected.push(["installer", tracks]);
  }
  if (roles.has("ISP")) {
    const tracks = plan.coverageMode === "local" ? ["regional-wisp"]
      : plan.coverageMode === "national" ? ["strategic-national"]
        : plan.coverageMode === "mixed" || plan.targetCount >= 50 ? ["strategic-national", "regional-wisp"]
          : ["strategic-national"];
    selected.push(["isp", tracks]);
  }
  if (roles.has("Agent")) selected.push(["agent", ["professional-agent"]]);
  if (roles.has("Brand Owner") && !plan.opportunityTargets.includes("OEM/ODM")) {
    selected.push(["brand-owner", ["owned-network-products"]]);
  }
  if (plan.opportunityTargets.includes("OEM/ODM")) {
    selected.push(["oem-odm-opportunity", ["customer-opportunity"]]);
  }
  return selected;
}

export function buildHybridSearchRoute(input: LeadSearchPlan): HybridSearchRouteStep[] {
  const plan = normalizeLeadSearchPlan(input);
  return selectedCategoryTracks(plan).flatMap(([category, tracks]) => tracks.flatMap((track) => {
    const steps = ACTIVE_HYBRID_SEARCH_POLICY.categories[category].tracks[track];
    if (!steps) throw new Error(`Hybrid search policy is missing ${category}/${track}`);
    return steps.map((step, sequence) => ({
      category, track, sequence, ...step,
      invocationReason: step.trigger === "core" ? `Core mechanism for ${category}/${track}`
        : `${step.trigger} only after the preceding batch leaves a measured gap`,
    }));
  }));
}

export function hybridSearchPolicyChecksum(policy: HybridSearchPolicy = ACTIVE_HYBRID_SEARCH_POLICY): string {
  return createHash("sha256").update(JSON.stringify(policy)).digest("hex");
}
