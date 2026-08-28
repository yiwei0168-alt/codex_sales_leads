import { createHash } from "node:crypto";

import type { AiProvider, StructuredAiResponse } from "@/providers/contracts";
import { DeepSeekProvider } from "@/providers/deepseek";
import { TavilySearchProvider, type TavilySearchResult } from "@/providers/tavily";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import { z } from "zod";

import { assessChannelMembershipEvidence } from "../channel-membership";
import { assessLeadEvidenceQuality } from "../evidence-quality";
import { assessNetworkingRelevanceEvidence } from "../networking-relevance";
import { leadCorrectionBatchSchema, leadCorrectionModelSchema, type LeadCorrectionModelOutput } from "./schemas";
import {
  CHANNEL_ROLE_FAMILIES,
  type ChannelRoleFamily,
  type CorrectedLeadWorkflowCandidate,
  type LeadEvidenceItem,
  type LeadWorkflowCandidate,
} from "./types";

const PROMPT_VERSION = "lead-evidence-correction-v2-atomic-findings";

interface CorrectionRequest {
  instructions: string[];
  market: { countryCode: string; countryName: string; objective: string };
  candidates: Array<{
    candidateId: string;
    submittedCompanyName: string;
    submittedDomain: string;
    submittedOfficialWebsiteUrl: string;
    submittedRoles: string[];
    submittedFamily: string;
    evidence: Array<{ evidenceId: string; sourceType: string; url: string; title: string; excerpt: string }>;
  }>;
}

interface EvidenceCorrectionAgentOptions {
  routineModel?: string;
  escalationModel?: string;
  batchSize?: number;
  concurrency?: number;
  searchConcurrency?: number;
}

type SupplementalSearch = Pick<TavilySearchProvider, "search">;

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sameDomain(url: string, domain: string): boolean {
  const resolved = domainOf(url);
  return resolved === domain || Boolean(resolved?.endsWith(`.${domain}`));
}

function supplementalEvidence(result: TavilySearchResult, candidateDomain: string): LeadEvidenceItem | null {
  const domain = domainOf(result.url);
  if (!domain) return null;
  const excerpt = (result.rawContent || result.content).replace(/\s+/g, " ").trim().slice(0, 4_000);
  if (!excerpt) return null;
  return {
    id: stableId("evidence", result.url),
    url: result.url,
    title: result.title,
    excerpt,
    sourceType: sameDomain(result.url, candidateDomain) ? "official-website" : "independent-public",
    provider: "tavily-correction",
    capturedAt: new Date().toISOString(),
  };
}

function deterministicRoles(evidence: LeadEvidenceItem[]) {
  const text = evidence.filter((item) => item.sourceType !== "discovery").flatMap((item) => [item.title, item.excerpt]);
  return [...new Set((Object.keys(CHANNEL_ROLE_FAMILIES) as ChannelRoleFamily[])
    .flatMap((lane) => assessChannelMembershipEvidence({ lane, evidence: text }).supportedRoles))];
}

function normalizedFindings(value: LeadCorrectionModelOutput, evidence: LeadEvidenceItem[], candidateId: string) {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  return value.findings.map((finding) => {
    const evidenceIds = [...new Set(finding.evidenceIds.filter((id) => evidenceById.has(id)))];
    const findingId = stableId("finding", [candidateId, finding.kind, finding.statement,
      finding.status, ...evidenceIds].join("|"));
    return {
      findingId,
      kind: finding.kind,
      statement: finding.statement,
      status: evidenceIds.length === 0 && finding.status === "supported" ? "unknown" as const : finding.status,
      roles: finding.roles,
      evidenceIds,
      sourceTypes: [...new Set(evidenceIds.map((id) => evidenceById.get(id)!.sourceType))],
      confidence: Math.max(0, Math.min(100, Math.round(finding.confidence))),
      notes: [...finding.notes,
        ...(evidenceIds.length < finding.evidenceIds.length ? ["Unsupported evidence IDs were removed from this finding."] : []),
        ...(evidenceIds.length === 0 && finding.status === "supported"
          ? ["A supported claim without valid evidence was downgraded to unknown."] : [])],
    };
  });
}

