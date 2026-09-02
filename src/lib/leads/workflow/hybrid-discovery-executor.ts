import type { LeadSearchPlan } from "@/lib/assistant/types";
import type { ChannelRole } from "@/lib/domain";
import { createDiscoveryProvider } from "@/providers/discovery";
import type { DiscoveryItem, DiscoveryProvider, DiscoveryQuery } from "@/providers/discovery-contracts";

import { RealtimeCandidateRegistry } from "./candidate-registry";
import { LeadDiscoveryGate, type DiscoveryGateResult } from "./discovery-gate";
import { ACTIVE_HYBRID_SEARCH_POLICY, buildHybridSearchRoute, normalizeLeadSearchPlan,
  type HybridSearchRouteStep, type LeadSearchCategory } from "./hybrid-search-policy";
import type { LeadMarketPlaybook, LeadWorkflowCandidate, WorkflowModelUsage } from "./types";

export interface HybridSearchCallTelemetry {
  callKey: string;
  route: HybridSearchRouteStep;
  query: string;
  status: "completed" | "failed" | "skipped";
  rawResults: number;
  normalizedCompanies: number;
  newUniqueCompanies: number;
  existingCompanyHits: number;
  rejectedResults: number;
  paidSearchCredits: number;
  requestCount: number;
  groundingQueries: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  retryCount: number;
  fallbackUsed: boolean;
  discardedReasonCounts: Record<string, number>;
  errorMessage?: string;
  items: Array<{ item: DiscoveryItem; candidateKey: string | null; domain: string | null;
    firstDiscovery: boolean; rejectionReason?: string }>;
}

export interface HybridDiscoveryExecution {
  candidates: LeadWorkflowCandidate[];
  rejectedCandidates: LeadWorkflowCandidate[];
  calls: HybridSearchCallTelemetry[];
  modelUsage: WorkflowModelUsage[];
  warnings: string[];
  targetPool: number;
  stopReason: "quality-pool-target" | "route-exhausted" | "marginal-value-stop";
}

interface ExecutorOptions {
  providerFactory?: (step: HybridSearchRouteStep) => DiscoveryProvider;
  gate?: Pick<LeadDiscoveryGate, "evaluate">;
  concurrency?: number;
  onCall?: (call: HybridSearchCallTelemetry) => Promise<void>;
}

const rolesByCategory: Record<LeadSearchCategory, ChannelRole[]> = {
  distribution: ["Distributor", "VAD"], resale: ["VAR", "Dealer", "Reseller"],
  retail: ["Retailer", "E-tailer"], "si-msp": ["SI", "MSP"], installer: ["Installer"], isp: ["ISP"],
  agent: ["Agent"], "brand-owner": ["Brand Owner"],
  "oem-odm-opportunity": ["Distributor", "VAD", "Retailer", "E-tailer", "SI", "ISP", "Brand Owner"],
};

const queryTemplates: Record<LeadSearchCategory, string[]> = {
  distribution: ["networking equipment distributor VAD reseller channel inventory logistics",
    "IT telecommunications wholesaler network vendor partner distribution"],
  resale: ["B2B network equipment reseller VAR business WiFi switch router quotation",
    "SMB networking dealer solution reseller commercial customers"],
  retail: ["network router mesh switch online shop price cart own retail",
    "electronics retailer home WiFi mesh mobile broadband category"],
  "si-msp": ["network system integrator MSP business WiFi LAN managed services customer case",
    "SMB enterprise WLAN switching solution provider deployment"],
  installer: ["business WiFi network cabling installer access point switch configuration testing",
    "professional WLAN LAN installation contractor commercial project"],
  isp: ["internet service provider WISP fiber broadband operator coverage tariffs CPE",
    "regional broadband operator regulator directory FWA network"],
  agent: ["networking manufacturer representative sales agency Handelsvertretung represented brands territory",
    "Herstellervertretung Netzwerktechnik Handelsagentur principals"],
  "brand-owner": ["own brand router mesh switch network product company product specifications",
    "Eigenmarke WLAN Router Netzwerk Brand Owner"],
  "oem-odm-opportunity": ["own brand router private label custom CPE centralized procurement customer",
    "branded CPE device tender standardized deployment OEM ODM customer opportunity"],
};

function familyForCategory(category: LeadSearchCategory): string | null {
  if (category === "distribution") return "distribution";
  if (category === "resale") return "resale";
  if (category === "retail") return "retail";
  if (category === "si-msp" || category === "installer") return "services";
  if (category === "isp") return "isp";
  if (category === "agent") return "agent";
  if (category === "brand-owner") return "brand";
  return null;
}

