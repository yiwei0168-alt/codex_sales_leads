import {createHash} from "node:crypto";
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),upsert:vi.fn(),asset:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
vi.mock("@/lib/rag/repository",()=>({upsertKnowledgeDocument:m.upsert}));
vi.mock("./document-repository",()=>({assertResolvedInsideKnowledgeRoot:vi.fn(),registerKnowledgeAsset:m.asset,safeKnowledgeStorageKey:(value:string)=>value}));
vi.mock("node:fs/promises",()=>({readFile:m.read}));
import {registerExtractedSharedBinary} from "./binary-registration";
const request={jobId:"00000000-0000-4000-8000-000000000001",sourceSha256:"a".repeat(64),language:"en",authorityLevel:3 as const};
beforeEach(()=>{m.query.mockReset();m.upsert.mockReset();m.asset.mockReset();m.read.mockReset();});
it("refuses another account's upload before reading a local artifact",async()=>{
  m.query.mockResolvedValueOnce([]);
  expect(await registerExtractedSharedBinary("owner",request)).toMatchObject({status:"missing_input"});
  expect(m.query.mock.calls[0][2]).toEqual([request.jobId,"owner"]);
  expect(m.upsert).not.toHaveBeenCalled();
});
it("rejects a changed source hash without indexing",async()=>{
  m.query.mockResolvedValueOnce([{id:request.jobId,source_sha256:"b".repeat(64),status:"extracted"}]);
  expect(await registerExtractedSharedBinary("owner",request)).toMatchObject({status:"missing_input"});
  expect(m.upsert).not.toHaveBeenCalled();
});
it("reuses a recorded registration without a second embedding",async()=>{
  m.query.mockResolvedValueOnce([{id:request.jobId,source_sha256:request.sourceSha256,status:"registered",published_document_id:"doc",published_asset_id:"asset"}]);
  expect(await registerExtractedSharedBinary("owner",request)).toMatchObject({status:"registered",reused:true,assetId:"asset",ragV3:"pending-release"});
  expect(m.upsert).not.toHaveBeenCalled();
});
it("registers only hash-matched extracted content and reports RAG v3 as pending",async()=>{
  const digest=(value:Buffer)=>createHash("sha256").update(value).digest("hex");
  const binary=Buffer.from("%PDF-fixture");
  const sourceSha256=digest(binary);
  const artifact=Buffer.from(JSON.stringify({documents:[{sourceSha256,blocks:[{id:"page-1",unitType:"page",unitIndex:1,blockType:"paragraph",text:"Evidence sentence",quality:"success"}]}]}));
  m.query.mockResolvedValueOnce([{id:request.jobId,collection_slug:"industry",status:"extracted",title:"Fixture",storage_key:"knowledge/fixture.pdf",extraction_artifact_key:"knowledge/fixture.json",source_sha256:sourceSha256,source_url:null,entity_key:null,metrics:{artifactSha256:digest(artifact)}}])
    .mockResolvedValueOnce([{id:request.jobId}]);
  m.read.mockResolvedValueOnce(binary).mockResolvedValueOnce(artifact);
  m.upsert.mockResolvedValueOnce({documentId:"doc",chunks:1,skipped:false});
  m.asset.mockResolvedValueOnce({id:"asset"});
  const saved=await registerExtractedSharedBinary("owner",{...request,sourceSha256});
  expect(saved).toMatchObject({status:"registered",documentId:"doc",assetId:"asset",ragV3:"pending-release"});
  expect(m.upsert.mock.calls[0][1]).toMatchObject({visibility:"shared",content:"page 1 · page-1\nEvidence sentence"});
  expect(m.query.mock.calls[1][2]).toEqual([request.jobId,"owner","doc","asset",sourceSha256]);
});
