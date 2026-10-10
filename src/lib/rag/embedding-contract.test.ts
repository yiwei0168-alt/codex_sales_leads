import { afterEach, expect, it, vi } from "vitest";
import { embedTextsWithUsage, embedTexts } from "./openai-provider";
import { getRagConfig } from "./config";
import { localKeywordQuery } from "./embedding-contract";
afterEach(() => vi.unstubAllEnvs());
it("uses quoted disjunction for generated long questions without query operators", () => {
  expect(localKeywordQuery('Which routers and switches are for Germany? -"switches"')).toBe('"routers" OR "switches" OR "germany"');
  expect(localKeywordQuery("and or the")).toBe("");
});
it("retired remote embedding never transmits despite configured old credentials", async () => {
  vi.stubEnv("EMBEDDING_API_KEY", "old-secret");
  vi.stubEnv("EMBEDDING_BASE_URL", "https://old-provider.example/v1");
  const transport = vi.fn();
  await expect(embedTextsWithUsage(["private text"], transport)).rejects.toThrow("retired");
  await expect(embedTexts(["private text"])).rejects.toThrow("retired");
  expect(transport).not.toHaveBeenCalled();
  expect(getRagConfig()).toMatchObject({embeddingApiKey:"",embeddingBaseUrl:""});
});
it("empty batches remain a local no-op", async () => {
  const transport = vi.fn();
  expect(await embedTextsWithUsage([], transport)).toEqual({embeddings:[],usage:[]});
  expect(transport).not.toHaveBeenCalled();
});