function queryForStep(plan: ReturnType<typeof normalizeLeadSearchPlan>, playbook: LeadMarketPlaybook,
  step: HybridSearchRouteStep): string {
  const family = familyForCategory(step.category);
  const planned = family ? playbook.searchQueries.filter((query) => query.family === family) : [];
  const base = planned[step.sequence % Math.max(1, planned.length)]?.query
    ?? queryTemplates[step.category][step.sequence % queryTemplates[step.category].length];
  const track = step.track.replace(/-/g, " ");
  const specialization = step.trigger.includes("semantic") || step.trigger === "technical-gap"
    ? queryTemplates[step.category][1] : queryTemplates[step.category][0];
  const direction = step.category === "oem-odm-opportunity"
    ? "potential customer buying customized or private-label networking products; exclude factories and suppliers to Cudy" : "real company official website";
  return `${base} ${specialization} ${track} ${plan.countryName} ${direction}`.replace(/\s+/g, " ").trim().slice(0, 1_200);
}

function hardPrefilter(item: DiscoveryItem): string | undefined {
  if (!item.title.trim()) return "missing-company-name";
  if (!item.url && !item.externalId) return "missing-url-and-external-id";
  if (/\.(?:pdf|docx?|xlsx?)(?:$|\?)/i.test(item.url ?? "")) return "document-not-company";
  if (/\b(?:top\s*\d+|best companies|company list|directory ranking)\b/i.test(item.title)) return "list-page";
  return undefined;
}

function shouldRun(step: HybridSearchRouteStep, plan: ReturnType<typeof normalizeLeadSearchPlan>,
  qualityCount: number, targetPool: number, noValueCount: number): { run: boolean; reason?: string } {
  if (step.trigger === "core") return { run: true };
  if (qualityCount >= targetPool) return { run: false, reason: "quality-pool-target-met" };
  if (noValueCount >= ACTIVE_HYBRID_SEARCH_POLICY.maxConsecutiveNoValueBatches) {
    return { run: false, reason: "two-consecutive-no-value-batches" };
  }
  if (step.trigger === "explicit-local-gap" && plan.coverageMode !== "local") {
    return { run: false, reason: "local-agent-search-not-explicit" };
  }
  if (step.trigger === "local-gap" && plan.coverageMode !== "local" && plan.coverageMode !== "mixed"
    && plan.targetCount < 50) return { run: false, reason: "no-local-coverage-gap" };
  return { run: true };
}

function mergeGateCandidate(current: LeadWorkflowCandidate, gated: LeadWorkflowCandidate): LeadWorkflowCandidate {
  const evidence = [...new Map([...current.evidence, ...gated.evidence].map((item) => [item.id, item])).values()];
  return { ...current, ...gated, evidence, discoveryOccurrences: current.discoveryOccurrences,
    searchCategories: current.searchCategories };
}

async function runLimited<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

