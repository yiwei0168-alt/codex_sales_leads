import { describe, expect, it } from "vitest";
import { assertMa24PersistedRunBinding } from "./ma24-persisted-run-binding";
import { ma24CaseQuerySha256, type Ma24Case, type Ma24Run } from "./ma24-independent-comparison";
import { digest } from "../../assistant/main/contracts";
import { modelFunctions, transportMessages } from "../../assistant/main/model";
import { modelRequestManifest } from "../../assistant/main/model-request-manifest";
import { modeModelConfig } from "../../assistant/main/mode-config";

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
  { role: "system" as const, content: "Search and cite only these selected knowledge collections: industry, product." },
  { role: "user" as const, content: query },
], config: { model: "model-1", providers: ["fixture"] } };
const wireBody = { model: "model-1", messages: transportMessages(modelInput.messages), tools: modelFunctions,
  provider: { only: ["fixture"], allow_fallbacks: false } };
const requestManifest = modelRequestManifest(wireBody,
  { model: "model-1", provider: "fixture", id: "generation-1" });
const modelCalls = [{ id: "33333333-3333-4333-8333-333333333333", user_id: userId,
  run_id: runId, tool_id: "main_model", effect: "model", status: "completed",
  input: modelInput, input_hash: digest(modelInput),
  output: { status: "success", data: { message: { role: "assistant", content: run.answer }, requestManifest } } }];
const verify = (overrides: Partial<Parameters<typeof assertMa24PersistedRunBinding>[0]> = {}) =>
  assertMa24PersistedRunBinding({ case: frozen, query, run, task, modelCalls, ...overrides });

describe("MA24 persisted run binding", () => {
  it("binds one completed execution to its database principal, question, scope, reply and model journal", () => {
    expect(verify().modelCallIds).toEqual([modelCalls[0].id]);
    expect(verify().wireManifests).toEqual([{ callId: modelCalls[0].id,
      requestHash: requestManifest.requestHash, provider: "fixture", generationId: "generation-1" }]);
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
      status: "success", data: { value: { message: { role: "assistant", content: run.answer }, requestManifest } },
    } }] })).toThrow("saved model wire manifest mismatch");
  });
  it("rejects a saved answer whose wire request or provider identity cannot be checked", () => {
    const success = modelCalls[0];
    expect(() => verify({ modelCalls: [{ ...success, output: { status: "success",
      data: { message: { role: "assistant", content: run.answer } } } }] }))
      .toThrow("saved model wire manifest mismatch");
    expect(() => verify({ modelCalls: [{ ...success, output: { status: "success",
      data: { message: { role: "assistant", content: run.answer },
        requestManifest: { ...requestManifest, requestHash: "0".repeat(64) } } } }] }))
      .toThrow("saved model wire manifest mismatch");
    expect(() => verify({ modelCalls: [{ ...success, output: { status: "success",
      data: { message: { role: "assistant", content: run.answer },
        requestManifest: { ...requestManifest, response: { ...requestManifest.response,
          generationId: null } } } } }] }))
      .toThrow("saved model wire manifest mismatch");
    const changedInput = { ...modelInput, config: { ...modelInput.config, model: "model-2" } };
    expect(() => verify({ modelCalls: [{ ...success, input: changedInput,
      input_hash: digest(changedInput) }] })).toThrow("saved model wire manifest mismatch");
  });
  it("accepts a mode-model wire manifest bound to the selected route", () => {
    const profile = modeModelConfig("standard").profile!;
    const route = profile.routes[0];
    const input = { messages: modelInput.messages, profile, index: 0 };
    const body = { model: route.model, messages: transportMessages(input.messages), tools: modelFunctions,
      stream: true, max_tokens: 16384, tool_choice: "auto", reasoning: { effort: route.effort },
      provider: { allow_fallbacks: false } };
    const manifest = modelRequestManifest(body,
      { model: route.model, provider: "fixture", id: "mode-generation-1" });
    const modeRun = { ...run, modelId: route.model };
    const modeTask = { ...task, model_config: { model: route.model } };
    const call = { ...modelCalls[0], input, input_hash: digest(input),
      output: { status: "success", data: { value: { message: { role: "assistant", content: run.answer },
        requestManifest: manifest } } } };
    expect(() => verify({ run: modeRun, task: modeTask, modelCalls: [call] })).not.toThrow();
  });
  it("rejects a provider generation reused by two successful calls in one task", () => {
    const secondId = "44444444-4444-4444-8444-444444444444";
    expect(() => verify({ run: { ...run, modelCallIds: [modelCalls[0].id, secondId],
      receiptIds: [modelCalls[0].id, secondId] }, modelCalls: [modelCalls[0],
      { ...modelCalls[0], id: secondId }] })).toThrow("duplicate provider generation");
  });
});
