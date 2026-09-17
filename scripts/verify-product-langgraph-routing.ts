import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { Client } from "@langchain/langgraph-sdk";

import {
  invokeAssistantWorkflowViaLangGraph,
  invokeLeadWorkflowViaLangGraph,
  invokeKnowledgeWorkflowViaLangGraph,
} from "../src/lib/langgraph/client";

const apiUrl = process.env.LANGGRAPH_API_URL?.trim() || "http://127.0.0.1:2024";
const client = new Client({ apiUrl, apiKey: null, callerOptions: { maxRetries: 0 } });
const startedAt = performance.now();

const health = await client.runs.wait(null, "runtime_health", {
  input: { probe: "product-routing-acceptance" },
  signal: AbortSignal.timeout(10_000),
}) as { status?: string; service?: string };
assert.equal(health.status, "ready");
assert.equal(health.service, "network-channel-langgraph");

const invalidIdentity = "not-a-valid-user-id";
await assert.rejects(
  invokeAssistantWorkflowViaLangGraph(invalidIdentity, "schema boundary probe"),
  /assistant_workflow/,
);
await assert.rejects(
  invokeKnowledgeWorkflowViaLangGraph({
    userId: invalidIdentity,
    question: "schema boundary probe",
    entry: "knowledge-page",
  }),
  /knowledge_workflow/,
);
await assert.rejects(
  invokeLeadWorkflowViaLangGraph({
    userId: invalidIdentity,
    actionId: "22222222-2222-4222-8222-222222222222",
    graphThreadId: "routing-probe",
    plan: {
      countryCode: "DE",
      countryName: "Germany",
      objective: "new-market",
      roles: ["Distributor"],
      targetCount: 1,
      queryLanguage: "en",
      userRequest: "schema boundary probe",
    },
  }),
  /lead_workflow/,
);

console.log(JSON.stringify({
  ok: true,
  apiUrl,
  requests: 4,
  validHealthOutputs: 1,
  expectedSchemaRejections: 2,
  externalProviderCalls: 0,
  elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
}));
