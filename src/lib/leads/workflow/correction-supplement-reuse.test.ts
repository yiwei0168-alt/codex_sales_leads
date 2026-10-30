import{beforeEach,expect,it,vi}from"vitest";
const m=vi.hoisted(()=>({query:vi.fn(),evidence:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
vi.mock("./public-evidence-repository",()=>({findReusablePublicEvidence:m.evidence}));
import{withSpendContext}from"@/lib/billing/context";
import{companyCostKey}from"@/lib/billing/company-cost-context";
import{reuseCompletedCorrectionSupplement}from"./correction-supplement-reuse";
import{tavilySearchBody}from"@/providers/tavily";
import type{LeadWorkflowCandidate}from"./types";
const candidate={domain:"example.test",evidenceSnapshotRunId:"run-1"}as LeadWorkflowCandidate;
const input={query:'"Example" UK official networking',searchDepth:"basic" as const,maxResults:5,includeRawContent:false};
const scope={userId:"owner",operationId:"action-1",stage:"correcting-evidence"};
beforeEach(()=>{vi.clearAllMocks();m.query.mockResolvedValue([{id:"receipt",created_at:"2026-10-30T03:30:00Z"}]);m.evidence.mockResolvedValue({evidence:[{id:"new",capturedAt:"2026-10-30T03:31:00Z"},{id:"old",capturedAt:"2026-10-29T00:00:00Z"}]});});
it("requires an exact owned completed correction-search receipt before reading saved evidence",async()=>{
 const result=await withSpendContext(scope,()=>reuseCompletedCorrectionSupplement(candidate,"GB",input));
 expect(result).toEqual({receiptId:"receipt",evidence:[{id:"new",capturedAt:"2026-10-30T03:31:00Z"}]});
 expect(m.query.mock.calls[0][0]).toBe("owner");
 expect(m.query.mock.calls[0][2]).toEqual(["owner","action-1","correcting-evidence",expect.stringMatching(/^[a-f0-9]{64}$/),companyCostKey("example.test","GB")]);
 const sql=m.query.mock.calls[0][1];expect(sql).toContain("'validOutputItems'='1'");expect(sql).toContain("'httpStatus'='200'");expect(sql).toContain("request_fingerprint=$4");
 expect(m.evidence).toHaveBeenCalledWith({domain:"example.test",countryCode:"GB",evidenceRunId:"run-1",includeStale:false,maximumChunks:20});
});
it("never treats no receipt as evidence of a completed search",async()=>{
 m.query.mockResolvedValue([]);expect(await withSpendContext(scope,()=>reuseCompletedCorrectionSupplement(candidate,"GB",input))).toBeNull();expect(m.evidence).not.toHaveBeenCalled();
});
it("retains missing evidence as empty rather than reconstructing a lost response",async()=>{
 m.evidence.mockResolvedValue({evidence:[]});expect(await withSpendContext(scope,()=>reuseCompletedCorrectionSupplement(candidate,"GB",input))).toEqual({receiptId:"receipt",evidence:[]});
});
it("fails closed on receipt or public-library outages",async()=>{
 m.query.mockRejectedValueOnce(Error("database unavailable"));await expect(withSpendContext(scope,()=>reuseCompletedCorrectionSupplement(candidate,"GB",input))).rejects.toMatchObject({code:"paid-request-already-recorded"});
 m.evidence.mockRejectedValueOnce(Error("library unavailable"));await expect(withSpendContext(scope,()=>reuseCompletedCorrectionSupplement(candidate,"GB",input))).rejects.toMatchObject({code:"paid-request-already-recorded"});
});
it("does not read another stage's receipts",async()=>{
 expect(await reuseCompletedCorrectionSupplement(candidate,"GB",input)).toBeNull();
 expect(await withSpendContext({...scope,stage:"planning"},()=>reuseCompletedCorrectionSupplement(candidate,"GB",input))).toBeNull();expect(m.query).not.toHaveBeenCalled();
});
it("keeps the Tavily correction wire body byte-compatible with existing paid fingerprints",()=>{
 expect(tavilySearchBody(input)).toBe('{"query":"\\"Example\\" UK official networking","search_depth":"basic","auto_parameters":false,"max_results":5,"include_answer":false,"include_raw_content":false}');
});
