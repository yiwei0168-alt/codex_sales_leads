import{beforeEach,afterEach,it,expect,vi}from"vitest";
const m=vi.hoisted(()=>({query:vi.fn(),rows:new Map<string,string>()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
import{withSpendContext}from"@/lib/billing/context";
import{qualificationResponseCheckpoint}from"./model-response-checkpoint";
import{sealModelResponse,openModelResponse}from"./response-checkpoint-crypto";
const scope={userId:"owner",operationId:"action",stage:"scoring",durableQualificationResponses:true};
beforeEach(()=>{vi.stubEnv("MAILBOX_CREDENTIAL_KEY",Buffer.alloc(32,7).toString("base64url"));m.rows.clear();m.query.mockReset();m.query.mockImplementation(async(_owner:string,sql:string,args:string[])=>{
 if(sql.includes("from assistant_action"))return[{id:"action"}];
 const id=JSON.stringify(args.slice(0,4));
 if(sql.includes("insert into")){if(!m.rows.has(id))m.rows.set(id,args[4]);return[];}
 return m.rows.has(id)?[{response_ciphertext:m.rows.get(id)}]:[];
});});
afterEach(()=>vi.unstubAllEnvs());
it("encrypts response content with account and request binding",()=>{
 const sealed=sealModelResponse("owner","request",{secret:"PRIVATE-FIXTURE"});
 expect(sealed).not.toContain("PRIVATE-FIXTURE");expect(openModelResponse("owner","request",sealed)).toEqual({secret:"PRIVATE-FIXTURE"});
 expect(()=>openModelResponse("peer","request",sealed)).toThrow();expect(()=>openModelResponse("owner","other",sealed)).toThrow();
});
it("is opt-in and does not affect other models/tasks",async()=>{
 expect(await qualificationResponseCheckpoint("lead-qualification","a".repeat(64))).toBeNull();
 expect(await withSpendContext(scope,()=>qualificationResponseCheckpoint("lead-evidence-correction","a".repeat(64)))).toBeNull();expect(m.query).not.toHaveBeenCalled();
});
it("persists before validation, reads exact responses and rejects conflicting overwrite",async()=>{
 await withSpendContext(scope,async()=>{const c=(await qualificationResponseCheckpoint("lead-qualification","a".repeat(64)))!;
 expect(await c.load()).toBeNull();const body={choices:[{finish_reason:"stop",message:{content:'{"assessments":[]}'}}]};
 await c.save(body);expect(await c.load()).toEqual(body);await c.save(body);
 await expect(c.save({different:true})).rejects.toMatchObject({code:"paid-request-already-recorded"});});
 expect([...m.rows.values()].join("")).not.toContain("assessments");
});
it("fails before a new call when key, ownership or checkpoint read is unavailable",async()=>{
 vi.stubEnv("MAILBOX_CREDENTIAL_KEY","");await expect(withSpendContext(scope,()=>qualificationResponseCheckpoint("lead-qualification","a".repeat(64)))).rejects.toMatchObject({code:"paid-request-already-recorded"});
 vi.stubEnv("MAILBOX_CREDENTIAL_KEY",Buffer.alloc(32,7).toString("base64url"));m.query.mockResolvedValue([]);
 await expect(withSpendContext(scope,()=>qualificationResponseCheckpoint("lead-qualification","a".repeat(64)))).rejects.toMatchObject({code:"paid-request-already-recorded"});
});
