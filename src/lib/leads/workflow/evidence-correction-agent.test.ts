import { describe, expect, it } from "vitest";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "@/providers/contracts";
import type { TavilySearchResponse } from "@/providers/tavily";

import { LeadEvidenceCorrectionAgent } from "./evidence-correction-agent";
import { leadCorrectionModelSchema } from "./schemas";
import type { LeadWorkflowCandidate } from "./types";

class FakeCorrectionProvider implements AiProvider {
  readonly id = "fake-corrector";
  calls: StructuredAiRequest<unknown>[] = [];
  constructor(private readonly repairableOutput = false) {}
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>): Promise<StructuredAiResponse<TOutput>> {
    this.calls.push(request as StructuredAiRequest<unknown>);
    const input = request.input as { candidates: Array<{ candidateId: string; evidence: Array<{ evidenceId: string; url: string }> }> };
    const candidate = input.candidates[0];
    const official = candidate.evidence.find((item) => item.url.includes("smarttechnik.eu"));
    return {
      output: { corrections: [{ candidateId: candidate.candidateId, resolvedCompanyName: "Smart Technik GmbH",
        resolvedOfficialWebsiteUrl: this.repairableOutput ? "not-a-valid-url" : "https://smarttechnik.eu/",
        roles: this.repairableOutput ? ["Installer", "SI", "Distributor"] : ["Installer", "SI"],
        primaryBusinessRole: "SI", primaryBusinessRoleReason: this.repairableOutput
          ? "System integration is the main evidenced activity. ".repeat(14)
          : "System integration is the main evidenced activity.",
        officialWebsiteEvidenceId: official?.evidenceId ?? null,
        evidenceIds: candidate.evidence.map((item) => item.evidenceId),
        findings: [
          { kind: "identity", statement: "The official domain belongs to Smart Technik GmbH.", status: "supported",
            roles: [], evidenceIds: official ? [official.evidenceId] : [], confidence: 95, notes: [] },
          { kind: "country-presence", statement: "The company operates in Germany.", status: "supported",
            roles: [], evidenceIds: official ? [official.evidenceId] : [], confidence: 90, notes: [] },
          { kind: "active-networking", statement: "The company installs active WLAN equipment.", status: "supported",
            roles: [], evidenceIds: official ? [official.evidenceId] : [], confidence: 92, notes: [] },
          { kind: "role", statement: "The company performs installation and system integration.", status: "supported",
            roles: ["Installer", "SI"], evidenceIds: official ? [official.evidenceId] : [], confidence: 92, notes: [] },
          ...(this.repairableOutput ? [
            { kind: "role-distributor", statement: "The distributor role is confirmed by current evidence.",
              status: "confirmed", roles: ["Distributor"], evidenceIds: official ? [official.evidenceId] : [],
              confidence: 90, notes: [] },
            { kind: "other", statement: "No further conclusion is available.",
              status: "insufficient-evidence", roles: [], evidenceIds: [], confidence: 20, notes: [] },
          ] : []),
        ],
        reasons: ["Official evidence shows Wi-Fi installation and network integration."],
        confidence: 92, escalation: { required: false, expectedTotalScoreChange: 0,
          criticalStateChanges: [], higherCapabilityCanResolve: false, reason: "" }, warnings: [] }] } as TOutput,
      modelVersion: request.modelVersion, promptVersion: request.promptVersion, latencyMs: 5, warnings: [],
    };
  }
}

const searchProvider = {
  async search(): Promise<TavilySearchResponse> {
    return { query: "fixture", creditsUsed: 2, results: [{ title: "Smart Technik official",
      url: "https://smarttechnik.eu/netzwerk", score: 0.9,
      content: "Smart Technik GmbH in Germany plans and installs WLAN, Wi-Fi access points and network switches for customers." }] };
  },
};

const candidate: LeadWorkflowCandidate = {
  candidateId: "lead-smart-technik", evidenceSnapshotRunId: "run-smart-technik",
  companyName: "Smart Technik", domain: "wrong-example.de",
  officialWebsiteUrl: "https://wrong-example.de/", queryRoles: ["Distributor"], queryFamily: "distribution",
  providerScore: 0.8, evidence: [{ id: "discovery-1", url: "https://directory.example/smart-technik",
    title: "Search result", excerpt: "IT company", sourceType: "discovery", provider: "test", capturedAt: "2026-08-27" }],
  evidenceWarnings: [],
};

