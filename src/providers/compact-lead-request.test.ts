import { expect, it } from "vitest";
import { compactLeadSingleton } from "./compact-lead-request";
import { leadRequestBatches } from "./lead-request-batches";
import { LeadRequestTooLargeError } from "./lead-request-bounds";
import type { StructuredAiRequest } from "./contracts";

const text = "Networking facts with quotes \" and Unicode 界. ".repeat(80);
const request: StructuredAiRequest<unknown> = {
  task: "lead-evidence-correction", modelVersion: "deepseek-v4-flash", promptVersion: "fixture",
  evidenceIds: Array.from({ length: 20 }, (_, i) => `e${i}`),
  input: { instructions: ["Keep factual evidence"], candidates: [{ candidateId: "c1",
    findings: [{ statement: "A retained fact", evidenceIds: ["e0", "e19"] }],
    evidence: Array.from({ length: 20 }, (_, i) => ({ evidenceId: `e${i}`, url: `https://example.test/${i}`,
      sourceType: "official-website", title: "Page", excerpt: text })) }] },
};

it("losslessly compresses an oversized singleton with separate citation identities and deterministic dependencies", () => {
  const before = JSON.stringify(request);
  const compact = compactLeadSingleton(request);
  expect(compact).not.toBe(request);
  const input = compact.input as { evidenceTextDictionary: Record<string, string>;
    candidates: Array<{ findings: unknown; evidence: Array<Record<string, unknown>> }> };
  const expanded = input.candidates[0].evidence.map(item => {
    const copy = { ...item };
    for (const field of ["title", "excerpt"]) if (copy[`${field}TextRef`]) {
      copy[field] = input.evidenceTextDictionary[String(copy[`${field}TextRef`])];
      delete copy[`${field}TextRef`];
    }
    return copy;
  });
  const original = request.input as typeof input;
  expect(expanded).toEqual(original.candidates[0].evidence);
  expect(input.candidates[0].findings).toEqual(original.candidates[0].findings);
  expect(compact.evidenceIds).toEqual(request.evidenceIds);
  expect(JSON.stringify(request)).toBe(before);
  expect(compactLeadSingleton(request)).toEqual(compact);
  expect(leadRequestBatches(["c1"], () => compact, 5, 100000)).toEqual([["c1"]]);
});

it("leaves normal batches untouched and never truncates uncompressible evidence", () => {
  const small = { ...request, input: { instructions: [], candidates: [{ evidence: [{ excerpt: "small" }] }] } };
  expect(compactLeadSingleton(small)).toBe(small);
  const unique = { ...request, input: { instructions: [], candidates: [{ evidence: [{ excerpt: text.repeat(30) }] }] } };
  expect(compactLeadSingleton(unique)).toBe(unique);
  expect(() => leadRequestBatches(["c1"], () => compactLeadSingleton(unique), 5, 100000))
    .toThrow(LeadRequestTooLargeError);
});
