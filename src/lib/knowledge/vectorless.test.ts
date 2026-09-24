import {createHash} from "node:crypto";
import {beforeEach,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mock.query,tenantTransaction:mock.transaction}));
vi.mock("./document-repository",()=>({safeKnowledgeStorageKey:(key:string)=>key,assertResolvedInsideKnowledgeRoot:vi.fn()}));
vi.mock("node:fs/promises",()=>({readFile:mock.read}));
import {evidenceText,indexExtractedDocument} from "./vectorless";
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
beforeEach(()=>{mock.query.mockReset();mock.transaction.mockReset();mock.read.mockReset();});
it("keeps table rows and headers as original evidence",()=>{
  expect(evidenceText({id:"table-1",unitType:"sheet",unitIndex:1,blockType:"table",quality:"success",table:{headers:["Model","Ports"],rows:[["A","8"],["B","16"]]}}))
    .toBe("Model\tPorts\nA\t8\nB\t16");
});
it("rejects changed source bytes before a tree transaction",async()=>{
  const source=Buffer.from("changed source");
  mock.query.mockResolvedValueOnce([{role:"admin"}]).mockResolvedValueOnce([{id:"job",status:"registered",published_document_id:"doc",published_asset_id:"asset",source_sha256:"a".repeat(64),extractor_version:"layout-v2.0.0",storage_key:"knowledge/source.pdf",extraction_artifact_key:"knowledge/artifact.json",metrics:{artifactSha256:sha(Buffer.from("{}"))}}]);
  mock.read.mockResolvedValueOnce(source).mockResolvedValueOnce(Buffer.from("{}"));
  await expect(indexExtractedDocument("owner","job")).rejects.toThrow("Source hash mismatch");
  expect(mock.transaction).not.toHaveBeenCalled();
});
it("rejects incomplete extraction before a tree transaction",async()=>{
  const source=Buffer.from("source");
  const artifact=Buffer.from(JSON.stringify({documents:[{sourceSha256:sha(source),extractorVersion:"layout-v2.0.0",blocks:[{id:"page-1",unitType:"page",unitIndex:1,blockType:"pending-ocr",quality:"pending-ocr"}]}]}));
  mock.query.mockResolvedValueOnce([{role:"admin"}]).mockResolvedValueOnce([{id:"job",status:"registered",published_document_id:"doc",published_asset_id:"asset",source_sha256:sha(source),extractor_version:"layout-v2.0.0",storage_key:"knowledge/source.pdf",extraction_artifact_key:"knowledge/artifact.json",metrics:{artifactSha256:sha(artifact)}}]);
  mock.read.mockResolvedValueOnce(source).mockResolvedValueOnce(artifact);
  await expect(indexExtractedDocument("owner","job")).rejects.toThrow("Unresolved extraction units");
  expect(mock.transaction).not.toHaveBeenCalled();
});
it("rejects a member before reading any source file",async()=>{
  mock.query.mockResolvedValueOnce([{role:"member"}]);
  await expect(indexExtractedDocument("member","job")).rejects.toThrow("Active administrator required");
  expect(mock.read).not.toHaveBeenCalled();
});
