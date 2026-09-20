import { beforeEach, expect, it, vi } from "vitest";
const db=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:db.query,tenantTransaction:vi.fn(),query:vi.fn(),transaction:vi.fn(),getPool:vi.fn()}));
import { loadResearch,researchTools } from "./research-tools";
const context={userId:"11111111-1111-4111-8111-111111111111",runId:"22222222-2222-4222-8222-222222222222",leaseToken:"33333333-3333-4333-8333-333333333333",role:"member" as const};
beforeEach(()=>db.query.mockReset());
it("requires an owned server-produced artifact rather than a submitted score",async()=>{
  db.query.mockResolvedValue([]);
  expect(await loadResearch(context,context.runId)).toBeNull();
  expect(db.query).toHaveBeenCalledWith(context.userId,expect.stringContaining("user_id=$1"),[context.userId,context.runId,expect.arrayContaining(["company_score"])]);
  const tool=researchTools.find(t=>t.id==="company_score")!;
  expect(tool.input.safeParse({sourceCallId:context.runId,assessment:{eligible:true,totalScore:100}}).success).toBe(false);
  expect(await tool.execute({sourceCallId:context.runId},context)).toMatchObject({status:"missing_input"});
});
it("keeps an existing uncorrected artifact available when scoring lacks role evidence",async()=>{
  const data={candidate:{candidateId:"c",evidence:[]},plan:{countryCode:"DE"},publication:"research-only"};
  db.query.mockResolvedValue([{output:{status:"success",data}}]);
  expect(await researchTools.find(t=>t.id==="company_score")!.execute({sourceCallId:context.runId},context)).toMatchObject({status:"missing_input",data});
});
