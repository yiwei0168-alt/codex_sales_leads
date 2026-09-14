import { afterEach, expect, it, vi } from "vitest";
import { createHybridDiscoverySession } from "./hybrid-discovery-executor";
import { discoverySessionDependency, restoreDiscoverySession, snapshotDiscoverySession } from "./discovery-session";
import { plan } from "../../../../scripts/workflow-recovery-fixtures";
afterEach(() => vi.unstubAllEnvs());
it("preserves task-level dedup, failures and recovery cooldown through a JSON checkpoint", () => {
  const session = createHybridDiscoverySession();
  session.excludedDomains.add("fixture.invalid");
  session.providerCircuits.set("brave", "configuration");
  session.failedCalls.set("failed", { kind: "timeout", message: "Synthetic timeout" });
  session.providerFailureCounts.set("exa", 2);
  session.providerCooldownUntilRound.set("exa", 3);
  const dependency = discoverySessionDependency(plan, "thread");
  const restored = restoreDiscoverySession(JSON.parse(JSON.stringify(snapshotDiscoverySession(session, dependency))), dependency);
  expect(restored).toEqual(session);
  restored.excludedDomains.add("other.invalid");
  expect(session.excludedDomains.size).toBe(1);
});
it("invalidates country, request, task and provider configuration without silently restarting paid work", () => {
  vi.stubEnv("GEMINI_DISCOVERY_MODEL", "fixture-model");
  const dependency = discoverySessionDependency(plan, "thread");
  const snapshot = snapshotDiscoverySession(createHybridDiscoverySession(), dependency);
  for (const changed of [discoverySessionDependency({ ...plan, countryCode: "CO" }, "thread"),
    discoverySessionDependency({ ...plan, roles: ["SI"] }, "thread"), discoverySessionDependency(plan, "other")]) {
    expect(() => restoreDiscoverySession(snapshot, changed)).toThrow("dependencies changed");
  }
  vi.stubEnv("GEMINI_DISCOVERY_MODEL", "new-model");
  expect(() => restoreDiscoverySession(snapshot, discoverySessionDependency(plan, "thread"))).toThrow("dependencies changed");
});
it("invalidates paid discovery recovery when a blank primary override resolves to a changed fallback model", () => {
  vi.stubEnv("GEMINI_DISCOVERY_MODEL", "   ");
  vi.stubEnv("GEMINI_SEARCH_MODEL", "gemini-3.6-flash");
  const snapshot = snapshotDiscoverySession(createHybridDiscoverySession(), discoverySessionDependency(plan, "thread"));
  vi.stubEnv("GEMINI_SEARCH_MODEL", "gemini-2.5-flash");
  expect(() => restoreDiscoverySession(snapshot, discoverySessionDependency(plan, "thread"))).toThrow("dependencies changed");
});
it("invalidates paid SearchAPI recovery when a blank standard key resolves to a changed alias account", () => {
  vi.stubEnv("SEARCHAPI_API_KEY", "   ");
  vi.stubEnv("SearchApi.io_API_KEY", "synthetic-account-a");
  const dependency = discoverySessionDependency(plan, "thread");
  const snapshot = snapshotDiscoverySession(createHybridDiscoverySession(), dependency);
  expect(JSON.stringify(snapshot)).not.toContain("synthetic-account-a");
  vi.stubEnv("SEARCHAPI_API_KEY", "");
  expect(discoverySessionDependency(plan, "thread")).toBe(dependency);
  vi.stubEnv("SearchApi.io_API_KEY", "synthetic-account-b");
  expect(() => restoreDiscoverySession(snapshot, discoverySessionDependency(plan, "thread"))).toThrow("dependencies changed");
});
it("does not persist credential values in the dependency record", () => {
  vi.stubEnv("BRAVE_SEARCH_API_KEY", "synthetic-secret");
  expect(JSON.stringify(snapshotDiscoverySession(createHybridDiscoverySession(), discoverySessionDependency(plan, "thread"))))
    .not.toContain("synthetic-secret");
});
it("retains purchased search items without retaining the provider raw envelope", () => {
  const session = createHybridDiscoverySession();
  session.completedCalls.set("request", { providerId: "brave", query: { query: "fixture", countryCode: "DE",
    countryName: "Germany", languageCode: "de", maxResults: 1, category: "distribution", track: "strategic",
    engine: "brave", mechanism: "web-index" }, items: [], sourceUrls: [], requestCount: 1, retryCount: 0, latencyMs: 2,
    usage: { paidSearchCredits: 1, inputTokens: 0, outputTokens: 0, totalTokens: 0 }, rawResponse: { irrelevant: "raw-envelope" } });
  const snapshot = snapshotDiscoverySession(session, "fixture");
  expect(JSON.stringify(snapshot)).not.toContain("raw-envelope");
  expect(restoreDiscoverySession(JSON.parse(JSON.stringify(snapshot)), "fixture").completedCalls.get("request")?.usage.paidSearchCredits).toBe(1);
});
