import { createHash } from "node:crypto";
import { z } from "zod";

import policyV2 from "../../../config/lead-scoring/policy-v2.0.0.json";

const weightsSchema = z.object({
  productAndUseCaseFit: z.number().int().nonnegative(),
  cooperationPathAndBuyingInfluence: z.number().int().nonnegative(),
  scaleAndChannelCoverage: z.number().int().nonnegative(),
  executionAndEnablement: z.number().int().nonnegative(),
  opportunityAndRisk: z.number().int().nonnegative(),
});

const productTrackSchema = z.object({
  label: z.string().min(2),
  enabledByDefault: z.boolean(),
  families: z.record(z.string(), z.number().int().nonnegative()),
});

export const leadScoringPolicySchema = z.object({
  policyKey: z.string().min(2),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  schemaVersion: z.literal("lead-scoring-policy-v2"),
  status: z.enum(["draft", "active", "retired"]),
  weights: weightsSchema,
  productAndUseCaseFit: z.object({
    productFamilyMatch: z.number().int(),
    customerAndScenarioOverlap: z.number().int(),
    positioningCompatibility: z.number().int(),
    productFamilyMatchMethod: z.literal("best-enabled-track"),
    fullPortfolioMode: z.literal("explicit-task-only"),
    unknownEvidence: z.literal("unknown-not-zero"),
  }),
  productTracks: z.record(z.string(), productTrackSchema),
  roleScorecards: z.record(z.string(), z.object({
    roles: z.array(z.string()).min(1),
    customerReachEvidence: z.array(z.string()).min(1),
    scenarioEvidence: z.array(z.string()).min(1),
    executionEvidence: z.array(z.string()).min(1),
  })),
  subweights: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())),
  researchPolicy: z.record(z.string(), z.unknown()),
  evidenceFreshnessDays: z.record(z.string(), z.number().int().positive()),
  eligibilityPolicy: z.record(z.string(), z.unknown()),
  escalationPolicy: z.record(z.string(), z.unknown()),
  accountTierPolicy: z.object({
    tier1Distribution: z.array(z.string()).length(4),
    downstream: z.array(z.string()).length(4),
    kaScope: z.string().min(20),
    strategicThreshold: z.number().min(0).max(100),
    priorityThreshold: z.number().min(0).max(100),
    thresholdsConfigurable: z.boolean(),
    doesNotAffectScore: z.literal(true),
  }),
  knowledgePolicy: z.record(z.string(), z.unknown()),
}).superRefine((policy, context) => {
  const total = Object.values(policy.weights).reduce((sum, value) => sum + value, 0);
  if (total !== 100) context.addIssue({ code: "custom", path: ["weights"], message: `Weights total ${total}, expected 100` });
  const productTotal = policy.productAndUseCaseFit.productFamilyMatch
    + policy.productAndUseCaseFit.customerAndScenarioOverlap
    + policy.productAndUseCaseFit.positioningCompatibility;
  if (productTotal !== policy.weights.productAndUseCaseFit) {
    context.addIssue({ code: "custom", path: ["productAndUseCaseFit"], message: "Product subweights must total 50" });
  }
  for (const [track, definition] of Object.entries(policy.productTracks)) {
    const totalFamilies = Object.values(definition.families).reduce((sum, value) => sum + value, 0);
    if (totalFamilies !== 100) context.addIssue({ code: "custom", path: ["productTracks", track], message: "Track family weights must total 100" });
  }
  if (policy.accountTierPolicy.tier1Distribution.includes("KA")) {
    context.addIssue({ code: "custom", path: ["accountTierPolicy", "tier1Distribution"], message: "KA cannot be a tier-1 distributor account label" });
  }
});

export type LeadScoringPolicy = z.infer<typeof leadScoringPolicySchema>;

export const ACTIVE_LEAD_SCORING_POLICY: LeadScoringPolicy = leadScoringPolicySchema.parse(policyV2);

export function scoringPolicyChecksum(policy: LeadScoringPolicy = ACTIVE_LEAD_SCORING_POLICY): string {
  return createHash("sha256").update(JSON.stringify(policy)).digest("hex");
}

export function scoreWeightTotal(policy: LeadScoringPolicy = ACTIVE_LEAD_SCORING_POLICY): number {
  return Object.values(policy.weights).reduce((sum, value) => sum + value, 0);
}
