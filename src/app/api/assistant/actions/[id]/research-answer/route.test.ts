import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),service:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:m.session}));
vi.mock("@/lib/leads/workflow/research-answer-service",()=>({researchAnswerService:m.service,ResearchAnswerConflict:class extends Error{}}));
import{GET,POST}from"./route";
const id="11111111-1111-4111-8111-111111111111",params=Promise.resolve({id});
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({userId:"owner"});m.service.mockResolvedValue({queued:true});});
it("requires authentication before reading or accepting evidence",async()=>{
  m.session.mockResolvedValue(new Response(null,{status:401}));
  expect((await GET(new Request("http://localhost"),{params})).status).toBe(401);
  expect((await POST(new Request("http://localhost",{method:"POST",body:"{}"}),{params})).status).toBe(401);
  expect(m.service).not.toHaveBeenCalled();
});
it("binds the submission to session ownership and rejects forged input",async()=>{
  const input={candidateId:"candidate-1",questionHash:"a".repeat(64),relationshipStatus:"none",answer:"No current relationship"};
  const submit=(body:unknown)=>POST(new Request("http://localhost",{method:"POST",body:JSON.stringify(body)}),{params});
  expect((await submit({...input,userId:"peer"})).status).toBe(400);
  expect((await submit(input)).status).toBe(200);
  expect(m.service).toHaveBeenCalledExactlyOnceWith("owner",id,input);
});
