import { createHash } from "node:crypto";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import type { ChannelRole } from "@/lib/domain";
import { createDiscoveryProvider, DiscoveryProviderError, type DiscoveryFailureKind } from "@/providers/discovery";
import type { DiscoveryItem, DiscoveryProvider, DiscoveryProviderResult,
  DiscoveryQuery } from "@/providers/discovery-contracts";

import { RealtimeCandidateRegistry } from "./candidate-registry";
import { LeadDiscoveryGate, type DiscoveryGateResult } from "./discovery-gate";
import { ACTIVE_HYBRID_SEARCH_POLICY, buildHybridSearchRoute, normalizeLeadSearchPlan,
  type HybridSearchRouteStep, type LeadSearchCategory } from "./hybrid-search-policy";
import type { LeadMarketPlaybook, LeadWorkflowCandidate, WorkflowModelUsage } from "./types";

export interface HybridSearchCallTelemetry {
  callKey: string;
  callFingerprint: string;
  queryClusterKey: string;
  route: HybridSearchRouteStep;
  query: string;
  status: "completed" | "failed" | "skipped";
  requestedResults: number;
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
  cacheStatus: "miss" | "hit" | "failed-hit" | "skipped";
  failureClass?: DiscoveryFailureKind;
  circuitScope?: "provider" | "route";
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
  queryRound?: number;
  targetPoolOverride?: number;
  initialExcludeDomains?: string[];
  session?: HybridDiscoverySession;
  onCall?: (call: HybridSearchCallTelemetry) => Promise<void>;
}

export interface HybridDiscoverySession {
  excludedDomains: Set<string>;
  completedCalls: Map<string, DiscoveryProviderResult>;
  failedCalls: Map<string, { kind: DiscoveryFailureKind; message: string }>;
  providerCircuits: Map<string, string>;
  routeCircuits: Map<string, string>;
  providerFailureCounts: Map<string, number>;
}

