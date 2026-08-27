import { z } from "zod";

import { ALL_CHANNEL_ROLES, CHANNEL_ROLE_FAMILIES } from "./types";

const channelRoleSchema = z.enum(ALL_CHANNEL_ROLES as [typeof ALL_CHANNEL_ROLES[number], ...typeof ALL_CHANNEL_ROLES]);
const channelRoleFamilySchema = z.enum(Object.keys(CHANNEL_ROLE_FAMILIES) as [keyof typeof CHANNEL_ROLE_FAMILIES, ...(keyof typeof CHANNEL_ROLE_FAMILIES)[]]);

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
  resolvedOfficialWebsiteUrl: z.string().url().max(1_000),
  roles: z.array(channelRoleSchema).max(11),
  officialWebsiteEvidenceId: z.string().nullable(),
  evidenceIds: z.array(z.string()).max(30),
  reasons: z.array(z.string().min(2).max(300)).min(1).max(12),
  confidence: z.number().min(0).max(100),
  needsEscalation: z.boolean(),
  warnings: z.array(z.string().max(300)).max(12),
});

export const leadCorrectionBatchSchema = z.object({
  corrections: z.array(leadCorrectionModelSchema).min(1).max(5),
});

const gatesSchema = z.object({
  correctedIdentityUsable: z.boolean(),
  companyExists: z.boolean(),
  targetCountryPresence: z.boolean(),
  networkingRelevant: z.boolean(),
  independentProspect: z.boolean(),
});

const dimensionsSchema = z.object({
  productAndUseCaseFit: z.number().min(0).max(44),
  cooperationPathAndBuyingInfluence: z.number().min(0).max(32),
  evidenceAndEntityConfidence: z.number().min(0).max(20),
  roleIdentificationQuality: z.number().min(0).max(3),
  channelClassificationQuality: z.number().min(0).max(1),
});

export const leadAssessmentModelSchema = z.object({
  candidateId: z.string().min(8).max(80),
  gates: gatesSchema,
  accountTier: z.enum(["KA", "Priority", "Standard", "Long-tail"]),
  supplyModel: z.enum(["Distributor Supply", "Brand Direct", "Co-sell/Co-supply", "TBD"]),
  brandInvolvement: z.enum(["Light", "Standard", "Deep"]),
  dimensions: dimensionsSchema,
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

export type LeadMarketPlaybookModelOutput = z.infer<typeof leadMarketPlaybookModelSchema>;
export type LeadCorrectionModelOutput = z.infer<typeof leadCorrectionModelSchema>;
export type LeadAssessmentModelOutput = z.infer<typeof leadAssessmentModelSchema>;
