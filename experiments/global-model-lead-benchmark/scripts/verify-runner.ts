import {
  anthropicMessagesUrl,
  buildAnthropicRequest,
  buildGrokRequest,
  buildKimiRequest,
  buildMessageEnvelope,
  buildOpenAiRequest,
  collectSourceUrls,
  loadContext,
  parseSseBuffer,
} from "../lib/benchmark";
import {
  deterministicBlindId,
  normalizedDiscountedCumulativeGain,
  pooledRecall,
  precisionAt,
  validatedLeadsAt,
} from "../lib/judging";
import {
  potentialFitBand,
  potentialFitScore,
  primaryPoolStatus,
  type PotentialPartnerAssessment,
} from "../lib/codex-audit";
import {
  deduplicateOccurrences,
  extractCandidateOccurrences,
  extractUrls,
  isDegenerateProcessOutput,
} from "../lib/normalization";
import { validateCandidateVerification } from "../lib/review-verification";

const context = await loadContext("openai", "2026-08-20", 1);
if (!context.prompt.includes("Germany（DE）") || !context.prompt.includes("用德语、英语进行检索")) throw new Error("Prompt substitution failed");
if (!context.prompt.includes("原生联网搜索能力") || !context.prompt.includes("不要输出JSON")
  || !context.prompt.includes("是否已经与Cudy合作不影响匹配度")
  || !context.prompt.includes("渠道能力、产品互补性、市场覆盖和合作可执行性")) {
  throw new Error("Potential-partner natural-language search prompt is incomplete");
}
if (context.pilot.protocolVersion !== "native-search-potential-fit-v3" || context.pilot.artifactTag !== "potential-fit-v3") {
  throw new Error("Potential-fit v3 artifact isolation is incomplete");
}
if (context.prompt.includes("区分“已证实的当前Cudy渠道”")) throw new Error("Existing-channel priority leaked into the v3 prompt");
if (/runMetadata|summaryMetrics|queriesExecutedCount|pageIndex/.test(context.prompt)) throw new Error("Legacy benchmark schema leaked into the v2 prompt");
if (!context.pilot.productComparator.enabled || !context.pilot.productComparator.sameUserPrompt
  || context.pilot.productComparator.nativeSearchRestrictionApplies
  || context.pilot.productComparator.sameTimeoutMinutes !== context.pilot.limits.timeoutMinutesPerProvider
  || context.pilot.productComparator.samePrimaryCompanyCutoff !== context.pilot.limits.primaryCompanyCutoff
  || context.pilot.productComparator.repetitionsPerSystem !== context.pilot.repetitionsPerSystem) {
  throw new Error("Sales Lead Copilot comparator is not aligned with the measured model runs");
}

for (const provider of ["openai", "claude", "kimi", "deepseek", "grok"] as const) {
  const envelope = buildMessageEnvelope(provider, context.prompt);
  const userContent = envelope.input ?? envelope.messages?.[0]?.content;
  if (userContent !== context.prompt) throw new Error(`${provider} did not receive the identical user prompt`);
  if ("instructions" in envelope || "system" in envelope || envelope.messages?.some((message) => message.role !== "user")) {
    throw new Error(`${provider} received a hidden benchmark instruction`);
  }
}

if (anthropicMessagesUrl("deepseek", "https://api.deepseek.com") !== "https://api.deepseek.com/anthropic/v1/messages") {
  throw new Error("DeepSeek Anthropic endpoint routing failed");
}
if (anthropicMessagesUrl("claude", "https://lingyuapi.com") !== "https://lingyuapi.com/v1/messages") {
  throw new Error("Claude gateway endpoint routing failed");
}

const openAiRequest = buildOpenAiRequest(context);
if (openAiRequest.model !== "gpt-5.6-terra" || openAiRequest.reasoning.effort !== "none"
  || "max_tool_calls" in openAiRequest || openAiRequest.max_output_tokens !== 8000
  || openAiRequest.tools[0].type !== "web_search" || "instructions" in openAiRequest) {
  throw new Error("OpenAI natural-language search request is incomplete");
}

const claudeContext = await loadContext("claude", "2026-08-20", 1);
const claudeRequest = buildAnthropicRequest(claudeContext);
if (claudeRequest.model !== "claude-haiku-4-5" || claudeRequest.max_tokens !== 8000
  || claudeRequest.tools[0].max_uses !== 12 || "system" in claudeRequest || "thinking" in claudeRequest) {
  throw new Error("Claude natural-language search request is incomplete");
}

const deepSeekContext = await loadContext("deepseek", "2026-08-20", 1);
const deepSeekRequest = buildAnthropicRequest(deepSeekContext);
if (deepSeekRequest.model !== "deepseek-v4-flash" || deepSeekRequest.thinking?.type !== "disabled") {
  throw new Error("DeepSeek non-thinking search request is incomplete");
}

const kimiContext = await loadContext("kimi", "2026-08-20", 1);
const kimiRequest = buildKimiRequest(kimiContext, [{ role: "user", content: "test" }]);
if (kimiRequest.model !== "kimi-k2.6" || kimiRequest.max_completion_tokens !== 8000
  || kimiRequest.thinking.type !== "disabled" || kimiRequest.tools[0].function.name !== "$web_search"
  || "response_format" in kimiRequest) {
  throw new Error("Kimi natural-language search request is incomplete");
}

const grokContext = await loadContext("grok", "2026-08-20", 1);
const grokRequest = buildGrokRequest(grokContext);
if (grokRequest.model !== "grok-4.3" || grokRequest.reasoning.effort !== "none"
  || grokRequest.max_turns !== 12 || grokRequest.max_output_tokens !== 8000
  || grokRequest.parallel_tool_calls !== false || grokRequest.tools[0].type !== "web_search"
  || "text" in grokRequest || "tool_choice" in grokRequest) {
  throw new Error("Grok natural-language search request is incomplete");
}

