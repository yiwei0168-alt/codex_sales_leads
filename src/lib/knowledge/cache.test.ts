import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearKnowledgeCache, knowledgeCacheKey, withSuccessfulKnowledgeCache } from "./cache";

describe("knowledge cache", () => {
  beforeEach(clearKnowledgeCache);
  it("deduplicates concurrent successful work and reuses it", async () => {
    const load = vi.fn(async () => [1, 2, 3]);
    const [first, second] = await Promise.all([
      withSuccessfulKnowledgeCache({ key: "same", ttlMs: 1_000, load }),
      withSuccessfulKnowledgeCache({ key: "same", ttlMs: 1_000, load }),
    ]);
    expect(load).toHaveBeenCalledOnce();
    expect(first.value).toEqual(second.value);
    expect((await withSuccessfulKnowledgeCache({ key: "same", ttlMs: 1_000, load })).cacheHit).toBe(true);
  });
  it("does not cache failures or rejected empty results", async () => {
    const failure = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce("ok");
    await expect(withSuccessfulKnowledgeCache({ key: "failure", ttlMs: 1_000, load: failure })).rejects.toThrow("failed");
    expect((await withSuccessfulKnowledgeCache({ key: "failure", ttlMs: 1_000, load: failure })).value).toBe("ok");
    const empty = vi.fn(async () => [] as number[]);
    await withSuccessfulKnowledgeCache({ key: "empty", ttlMs: 1_000, load: empty, shouldCache: (value) => value.length > 0 });
    await withSuccessfulKnowledgeCache({ key: "empty", ttlMs: 1_000, load: empty, shouldCache: (value) => value.length > 0 });
    expect(empty).toHaveBeenCalledTimes(2);
  });
  it("includes every supplied scope/version dimension in the digest", () => {
    expect(knowledgeCacheKey("evidence", { userId: "a", generation: "g1" }))
      .not.toBe(knowledgeCacheKey("evidence", { userId: "b", generation: "g1" }));
  });
});
