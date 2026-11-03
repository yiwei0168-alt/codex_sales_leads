import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { knowledgeExtractorScript, resolveKnowledgeStoragePath, safeKnowledgeStorageKey } from "./storage-path";

const routeMocks = vi.hoisted(() => ({ query: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/rag/db", () => ({ tenantQuery: routeMocks.query, tenantTransaction: async (_user: string, work: (client: object) => unknown) => work({}) }));
vi.mock("@/lib/auth/session", () => ({ requireApiSession: routeMocks.session }));
vi.mock("@/lib/knowledge/immutable-asset-snapshot", () => ({ readAvailableImmutableKnowledgeAsset: async () => null }));
import { inspectKnowledgeAssetBytes } from "./document-repository";
import { GET } from "@/app/api/knowledge/assets/[assetId]/route";

const base = resolve("tmp");
let directory: string, root: string, packaged: string;
const bytes = Buffer.from("synthetic original for packaged runtime");
const hash = createHash("sha256").update(bytes).digest("hex");
beforeEach(async () => {
  await mkdir(base, { recursive: true });
  directory = await mkdtemp(resolve(base, "knowledge-path-test-"));
  root = resolve(directory, "storage"); packaged = resolve(directory, "packaged");
  await mkdir(root); await mkdir(packaged); await writeFile(resolve(root, "original.pdf"), bytes);
  vi.stubEnv("KNOWLEDGE_STORAGE_ROOT", root); vi.stubEnv("KNOWLEDGE_SCRIPTS_ROOT", "");
  vi.spyOn(process, "cwd").mockReturnValue(packaged);
  routeMocks.query.mockReset(); routeMocks.session.mockReset();
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  if (!directory.startsWith(base + sep + "knowledge-path-test-")) throw Error("Fixture escaped cleanup scope");
  await rm(directory, { recursive: true, force: true });
});
it("reproduces the missing original under a packaged cwd without a storage setting", async () => {
  vi.stubEnv("KNOWLEDGE_STORAGE_ROOT", "");
  await expect(inspectKnowledgeAssetBytes("knowledge/original.pdf", hash)).rejects.toMatchObject({ code: "ENOENT" });
});
it("reads the registered bytes and digest from shared storage with a different cwd", async () => {
  const result = await inspectKnowledgeAssetBytes("knowledge/original.pdf", hash);
  expect(result.sha256).toBe(hash); expect(result.byteSize).toBe(bytes.length);
  expect(result.storageKey).toBe("knowledge/original.pdf");
  await expect(inspectKnowledgeAssetBytes("knowledge/original.pdf", "0".repeat(64))).rejects.toThrow("no longer matches approved hash");
});
it("places new originals and extraction outputs under the same shared root", async () => {
  const path = resolveKnowledgeStoragePath("knowledge/uploads/owner/new.json");
  await mkdir(resolve(root, "uploads/owner"), { recursive: true }); await writeFile(path, bytes, { flag: "wx" });
  expect(await readFile(resolve(root, "uploads/owner/new.json"))).toEqual(bytes);
});
it("rejects traversal, absolute paths, alternate streams and ambiguous keys", () => {
  for (const key of ["knowledge/../outside", "knowledge/a/../../outside", "C:\\outside", "/knowledge/x", "knowledge/a:stream", "knowledge//x", "knowledge/./x", "knowledge/x\0"])
    expect(() => safeKnowledgeStorageKey(key)).toThrow("Invalid knowledge asset storage key");
});
it("rejects existing directory links that escape storage for both reads and new writes", async () => {
  const outside = resolve(directory, "outside"); await mkdir(outside); await writeFile(resolve(outside, "secret.pdf"), bytes);
  await symlink(outside, resolve(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  expect(() => resolveKnowledgeStoragePath("knowledge/escape/secret.pdf")).toThrow("escaped storage root");
  expect(() => resolveKnowledgeStoragePath("knowledge/escape/new/output.json")).toThrow("escaped storage root");
});
it("accepts an explicitly configured root junction using its canonical location", async () => {
  const alias = resolve(directory, "storage-alias");
  await symlink(root, alias, process.platform === "win32" ? "junction" : "dir"); vi.stubEnv("KNOWLEDGE_STORAGE_ROOT", alias);
  expect((await inspectKnowledgeAssetBytes("knowledge/original.pdf", hash)).sha256).toBe(hash);
});
it("requires absolute configured roots and resolves extractor metadata outside the packaged cwd", () => {
  vi.stubEnv("KNOWLEDGE_STORAGE_ROOT", "relative-storage");
  expect(() => resolveKnowledgeStoragePath("knowledge/original.pdf")).toThrow("must be absolute");
  vi.stubEnv("KNOWLEDGE_SCRIPTS_ROOT", resolve(directory, "scripts"));
  expect(knowledgeExtractorScript("knowledge_extraction_v2.py")).toBe(resolve(directory, "scripts/knowledge_extraction_v2.py"));
  vi.stubEnv("KNOWLEDGE_SCRIPTS_ROOT", "relative-scripts");
  expect(() => knowledgeExtractorScript("knowledge_extraction_v2.py")).toThrow("must be absolute");
});
it("downloads real shared-storage bytes through the route with permission and range checks", async () => {
  const assetId = "11111111-1111-4111-8111-111111111111", owner = "22222222-2222-4222-8222-222222222222";
  routeMocks.session.mockResolvedValue({ userId: owner });
  const asset = { storageKey: "knowledge/original.pdf", mimeType: "application/pdf", byteSize: String(bytes.length), title: "Synthetic original", sourceSha256: hash };
  routeMocks.query.mockResolvedValue([asset]);
  const request = (range?: string) => GET(new Request("http://local/api/knowledge/assets/" + assetId, { headers: range ? { range } : {} }), { params: Promise.resolve({ assetId }) });
  const response = await request("bytes=1-4");
  expect(response.status).toBe(206); expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(1, 5));
  expect(routeMocks.query.mock.calls.every(call => call[0] === owner && call[2][1] === owner)).toBe(true);
  routeMocks.query.mockResolvedValue([]); expect((await request()).status).toBe(404);
  routeMocks.query.mockResolvedValue([asset]); await writeFile(resolve(root, "original.pdf"), Buffer.alloc(bytes.length));
  expect((await request("bytes=1-4")).status).toBe(410);
});
