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
const cooperationPathTypeSchema = z.enum(["Direct Distribution", "Direct Channel Supply",
  "Distributor-Supplied Channel", "Direct Retail/E-commerce", "ISP/Operator Supply",
  "Project/Specification Partnership", "Co-sell/Co-supply", "Referral/Introduction", "OEM/ODM"]);
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
  needsEscalation: z.boolean(),
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
  pathNodes: z.array(z.object({
    actor: z.enum(["Cudy", "Candidate", "Intermediary", "Customer"]),
    role: z.string().min(2).max(500),
  })).min(2).max(8),
  supplyFlow: z.string().min(2).max(500),
  decisionRole: z.string().min(2).max(1_000),
  fitScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  rank: z.number().int().min(1).max(20).nullable(),
  evidenceIds: z.array(z.string()).max(20),
  prerequisites: z.array(z.string().min(2).max(300)).max(10),
  valuePropositions: z.array(z.string().min(2).max(300)).max(10),
  risks: z.array(z.string().min(2).max(300)).max(10),
  unknowns: z.array(z.string().min(2).max(300)).max(10),
  targetTitles: z.array(z.string().min(2).max(160)).max(10),
  recommendedCta: z.string().min(2).max(500),
  allowedInExternalEmail: z.boolean(),
});

export const leadAssessmentModelSchema = z.object({
  candidateId: z.string().min(8).max(80),
  gates: gatesSchema,
  eligibilityStatus: eligibilityStatusSchema,
  companyScaleClass: companyScaleClassSchema,
  researchDepth: researchDepthSchema,
  supplyModel: z.string().min(1).max(2_000),
  brandInvolvement: z.string().min(1).max(2_000),
  cooperationPaths: z.array(cooperationPathSchema).max(8),
  selectedPathId: z.string().max(80).nullable(),
  dimensions: dimensionsSchema,
  dimensionRationales: z.array(z.object({
    dimension: dimensionNameSchema,
    score: z.number().min(0).max(25),
    reason: z.string().min(2).max(1_500),
    findingIds: z.array(z.string()).max(20),
    evidenceIds: z.array(z.string()).max(20),
    confidence: z.number().min(0).max(100),
  })).min(7).max(7),
  confidence: z.number().min(0).max(100),
  summary: z.string().min(8).max(800),
  reasons: z.array(z.string().min(2).max(300)).min(1).max(12),
  risks: z.array(z.string().min(2).max(300)).max(12),
  unknowns: z.array(z.string().min(2).max(200)).max(12),
  evidenceIds: z.array(z.string()).max(30),
  needsEscalation: z.boolean(),
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
