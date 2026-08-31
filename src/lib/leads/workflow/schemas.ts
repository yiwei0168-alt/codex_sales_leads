import { z } from "zod";

import { ALL_CHANNEL_ROLES, CHANNEL_ROLE_FAMILIES } from "./types";

const channelRoleSchema = z.enum(ALL_CHANNEL_ROLES as [typeof ALL_CHANNEL_ROLES[number], ...typeof ALL_CHANNEL_ROLES]);
const primaryBusinessRoleSchema = z.union([channelRoleSchema, z.enum(["Hybrid", "Unresolved"])]);
const channelRoleFamilySchema = z.enum(Object.keys(CHANNEL_ROLE_FAMILIES) as [keyof typeof CHANNEL_ROLE_FAMILIES, ...(keyof typeof CHANNEL_ROLE_FAMILIES)[]]);
const claimStatusSchema = z.enum(["supported", "not-supported", "unknown", "conflicting"]);
const eligibilityStatusSchema = z.enum(["eligible", "research-required", "ineligible-for-current-task",
  "insufficient-evidence-for-recommendation"]);
const companyScaleClassSchema = z.enum(["Global/Enterprise", "National", "Regional", "Local/Small", "Unknown"]);
const researchDepthSchema = z.enum(["deep", "standard", "limited"]);
const cooperationPathTypeSchema = z.enum(["Direct Tier-1 Supply", "Distributor-Mediated Supply",
  "Direct Downstream Channel Supply", "OEM/ODM", "Other"]);
const dimensionNameSchema = z.enum([
  "productFamilyMatch", "customerAndScenarioOverlap", "positioningCompatibility",
  "cooperationPathAndBuyingInfluence", "scaleAndChannelCoverage", "executionAndEnablement", "opportunityAndRisk",
]);

export const leadEvidenceFindingModelSchema = z.object({
  kind: z.string().min(1).max(80),
  statement: z.string().min(2).max(500),
  status: z.string().min(1).max(50),
  roles: z.array(channelRoleSchema).max(11),
  evidenceIds: z.array(z.string()).max(100),
  confidence: z.number().min(0).max(100),
  notes: z.array(z.string().min(2).max(1_000)).max(12),
});

export const leadMarketPlaybookModelSchema = z.object({
  marketHypothesis: z.string().min(20).max(1_200),
  productAngles: z.array(z.string().min(2).max(240)).min(1).max(12),
  preferredCompanyTraits: z.array(z.string().min(2).max(240)).min(1).max(16),
  exclusions: z.array(z.string().min(2).max(160)).max(16),
  rolePriorities: z.array(z.object({
    family: channelRoleFamilySchema,
    roles: z.array(channelRoleSchema).min(1),
    weight: z.number().min(0.25).max(2),
    reason: z.string().min(4).max(300),
  })).min(1).max(5),
  searchQueries: z.array(z.object({
    family: channelRoleFamilySchema,
    roles: z.array(channelRoleSchema).min(1),
    query: z.string().min(8).max(300),
    priority: z.number().int().min(1).max(10),
  })).min(1).max(20),
});

export const leadCorrectionModelSchema = z.object({
  candidateId: z.string().min(8).max(80),
  resolvedCompanyName: z.string().min(2).max(300),
  resolvedOfficialWebsiteUrl: z.string().max(1_000),
  roles: z.array(channelRoleSchema).max(11),
  primaryBusinessRole: primaryBusinessRoleSchema,
  primaryBusinessRoleReason: z.string().min(2).max(2_000),
  officialWebsiteEvidenceId: z.string().nullable(),
  evidenceIds: z.array(z.string()).max(100),
  findings: z.array(leadEvidenceFindingModelSchema).min(1).max(30),
  reasons: z.array(z.string().min(2).max(300)).min(1).max(12),
  confidence: z.number().min(0).max(100),
  escalation: z.object({
    required: z.boolean(),
    expectedTotalScoreChange: z.number().min(0).max(100),
    criticalStateChanges: z.array(z.enum([
      "identity", "eligibility", "primary-role", "company-existence", "country-presence", "networking-relevance",
    ])).max(6),
    higherCapabilityCanResolve: z.boolean(),
    reason: z.string().max(300),
  }),
  warnings: z.array(z.string().max(300)).max(12),
});

export const leadCorrectionBatchSchema = z.object({
  corrections: z.array(leadCorrectionModelSchema).min(1).max(5),
});

