import { z } from "zod";

export const geminiControlCandidateSchema = z.object({
  rank: z.coerce.number().int().min(1).max(50),
  companyName: z.string().min(1).max(240),
  officialWebsite: z.string().url().max(2_000),
  marketSignal: z.string().min(1).max(600),
  roleSignal: z.string().min(1).max(600),
  relevanceSignal: z.string().min(1).max(600),
  evidenceUrls: z.array(z.string().url().max(2_000)).min(1).max(8),
});

export const geminiControlOutputSchema = z.object({
  market: z.string().min(2).max(120),
  category: z.enum(["distribution", "resale", "retail", "si-msp"]),
  candidates: z.array(geminiControlCandidateSchema).max(50),
});

const dimensionsSchema = z.object({
  productAndUseCaseFit: z.coerce.number().int().min(0).max(50),
  channelAndBuyingInfluence: z.coerce.number().int().min(0).max(15),
  sameRoleScaleAndCoverage: z.coerce.number().int().min(0).max(15),
  executionAndEnablement: z.coerce.number().int().min(0).max(10),
  opportunityAndRisk: z.coerce.number().int().min(0).max(10),
});

export const blindJudgeV2CitationSchema = z.object({
  evidenceId: z.string().min(1).max(100),
  claim: z.string().min(1).max(500),
  support: z.enum(["direct", "partial", "context-only", "unsupported"]),
});

export const blindJudgeV2OutputSchema = z.object({
  packetId: z.string().min(8).max(100),
  externalSearchUsed: z.boolean(),
  externalKnowledgeUsed: z.boolean(),
  isRealOperatingCompany: z.boolean(),
  operatesInTargetMarket: z.boolean(),
  supportedRoles: z.array(z.string().max(80)).max(8),
  primaryRole: z.string().max(80),
  dimensions: dimensionsSchema,
  totalScore: z.coerce.number().int().min(0).max(100),
  eligibility: z.enum(["eligible", "research-required", "ineligible-for-current-task",
    "insufficient-evidence-for-recommendation"]),
  dimensionReasons: z.array(z.object({
    dimension: z.enum(["productAndUseCaseFit", "channelAndBuyingInfluence", "sameRoleScaleAndCoverage",
      "executionAndEnablement", "opportunityAndRisk"]),
    reason: z.string().max(500),
    citations: z.array(blindJudgeV2CitationSchema).max(12),
  })).length(5),
  unsupportedOrContradictoryClaims: z.array(z.string().max(500)).max(12),
});

export const blindJudgeOutputSchema = z.object({
  packetId: z.string().min(8).max(100),
  isRealOperatingCompany: z.boolean(),
  operatesInTargetMarket: z.boolean(),
  supportedRoles: z.array(z.string().max(80)).max(8),
  primaryRole: z.string().max(80),
  requestedCategoryMatch: z.boolean(),
  dimensions: dimensionsSchema,
  totalScore: z.coerce.number().int().min(0).max(100),
  eligibility: z.enum(["eligible", "research-required", "ineligible-for-current-task",
    "insufficient-evidence-for-recommendation"]),
  dimensionReasons: z.array(z.object({ dimension: z.string().max(100), reason: z.string().max(500),
    evidenceIds: z.array(z.string().max(100)).max(12) })).length(5),
  unsupportedOrContradictoryClaims: z.array(z.string().max(500)).max(12),
  citationAlignment: z.boolean(),
});

export type GeminiControlOutput = z.infer<typeof geminiControlOutputSchema>;
export type BlindJudgeOutput = z.infer<typeof blindJudgeOutputSchema>;
export type BlindJudgeV2Output = z.infer<typeof blindJudgeV2OutputSchema>;
