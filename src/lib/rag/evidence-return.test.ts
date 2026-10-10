import {beforeEach,expect,it,vi} from "vitest";
import type {RetrievedChunk} from "./types";
const mocks=vi.hoisted(()=>({search:vi.fn(),authorize:vi.fn(),generate:vi.fn(),log:vi.fn()}));
vi.mock("./repository",()=>({hybridSearch:mocks.search,authorizedKnowledgeChunkIds:mocks.authorize,
  knowledgeRevisionToken:async()=>"synthetic-revision",logRagQuery:mocks.log}));
vi.mock("./bge-client",()=>({embedTextsWithBge:async()=>{throw Error("offline");}}));
vi.mock("./openai-provider",()=>({generateGroundedAnswer:mocks.generate}));
vi.mock("@/lib/billing/context",()=>({withProductSpend:(_u:unknown,_s:unknown,run:()=>unknown)=>run()}));
vi.mock("@/lib/tracked-operation",()=>({trackedOperation:(_u:unknown,_s:unknown,_n:unknown,_l:unknown,run:()=>unknown)=>run()}));
import {answerWithRag} from "./service";
import {clearKnowledgeCache} from "@/lib/knowledge/cache";
const id="11111111-1111-4111-8111-111111111111";
const other="fedcbafe-dcba-4fed-8fed-fedcbafedcba";
const content=`${"Synthetic navigation text. ".repeat(30)}Critical qualification at end: use only with approved attachments.`;
const chunk:RetrievedChunk={id,documentId:"doc",collection:"industry",title:"Synthetic source",content,
  sourceType:"public-url-import",authorityLevel:3,headingPath:[],visibility:"shared",score:0.9,
  retrievalSignals:["keyword"],corroborated:false,metadata:{sourceLocation:{unitType:"page",unitIndex:7}}};
beforeEach(()=>{
  vi.resetAllMocks();clearKnowledgeCache();mocks.search.mockResolvedValue([chunk]);
  mocks.log.mockResolvedValue(undefined);
  mocks.authorize.mockResolvedValue(new Set([id,other]));
  mocks.generate.mockResolvedValue(`A qualified statement [KB:${id}]`);
});
it("returns the whole cited block including tail qualifications and its original coordinate",async()=>{
  const result=await answerWithRag("synthetic-owner",{question:"Summarize attachment conditions"});
  expect(result.citations[0].excerpt).toBe(content);
  expect(result.citations[0].sourceLocation).toEqual({unitType:"page",unitIndex:7});
  expect(mocks.authorize).toHaveBeenCalledTimes(2);
});
it("does not send a newly revoked search result to the model",async()=>{
  mocks.authorize.mockResolvedValue(new Set());
  const result=await answerWithRag("synthetic-owner",{question:"Summarize attachment conditions"});
  expect(mocks.generate).not.toHaveBeenCalled();expect(result.citations).toEqual([]);
});
it("withholds the entire generated answer when even an uncited supplied source is revoked",async()=>{
  mocks.search.mockResolvedValue([chunk,{...chunk,id:other,title:"Revoked source"}]);
  mocks.authorize.mockResolvedValueOnce(new Set([id,other])).mockResolvedValueOnce(new Set([id]));
  mocks.generate.mockResolvedValue(`Private derived detail [KB:${id}]`);
  const result=await answerWithRag("synthetic-owner",{question:"Summarize both documents"});
  expect(result.reasonCode).toBe("evidence-access-changed");expect(result.grounded).toBe(false);
  expect(result.answer).not.toContain("Private derived detail");expect(result.citations).toEqual([]);
  expect(mocks.log).not.toHaveBeenCalled();
});
it("rechecks cache hits before model use as well as after generation",async()=>{
  await answerWithRag("synthetic-owner",{question:"Summarize attachment conditions"});
  mocks.authorize.mockResolvedValue(new Set());mocks.generate.mockClear();
  const result=await answerWithRag("synthetic-owner",{question:"Summarize attachment conditions"});
  expect(mocks.search).toHaveBeenCalledTimes(1);expect(mocks.generate).not.toHaveBeenCalled();
  expect(result.citations).toEqual([]);
});
