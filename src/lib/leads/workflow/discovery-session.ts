import { createHash } from "node:crypto";
import { DISCOVERY_PROVIDER_ENVIRONMENTS, configuredGeminiDiscoveryModel,
  resolveDiscoveryProviderConnection } from "@/providers/discovery";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import { ACTIVE_HYBRID_SEARCH_POLICY } from "./hybrid-search-policy";
import { createHybridDiscoverySession, type HybridDiscoverySession } from "./hybrid-discovery-executor";

export interface DiscoverySessionSnapshot {
  version: "task-discovery-session-v1";
  dependency: string;
  excludedDomains: string[];
  completedCalls: Array<[string, HybridDiscoverySession["completedCalls"] extends Map<string, infer V> ? V : never]>;
  failedCalls: Array<[string, { kind: import("@/providers/discovery").DiscoveryFailureKind; message: string }]>;
  providerCircuits: Array<[string, string]>;
  routeCircuits: Array<[string, string]>;
  providerFailureCounts: Array<[string, number]>;
  providerCooldownUntilRound: Array<[string, number]>;
  providerNoValueCounts?: Array<[string, number]>;
}

export function discoverySessionDependency(plan: LeadSearchPlan, graphThreadId: string): string {
  // Never persist credentials or endpoint values: only the combined dependency digest.
  const providers = DISCOVERY_PROVIDER_ENVIRONMENTS.map(config => {
    const connection=resolveDiscoveryProviderConnection(config);
    return [config.id,connection.apiKey,connection.baseUrl];
  });
  return createHash("sha256").update(JSON.stringify({ graphThreadId, plan,
    policy: ACTIVE_HYBRID_SEARCH_POLICY, requestContract: "discovery-request-v4-searchapi-google-limit", providers,
    model: configuredGeminiDiscoveryModel() })).digest("hex");
}

export function snapshotDiscoverySession(session: HybridDiscoverySession, dependency: string): DiscoverySessionSnapshot {
  return { version: "task-discovery-session-v1", dependency,
    excludedDomains: [...session.excludedDomains],
    completedCalls: [...session.completedCalls].map(([key, response]) => {
      const publicResult = { ...response }; delete publicResult.rawResponse;
      return [key, publicResult];
    }), failedCalls: [...session.failedCalls], providerCircuits: [...session.providerCircuits],
    routeCircuits: [...session.routeCircuits], providerFailureCounts: [...session.providerFailureCounts],
    providerCooldownUntilRound: [...session.providerCooldownUntilRound], providerNoValueCounts: [...session.providerNoValueCounts] };
}

export function restoreDiscoverySession(snapshot: DiscoverySessionSnapshot | undefined, dependency: string): HybridDiscoverySession {
  if (!snapshot) return createHybridDiscoverySession();
  if (snapshot.version !== "task-discovery-session-v1" || snapshot.dependency !== dependency) {
    throw new Error("Discovery session dependencies changed; review existing paid work before recovery");
  }
  if (!Array.isArray(snapshot.excludedDomains) || !snapshot.excludedDomains.every(domain => typeof domain === "string")
    || ![snapshot.completedCalls, snapshot.failedCalls, snapshot.providerCircuits, snapshot.routeCircuits,
      snapshot.providerFailureCounts, snapshot.providerCooldownUntilRound, snapshot.providerNoValueCounts ?? []]
      .every(entries => Array.isArray(entries) && entries.every(entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string"))) {
    throw new Error("Discovery session checkpoint is incomplete; automatic paid replay is prohibited");
  }
  return { excludedDomains: new Set(snapshot.excludedDomains), completedCalls: new Map(snapshot.completedCalls),
    failedCalls: new Map(snapshot.failedCalls), providerCircuits: new Map(snapshot.providerCircuits),
    routeCircuits: new Map(snapshot.routeCircuits), providerFailureCounts: new Map(snapshot.providerFailureCounts),
    providerCooldownUntilRound: new Map(snapshot.providerCooldownUntilRound), providerNoValueCounts: new Map(snapshot.providerNoValueCounts ?? []) };
}
