import {createHash} from "node:crypto";
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),tx:vi.fn(),sql:vi.fn(),runShadow:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query,tenantTransaction:m.tx}));
vi.mock("@/providers/deepseek",()=>({DeepSeekProvider:class{isConfigured(){return true;}}}));
vi.mock("./agent",()=>({ContactVerificationAgent:class{runShadow=m.runShadow;}}));
import {evaluateSavedContact,publishSavedContactDecision} from "./saved-service";

const candidate={id:"candidate",workspace_id:"workspace",company_id:"company",contact_id:null,canonical_name:"Example",domain:"example.com",full_name:null,job_title:null,email:"person@example.com",source_status:"Public",derivation:null,last_seen_at:"time",current_decision_id:null};
beforeEach(()=>{m.query.mockReset();m.tx.mockReset();m.sql.mockReset();m.runShadow.mockReset();m.tx.mockImplementation(async(_user:string,fn:(client:{query:typeof m.sql})=>Promise<unknown>)=>fn({query:m.sql}));});
it("rejects an inaccessible candidate without a model call",async()=>{
  m.query.mockResolvedValueOnce([]);
  expect(await evaluateSavedContact("owner","candidate","person@example.com","call")).toMatchObject({status:"missing_input"});
  expect(m.query.mock.calls[0][2]).toEqual(["owner","candidate"]);
  expect(m.runShadow).not.toHaveBeenCalled();
});
it("requires the observed email before disclosure",async()=>{
  m.query.mockResolvedValueOnce([candidate]);
  expect(await evaluateSavedContact("owner","candidate","other@example.com","call")).toMatchObject({status:"missing_input"});
  expect(m.runShadow).not.toHaveBeenCalled();
});
it("does not repeat a saved uncertain model attempt",async()=>{
  m.query.mockResolvedValueOnce([candidate]).mockResolvedValueOnce([{id:"evidence",source_kind:"official-website",url:"https://example.com",title:"Team",excerpt:"Person",captured_at:"time"}]);
  m.sql.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{id:"run",status:"running",metadata:{}}]});
  expect(await evaluateSavedContact("owner","candidate","person@example.com","call")).toMatchObject({status:"unavailable"});
  expect(m.runShadow).not.toHaveBeenCalled();
});
it("refuses a changed decision before mutating verification state",async()=>{
  const decision={category:"NeedsReview",lifecycleStatus:"Active",developmentPriority:40,reviewFlags:[]};
  m.sql.mockResolvedValueOnce({rows:[{run_id:"run",email_candidate_id:"candidate",company_id:"company",contact_id:null,current:false,metadata:{decision,decisionHash:"a".repeat(64),sourceStatus:"Public"},email:"person@example.com",source_status:"Public",last_seen_at:"time",verification_decision_id:null}]});
  await expect(publishSavedContactDecision("owner",{decisionId:"decision",decisionHash:"b".repeat(64),email:"person@example.com",category:"NeedsReview",activeStatus:"Public",expectedCurrentDecisionId:null})).rejects.toThrow("changed");
  expect(m.sql).toHaveBeenCalledTimes(1);
});
it("publishes a reviewed decision only while source evidence and current state match",async()=>{
  const evidence=[{id:"evidence",provider:"test",source_kind:"official-website",url:"https://example.com/team",title:"Team",excerpt:"Person",captured_at:"time"}];
  const evidenceHash=createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
  const decision={category:"Official",lifecycleStatus:"Active",developmentPriority:70,reviewFlags:[]};
  m.sql.mockResolvedValueOnce({rows:[{run_id:"run",email_candidate_id:"candidate",company_id:"company",contact_id:null,current:false,
    metadata:{decision,decisionHash:"a".repeat(64),sourceStatus:"Public",candidateSeenAt:"time",currentDecisionId:null,evidenceIds:["evidence"],evidenceHash},
    email:"person@example.com",source_status:"Public",last_seen_at:"time",verification_decision_id:null}]})
    .mockResolvedValueOnce({rows:evidence});
  const published=await publishSavedContactDecision("owner",{decisionId:"decision",decisionHash:"a".repeat(64),email:"person@example.com",category:"Official",activeStatus:"Verified",expectedCurrentDecisionId:null});
  expect(published).toMatchObject({published:true,activeStatus:"Verified",reused:false});
  expect(m.sql.mock.calls.some(([sql])=>String(sql).includes("update company_email_candidate set status=$2"))).toBe(true);
});