const gatesSchema = z.object({
  correctedIdentityUsable: claimStatusSchema,
  companyExists: claimStatusSchema,
  targetCountryPresence: claimStatusSchema,
  networkingRelevant: claimStatusSchema,
  independentProspect: claimStatusSchema,
});

const dimensionsSchema = z.object({
  productFamilyMatch: z.number().min(0).max(25),
  customerAndScenarioOverlap: z.number().min(0).max(15),
  positioningCompatibility: z.number().min(0).max(10),
  cooperationPathAndBuyingInfluence: z.number().min(0).max(15),
  scaleAndChannelCoverage: z.number().min(0).max(15),
  executionAndEnablement: z.number().min(0).max(10),
  opportunityAndRisk: z.number().min(0).max(10),
});

const cooperationPathSchema = z.object({
  pathId: z.string().min(2).max(80),
  pathType: cooperationPathTypeSchema,
  candidateRole: channelRoleSchema,
  fitComponents: z.object({
    roleStructureFit: z.number().min(0).max(30),
    userStageAndSupplyFit: z.number().min(0).max(25),
    productCustomerScenarioFit: z.number().min(0).max(20),
    procurementAndInfluence: z.number().min(0).max(15),
    executionFeasibility: z.number().min(0).max(10),
  }),
  findingIds: z.array(z.string()).max(10),
  evidenceIds: z.array(z.string()).max(20),
  reason: z.string().min(2).max(300),
  prerequisites: z.array(z.string().min(2).max(180)).max(4),
  risks: z.array(z.string().min(2).max(180)).max(4),
  unknowns: z.array(z.string().min(2).max(180)).max(4),
  allowedInExternalEmail: z.boolean(),
});

const escalationSchema = z.object({
  required: z.boolean(),
  expectedTotalScoreChange: z.number().min(0).max(100),
  criticalStateChanges: z.array(z.enum([
    "identity", "eligibility", "primary-role", "company-existence", "country-presence", "networking-relevance",
  ])).max(6),
  higherCapabilityCanResolve: z.boolean(),
  reason: z.string().max(300),
});

export const leadAssessmentModelSchema = z.object({
  candidateId: z.string().min(8).max(80),
  gates: gatesSchema,
  eligibilityStatus: eligibilityStatusSchema,
  companyScaleClass: companyScaleClassSchema,
  researchDepth: researchDepthSchema,
  supplyModel: z.string().min(1).max(2_000),
  brandInvolvement: z.string().min(1).max(2_000),
  cooperationPaths: z.array(cooperationPathSchema).max(2),
  selectedPathId: z.string().max(80).nullable(),
  dimensions: dimensionsSchema,
  dimensionRationales: z.array(z.object({
    dimension: dimensionNameSchema,
    score: z.number().min(0).max(25),
    reason: z.string().min(2).max(400),
    findingIds: z.array(z.string()).max(20),
    evidenceIds: z.array(z.string()).max(20),
    confidence: z.number().min(0).max(100),
  })).min(7).max(7),
  confidence: z.number().min(0).max(100),
  summary: z.string().min(8).max(400),
  reasons: z.array(z.string().min(2).max(220)).min(1).max(6),
  risks: z.array(z.string().min(2).max(220)).max(6),
  unknowns: z.array(z.string().min(2).max(180)).max(6),
  evidenceIds: z.array(z.string()).max(30),
  escalation: escalationSchema,
  warnings: z.array(z.string().max(300)).max(12),
});

export const leadAssessmentBatchSchema = z.object({
  assessments: z.array(leadAssessmentModelSchema).min(1).max(5),
});

export const leadAssessmentJudgeSchema = z.object({
  candidateId: z.string().min(8).max(80),
  decision: z.enum(["accept-a", "accept-b", "merge", "targeted-research"]),
  assessment: leadAssessmentModelSchema,
  rationale: z.string().min(8).max(800),
  researchQuestion: z.string().max(500),
  warnings: z.array(z.string().max(300)).max(12),
});

export type LeadMarketPlaybookModelOutput = z.infer<typeof leadMarketPlaybookModelSchema>;
export type LeadCorrectionModelOutput = z.infer<typeof leadCorrectionModelSchema>;
export type LeadAssessmentModelOutput = z.infer<typeof leadAssessmentModelSchema>;
