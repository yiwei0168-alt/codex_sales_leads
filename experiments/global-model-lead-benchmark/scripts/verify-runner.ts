import {
  anthropicMessagesUrl,
  buildAnthropicRequest,
  buildGeminiRequest,
  buildGrokRequest,
  buildKimiRequest,
  buildMessageEnvelope,
  buildOpenAiRequest,
  CLAUDE_SEARCH_SYSTEM_PROMPT,
  collectSourceUrls,
  countGeminiSearchQueries,
  geminiInteractionText,
  geminiInteractionsUrl,
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
if (!context.prompt.includes("原生联网搜索和原生网页读取能力") || !context.prompt.includes("不要输出JSON")
  || !context.prompt.includes("是否已经与Cudy合作不影响匹配度")
  || !context.prompt.includes("每类目标提交10家公司，共目标40家")
  || !context.prompt.includes("不搜索、不输出关键联系人")) {
  throw new Error("Four-category natural-language search prompt is incomplete");
}
if (context.pilot.protocolVersion !== "native-search-four-channel-categories-v4" || context.pilot.artifactTag !== "four-channel-categories-v4") {
  throw new Error("Four-category v4 artifact isolation is incomplete");
}
if (Object.values(context.pilot.categoryTargets).some((target) => target !== 10)
  || context.pilot.limits.primaryCompanyCutoff !== 40
  || !context.pilot.limits.providerNativeOutputLimitOnly
  || context.pilot.limits.automaticTransportRetries !== 2) {
  throw new Error("Four-category quotas or reliability controls are incomplete");
}
if (context.pilot.judging.blindHumanAuditPercent !== 25 || context.pilot.judging.blindHumanAuditMinimum !== 12
  || context.pilot.judging.highRiskSupplementMaximumPercent !== 10
  || context.pilot.judging.failedAuditExpansionPercent !== 15) {
  throw new Error("Potential-fit human audit limits are incomplete");
}
if (context.prompt.includes("区分“已证实的当前Cudy渠道”")) throw new Error("Existing-channel priority leaked into the v3 prompt");
if (/runMetadata|summaryMetrics|queriesExecutedCount|pageIndex/.test(context.prompt)) throw new Error("Legacy benchmark schema leaked into the v4 prompt");
if (!context.pilot.productComparator.enabled || !context.pilot.productComparator.sameUserPrompt
  || context.pilot.productComparator.nativeSearchRestrictionApplies
  || context.pilot.productComparator.sameTimeoutMinutes !== context.pilot.limits.timeoutMinutesPerProvider
  || context.pilot.productComparator.samePrimaryCompanyCutoff !== context.pilot.limits.primaryCompanyCutoff
  || context.pilot.productComparator.repetitionsPerSystem !== context.pilot.repetitionsPerSystem) {
  throw new Error("Sales Lead Copilot comparator is not aligned with the measured model runs");
}

for (const provider of ["openai", "claude", "kimi", "deepseek", "grok", "gemini"] as const) {
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
if (openAiRequest.model !== "gpt-5.6-terra" || openAiRequest.reasoning.effort !== "low"
  || "max_tool_calls" in openAiRequest || "max_output_tokens" in openAiRequest
  || openAiRequest.tools[0].type !== "web_search" || "instructions" in openAiRequest) {
  throw new Error("OpenAI natural-language search request is incomplete");
}

const claudeContext = await loadContext("claude", "2026-08-20", 1);
const claudeRequest = buildAnthropicRequest(claudeContext);
if (claudeRequest.model !== "claude-opus-5" || claudeRequest.max_tokens !== 128_000
  || claudeRequest.tools?.[0].type !== "web_search_20260209" || claudeRequest.tools?.[0].max_uses !== 8
  || claudeRequest.output_config?.effort !== "medium" || claudeRequest.system !== CLAUDE_SEARCH_SYSTEM_PROMPT
  || "thinking" in claudeRequest) {
  throw new Error("Claude natural-language search request is incomplete");
}

const deepSeekContext = await loadContext("deepseek", "2026-08-20", 1);
const deepSeekRequest = buildAnthropicRequest(deepSeekContext);
if (deepSeekRequest.model !== "deepseek-v4-pro" || deepSeekRequest.max_tokens !== 384_000
  || deepSeekRequest.thinking?.type !== "disabled"
  || deepSeekRequest.tools?.[0].type !== "web_search_20250305") {
  throw new Error("DeepSeek non-thinking search request is incomplete");
}

const kimiContext = await loadContext("kimi", "2026-08-20", 1);
const kimiRequest = buildKimiRequest(kimiContext, [{ role: "user", content: "test" }]);
if (kimiRequest.model !== "kimi-k3" || kimiRequest.max_completion_tokens !== 128_000
  || kimiRequest.reasoning_effort !== "low" || "thinking" in kimiRequest || kimiRequest.tools?.[0]?.function.name !== "$web_search"
  || "response_format" in kimiRequest) {
  throw new Error("Kimi natural-language search request is incomplete");
}
if ("tools" in buildKimiRequest(kimiContext, [{ role: "user", content: "test" }], null)) {
  throw new Error("Kimi final synthesis request still exposes search tools after the action ceiling");
}
const kimiRequiredSearch = buildKimiRequest(kimiContext, [{ role: "user", content: "test" }], [
  { type: "function", function: { name: "web_search" } },
], "required");
if (kimiRequiredSearch.tool_choice !== "required" || kimiRequiredSearch.tools?.[0]?.function.name !== "web_search") {
  throw new Error("Kimi recovery request does not require an auditable first native search");
}
if (buildKimiRequest(kimiContext, [{ role: "user", content: "test" }], kimiRequiredSearch.tools, "none").tool_choice !== "none") {
  throw new Error("Kimi recovery request cannot force final synthesis at the search target");
}

const grokContext = await loadContext("grok", "2026-08-20", 1);
const grokRequest = buildGrokRequest(grokContext);
if (grokRequest.model !== "grok-4.6" || "reasoning" in grokRequest
  || "max_turns" in grokRequest || "max_output_tokens" in grokRequest
  || grokRequest.parallel_tool_calls !== false || grokRequest.tools[0].type !== "web_search"
  || "text" in grokRequest || "tool_choice" in grokRequest) {
  throw new Error("Grok natural-language search request is incomplete");
}

const geminiContext = await loadContext("gemini", "2026-08-20", 1);
const geminiRequest = buildGeminiRequest(geminiContext);
if (geminiRequest.model !== "gemini-3.6-flash" || geminiRequest.input !== context.prompt
  || geminiRequest.generation_config.thinking_level !== "low"
  || "max_output_tokens" in geminiRequest.generation_config
  || geminiRequest.tools?.[0]?.type !== "google_search" || "system_instruction" in geminiRequest) {
  throw new Error("Gemini natural-language search request is incomplete");
}
if (geminiInteractionsUrl("https://generativelanguage.googleapis.com/v1beta/openai/")
    !== "https://generativelanguage.googleapis.com/v1beta/interactions"
  || geminiInteractionsUrl("https://generativelanguage.googleapis.com")
    !== "https://generativelanguage.googleapis.com/v1beta/interactions") {
  throw new Error("Gemini native Interactions endpoint routing failed");
}
const syntheticGeminiResponse = {
  steps: [
    { type: "google_search_call", arguments: { queries: ["Cudy Technology official website"] } },
    { type: "model_output", content: [{ type: "text", text: "Cudy official site" }] },
  ],
};
if (countGeminiSearchQueries(syntheticGeminiResponse) !== 1
  || geminiInteractionText(syntheticGeminiResponse) !== "Cudy official site") {
  throw new Error("Gemini native search response parsing failed");
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
  riskFlags: [], notes: [],
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
  || syntheticCandidates[0].officialWebsiteUrl !== "https://shop.example.de/networking"
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
const syntheticNumberedListCandidates = extractCandidateOccurrences({
  ...syntheticRun,
  answerText: [
    "## 1. 一级分销商",
    "1. **List One GmbH**",
    "类别：一级分销商。官网：https://list-one.example/",
    "## 2. Reseller",
    "1. Plain Network GmbH",
    "Website: https://plain-network.example/",
  ].join("\n"),
}, "test-salt");
if (syntheticNumberedListCandidates.length !== 2
  || syntheticNumberedListCandidates.some((candidate) => candidate.claimedCategory === "unclear")
  || syntheticNumberedListCandidates.some((candidate) => /^(?:一级分销商|reseller)$/i.test(candidate.companyName))) {
  throw new Error("Numbered-list candidate extraction or category-heading exclusion failed");
}
const syntheticStandaloneBoldCandidates = extractCandidateOccurrences({
  ...syntheticRun,
  answerText: [
    "**EFB-Elektronik GmbH** (Bielefeld, Deutschland)  ",
    "**Website:** https://www.efb-elektronik.de/",
    "**Kanalrolle:** Distributor für Fachkunden.",
    "**YELLO NETCOM GmbH** (Rheine, Deutschland)",
    "**Website:** https://www.yello-net.de/",
    "**Kanalrolle:** Value-Added-Distributor.",
  ].join("\n"),
}, "test-salt");
if (syntheticStandaloneBoldCandidates.length !== 2
  || syntheticStandaloneBoldCandidates.some((candidate) => candidate.extractionRule !== "bold_candidate")) {
  throw new Error("Standalone bold natural-language candidate extraction failed");
}
const syntheticMixedCandidates = extractCandidateOccurrences({
  ...syntheticRun,
  answerText: [
    "### 1. Primary Distribution GmbH",
    "Distributor. https://primary.example/",
    "### 2. Second Distribution GmbH",
    "Distributor. https://second.example/",
    "### 3. 其他值得关注的潜在渠道",
    "- **Third Networks GmbH**（集成商）：https://third.example/",
  ].join("\n"),
}, "test-salt");
if (syntheticMixedCandidates.length !== 3
  || syntheticMixedCandidates[2].companyName !== "Third Networks GmbH") {
  throw new Error("Mixed natural-language candidate extraction failed");
}
const syntheticLeadingTableCandidates = extractCandidateOccurrences({
  ...syntheticRun,
  answerText: [
    "| 1 | **Leading Table GmbH** | https://leading-table.example/ |",
    "### 2. Detailed Networks GmbH",
    "Distributor. https://detailed.example/",
    "| 3 | **Repeated Summary GmbH** | summary only |",
  ].join("\n"),
}, "test-salt");
if (syntheticLeadingTableCandidates.length !== 2
  || syntheticLeadingTableCandidates[0].companyName !== "Leading Table GmbH"
  || syntheticLeadingTableCandidates[1].companyName !== "Detailed Networks GmbH") {
  throw new Error("Leading table plus detailed heading extraction failed");
}
if (extractUrls("https://example.de/a?utm_source=x and https://example.de/a").length !== 1) {
  throw new Error("Normalized answer URL extraction failed");
}
const fourCategoryRows = [
  ["一级分销商", "Distributor", "distributor"],
  ["Reseller", "Reseller", "reseller"],
  ["Retailer", "Retailer", "retailer"],
  ["SI", "Integrator", "integrator"],
].flatMap(([category, name, domain]) => Array.from({ length: 11 }, (_, index) =>
  `| ${index + 1} | **${name} ${index + 1} GmbH** | 类别：${category} | https://${domain}${index + 1}.example/ |`));
const fourCategoryCandidates = extractCandidateOccurrences({
  ...syntheticRun,
  answerText: fourCategoryRows.join("\n"),
}, "test-salt");
if (fourCategoryCandidates.length !== 40
  || fourCategoryCandidates.some((candidate) => candidate.claimedCategory === "unclear" || candidate.categoryRank === null)
  || new Set(fourCategoryCandidates.map((candidate) => candidate.claimedCategory)).size !== 4
  || Math.max(...fourCategoryCandidates.map((candidate) => candidate.categoryRank ?? 0)) !== 10) {
  throw new Error("Four-category extraction or per-category cutoff failed");
}
if (!isDegenerateProcessOutput(Array.from({ length: 20 }, () => "让我继续搜索更多渠道。").join(""))) {
  throw new Error("Degenerate process-output detection failed");
}
if (!isDegenerateProcessOutput("I found initial leads. Let me search more distributors. Let me compile the findings after more searches.")) {
  throw new Error("Short process-only output detection failed");
}
if (!isDegenerateProcessOutput(`I'll search for "${"repeat the task ".repeat(60)}"`)) {
  throw new Error("Long prompt-echo process-output detection failed");
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
  unverifiedOrContradictedClaims: [],
  notes: [],
});

console.log("Native-search four-category v4 benchmark validation passed");