describe("LeadEvidenceCorrectionAgent", () => {
  it("supplements evidence, corrects the official domain, reroutes roles and preserves provenance", async () => {
    const provider = new FakeCorrectionProvider();
    const agent = new LeadEvidenceCorrectionAgent(provider, searchProvider,
      { batchSize: 1, concurrency: 1, searchConcurrency: 1 });
    const result = await agent.correct([candidate], { countryCode: "DE", countryName: "Germany",
      objective: "new-market", roles: ["Distributor", "Installer", "SI"], targetCount: 10,
      queryLanguage: "en", userRequest: "Find German networking channel prospects" });
    expect(result.creditsUsed).toBe(2);
    expect(result.candidates).toHaveLength(1);
    const [corrected] = result.candidates;
    expect(corrected.domain).toBe("smarttechnik.eu");
    expect(corrected.companyName).toBe("Smart Technik GmbH");
    expect(corrected.correction.resolvedRoles).toEqual(expect.arrayContaining(["Installer", "SI"]));
    expect(corrected.correction.resolvedFamilies).toEqual(["services"]);
    expect(corrected.correction.primaryRole).toBe("SI");
    expect(corrected.correction.primaryFamily).toBe("services");
    expect(corrected.correction.identityChanged).toBe(true);
    expect(corrected.correction.routingChanged).toBe(true);
    expect(corrected.correction.supplementalEvidenceIds).toHaveLength(1);
    expect(corrected.correction.findings.every((finding) => finding.evidenceIds.length > 0)).toBe(true);
    expect(corrected.evidence.some((item) => item.sourceType === "official-website")).toBe(true);
    expect(JSON.stringify(provider.calls.map((call) => call.input))).not.toContain("discovery-1");
  });

  it("keeps repairable model output and safely normalizes invalid URL and claim status", async () => {
    const provider = new FakeCorrectionProvider(true);
    const agent = new LeadEvidenceCorrectionAgent(provider, searchProvider,
      { batchSize: 1, concurrency: 1, searchConcurrency: 1 });
    const result = await agent.correct([candidate], { countryCode: "DE", countryName: "Germany",
      objective: "new-market", roles: ["Distributor", "Installer", "SI"], targetCount: 10,
      queryLanguage: "en", userRequest: "Find German networking channel prospects" });
    const [corrected] = result.candidates;
    expect(corrected.correction.model).not.toBe("deterministic-fallback");
    expect(corrected.domain).toBe("wrong-example.de");
    const normalized = corrected.correction.findings.find((finding) => finding.kind === "other");
    expect(normalized?.status).toBe("unknown");
    expect(normalized?.notes.join(" ")).toContain("normalized to unknown");
    const confirmed = corrected.correction.findings.find((finding) => finding.statement.includes("role is confirmed"));
    expect(confirmed?.kind).toBe("role");
    expect(confirmed?.status).toBe("supported");
    expect(confirmed?.notes.join(" ")).toContain("normalized to supported");
    expect(corrected.correction.resolvedRoles).toContain("Distributor");
  });

  it("accepts large but bounded current-evidence citation sets from deep research", () => {
    const evidenceIds = Array.from({ length: 31 }, (_, index) => `evidence-${index}`);
    const parsed = leadCorrectionModelSchema.safeParse({
      candidateId: "lead-deep-research", resolvedCompanyName: "Example GmbH",
      resolvedOfficialWebsiteUrl: "https://example.de/", roles: ["Distributor"],
      primaryBusinessRole: "Distributor", primaryBusinessRoleReason: "Distribution is the primary supported role.",
      officialWebsiteEvidenceId: evidenceIds[0], evidenceIds,
      findings: [{ kind: "distributor_role", statement: "The company supplies downstream resellers.",
        status: "confirmed", roles: ["Distributor"], evidenceIds, confidence: 90, notes: [] }],
      reasons: ["Current public evidence supports distribution."], confidence: 90,
      escalation: { required: false, expectedTotalScoreChange: 0,
        criticalStateChanges: [], higherCapabilityCanResolve: false, reason: "" }, warnings: [],
    });
    expect(parsed.success).toBe(true);
  });
});