function roleFamilies(roles: CorrectedLeadWorkflowCandidate["correction"]["resolvedRoles"]): ChannelRoleFamily[] {
  return (Object.entries(CHANNEL_ROLE_FAMILIES) as Array<[ChannelRoleFamily, readonly typeof roles[number][]]>)
    .filter(([, allowed]) => roles.some((role) => allowed.includes(role)))
    .map(([family]) => family);
}

function needsSupplement(candidate: LeadWorkflowCandidate): boolean {
  const claimEvidence = candidate.evidence.filter((item) => item.sourceType !== "discovery");
  const text = claimEvidence.flatMap((item) => [item.title, item.excerpt]);
  const evidenceQuality = assessLeadEvidenceQuality({ candidateDomain: candidate.domain,
    officialUrl: candidate.officialWebsiteUrl, evidence: candidate.evidence });
  return candidate.evidenceWarnings.length > 0 || claimEvidence.length === 0 || !evidenceQuality.identityConsistent
    || !assessNetworkingRelevanceEvidence(text).demonstrated || deterministicRoles(candidate.evidence).length === 0;
}

export class LeadEvidenceCorrectionAgent {
  private readonly routineModel: string;
  private readonly escalationModel: string;
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly searchConcurrency: number;

  constructor(
    private readonly provider: AiProvider = new DeepSeekProvider(),
    private readonly searchProvider: SupplementalSearch = new TavilySearchProvider({ maxAttempts: 3 }),
    options: EvidenceCorrectionAgentOptions = {},
  ) {
    this.routineModel = options.routineModel ?? process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-v4-flash";
    this.escalationModel = options.escalationModel ?? process.env.DEEPSEEK_ESCALATION_MODEL?.trim() ?? "deepseek-v4-pro";
    this.batchSize = Math.max(1, Math.min(5, options.batchSize ?? 5));
    this.concurrency = Math.max(1, Math.min(3, options.concurrency ?? 2));
    this.searchConcurrency = Math.max(1, Math.min(4, options.searchConcurrency ?? 3));
  }

