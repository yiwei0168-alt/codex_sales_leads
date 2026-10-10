import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ bge: vi.fn(), search: vi.fn(), remote: vi.fn(), revision: vi.fn() }));
vi.mock("./bge-client", () => ({ embedTextsWithBge: mocks.bge }));
vi.mock("./repository", () => ({ hybridSearch: mocks.search, knowledgeRevisionToken: mocks.revision,
  authorizedKnowledgeChunkIds: vi.fn(), logRagQuery: vi.fn() }));
vi.mock("./openai-provider", () => ({ embedTexts: mocks.remote, generateGroundedAnswer: vi.fn() }));
vi.mock("@/lib/tracked-operation", () => ({ trackedOperation: (_a: unknown, _b: unknown, _c: unknown, _d: unknown, run: () => unknown) => run() }));
import { answerWithRag } from "./service";
import { clearKnowledgeCache } from "@/lib/knowledge/cache";
beforeEach(() => { vi.clearAllMocks(); clearKnowledgeCache(); mocks.revision.mockResolvedValue("local-profile"); mocks.search.mockResolvedValue([]); });
it("passes local vectors only to the BGE lane and does not report retired Qwen as an outage", async () => {
  const vector = Array(1024).fill(0.01); mocks.bge.mockResolvedValue([vector]);
  const answer = await answerWithRag("owner", { question: "synthetic local query" });
  expect(mocks.search.mock.calls[0][2]).toBeNull();
  expect(mocks.search.mock.calls[0][5]).toEqual(vector);
  expect(mocks.remote).not.toHaveBeenCalled();
  expect(answer.degradedLanes).toEqual([]);
});
it("continues authorized lexical/fact retrieval if BGE is unavailable, without cloud fallback", async () => {
  mocks.bge.mockRejectedValue(new Error("offline"));
  const answer = await answerWithRag("owner", { question: "synthetic local query" });
  expect(mocks.search).toHaveBeenCalledOnce();
  expect(mocks.search.mock.calls[0][2]).toBeNull();
  expect(mocks.search.mock.calls[0][5]).toBeNull();
  expect(mocks.remote).not.toHaveBeenCalled();
  expect(answer.degradedLanes).toEqual(["bge"]);
});
