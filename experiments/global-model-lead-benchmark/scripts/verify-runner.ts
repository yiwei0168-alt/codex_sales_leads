import { loadContext, parseSseBuffer, validateBenchmarkResult } from "../lib/benchmark";

const context = await loadContext("openai", "2026-08-19");
if (!context.prompt.includes("Country: `Germany` (`DE`)") || !context.prompt.includes("Search languages: `German, English` plus English")) throw new Error("Prompt substitution failed");
const result = {
  runMetadata: { countryName: "Germany", countryCode: "DE" }, searchCapability: { queriesExecutedCount: 0 },
  tier1Partners: [], downstreamCustomers: [], contacts: [], uncertainties: [], knowledgeGaps: [],
  continuation: { outputTruncated: false, nextActions: [], resumeInstructions: null },
  summaryMetrics: { tier1PartnerCount: 0, tier1ConfirmedCurrentCount: 0, downstreamCustomerCount: 0, downstreamConfirmedCudyCount: 0, contactCount: 0, publicVerifiedContactCount: 0, uniqueCompanyCount: 0, uniqueDomainCount: 0, queriesExecutedCount: 0 },
};
validateBenchmarkResult(result, context);
const invalid = structuredClone(result);
invalid.summaryMetrics.contactCount = 1;
let rejected = false;
try { validateBenchmarkResult(invalid, context); } catch { rejected = true; }
if (!rejected) throw new Error("Validator accepted inconsistent metrics");
const sse = parseSseBuffer('event: response.created\ndata: {"type":"response.created"}\n\ndata: {"type":"response.completed","response":{"id":"r1"}}\n\n');
if (sse.events.length !== 2 || sse.events[1].type !== "response.completed" || sse.remainder !== "") throw new Error("SSE parser validation failed");
console.log("Benchmark runner mock validation passed");