const urls = collectSourceUrls({
  text: "Sources: https://www.cudy.com/. Duplicate https://www.cudy.com/ and https://example.de/path?q=1",
  nested: [{ url: "https://example.de/path?q=1" }],
});
if (urls.length !== 2 || !urls.includes("https://www.cudy.com/") || !urls.includes("https://example.de/path?q=1")) {
  throw new Error("Source URL collection or deduplication failed");
}

const sse = parseSseBuffer('event: response.created\ndata: {"type":"response.created"}\n\ndata: {"type":"response.completed","response":{"id":"r1"}}\n\n');
if (sse.events.length !== 2 || sse.events[1].type !== "response.completed" || sse.remainder !== "") {
  throw new Error("SSE parser validation failed");
}

let invalidRepetitionRejected = false;
try { await loadContext("openai", "2026-08-20", 4); } catch { invalidRepetitionRejected = true; }
if (!invalidRepetitionRejected) throw new Error("Runner accepted a repetition outside the confirmed three-run design");

const ndcg = normalizedDiscountedCumulativeGain([3, 1, 2, 0], [3, 2, 1, 0], 4);
if (ndcg <= 0 || ndcg >= 1) throw new Error("nDCG calculation failed");
if (precisionAt([true, false, true], 4) !== 0.5 || validatedLeadsAt([3, 0, 1], 20) !== 2) {
  throw new Error("Cutoff metric calculation failed");
}
if (pooledRecall(["C-A", "C-A", "C-B"], ["C-A", "C-B", "C-C"]) !== 2 / 3) {
  throw new Error("Pooled recall calculation failed");
}
if (!/^R-[A-F0-9]{12}$/.test(deterministicBlindId("R", "secret", "openai-r1"))) {
  throw new Error("Blind ID generation failed");
}
const potentialAssessment: PotentialPartnerAssessment = {
  blindCandidateId: "C-000000000001",
  assessedAt: "2026-08-20T00:00:00.000Z",
  evidenceGates: {
    submittedIdentityUsable: true, companyExists: true, targetCountryPresence: true,
    relevantChannel: true, sufficientEvidence: true, independentProspect: true,
  },
  relationshipStatus: "confirmed_existing",
  evidenceStrength: "strong",
  fitDimensions: {
    channelRoleAndCustomerAccess: 25, productAndUseCaseFit: 20, targetMarketCoverage: 15,
    partnershipExecutionCapability: 10, strategicComplementarity: 10,
  },
  independentEvidenceUrls: ["https://example.de/evidence"],
  namedContacts: [], contactMethods: [], riskFlags: [], notes: [],
};
if (potentialFitScore(potentialAssessment) !== 80 || potentialFitBand(potentialAssessment) !== "high_fit"
  || primaryPoolStatus(potentialAssessment) !== "existing_relationship_reference") {
  throw new Error("Existing relationships affected potential-fit scoring or primary-pool separation");
}

const syntheticRun = {
  providerId: "synthetic",
  modelId: "synthetic-fast",
  countryCode: "DE",
  repetition: 1,
  scoringEligibility: "eligible",
  nativeSearchEvidence: "observed",
  answerText: [
    "## Potential partners",
    "### 1. Example Distribution GmbH",
    "Networking distributor with national reseller coverage. https://shop.example.de/networking?utm_source=test",
    "### 2. Second Network Shop",
    "Online retailer in Germany. https://second.example.com/de",
  ].join("\n"),
};
const syntheticCandidates = extractCandidateOccurrences(syntheticRun, "test-salt");
if (syntheticCandidates.length !== 2 || syntheticCandidates[0].answerRank !== 1
  || syntheticCandidates[0].sourceUrls[0] !== "https://shop.example.de/networking"
  || deduplicateOccurrences(syntheticCandidates).length !== 2) {
  throw new Error("Natural-language candidate extraction or deduplication failed");
}
const syntheticTableCandidates = extractCandidateOccurrences({
  ...syntheticRun,
  answerText: [
    "| Priority | Company | Evidence |",
    "|---|---|---|",
    "| 1 | **Table One GmbH** | https://table-one.example/cudy |",
    "| 2 | **Table Two GmbH** | https://table-two.example/cudy |",
  ].join("\n"),
}, "test-salt");
if (syntheticTableCandidates.length !== 2 || syntheticTableCandidates.some((candidate) => candidate.extractionRule !== "numbered_table_row")) {
  throw new Error("Natural-language table candidate extraction failed");
}
if (extractUrls("https://example.de/a?utm_source=x and https://example.de/a").length !== 1) {
  throw new Error("Normalized answer URL extraction failed");
}
if (!isDegenerateProcessOutput(Array.from({ length: 20 }, () => "让我继续搜索更多渠道。").join(""))) {
  throw new Error("Degenerate process-output detection failed");
}
validateCandidateVerification({
  blindCandidateId: "C-000000000001",
  verifiedAt: "2026-08-20T00:00:00.000Z",
  companyExists: true,
  operatesInCountry: true,
  targetMarketPresence: "direct_german_entity",
  channelRelevant: true,
  evidenceSufficient: true,
  cudyRelationshipEvidence: "confirmed_current",
  independentEvidenceUrls: ["https://example.de/evidence"],
  verifiedNamedContactClaims: [],
  verifiedPublicContactMethodClaims: [],
  unverifiedOrContradictedClaims: [],
  notes: [],
});

console.log("Native-search potential-fit v3 benchmark validation passed");
