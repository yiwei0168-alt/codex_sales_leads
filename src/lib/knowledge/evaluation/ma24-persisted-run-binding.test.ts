import { describe, expect, it } from "vitest";
import { assertMa24PersistedRunBinding } from "./ma24-persisted-run-binding";
import { ma24CaseQuerySha256, type Ma24Case, type Ma24Run } from "./ma24-independent-comparison";
import { digest } from "../../assistant/main/contracts";

const userId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const query = "What does the private document say?";
const frozen: Ma24Case = { caseId: "private-owner", caseSha256: ma24CaseQuerySha256(query),
  group: "permission", tags: ["permission"], expectedOutcome: "route", userId,
  knowledgeScope: ["industry", "product"] };
const run: Ma24Run = { caseId: frozen.caseId, arm: "candidate", runId,
  caseSha256: frozen.caseSha256, manifestSha256: "a".repeat(64), userId,
  knowledgeScope: frozen.knowledgeScope, status: "completed", answer: "Document answer",
  citations: [], receiptIds: ["33333333-3333-4333-8333-333333333333"],
  modelCallIds: ["33333333-3333-4333-8333-333333333333"], modelId: "model-1" };
const task = { id: runId, user_id: userId, status: "completed", execution_kind: "main-agent",
  input: { content: query, knowledgeScope: frozen.knowledgeScope },
  model_config: { model: "model-1" }, result: { reply: "Document answer" } };
const modelInput = { messages: [
  { role: "system", content: "Search and cite only these selected knowledge collections: industry, product." },
  { role: "user", content: query },
] };
const modelCalls = [{ id: "33333333-3333-4333-8333-333333333333", user_id: userId,
  run_id: runId, tool_id: "main_model", effect: "model", status: "completed",
  input: modelInput, input_hash: digest(modelInput),
  output: { status: "success", data: { message: { role: "assistant", content: run.answer } } } }];
const verify = (overrides: Partial<Parameters<typeof assertMa24PersistedRunBinding>[0]> = {}) =>
  assertMa24PersistedRunBinding({ case: frozen, query, run, task, modelCalls, ...overrides });

describe("MA24 persisted run binding", () => {
  it("binds one completed execution to its database principal, question, scope, reply and model journal", () => {
    expect(verify().modelCallIds).toEqual([modelCalls[0].id]);
    expect(() => verify({ task: { ...task, user_id: "44444444-4444-4444-8444-444444444444" } }))
      .toThrow("persisted task mismatch");
    expect(() => verify({ task: { ...task, input: { ...task.input, knowledgeScope: ["industry"] } } }))
      .toThrow("persisted task mismatch");
    expect(() => verify({ task: { ...task, input: { ...task.input, content: "Changed question" } } }))
      .toThrow("persisted task mismatch");
    expect(() => verify({ task: { ...task, result: { reply: "Changed answer" } } }))
      .toThrow("persisted task mismatch");
    expect(() => verify({ modelCalls: [{ ...modelCalls[0], run_id: "44444444-4444-4444-8444-444444444444" }] }))
      .toThrow("persisted model journal mismatch");
    expect(() => verify({ task: { ...task, input: { ...task.input, attachments: [{ assetId: runId }] } } }))
      .toThrow("persisted task mismatch");
    expect(() => verify({ task: { ...task, input: { ...task.input, conversationId: runId } } }))
      .toThrow("persisted task mismatch");
    expect(() => verify({ modelCalls: [{ ...modelCalls[0], input_hash: "0".repeat(64) }] }))
      .toThrow("persisted model journal mismatch");
    expect(() => verify({ modelCalls: [{ ...modelCalls[0], input: { messages: [
      modelInput.messages[0], { role: "user", content: "Changed question" },
    ] } }] })).toThrow("persisted model journal mismatch");
    expect(() => verify({ run: { ...run, modelCallIds: ["44444444-4444-4444-8444-444444444444"] } }))
      .toThrow("persisted model journal mismatch");
  });
  it("rejects a run with no persisted model attempt", () => {
    expect(() => verify({ modelCalls: [] })).toThrow("persisted model journal mismatch");
    const failedRun: Ma24Run = { ...run, status: "failed", answer: "", citations: [], modelCallIds: [],
      failureReason: "preflight failed" };
    expect(() => verify({ run: failedRun, task: { ...task, status: "failed", result: null },
      modelCalls: [] })).not.toThrow();
  });
  it("requires a successful saved model output while allowing a failed fallback attempt", () => {
    const failedCall = { ...modelCalls[0], id: "44444444-4444-4444-8444-444444444444",
      output: { status: "unavailable" } };
    expect(() => verify({ modelCalls: [{ ...modelCalls[0], output: { status: "unavailable" } }] }))
      .toThrow("persisted model journal mismatch");
    expect(() => verify({ run: { ...run, modelCallIds: [failedCall.id, modelCalls[0].id],
      receiptIds: [failedCall.id, modelCalls[0].id] }, modelCalls: [failedCall, modelCalls[0]] }))
      .not.toThrow();
    expect(() => verify({ modelCalls: [{ ...modelCalls[0], output: null }] }))
      .toThrow("persisted model journal mismatch");
    expect(() => verify({ modelCalls: [{ ...modelCalls[0], output: { status: "success" } }] }))
      .toThrow("persisted model journal mismatch");
    expect(() => verify({ modelCalls: [{ ...modelCalls[0], output: {
      status: "success", data: { value: { message: { role: "assistant", content: "Other answer" } } },
    } }] })).toThrow("persisted model journal mismatch");
    expect(() => verify({ modelCalls: [{ ...modelCalls[0], output: {
      status: "success", data: { value: { message: { role: "assistant", content: run.answer } } },
    } }] })).not.toThrow();
  });
});
