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
  roles: z.array(channelRoleSchema).max(13),
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
  })).min(1).max(7),
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
  roles: z.array(channelRoleSchema).max(13),
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

const correctionRoleValues = new Set<string>([...ALL_CHANNEL_ROLES, "Hybrid", "Unresolved"]);
const correctionCriticalStates = new Set([
  "identity", "eligibility", "primary-role", "company-existence", "country-presence", "networking-relevance",
]);

function boundedString(value: unknown, maximum: number): unknown {
  return typeof value === "string" ? value.slice(0, maximum) : value;
}

function boundedStringArray(value: unknown, maximumItems: number, maximumLength: number): unknown {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, maximumItems)
    .map((item) => item.slice(0, maximumLength)) : value;
}

/**
 * Repairs only transport/schema noise from a model response. It truncates oversized text and removes unknown enum
 * labels; it never converts unsupported business claims into supported ones or invents evidence.
 */
export function sanitizeLeadCorrectionOutput(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("corrections" in value)
    || !Array.isArray((value as { corrections?: unknown }).corrections)) return value;
  const corrections = (value as { corrections: unknown[] }).corrections.slice(0, 5).map((item) => {
    if (typeof item !== "object" || item === null) return item;
    const source = item as Record<string, unknown>;
    const rawRoles = Array.isArray(source.roles) ? source.roles : [];
    const roles = rawRoles.filter((role): role is string => typeof role === "string"
      && correctionRoleValues.has(role) && role !== "Hybrid" && role !== "Unresolved").slice(0, 13);
    const primaryValid = typeof source.primaryBusinessRole === "string"
      && correctionRoleValues.has(source.primaryBusinessRole);
    const repairWarnings = [
      ...(Array.isArray(source.warnings) ? source.warnings.filter((warning): warning is string => typeof warning === "string") : []),
      ...(!primaryValid ? ["Unknown primary-role label was normalized to Unresolved."] : []),
      ...(roles.length < rawRoles.length ? ["Unknown role labels were removed before schema validation."] : []),
    ].slice(0, 12).map((warning) => warning.slice(0, 300));
    const findings = Array.isArray(source.findings) ? source.findings.slice(0, 30).map((finding) => {
      if (typeof finding !== "object" || finding === null) return finding;
      const record = finding as Record<string, unknown>;
      return { ...record, kind: boundedString(record.kind, 80), statement: boundedString(record.statement, 500),
        status: boundedString(record.status, 50),
        roles: Array.isArray(record.roles) ? record.roles.filter((role) => typeof role === "string"
          && correctionRoleValues.has(role) && role !== "Hybrid" && role !== "Unresolved").slice(0, 13) : record.roles,
        evidenceIds: Array.isArray(record.evidenceIds) ? record.evidenceIds.slice(0, 100) : record.evidenceIds,
        notes: boundedStringArray(record.notes, 12, 1_000) };
    }) : source.findings;
    const escalation = typeof source.escalation === "object" && source.escalation !== null
      ? source.escalation as Record<string, unknown> : null;
    return { ...source, candidateId: boundedString(source.candidateId, 80),
      resolvedCompanyName: boundedString(source.resolvedCompanyName, 300),
      resolvedOfficialWebsiteUrl: boundedString(source.resolvedOfficialWebsiteUrl, 1_000), roles,
      primaryBusinessRole: primaryValid ? source.primaryBusinessRole : "Unresolved",
      primaryBusinessRoleReason: boundedString(source.primaryBusinessRoleReason, 2_000),
      evidenceIds: Array.isArray(source.evidenceIds) ? source.evidenceIds.slice(0, 100) : source.evidenceIds,
      findings, reasons: boundedStringArray(source.reasons, 12, 300), warnings: repairWarnings,
      escalation: escalation ? { ...escalation,
        criticalStateChanges: Array.isArray(escalation.criticalStateChanges)
          ? escalation.criticalStateChanges.filter((state) => typeof state === "string"
            && correctionCriticalStates.has(state)).slice(0, 6) : escalation.criticalStateChanges,
        reason: boundedString(escalation.reason, 300) } : source.escalation };
  });
  return { ...(value as Record<string, unknown>), corrections };
}

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

const leadAssessmentCommonSchema = z.object({
  candidateId: z.string().min(8).max(80),
  gates: gatesSchema,
  eligibilityStatus: eligibilityStatusSchema,
  companyScaleClass: companyScaleClassSchema,
  researchDepth: researchDepthSchema,
  supplyModel: z.string().min(1).max(2_000),
  brandInvolvement: z.string().min(1).max(2_000),
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

export const leadAssessmentScoreOnlyModelSchema = leadAssessmentCommonSchema;

export const leadAssessmentModelSchema = leadAssessmentCommonSchema.extend({
  cooperationPaths: z.array(cooperationPathSchema).max(2),
  selectedPathId: z.string().max(80).nullable(),
});

export const leadAssessmentBatchSchema = z.object({
  assessments: z.array(leadAssessmentModelSchema).min(1).max(5),
});

export const leadAssessmentScoreOnlyBatchSchema = z.object({
  assessments: z.array(leadAssessmentScoreOnlyModelSchema).min(1).max(5),
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
export type LeadAssessmentScoreOnlyModelOutput = z.infer<typeof leadAssessmentScoreOnlyModelSchema>;