export function createHybridDiscoverySession(): HybridDiscoverySession {
  return { excludedDomains: new Set(), completedCalls: new Map(), failedCalls: new Map(),
    providerCircuits: new Map(), routeCircuits: new Map(), providerFailureCounts: new Map() };
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

const spanishQueryTemplates: Partial<Record<LeadSearchCategory, string[]>> = {
  distribution: ["distribuidor mayorista de equipos de red canal revendedores inventario logística",
    "mayorista TI telecomunicaciones marcas de redes programa para distribuidores"],
  resale: ["revendedor B2B VAR equipos de red Wi-Fi empresarial switches routers cotización",
    "integrador revendedor soluciones de red para pymes soporte configuración"],
  retail: ["tienda de computación electrónica routers Wi-Fi mesh switches precio carrito compra en línea",
    "tienda minorista equipos de red hogar SOHO entrega inventario sucursales"],
  "si-msp": ["integrador de sistemas MSP redes empresariales Wi-Fi LAN servicios administrados casos de éxito",
    "proveedor de soluciones WLAN switches para pymes instalación soporte"],
};

const roundFocusByLanguage: Record<string, Partial<Record<LeadSearchCategory, string[]>>> = {
  en: {
    retail: ["London", "Manchester Birmingham", "Leeds Glasgow", "Bristol Liverpool", "Edinburgh Cardiff"],
    resale: ["London", "Manchester Birmingham", "Leeds Glasgow", "Bristol Liverpool"],
    "si-msp": ["London", "Manchester Birmingham", "Leeds Glasgow", "Bristol Edinburgh"],
    distribution: ["United Kingdom", "England Scotland Wales", "London Manchester"],
  },
  es: {
    retail: ["Ciudad de México", "Guadalajara", "Monterrey", "Puebla Querétaro", "Tijuana León Mérida"],
    resale: ["Ciudad de México", "Guadalajara Monterrey", "Querétaro Puebla", "Tijuana León"],
    "si-msp": ["Ciudad de México", "Monterrey Guadalajara", "Querétaro Puebla", "Tijuana León"],
    distribution: ["México", "Ciudad de México", "Monterrey Guadalajara"],
  },
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
  step: HybridSearchRouteStep, queryRound: number): string {
  const family = familyForCategory(step.category);
  const planned = family ? playbook.searchQueries.filter((query) => query.family === family) : [];
  const templates = spanishQueryTemplates[step.category] && plan.queryLanguage.toLowerCase().startsWith("es")
    ? spanishQueryTemplates[step.category]! : queryTemplates[step.category];
  const base = planned[step.sequence % Math.max(1, planned.length)]?.query
    ?? templates[step.sequence % templates.length];
  const track = step.track.replace(/-/g, " ");
  const specialization = step.trigger.includes("semantic") || step.trigger === "technical-gap"
    ? templates[1] : templates[0];
  const language = plan.queryLanguage.toLowerCase().split(/[-_]/)[0];
  const focusOptions = roundFocusByLanguage[language]?.[step.category] ?? [];
  const roundFocus = focusOptions.length > 0 ? focusOptions[queryRound % focusOptions.length] : "";
  if (step.provider === "google-places") {
    return `${templates[0]} ${roundFocus} ${plan.countryName}`.replace(/\s+/g, " ").trim().slice(0, 400);
  }
  const retailBoundary = step.category === "retail"
    ? language === "es"
      ? "venta minorista real con precio carrito inventario entrega o sucursales; excluir fabricante sitio oficial de marca mayorista directorio y vendedor particular de marketplace"
      : "real consumer retailer with price cart inventory delivery or stores; exclude manufacturer brand site wholesale-only directory and individual marketplace listing"
    : "";
  const direction = step.category === "oem-odm-opportunity"
    ? "potential customer buying customized or private-label networking products; exclude factories and suppliers to Cudy" : "real company official website";
  return `${base} ${specialization} ${track} ${roundFocus} ${plan.countryName} ${retailBoundary} ${direction}`
    .replace(/\s+/g, " ").trim().slice(0, 1_200);
}

function normalizedQuery(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function queryClusterKey(plan: ReturnType<typeof normalizeLeadSearchPlan>, step: HybridSearchRouteStep,
  query: string): string {
  return hash([plan.countryCode, step.category, step.track, normalizedQuery(query)].join("|"));
}

function callFingerprint(plan: ReturnType<typeof normalizeLeadSearchPlan>, step: HybridSearchRouteStep,
  query: string, requestedResults: number, excludeDomains: string[]): string {
  return hash([ACTIVE_HYBRID_SEARCH_POLICY.version, plan.countryCode, plan.queryLanguage, step.category,
    step.track, step.provider, step.engine, step.mechanism, normalizedQuery(query), requestedResults,
    hash([...excludeDomains].sort().join("|"))].join("|"));
}

function failureDetails(error: unknown): { kind: DiscoveryFailureKind; attempts: number;
  latencyMs: number; circuitScope: "provider" | "route" } {
  if (error instanceof DiscoveryProviderError) return error.details;
  const message = error instanceof Error ? error.message : String(error);
  const configuration = /not configured|unsupported|unknown discovery provider/i.test(message);
  return { kind: configuration ? "configuration" : "transport", attempts: 0, latencyMs: 0,
    circuitScope: configuration ? "provider" : "route" };
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

async function runProviderAware<T>(tasks: Array<{ provider: string; run: () => Promise<T> }>,
  concurrency: number): Promise<T[]> {
  const groups = new Map<string, Array<{ index: number; run: () => Promise<T> }>>();
  tasks.forEach((task, index) => groups.set(task.provider,
    [...(groups.get(task.provider) ?? []), { index, run: task.run }]));
  const output = new Array<T>(tasks.length);
  await runLimited([...groups.values()].map((group) => async () => {
    for (const task of group) output[task.index] = await task.run();
  }), concurrency);
  return output;
}

export async function executeHybridDiscovery(runId: string, inputPlan: LeadSearchPlan,
  playbook: LeadMarketPlaybook, options: ExecutorOptions = {}): Promise<HybridDiscoveryExecution> {
  const plan = normalizeLeadSearchPlan(inputPlan);
  const route = buildHybridSearchRoute(plan);
  const registry = new RealtimeCandidateRegistry(runId, plan.countryCode);
  const gate = options.gate ?? new LeadDiscoveryGate();
  const providerFactory = options.providerFactory ?? ((step) => createDiscoveryProvider(step.provider));
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? Number(process.env.LEAD_DISCOVERY_CONCURRENCY ?? 6)));
  const defaultTargetPool = Math.max(plan.targetCount + 5,
    Math.ceil(plan.targetCount * ACTIVE_HYBRID_SEARCH_POLICY.initialCandidateMultiplier));
  const targetPool = Math.min(150, Math.max(1, Math.ceil(options.targetPoolOverride ?? defaultTargetPool)));
  const trackCount = Math.max(1, new Set(route.map((step) => `${step.category}/${step.track}`)).size);
  const requestedResults = Math.min(ACTIVE_HYBRID_SEARCH_POLICY.maxBatchSize,
    Math.max(ACTIVE_HYBRID_SEARCH_POLICY.defaultBatchSize, Math.ceil(targetPool / trackCount)));
  const queryRound = Math.max(0, Math.floor(options.queryRound ?? 0));
  const session = options.session ?? createHybridDiscoverySession();
  for (const domain of options.initialExcludeDomains ?? []) {
    if (domain.trim()) session.excludedDomains.add(domain.trim().toLowerCase());
  }
  const initiallyExcludedDomains = new Set(session.excludedDomains);
  const calls: HybridSearchCallTelemetry[] = [];
  const warnings: string[] = [];
  const modelUsage: WorkflowModelUsage[] = [];
  const gated = new Map<string, LeadWorkflowCandidate>();
  const rejected = new Map<string, LeadWorkflowCandidate>();
  const noValueByTrack = new Map<string, number>();
  const failedByTrack = new Set<string>();
  const invocationProviderCircuits = new Map<string, string>();
  const maximumSequence = Math.max(...route.map((step) => step.sequence), 0);

  const qualityCount = () => [...gated.values()].filter((candidate) => candidate.discoveryGate?.status === "pass"
    || candidate.discoveryGate?.status === "hold").length;

  for (let sequence = 0; sequence <= maximumSequence; sequence += 1) {
    const wave = route.filter((step) => step.sequence === sequence);
    const tasks = wave.map((step) => ({ provider: step.provider, run: async () => {
      const trackKey = `${step.category}/${step.track}`;
      const decision = shouldRun(step, plan, qualityCount(), targetPool, noValueByTrack.get(trackKey) ?? 0);
      const searchQuery = queryForStep(plan, playbook, step, queryRound);
      const callKey = `${trackKey}/${sequence}/${step.provider}/${step.engine}`;
      const excludeDomains = [...new Set([...session.excludedDomains, ...registry.domains()])];
      const fingerprint = callFingerprint(plan, step, searchQuery, requestedResults, excludeDomains);
      const clusterKey = queryClusterKey(plan, step, searchQuery);
      const routeCircuitKey = `${step.provider}/${step.engine}`;
      const circuitReason = session.providerCircuits.get(step.provider)
        ?? invocationProviderCircuits.get(step.provider) ?? session.routeCircuits.get(routeCircuitKey);
      const cached = session.completedCalls.get(fingerprint);
      const failedCache = session.failedCalls.get(fingerprint);
      if (circuitReason || failedCache) {
        const skipped: HybridSearchCallTelemetry = { callKey, callFingerprint: fingerprint,
          queryClusterKey: clusterKey, route: step, query: searchQuery, status: "skipped",
          requestedResults, rawResults: 0, normalizedCompanies: 0, newUniqueCompanies: 0, existingCompanyHits: 0, rejectedResults: 0,
          paidSearchCredits: 0, requestCount: 0, groundingQueries: 0, inputTokens: 0, outputTokens: 0,
          latencyMs: 0, retryCount: 0, fallbackUsed: failedByTrack.has(trackKey),
          cacheStatus: failedCache ? "failed-hit" : "skipped",
          discardedReasonCounts: { [failedCache ? "failed-call-cache-hit" : "circuit-open"]: 1 },
          errorMessage: failedCache?.message ?? circuitReason, failureClass: failedCache?.kind, items: [] };
        calls.push(skipped); await options.onCall?.(skipped); return;
      }
      if (!decision.run) {
        const skipped: HybridSearchCallTelemetry = { callKey, callFingerprint: fingerprint,
          queryClusterKey: clusterKey, route: step, query: searchQuery, status: "skipped",
          requestedResults, rawResults: 0, normalizedCompanies: 0, newUniqueCompanies: 0, existingCompanyHits: 0, rejectedResults: 0,
          paidSearchCredits: 0, requestCount: 0, groundingQueries: 0,
          inputTokens: 0, outputTokens: 0, latencyMs: 0, retryCount: 0,
          fallbackUsed: false, cacheStatus: "skipped",
          discardedReasonCounts: { [decision.reason ?? "not-required"]: 1 }, items: [] };
        calls.push(skipped); await options.onCall?.(skipped); return;
      }
      const query: DiscoveryQuery = { query: searchQuery, countryCode: plan.countryCode, countryName: plan.countryName,
        languageCode: plan.queryLanguage, maxResults: requestedResults,
        category: step.category, track: step.track, engine: step.engine, mechanism: step.mechanism,
        excludeDomains };
      try {
        const response = cached ?? await providerFactory(step).search(query, AbortSignal.timeout(150_000));
        if (!cached) session.completedCalls.set(fingerprint, response);
        if (!cached) {
          session.providerFailureCounts.set(step.provider, 0);
          invocationProviderCircuits.delete(step.provider);
        }
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
            if (added.firstDiscovery && (!added.domain || !session.excludedDomains.has(added.domain))) {
              newUniqueCompanies += 1;
              if (added.domain) session.excludedDomains.add(added.domain);
            } else existingCompanyHits += 1;
          }
          return { item, candidateKey: added.candidateKey, domain: added.domain,
            firstDiscovery: added.firstDiscovery, rejectionReason: added.rejectionReason };
        });
        noValueByTrack.set(trackKey, newUniqueCompanies === 0 ? (noValueByTrack.get(trackKey) ?? 0) + 1 : 0);
        const completed: HybridSearchCallTelemetry = { callKey, callFingerprint: fingerprint,
          queryClusterKey: clusterKey, route: step, query: searchQuery, status: "completed",
          requestedResults, rawResults: response.items.length, normalizedCompanies, newUniqueCompanies, existingCompanyHits,
          rejectedResults: response.items.length - normalizedCompanies,
          paidSearchCredits: cached ? 0 : response.usage.paidSearchCredits,
          requestCount: cached ? 0 : response.requestCount,
          groundingQueries: cached ? 0 : response.usage.groundingQueries ?? 0,
          inputTokens: cached ? 0 : response.usage.inputTokens,
          outputTokens: cached ? 0 : response.usage.outputTokens,
          latencyMs: cached ? 0 : response.latencyMs,
          retryCount: cached ? 0 : response.retryCount, fallbackUsed: failedByTrack.has(trackKey),
          cacheStatus: cached ? "hit" : "miss", discardedReasonCounts: discarded, items };
        calls.push(completed); await options.onCall?.(completed);
      } catch (error) {
        failedByTrack.add(trackKey);
        const details = failureDetails(error);
        session.failedCalls.set(fingerprint, { kind: details.kind,
          message: error instanceof Error ? error.message : String(error) });
        const failures = (session.providerFailureCounts.get(step.provider) ?? 0) + 1;
        session.providerFailureCounts.set(step.provider, failures);
        if (details.circuitScope === "provider") {
          session.providerCircuits.set(step.provider, `${details.kind}: ${error instanceof Error ? error.message : String(error)}`);
        } else if (failures >= 2) {
          invocationProviderCircuits.set(step.provider,
            `${details.kind}: ${error instanceof Error ? error.message : String(error)}`);
        } else if (!details.attempts && details.kind === "configuration") {
          session.routeCircuits.set(routeCircuitKey, error instanceof Error ? error.message : String(error));
        }
        const failed: HybridSearchCallTelemetry = { callKey, callFingerprint: fingerprint,
          queryClusterKey: clusterKey, route: step, query: searchQuery, status: "failed",
          requestedResults, rawResults: 0, normalizedCompanies: 0, newUniqueCompanies: 0, existingCompanyHits: 0, rejectedResults: 0,
          paidSearchCredits: 0, groundingQueries: 0, inputTokens: 0, outputTokens: 0, latencyMs: details.latencyMs,
          requestCount: details.attempts, retryCount: Math.max(0, details.attempts - 1),
          fallbackUsed: false, cacheStatus: "miss", failureClass: details.kind,
          circuitScope: details.circuitScope, discardedReasonCounts: { [`provider-${details.kind}`]: 1 }, items: [],
          errorMessage: error instanceof Error ? error.message : String(error) };
        warnings.push(`Hybrid discovery failed (${trackKey}/${step.provider}): ${failed.errorMessage}`);
        calls.push(failed); await options.onCall?.(failed);
      }
    }}));
    await runProviderAware(tasks, concurrency);
    const current = registry.toWorkflowCandidates(250)
      .filter((candidate) => !initiallyExcludedDomains.has(candidate.domain));
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

  const currentById = new Map(registry.toWorkflowCandidates(250)
    .filter((candidate) => !initiallyExcludedDomains.has(candidate.domain))
    .map((candidate) => [candidate.candidateId, candidate]));
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
