import nextEnv from "@next/env";

import { buildLeadMarketPlaybook } from "../src/lib/leads/workflow/playbook";
import { LeadEvidenceCorrectionAgent } from "../src/lib/leads/workflow/evidence-correction-agent";
import { LeadQualificationAgent } from "../src/lib/leads/workflow/qualification-agent";
import { LeadAssessmentReviewAgent } from "../src/lib/leads/workflow/assessment-review-agent";
import type { LeadRagCitation, LeadWorkflowCandidate } from "../src/lib/leads/workflow/types";

nextEnv.loadEnvConfig(process.cwd());

const plan = {
  countryCode: "DE",
  countryName: "Germany",
  objective: "new-market" as const,
  roles: ["Distributor", "SI"] as const,
  targetCount: 1,
  queryLanguage: "en",
  userRequest: "Model adapter preflight only",
};
const ragContext: LeadRagCitation[] = [
  { chunkId: "10000000-0000-4000-8000-000000000001", collection: "product", title: "Cudy verified router catalog",
    content: "The supplied catalog includes networking products for channel development.", score: 0.8,
    retrievalSignals: ["vector", "structured"], corroborated: true,
    structuredFacts: [{ model: "WR3000", factKey: "category", factValue: "Wi-Fi Router", status: "verified" }] },
  { chunkId: "10000000-0000-4000-8000-000000000002", collection: "company", title: "Cudy company brief",
    content: "Cudy develops networking products and works through channel partners.", score: 0.8,
    retrievalSignals: ["vector", "keyword"], corroborated: true, structuredFacts: [] },
  { chunkId: "10000000-0000-4000-8000-000000000003", collection: "industry", title: "Channel role guide",
    content: "Distributors supply resellers; system integrators deliver customer projects.", score: 0.8,
    retrievalSignals: ["vector", "keyword"], corroborated: true, structuredFacts: [] },
];

const playbook = await buildLeadMarketPlaybook({ ...plan, roles: [...plan.roles] }, ragContext);
if (playbook.generatedBy !== "langchain-model") {
  throw new Error(`OpenRouter OpenAI planner preflight degraded: ${playbook.warnings.join("; ")}`);
}

const candidate: LeadWorkflowCandidate = {
  candidateId: "adapter-preflight-bechtle",
  evidenceSnapshotRunId: "run-adapter-preflight",
  companyName: "Bechtle AG",
  domain: "bechtle.com",
  officialWebsiteUrl: "https://www.bechtle.com/",
  queryRoles: ["Distributor", "SI"],
  queryFamily: "services",
  providerScore: 0.5,
  evidence: [{
    id: "preflight-evidence-1",
    url: "https://www.bechtle.com/",
    title: "Bechtle official website",
    excerpt: "Preflight fixture: an IT company offering IT solutions and services in Germany. This fixture validates schema handling, not the factual claim.",
    sourceType: "official-website",
    provider: "preflight-fixture",
    capturedAt: new Date().toISOString(),
  }],
  // Force the production ambiguity branch so both the routine and escalation
  // model adapters are exercised without persisting this fixture.
  evidenceWarnings: ["Preflight fixture intentionally requests escalation."],
};
const noOpSearch = { search: async () => ({ query: "preflight", results: [], creditsUsed: 0 }) };
const correction = await new LeadEvidenceCorrectionAgent(undefined, noOpSearch,
  { batchSize: 1, concurrency: 1, searchConcurrency: 1 }).correct([candidate], { ...plan, roles: [...plan.roles] });
const [correctedCandidate] = correction.candidates;
if (!correctedCandidate || correctedCandidate.correction.model === "deterministic-fallback") {
  throw new Error(`DeepSeek correction preflight failed: ${correctedCandidate?.correction.warnings.join("; ") ?? "no correction"}`);
}
const [assessment] = await new LeadQualificationAgent(undefined, { batchSize: 1, concurrency: 1 })
  .evaluate([correctedCandidate], playbook, "DE", "Germany", "new-market");
if (!assessment || assessment.model === "unavailable" || !assessment.escalated) {
  throw new Error(`DeepSeek model preflight failed: ${assessment?.warnings.join("; ") ?? "no assessment"}`);
}
const reviewed = await new LeadAssessmentReviewAgent(undefined, { randomAuditPercent: 100, concurrency: 1 })
  .review([correctedCandidate], [assessment], playbook, { ...plan, roles: [...plan.roles] });
const review = reviewed.reviews[0];
if (!review || review.status === "review-failed") {
  throw new Error(`OpenAI assessment review preflight failed: ${review?.warnings.join("; ") ?? "no review"}`);
}

console.log(JSON.stringify({
  planner: { model: playbook.model, generatedBy: playbook.generatedBy, queryCount: playbook.searchQueries.length },
  correction: { model: correctedCandidate.correction.model, escalated: correctedCandidate.correction.escalated,
    schemaValid: true, roles: correctedCandidate.correction.resolvedRoles },
  qualification: { model: assessment.model, escalated: assessment.escalated,
    schemaValid: true, eligible: assessment.eligible, score: assessment.totalScore },
  independentReview: { status: review.status, secondaryModel: review.secondaryModel,
    judgeModel: review.judgeModel, finalScore: review.finalScore },
}, null, 2));
