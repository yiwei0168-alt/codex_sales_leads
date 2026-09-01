import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

import { z } from "zod";

import type { ChannelRole } from "@/lib/domain";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";
import type { AiProvider } from "@/providers/contracts";
import { createLeadAiProvider } from "@/providers/resilient-ai";

import { ALL_CHANNEL_ROLES, type LeadEvidenceItem, type LeadWorkflowCandidate, type WorkflowModelUsage } from "./types";

const PROMPT_VERSION = "lead-discovery-light-gate-v1.0.0";
const signalSchema = z.enum(["supported", "not-supported", "unknown"]);
const roleSchema = z.enum(ALL_CHANNEL_ROLES as [ChannelRole, ...ChannelRole[]]);
const resultSchema = z.object({
  candidateId: z.string().min(8).max(80),
  companyExistsSignal: signalSchema,
  networkProductRelevance: signalSchema,
  targetCategorySignal: signalSchema,
  productOrBrandControlSignal: signalSchema,
  volumeProcurementSignal: signalSchema,
  customizationSignal: signalSchema,
  roleHints: z.array(roleSchema).max(5),
  hardRejectCodes: z.array(z.enum([
    "non-company", "wrong-market", "unrelated-business", "pure-marketplace", "individual-seller",
    "wrong-agent-category", "wrong-isp-category", "wrong-installer-category", "oem-supplier-not-customer",
    "trademark-only", "manufacturing-service-only",
  ])).max(5),
  opportunitySignals: z.array(z.object({
    signalType: z.enum(["own-brand-product", "branded-cpe", "private-label", "custom-hardware", "device-tender",
      "centralized-procurement", "standardized-deployment", "product-portfolio-gap", "past-oem-odm-relationship"]),
    basis: z.enum(["explicit", "indirect"]),
    sourceUrl: z.string().url(),
  })).max(6),
  suspectedRelationships: z.array(z.object({ relationshipType: z.string().min(2).max(80),
    relatedName: z.string().min(2).max(200), sourceUrl: z.string().url() })).max(5),
  missingEvidence: z.array(z.string().min(2).max(120)).max(6),
  reasonCodes: z.array(z.string().min(2).max(80)).max(8),
});
const batchSchema = z.object({ candidates: z.array(resultSchema).min(1).max(10) });
type GateModelResult = z.infer<typeof resultSchema>;

function privateIp(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  if (!isIP(hostname)) return false;
  return /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe80)/i.test(hostname)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname);
}

async function publiclyResolvable(hostname: string, resolveDns: boolean): Promise<boolean> {
  if (privateIp(hostname)) return false;
  if (!resolveDns) return true;
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((entry) => !privateIp(entry.address));
  } catch { return false; }
}

async function limitedText(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = limit - size;
    chunks.push(value.length > remaining ? value.slice(0, remaining) : value);
    size += Math.min(value.length, remaining);
    if (value.length > remaining) await reader.cancel();
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function compactHtml(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "Official homepage";
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, " ").replace(/\s+/g, " ").trim().slice(0, 8_000);
  return { title, text };
}

export async function fetchLightweightHomepage(candidate: LeadWorkflowCandidate,
  fetchImplementation: typeof fetch = fetch): Promise<{ evidence?: LeadEvidenceItem; warning?: string }> {
  try {
    let target = new URL(candidate.officialWebsiteUrl || `https://${candidate.domain}/`);
    if (!await publiclyResolvable(target.hostname, fetchImplementation === fetch)) {
      return { warning: "homepage-private-local-or-unresolvable-host" };
    }
    target.protocol = "https:";
    target.pathname = "/";
    target.search = "";
    target.hash = "";
    let response: Response | undefined;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      response = await fetchImplementation(target, { redirect: "manual",
        headers: { "user-agent": "CudyLeadResearch/1.0", accept: "text/html,text/plain;q=0.9" },
        signal: AbortSignal.timeout(12_000) });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location || redirect === 3) return { warning: "homepage-redirect-limit-or-missing-location" };
      const redirected = new URL(location, target);
      if (redirected.protocol !== "https:" || !await publiclyResolvable(redirected.hostname, fetchImplementation === fetch)) {
        return { warning: "homepage-unsafe-redirect" };
      }
      target = redirected;
    }
    if (!response) return { warning: "homepage-no-response" };
    if (!response.ok) return { warning: `homepage-http-${response.status}` };
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/(?:html|plain)|application\/xhtml/i.test(contentType)) return { warning: "homepage-unsupported-content-type" };
    const compact = compactHtml(await limitedText(response, 96_000));
    if (compact.text.length < 80) return { warning: "homepage-insufficient-text" };
    const capturedAt = new Date().toISOString();
    return { evidence: { id: `evidence-home-${candidate.candidateId.replace(/^lead-/, "")}`, url: target.toString(),
      title: compact.title.slice(0, 300), excerpt: compact.text, sourceType: "official-website", provider: "direct-http",
      capturedAt, evidenceRunId: candidate.evidenceSnapshotRunId, contentHash: leadEvidenceContentHash(compact.text),
      freshnessStatus: "fresh" } };
  } catch (error) {
    return { warning: `homepage-fetch-failed:${error instanceof Error ? error.name : "unknown"}` };
  }
}

function deterministicGate(result: GateModelResult): "pass" | "hold" | "reject" {
  if (result.hardRejectCodes.length > 0 || result.companyExistsSignal === "not-supported"
    || result.networkProductRelevance === "not-supported" || result.targetCategorySignal === "not-supported") return "reject";
  if (result.companyExistsSignal === "supported" && result.networkProductRelevance === "supported"
    && result.targetCategorySignal === "supported") return "pass";
  return "hold";
}