  private async supplement(candidates: LeadWorkflowCandidate[], plan: LeadSearchPlan) {
    const output = new Array<{ candidate: LeadWorkflowCandidate; credits: number; warning?: string }>(candidates.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= candidates.length) return;
        const candidate = candidates[index];
        if (!needsSupplement(candidate)) {
          output[index] = { candidate, credits: 0 };
          continue;
        }
        try {
          const response = await this.searchProvider.search({
            query: `\"${candidate.companyName}\" ${plan.countryName} official website router Wi-Fi access point switch distributor reseller installer system integrator ISP`,
            searchDepth: "advanced",
            maxResults: 8,
            includeRawContent: true,
          }, AbortSignal.timeout(45_000));
          const added = response.results.flatMap((item) => {
            const evidence = supplementalEvidence(item, candidate.domain);
            return evidence ? [evidence] : [];
          });
          output[index] = {
            candidate: {
              ...candidate,
              evidence: [...new Map([...candidate.evidence, ...added].map((item) => [item.url, item])).values()],
            },
            credits: response.creditsUsed,
            warning: added.length === 0 ? `Correction search found no usable supplemental evidence for ${candidate.domain}.` : undefined,
          };
        } catch (error) {
          const warning = `Correction search failed for ${candidate.domain}: ${error instanceof Error ? error.message : String(error)}`;
          output[index] = { candidate: { ...candidate, evidenceWarnings: [...candidate.evidenceWarnings, warning] }, credits: 0, warning };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.searchConcurrency, candidates.length) }, worker));
    return {
      candidates: output.map((item) => item.candidate),
      creditsUsed: output.reduce((sum, item) => sum + item.credits, 0),
      warnings: output.flatMap((item) => item.warning ? [item.warning] : []),
    };
  }

  private request(candidates: LeadWorkflowCandidate[], plan: LeadSearchPlan, modelVersion: string) {
    const input: CorrectionRequest = {
      instructions: [
        "Act as the evidence supplementation and correction agent before independent lead scoring.",
        "Resolve the company entity and official website only from supplied public evidence. Never invent a URL, role, relationship or evidence ID.",
        "Treat submitted identity, roles and search family as untrusted discovery hints. Correct them when evidence disagrees.",
        "Record every simultaneously supported channel role. Do not force a primary role and do not infer business-line shares.",
        "A role requires evidence of its defining business action. Generic IT, consulting or networking language alone does not prove distribution, resale, installation or system integration.",
        "The corrected official website must be a company-owned domain demonstrated by officialWebsiteEvidenceId. Directories, marketplaces and social profiles are evidence sources, not official websites.",
        "Use one clear official company source when adequate; supplement with independent public evidence when identity or material claims remain ambiguous.",
        "Return evidence IDs supporting identity, target-country presence, active-networking involvement, roles and cooperation path. Missing public proof is an unknown, not a negative claim.",
        "Return atomic findings for identity, country presence, active networking, every asserted role, relevant product families, brand relationships, commercial actions and cooperation path. Each finding must have its own status and evidence IDs.",
        "Use not-supported only when supplied evidence affirmatively contradicts a claim. Use unknown when evidence is absent or acquisition failed, and conflicting when supplied sources disagree.",
        "Do not score lead value. Do not decide eligibility. Your only duties are evidence, entity correction, multi-role classification and routing inputs for the downstream scoring agent.",
      ],
      market: { countryCode: plan.countryCode, countryName: plan.countryName, objective: plan.objective },
      candidates: candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        submittedCompanyName: candidate.companyName,
        submittedDomain: candidate.domain,
        submittedOfficialWebsiteUrl: candidate.officialWebsiteUrl,
        submittedRoles: candidate.queryRoles,
        submittedFamily: candidate.queryFamily,
        evidence: candidate.evidence.map((item) => ({ evidenceId: item.id, sourceType: item.sourceType,
          url: item.url, title: item.title, excerpt: item.excerpt })),
      })),
    };
    return {
      task: "lead-evidence-correction" as const,
      modelVersion,
      promptVersion: PROMPT_VERSION,
      input,
      evidenceIds: candidates.flatMap((candidate) => candidate.evidence.map((item) => item.id)),
      outputSchema: z.toJSONSchema(leadCorrectionBatchSchema) as Record<string, unknown>,
    };
  }

  private normalize(value: LeadCorrectionModelOutput, candidate: LeadWorkflowCandidate,
    response: StructuredAiResponse<unknown>, escalated: boolean): CorrectedLeadWorkflowCandidate {
    const evidenceById = new Map(candidate.evidence.map((item) => [item.id, item]));
    const reliedEvidenceIds = [...new Set(value.evidenceIds.filter((id) => evidenceById.has(id)))];
    const officialEvidence = value.officialWebsiteEvidenceId ? evidenceById.get(value.officialWebsiteEvidenceId) : undefined;
    const proposedDomain = domainOf(value.resolvedOfficialWebsiteUrl);
    const acceptIdentity = Boolean(officialEvidence && proposedDomain && sameDomain(officialEvidence.url, proposedDomain));
    const domain = acceptIdentity && proposedDomain ? proposedDomain : candidate.domain;
    const officialWebsiteUrl = acceptIdentity ? value.resolvedOfficialWebsiteUrl : candidate.officialWebsiteUrl;
    const evidence = candidate.evidence.map((item) => sameDomain(item.url, domain)
      ? { ...item, sourceType: "official-website" as const } : item);
    const findings = normalizedFindings(value, evidence, candidate.candidateId);
    const supportedFindingRoles = findings.filter((finding) => finding.kind === "role" && finding.status === "supported")
      .flatMap((finding) => finding.roles);
    const roles = [...new Set(value.roles.filter((role) => supportedFindingRoles.includes(role)))];
    const heuristicRoles = deterministicRoles(evidence);
    const families = roleFamilies(roles);
    const supplementalEvidenceIds = evidence.filter((item) => item.provider === "tavily-correction").map((item) => item.id);
    return {
      ...candidate,
      companyName: acceptIdentity ? value.resolvedCompanyName : candidate.companyName,
      domain,
      officialWebsiteUrl,
      evidence,
      correction: {
        originalCompanyName: candidate.companyName,
        originalDomain: candidate.domain,
        originalOfficialWebsiteUrl: candidate.officialWebsiteUrl,
        resolvedRoles: roles,
        resolvedFamilies: families,
        identityChanged: domain !== candidate.domain || value.resolvedCompanyName !== candidate.companyName,
        routingChanged: !families.includes(candidate.queryFamily) || families.length > 1,
        supplementalEvidenceIds,
        reliedEvidenceIds,
        findings,
        reasons: value.reasons,
        confidence: Math.max(0, Math.min(100, Math.round(value.confidence))),
        model: response.modelVersion,
        promptVersion: response.promptVersion,
        escalated,
        warnings: [...response.warnings, ...value.warnings,
          ...(!acceptIdentity && proposedDomain !== candidate.domain
            ? ["Proposed official website was not supported by the cited company-owned evidence; original identity retained."] : []),
          ...(value.roles.length > roles.length
            ? ["Roles without a supported atomic role finding were removed."] : []),
          ...(heuristicRoles.some((role) => !roles.includes(role))
            ? [`Deterministic role hints were not auto-added: ${heuristicRoles.filter((role) => !roles.includes(role)).join(", ")}.`] : []),
          ...(reliedEvidenceIds.length < value.evidenceIds.length ? ["Unsupported evidence IDs were removed."] : [])],
      },
    };
  }

  private fallback(candidate: LeadWorkflowCandidate, warning: string): CorrectedLeadWorkflowCandidate {
    const roles = deterministicRoles(candidate.evidence);
    const nonDiscoveryEvidence = candidate.evidence.filter((item) => item.sourceType !== "discovery");
    const networking = assessNetworkingRelevanceEvidence(nonDiscoveryEvidence.flatMap((item) => [item.title, item.excerpt]));
    const evidenceIds = nonDiscoveryEvidence.map((item) => item.id);
    const findings = [
      {
        findingId: stableId("finding", `${candidate.candidateId}|identity-fallback`),
        kind: "identity" as const,
        statement: "Candidate identity was not resolved by the correction model.",
        status: "unknown" as const,
        roles: [], evidenceIds: [], sourceTypes: [], confidence: 0,
        notes: ["Retry required; deterministic fallback does not make an identity claim."],
      },
      {
        findingId: stableId("finding", `${candidate.candidateId}|networking-fallback`),
        kind: "active-networking" as const,
        statement: networking.reason,
        status: networking.demonstrated && evidenceIds.length > 0 ? "supported" as const : "unknown" as const,
        roles: [], evidenceIds: networking.demonstrated ? evidenceIds : [],
        sourceTypes: [...new Set(nonDiscoveryEvidence.map((item) => item.sourceType))],
        confidence: networking.demonstrated ? 50 : 0,
        notes: ["Deterministic fallback finding; model correction did not complete."],
      },
      ...roles.map((role) => ({
        findingId: stableId("finding", `${candidate.candidateId}|role|${role}`),
        kind: "role" as const,
        statement: `Deterministic evidence patterns indicate the ${role} role.`,
        status: "supported" as const,
        roles: [role], evidenceIds, sourceTypes: [...new Set(nonDiscoveryEvidence.map((item) => item.sourceType))],
        confidence: 50, notes: ["Requires model review before external use."],
      })),
    ];
    return {
      ...candidate,
      correction: {
        originalCompanyName: candidate.companyName,
        originalDomain: candidate.domain,
        originalOfficialWebsiteUrl: candidate.officialWebsiteUrl,
        resolvedRoles: roles,
        resolvedFamilies: roleFamilies(roles),
        identityChanged: false,
        routingChanged: !roleFamilies(roles).includes(candidate.queryFamily),
        supplementalEvidenceIds: candidate.evidence.filter((item) => item.provider === "tavily-correction").map((item) => item.id),
        reliedEvidenceIds: evidenceIds,
        findings,
        reasons: ["Deterministic evidence fallback was used because model correction did not complete."],
        confidence: roles.length > 0 ? 50 : 20,
        model: "deterministic-fallback",
        promptVersion: PROMPT_VERSION,
        escalated: false,
        warnings: [warning],
      },
    };
  }

  private async evaluateOneEscalated(candidate: LeadWorkflowCandidate, plan: LeadSearchPlan, reason: string) {
    try {
      const response = await this.provider.execute<CorrectionRequest, unknown>(
        this.request([candidate], plan, this.escalationModel), AbortSignal.timeout(120_000));
      const raw = typeof response.output === "object" && response.output !== null && "corrections" in response.output
        ? (response.output as { corrections?: unknown[] }).corrections?.[0] : response.output;
      return this.normalize(leadCorrectionModelSchema.parse(raw), candidate, response, true);
    } catch (error) {
      return this.fallback(candidate, `${reason} Escalation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async evaluateBatch(candidates: LeadWorkflowCandidate[], plan: LeadSearchPlan) {
    try {
      const response = await this.provider.execute<CorrectionRequest, unknown>(
        this.request(candidates, plan, this.routineModel), AbortSignal.timeout(75_000));
      const parsed = leadCorrectionBatchSchema.parse(response.output);
      const byId = new Map(parsed.corrections.map((item) => [item.candidateId, item]));
      return Promise.all(candidates.map((candidate) => {
        const value = byId.get(candidate.candidateId);
        if (!value) return this.evaluateOneEscalated(candidate, plan, "Routine correction omitted the candidate.");
        if (value.needsEscalation || value.confidence < 60 || candidate.evidenceWarnings.length > 0) {
          return this.evaluateOneEscalated(candidate, plan, "Routine correction requested ambiguity escalation.");
        }
        return this.normalize(value, candidate, response, false);
      }));
    } catch (error) {
      return Promise.all(candidates.map((candidate) => this.evaluateOneEscalated(
        candidate, plan, `Routine correction failed: ${error instanceof Error ? error.message : String(error)}`)));
    }
  }

  private deduplicate(candidates: CorrectedLeadWorkflowCandidate[]): CorrectedLeadWorkflowCandidate[] {
    const byDomain = new Map<string, CorrectedLeadWorkflowCandidate>();
    for (const candidate of [...candidates].sort((left, right) => right.providerScore - left.providerScore)) {
      const existing = byDomain.get(candidate.domain);
      if (!existing) {
        byDomain.set(candidate.domain, candidate);
        continue;
      }
      const evidence = [...new Map([...existing.evidence, ...candidate.evidence].map((item) => [item.url, item])).values()];
      const roles = [...new Set([...existing.correction.resolvedRoles, ...candidate.correction.resolvedRoles])];
      byDomain.set(candidate.domain, {
        ...existing,
        evidence,
        correction: {
          ...existing.correction,
          resolvedRoles: roles,
          resolvedFamilies: roleFamilies(roles),
          supplementalEvidenceIds: [...new Set([...existing.correction.supplementalEvidenceIds, ...candidate.correction.supplementalEvidenceIds])],
          reliedEvidenceIds: [...new Set([...existing.correction.reliedEvidenceIds, ...candidate.correction.reliedEvidenceIds])],
          findings: [...new Map([...existing.correction.findings, ...candidate.correction.findings]
            .map((finding) => [finding.findingId, finding])).values()],
          reasons: [...existing.correction.reasons, `Merged duplicate discovery candidate ${candidate.candidateId} after identity correction.`],
        },
      });
    }
    return [...byDomain.values()];
  }

  async correct(candidates: LeadWorkflowCandidate[], plan: LeadSearchPlan) {
    const supplemented = await this.supplement(candidates, plan);
    const batches: LeadWorkflowCandidate[][] = [];
    for (let offset = 0; offset < supplemented.candidates.length; offset += this.batchSize) {
      batches.push(supplemented.candidates.slice(offset, offset + this.batchSize));
    }
    const results = new Array<CorrectedLeadWorkflowCandidate[]>(batches.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= batches.length) return;
        results[index] = await this.evaluateBatch(batches[index], plan);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, batches.length) }, worker));
    const corrected = this.deduplicate(results.flat());
    return {
      candidates: corrected,
      creditsUsed: supplemented.creditsUsed,
      warnings: [...supplemented.warnings,
        ...corrected.flatMap((candidate) => candidate.correction.warnings.map((warning) => `${candidate.domain}: ${warning}`))],
    };
  }
}
