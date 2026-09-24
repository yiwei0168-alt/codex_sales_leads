import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({transaction:vi.fn(),query:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mocks.query,tenantTransaction:mocks.transaction}));
import {buildKnowledgeEvaluationCorpus} from "./evaluation/corpus";
import {evaluationCaseSha256} from "./review-types";
import {decideFactReview,saveGoldReview,unlockGoldHoldout} from "./review-repository";

describe("fact review persistence",()=>{beforeEach(()=>{vi.clearAllMocks();mocks.transaction.mockImplementation(async(_user:string,run:(client:{query:typeof mocks.query})=>unknown)=>run({query:mocks.query}));});
  it.each([
    ["verify","verified","accepted"],["retain-candidate","candidate","accepted"],["reject","rejected","rejected"],
  ] as const)("maps %s to an audited %s fact",async(decision,factStatus,reviewStatus)=>{mocks.query.mockResolvedValueOnce({rows:[{factId:"fact-1",status:"open",attributeKey:"ethernet_port_count"}]});mocks.query.mockResolvedValue({rows:[]});await decideFactReview("admin",{reviewId:"review-1",decision,note:"checked"});const sql=mocks.query.mock.calls.map(call=>String(call[0]));expect(mocks.query.mock.calls[1][1][1]).toBe(reviewStatus);expect(sql.some(value=>value.includes(`verification_status='${factStatus}'`))).toBe(true);});
  it("stores a correction and verifies the corrected fact",async()=>{mocks.query.mockResolvedValueOnce({rows:[{factId:"fact-1",status:"open",attributeKey:"ethernet_port_count"}]});mocks.query.mockResolvedValue({rows:[]});await decideFactReview("admin",{reviewId:"review-1",decision:"correct",note:"datasheet row checked",correctedRawValue:"8 ports",correctedValue:8,correctedUnit:"port"});expect(mocks.query.mock.calls[1][1][1]).toBe("corrected");expect(mocks.query.mock.calls[2][1]).toEqual(["fact-1","8","8 ports","port"]);});
  it("refuses stale decisions without writing",async()=>{mocks.query.mockResolvedValueOnce({rows:[{factId:"fact-1",status:"accepted",attributeKey:"ethernet_port_count"}]});await expect(decideFactReview("admin",{reviewId:"review-1",decision:"verify",note:""})).rejects.toThrow("review-already-resolved");expect(mocks.query).toHaveBeenCalledOnce();});
});

describe("human Gold evidence gate",()=>{beforeEach(()=>{vi.clearAllMocks();});
  it("refuses a source outside the active shared release",async()=>{
    const item=buildKnowledgeEvaluationCorpus().cases.find(candidate=>candidate.expectedOutcome==="route")!;
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(saveGoldReview("admin",{caseId:item.id,caseSha256:evaluationCaseSha256(item),expectedAnswer:"Reviewed answer",
      expectedSources:[{assetSha256:"a".repeat(64),unitIndex:2,excerpt:"Original source text"}],reviewNote:""})).rejects.toThrow("source-unavailable");
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it("requires a search-scope note when no answer has no source",async()=>{
    const item=buildKnowledgeEvaluationCorpus().cases.find(candidate=>candidate.expectedOutcome==="insufficient-evidence"&&candidate.split!=="holdout")!;
    mocks.query.mockResolvedValue([]);
    await expect(saveGoldReview("admin",{caseId:item.id,caseSha256:evaluationCaseSha256(item),expectedAnswer:"No verified answer",
      expectedSources:[],reviewNote:""})).rejects.toThrow("no-answer-review-note-required");
    await saveGoldReview("admin",{caseId:item.id,caseSha256:evaluationCaseSha256(item),expectedAnswer:"No verified answer",
      expectedSources:[],reviewNote:"Checked all active source documents."});
    expect(mocks.query.mock.calls.some(call=>String(call[1]).includes("insert into knowledge_evaluation_review_v3"))).toBe(true);
  });
  it("checks the quote against the current page and block before saving",async()=>{
    const item=buildKnowledgeEvaluationCorpus().cases.find(candidate=>candidate.expectedOutcome==="route"&&candidate.split!=="holdout")!;
    const source={assetSha256:"a".repeat(64),unitIndex:2,blockId:"block-2",excerpt:"Verified original words"};
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{source_sha256:source.assetSha256}])
      .mockResolvedValueOnce([{blockId:"block-2",content:"Different words",unitIndex:2}]);
    await expect(saveGoldReview("admin",{caseId:item.id,caseSha256:evaluationCaseSha256(item),expectedAnswer:"Reviewed answer",expectedSources:[source],reviewNote:""}))
      .rejects.toThrow("source-excerpt-mismatch");
    expect(mocks.query.mock.calls.some(call=>String(call[1]).includes("insert into knowledge_evaluation_review_v3"))).toBe(false);
    mocks.query.mockReset();
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{source_sha256:source.assetSha256}])
      .mockResolvedValueOnce([{blockId:"block-2",content:"Verified original\n words appear here",unitIndex:2}])
      .mockResolvedValueOnce([]);
    await saveGoldReview("admin",{caseId:item.id,caseSha256:evaluationCaseSha256(item),expectedAnswer:"Reviewed answer",expectedSources:[source],reviewNote:""});
    expect(mocks.query.mock.calls.some(call=>String(call[1]).includes("insert into knowledge_evaluation_review_v3"))).toBe(true);
  });
  it("rechecks every saved source before unlocking the holdout",async()=>{
    const rows=buildKnowledgeEvaluationCorpus().cases.filter(item=>item.split!=="holdout").map(item=>({
      caseId:item.id,caseSha256:evaluationCaseSha256(item),reviewNote:"Checked all active source documents.",
      expectedSources:item.expectedOutcome==="route"?[{assetSha256:"a".repeat(64),unitIndex:1,excerpt:"Original quote"}]:[],
    }));
    mocks.query.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
    await expect(unlockGoldHoldout("admin",true)).rejects.toThrow("development-review-incomplete");
    expect(mocks.query.mock.calls.some(call=>String(call[1]).includes("insert into knowledge_evaluation_holdout_gate_v3"))).toBe(false);
  });
});