export interface DiscoveryGateResult {
  candidates: LeadWorkflowCandidate[];
  rejected: LeadWorkflowCandidate[];
  usage: WorkflowModelUsage[];
  warnings: string[];
}

export class LeadDiscoveryGate {
  private readonly model: string;
  private readonly batchSize: number;
  private readonly concurrency: number;
  constructor(private readonly provider: AiProvider = createLeadAiProvider(), private readonly fetchImplementation: typeof fetch = fetch,
    options: { model?: string; batchSize?: number; concurrency?: number } = {}) {
    this.model = options.model ?? process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-v4-flash";
    this.batchSize = Math.max(1, Math.min(10, options.batchSize ?? 10));
    this.concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4));
  }

  async evaluate(candidates: LeadWorkflowCandidate[]): Promise<DiscoveryGateResult> {
    const homepageResults = new Array<Awaited<ReturnType<typeof fetchLightweightHomepage>>>(candidates.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= candidates.length) return;
        homepageResults[index] = await fetchLightweightHomepage(candidates[index], this.fetchImplementation);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, candidates.length) }, () => worker()));
    const enriched = candidates.map((candidate, index) => ({ ...candidate,
      evidence: homepageResults[index].evidence ? [...candidate.evidence, homepageResults[index].evidence!] : candidate.evidence,
      evidenceWarnings: homepageResults[index].warning
        ? [...candidate.evidenceWarnings, homepageResults[index].warning!] : candidate.evidenceWarnings }));
    const outputs = new Map<string, GateModelResult>();
    const usage: WorkflowModelUsage[] = [];
    const warnings: string[] = [];
    for (let start = 0; start < enriched.length; start += this.batchSize) {
      const batch = enriched.slice(start, start + this.batchSize);
      try {
        const response = await this.provider.execute({ task: "lead-discovery-gate", modelVersion: this.model,
          promptVersion: PROMPT_VERSION, dataClassification: "public", evidenceIds: batch.flatMap((candidate) => candidate.evidence.map((item) => item.id)),
          outputSchema: z.toJSONSchema(batchSchema) as Record<string, unknown>, input: {
            instructions: [
              "Perform a lightweight public-company search gate, not final qualification.",
              "Use only supplied search snippets and lightweight official-homepage text.",
              "Return compact enums, booleans, reason codes, missing evidence and tentative role hints. Do not score, rank, recommend paths, write strategy/email or return confidence.",
              "The original search category is a target to test, not a final role. Unknown stays unknown.",
              "Record brand/group/legal/regional relationships only as suspected relationships with a supplied source URL; do not resolve or merge entities.",
              "For OEM/ODM, find only possible customers buying Cudy solutions for own-brand/customized products. Reject factories/design houses that only supply OEM/ODM services.",
              "Agent means target-industry manufacturer representative or commission sales agency; reject real-estate, insurance, travel, recruiting, customs/logistics and AI agents.",
            ],
            candidates: batch.map((candidate) => ({ candidateId: candidate.candidateId, companyName: candidate.companyName,
              domain: candidate.domain, searchCategories: candidate.searchCategories ?? [], queryRoleHints: candidate.queryRoles,
              sources: candidate.evidence.slice(0, 6).map((item) => ({ evidenceId: item.id, url: item.url,
                sourceType: item.sourceType, excerpt: item.excerpt.slice(0, 4_000) })) })),
          } }, AbortSignal.timeout(60_000));
        const parsed = batchSchema.parse(response.output);
        parsed.candidates.forEach((item) => outputs.set(item.candidateId, item));
        usage.push({ stage: "discovery-gate", requestedModel: response.requestedModelVersion ?? this.model,
          actualModel: response.modelVersion, providerId: response.actualProviderId, promptTokens: response.usage?.promptTokens ?? 0,
          completionTokens: response.usage?.completionTokens ?? 0, reasoningTokens: response.usage?.reasoningTokens ?? 0,
          totalTokens: response.usage?.totalTokens ?? 0, latencyMs: response.latencyMs,
          fallbackUsed: Boolean(response.requestedModelVersion && response.requestedModelVersion !== response.modelVersion) });
      } catch (error) {
        warnings.push(`Discovery gate batch held after routine model failure: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const evaluated = enriched.map((candidate) => {
      const model = outputs.get(candidate.candidateId);
      if (!model) return { ...candidate, discoveryGate: { status: "hold" as const,
        reasonCodes: ["routine-gate-unavailable"], missingEvidence: ["lightweight semantic gate result"],
        roleHints: [], model: this.model } };
      const allowedUrls = new Set(candidate.evidence.map((item) => item.url));
      return { ...candidate,
        suspectedRelationships: model.suspectedRelationships.filter((item) => allowedUrls.has(item.sourceUrl))
          .map((item) => ({ ...item, status: "unresolved" as const })),
        opportunitySignals: model.opportunitySignals.filter((item) => allowedUrls.has(item.sourceUrl))
          .map((item) => ({ ...item, status: "unverified" as const })),
        discoveryGate: { status: deterministicGate(model), reasonCodes: [...model.hardRejectCodes, ...model.reasonCodes],
          missingEvidence: model.missingEvidence, roleHints: model.roleHints, model: this.model } };
    });
    return { candidates: evaluated.filter((candidate) => candidate.discoveryGate?.status !== "reject"),
      rejected: evaluated.filter((candidate) => candidate.discoveryGate?.status === "reject"), usage, warnings };
  }
}
