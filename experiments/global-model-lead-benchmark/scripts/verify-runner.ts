import { anthropicMessagesUrl, buildKimiRequest, buildMessageEnvelope, extractBenchmarkJson, loadContext, parseSseBuffer, validateBenchmarkResult } from "../lib/benchmark";

const context = await loadContext("openai", "2026-08-19");
if (!context.prompt.includes("Country: `Germany` (`DE`)") || !context.prompt.includes("Search languages: `German, English` plus English")) throw new Error("Prompt substitution failed");
for (const provider of ["openai", "claude", "kimi", "deepseek"] as const) {
  const envelope = buildMessageEnvelope(provider, context.prompt, context.trigger);
  const userContent = envelope.input ?? envelope.messages?.find((message) => message.role === "user")?.content;
  const systemContent = envelope.instructions ?? envelope.system ?? envelope.messages?.find((message) => message.role === "system")?.content;
  if (userContent !== context.trigger || systemContent !== context.prompt || userContent.includes("Cudy Global Channel-Lead")) throw new Error(`${provider} message role separation failed`);
}
if (!context.trigger.includes("Germany (DE)") || !context.trigger.includes("German and English") || !context.trigger.includes("Cudy's current channel partners") || !context.trigger.includes("return only JSON")) throw new Error("Searchable benchmark trigger is incomplete");
if (anthropicMessagesUrl("deepseek", "https://api.deepseek.com") !== "https://api.deepseek.com/anthropic/v1/messages" || anthropicMessagesUrl("claude", "https://lingyuapi.com") !== "https://lingyuapi.com/v1/messages") throw new Error("Anthropic-compatible endpoint routing failed");
const kimiContext = await loadContext("kimi", "2026-08-19");
const kimiRequest = buildKimiRequest(kimiContext, [{ role: "user", content: "test" }]);
if (kimiRequest.max_completion_tokens !== 10000 || kimiRequest.response_format.type !== "json_object" || kimiRequest.thinking.type !== "disabled" || kimiRequest.tools[0].function.name !== "$web_search") throw new Error("Kimi JSON-mode benchmark request is incomplete");
const result = {
  runMetadata: { countryName: "Germany", countryCode: "DE" }, searchCapability: { queriesExecutedCount: 0 },
  tier1Partners: [], downstreamCustomers: [], contacts: [], uncertainties: [], knowledgeGaps: [],
  continuation: { outputTruncated: false, nextActions: [], resumeInstructions: null },
  summaryMetrics: { tier1PartnerCount: 0, tier1ConfirmedCurrentCount: 0, downstreamCustomerCount: 0, downstreamConfirmedCudyCount: 0, contactCount: 0, publicVerifiedContactCount: 0, uniqueCompanyCount: 0, uniqueDomainCount: 0, queriesExecutedCount: 0 },
};
validateBenchmarkResult(result, context);
const wrapped = extractBenchmarkJson(`I searched first.\n\n\`\`\`json\n${JSON.stringify(result)}\n\`\`\``) as typeof result;
if (wrapped.runMetadata.countryCode !== "DE") throw new Error("Wrapped JSON extraction failed");
let multipleRejected = false;
try { extractBenchmarkJson(`${JSON.stringify(result)}\n${JSON.stringify(result)}`); } catch { multipleRejected = true; }
if (!multipleRejected) throw new Error("Extractor accepted multiple benchmark objects");
const invalid = structuredClone(result);
invalid.summaryMetrics.contactCount = 1;
let rejected = false;
try { validateBenchmarkResult(invalid, context); } catch { rejected = true; }
if (!rejected) throw new Error("Validator accepted inconsistent metrics");
const sse = parseSseBuffer('event: response.created\ndata: {"type":"response.created"}\n\ndata: {"type":"response.completed","response":{"id":"r1"}}\n\n');
if (sse.events.length !== 2 || sse.events[1].type !== "response.completed" || sse.remainder !== "") throw new Error("SSE parser validation failed");
console.log("Benchmark runner mock validation passed");
