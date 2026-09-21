import {createHash} from "node:crypto";
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({tx:vi.fn(),sql:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantTransaction:m.tx}));
import {activateSharedRelease,readSharedReleaseGate} from "./release-activation";
const gate={releaseId:"release",status:"validated",manifest:{assets:["asset"]},registeredAssets:1,assets:1,incompleteAssets:0,chunks:2,qwen:2,bge:2,documentReviews:0,factReviews:3,goldReviewed:11,holdoutUnlocked:false};
const hash=createHash("sha256").update(JSON.stringify(gate.manifest)).digest("hex");
beforeEach(()=>{m.tx.mockReset();m.sql.mockReset();m.tx.mockImplementation(async(_owner:string,fn:(client:{query:typeof m.sql})=>Promise<unknown>)=>fn({query:m.sql}));});
it("requires the stored active administrator role",async()=>{
  m.sql.mockResolvedValueOnce({rows:[{role:"member"}]});
  await expect(readSharedReleaseGate("owner","release-key")).rejects.toThrow("administrator");
  expect(m.sql).toHaveBeenCalledTimes(1);
});
it("reports the exact manifest and blockers without activating",async()=>{
  m.sql.mockResolvedValueOnce({rows:[{role:"admin"}]}).mockResolvedValueOnce({rows:[gate]}).mockResolvedValueOnce({rows:[]});
  const result=await readSharedReleaseGate("owner","release-key");
  expect(result).toMatchObject({releaseId:"release",manifestHash:hash,blockers:[],active:false,factReviews:3,goldReviewed:11});
  expect(m.sql.mock.calls.every(([sql])=>!String(sql).includes("select activate_knowledge_release_v3"))).toBe(true);
});
it("refuses a changed manifest before any activation effect",async()=>{
  m.sql.mockResolvedValueOnce({rows:[{role:"admin"}]}).mockResolvedValueOnce({rows:[gate]});
  await expect(activateSharedRelease("owner",{releaseKey:"release-key",releaseId:"release",expectedManifestHash:"a".repeat(64)})).rejects.toThrow("changed");
  expect(m.sql).toHaveBeenCalledTimes(2);
});
it("calls the existing activation gate only for a ready exact release",async()=>{
  m.sql.mockResolvedValueOnce({rows:[{role:"admin"}]}).mockResolvedValueOnce({rows:[gate]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[]});
  expect(await activateSharedRelease("owner",{releaseKey:"release-key",releaseId:"release",expectedManifestHash:hash})).toMatchObject({activated:true,reused:false});
  expect(m.sql.mock.calls[3][0]).toContain("activate_knowledge_release_v3");
});
it("reuses the active pointer without repeating activation",async()=>{
  m.sql.mockResolvedValueOnce({rows:[{role:"admin"}]}).mockResolvedValueOnce({rows:[{...gate,status:"active"}]}).mockResolvedValueOnce({rows:[{id:"release"}]});
  expect(await activateSharedRelease("owner",{releaseKey:"release-key",releaseId:"release",expectedManifestHash:hash})).toMatchObject({activated:true,reused:true});
  expect(m.sql).toHaveBeenCalledTimes(3);
});
it("reports and refuses incomplete releases",async()=>{
  m.sql.mockResolvedValueOnce({rows:[{role:"admin"}]}).mockResolvedValueOnce({rows:[{...gate,bge:1}]}).mockResolvedValueOnce({rows:[]});
  await expect(activateSharedRelease("owner",{releaseKey:"release-key",releaseId:"release",expectedManifestHash:hash})).rejects.toThrow("BGE embeddings 1/2");
  expect(m.sql.mock.calls.some(([sql])=>String(sql).includes("select activate_knowledge_release_v3"))).toBe(false);
});
it("does not claim an active release covers a newly registered asset",async()=>{
  m.sql.mockResolvedValueOnce({rows:[{role:"admin"}]}).mockResolvedValueOnce({rows:[{...gate,status:"active",registeredAssets:2}]}).mockResolvedValueOnce({rows:[{id:"release"}]});
  await expect(activateSharedRelease("owner",{releaseKey:"release-key",releaseId:"release",expectedManifestHash:hash})).rejects.toThrow("Manifest assets 1/2");
});