export async function executeHybridDiscovery(runId: string, inputPlan: LeadSearchPlan,
  playbook: LeadMarketPlaybook, options: ExecutorOptions = {}): Promise<HybridDiscoveryExecution> {
  const plan = normalizeLeadSearchPlan(inputPlan);
  const route = buildHybridSearchRoute(plan);
  const registry = new RealtimeCandidateRegistry(runId, plan.countryCode);
  const gate = options.gate ?? new LeadDiscoveryGate();
  const providerFactory = options.providerFactory ?? ((step) => createDiscoveryProvider(step.provider));
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? Number(process.env.LEAD_DISCOVERY_CONCURRENCY ?? 6)));
  const targetPool = Math.min(150, Math.max(plan.targetCount + 5, Math.ceil(plan.targetCount * 1.35)));
  const calls: HybridSearchCallTelemetry[] = [];
  const warnings: string[] = [];
  const modelUsage: WorkflowModelUsage[] = [];
  const gated = new Map<string, LeadWorkflowCandidate>();
  const rejected = new Map<string, LeadWorkflowCandidate>();
  const noValueByTrack = new Map<string, number>();
  const failedByTrack = new Set<string>();
  const maximumSequence = Math.max(...route.map((step) => step.sequence), 0);

  const qualityCount = () => [...gated.values()].filter((candidate) => candidate.discoveryGate?.status === "pass"
    || candidate.discoveryGate?.status === "hold").length;

  for (let sequence = 0; sequence <= maximumSequence; sequence += 1) {
    const wave = route.filter((step) => step.sequence === sequence);
    const tasks = wave.map((step) => async () => {
      const trackKey = `${step.category}/${step.track}`;
      const decision = shouldRun(step, plan, qualityCount(), targetPool, noValueByTrack.get(trackKey) ?? 0);
      const searchQuery = queryForStep(plan, playbook, step);
      const callKey = `${trackKey}/${sequence}/${step.provider}/${step.engine}`;
      if (!decision.run) {
        const skipped: HybridSearchCallTelemetry = { callKey, route: step, query: searchQuery, status: "skipped",
          rawResults: 0, normalizedCompanies: 0, newUniqueCompanies: 0, existingCompanyHits: 0, rejectedResults: 0,
          paidSearchCredits: 0, requestCount: 0, groundingQueries: 0,
          inputTokens: 0, outputTokens: 0, latencyMs: 0, retryCount: 0,
          fallbackUsed: false, discardedReasonCounts: { [decision.reason ?? "not-required"]: 1 }, items: [] };
        calls.push(skipped); await options.onCall?.(skipped); return;
      }
      const query: DiscoveryQuery = { query: searchQuery, countryCode: plan.countryCode, countryName: plan.countryName,
        languageCode: plan.queryLanguage, maxResults: ACTIVE_HYBRID_SEARCH_POLICY.defaultBatchSize,
        category: step.category, track: step.track, engine: step.engine, mechanism: step.mechanism,
        excludeDomains: registry.domains() };
      try {
        const response = await providerFactory(step).search(query, AbortSignal.timeout(150_000));
        const discarded: Record<string, number> = {};
        let normalizedCompanies = 0;
        let newUniqueCompanies = 0;
        let existingCompanyHits = 0;
        const items = response.items.map((item) => {
          const prefilter = hardPrefilter(item);
          if (prefilter) {
            discarded[prefilter] = (discarded[prefilter] ?? 0) + 1;
            return { item, candidateKey: null, domain: null, firstDiscovery: false, rejectionReason: prefilter };
          }
          const added = registry.add(item, query, step, rolesByCategory[step.category]);
          if (!added.accepted) {
            const reason = added.rejectionReason ?? "identity-normalization-failed";
            discarded[reason] = (discarded[reason] ?? 0) + 1;
          } else {
            normalizedCompanies += 1;
            if (added.firstDiscovery) newUniqueCompanies += 1; else existingCompanyHits += 1;
          }
          return { item, candidateKey: added.candidateKey, domain: added.domain,
            firstDiscovery: added.firstDiscovery, rejectionReason: added.rejectionReason };
        });
        noValueByTrack.set(trackKey, newUniqueCompanies === 0 ? (noValueByTrack.get(trackKey) ?? 0) + 1 : 0);
        const completed: HybridSearchCallTelemetry = { callKey, route: step, query: searchQuery, status: "completed",
          rawResults: response.items.length, normalizedCompanies, newUniqueCompanies, existingCompanyHits,
          rejectedResults: response.items.length - normalizedCompanies, paidSearchCredits: response.usage.paidSearchCredits,
          requestCount: response.requestCount, groundingQueries: response.usage.groundingQueries ?? 0,
          inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, latencyMs: response.latencyMs,
          retryCount: response.retryCount, fallbackUsed: failedByTrack.has(trackKey), discardedReasonCounts: discarded, items };
        calls.push(completed); await options.onCall?.(completed);
      } catch (error) {
        failedByTrack.add(trackKey);
        noValueByTrack.set(trackKey, (noValueByTrack.get(trackKey) ?? 0) + 1);
        const failed: HybridSearchCallTelemetry = { callKey, route: step, query: searchQuery, status: "failed",
          rawResults: 0, normalizedCompanies: 0, newUniqueCompanies: 0, existingCompanyHits: 0, rejectedResults: 0,
          paidSearchCredits: 0, requestCount: 0, groundingQueries: 0,
          inputTokens: 0, outputTokens: 0, latencyMs: 0, retryCount: 0,
          fallbackUsed: false, discardedReasonCounts: { "provider-error": 1 }, items: [],
          errorMessage: error instanceof Error ? error.message : String(error) };
        warnings.push(`Hybrid discovery failed (${trackKey}/${step.provider}): ${failed.errorMessage}`);
        calls.push(failed); await options.onCall?.(failed);
      }
    });
    await runLimited(tasks, concurrency);
    const current = registry.toWorkflowCandidates(250);
    const ungated = current.filter((candidate) => !gated.has(candidate.candidateId) && !rejected.has(candidate.candidateId));
    if (ungated.length > 0) {
      const gateResult: DiscoveryGateResult = await gate.evaluate(ungated);
      gateResult.candidates.forEach((candidate) => gated.set(candidate.candidateId, candidate));
      gateResult.rejected.forEach((candidate) => rejected.set(candidate.candidateId, candidate));
      modelUsage.push(...gateResult.usage);
      warnings.push(...gateResult.warnings);
    }
    if (qualityCount() >= targetPool) break;
  }

  const currentById = new Map(registry.toWorkflowCandidates(250).map((candidate) => [candidate.candidateId, candidate]));
  const candidates = [...gated.values()].map((candidate) => {
    const current = currentById.get(candidate.candidateId);
    return current ? mergeGateCandidate(current, candidate) : candidate;
  });
  const rejectedCandidates = [...rejected.values()].map((candidate) => {
    const current = currentById.get(candidate.candidateId);
    return current ? mergeGateCandidate(current, candidate) : candidate;
  });
  const stoppedForMarginalValue = [...noValueByTrack.values()].some((count) =>
    count >= ACTIVE_HYBRID_SEARCH_POLICY.maxConsecutiveNoValueBatches);
  return { candidates, rejectedCandidates, calls, modelUsage, warnings, targetPool,
    stopReason: qualityCount() >= targetPool ? "quality-pool-target"
      : stoppedForMarginalValue ? "marginal-value-stop" : "route-exhausted" };
}
