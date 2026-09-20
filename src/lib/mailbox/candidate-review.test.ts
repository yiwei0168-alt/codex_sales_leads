import {beforeEach,describe,expect,it,vi} from "vitest";
const {query,save,transaction}=vi.hoisted(()=>({query:vi.fn(),save:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantTransaction:transaction}));
vi.mock("@/lib/rag/repository",()=>({upsertKnowledgeDocument:save}));
vi.mock("@/lib/tracked-operation",()=>({trackedOperation:async(_user:unknown,_stage:unknown,_items:unknown,_chars:unknown,run:()=>Promise<unknown>)=>run()}));
import {reviewMailboxCandidate} from "./candidate-review";
describe("mailbox candidate review",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    transaction.mockImplementation(async(_user,run)=>run({query}));
    query.mockImplementation(async(sql:string)=>{
      if(sql.includes("pg_try_advisory"))return {rows:[{locked:true}]};
      if(sql.startsWith("select id,kind"))return {rows:[{id:"candidate",kind:"fact",title:"Synthetic",content:"Fixture",review_status:"pending"}]};
      return {rows:[],rowCount:0};
    });
  });
  it("saves approved content privately with the authenticated owner before marking reviewed",async()=>{
    expect(await reviewMailboxCandidate("owner","candidate","approved")).toEqual({kind:"saved",status:"approved",reused:false});
    expect(save).toHaveBeenCalledWith("owner",expect.objectContaining({visibility:"private",externalId:"mailbox-artifact:candidate",content:"Fixture"}));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("user_id=$2 for update"),["candidate","owner"]);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder.at(-1)!);
  });
  it("refuses an overlapping review without calling embedding or updating state",async()=>{
    query.mockResolvedValueOnce({rows:[{locked:false}]});
    expect(await reviewMailboxCandidate("owner","candidate","approved")).toEqual({kind:"busy"});
    expect(query).toHaveBeenCalledTimes(1);expect(save).not.toHaveBeenCalled();
  });
  it.each(["approved","rejected"] as const)("reuses a repeated %s decision without work",async status=>{
    query.mockResolvedValueOnce({rows:[{locked:true}]}).mockResolvedValueOnce({rows:[{review_status:status}]});
    expect(await reviewMailboxCandidate("owner","candidate",status)).toEqual({kind:"saved",status,reused:true});
    expect(save).not.toHaveBeenCalled();expect(query).toHaveBeenCalledTimes(2);
  });
  it("does not reverse a completed decision",async()=>{
    query.mockResolvedValueOnce({rows:[{locked:true}]}).mockResolvedValueOnce({rows:[{review_status:"rejected"}]});
    expect(await reviewMailboxCandidate("owner","candidate","approved")).toEqual({kind:"conflict"});expect(save).not.toHaveBeenCalled();
  });
  it("refuses a candidate whose content changed after exact approval was prepared",async()=>{
    expect(await reviewMailboxCandidate("owner","candidate","approved","a".repeat(64))).toEqual({kind:"conflict"});
    expect(save).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("keeps a partially persisted approval recoverable",async()=>{
    query.mockResolvedValueOnce({rows:[{locked:true}]}).mockResolvedValueOnce({rows:[{review_status:"pending"}]}).mockResolvedValueOnce({rows:[{id:"doc"}],rowCount:1});
    expect(await reviewMailboxCandidate("owner","candidate","rejected")).toEqual({kind:"approval-incomplete"});
    expect(query).toHaveBeenCalledTimes(3);expect(save).not.toHaveBeenCalled();
  });
  it("does not mark reviewed if knowledge persistence fails",async()=>{
    save.mockRejectedValue(new Error("unknown paid result"));
    await expect(reviewMailboxCandidate("owner","candidate","approved")).rejects.toThrow("unknown paid result");
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("does not expose absent or inaccessible candidates",async()=>{
    query.mockResolvedValueOnce({rows:[{locked:true}]}).mockResolvedValueOnce({rows:[]});
    expect(await reviewMailboxCandidate("other","candidate","approved")).toEqual({kind:"missing"});expect(save).not.toHaveBeenCalled();
  });
});
