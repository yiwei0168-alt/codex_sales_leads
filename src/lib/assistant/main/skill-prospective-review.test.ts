import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
const m=vi.hoisted(()=>({evidence:vi.fn(),rebuild:vi.fn(),chain:vi.fn(),journal:vi.fn(),audit:vi.fn(),query:vi.fn(),historical:vi.fn(),safety:vi.fn()}));
vi.mock('./skill-acceptance-store',()=>({readSkillAcceptanceEvidence:m.evidence}));
vi.mock('./skill-prospective-collector',async original=>({...await original<typeof import('./skill-prospective-collector')>(),prepareSkillProspectiveObservation:m.rebuild}));
vi.mock('./recorded-task-source',()=>({loadRecordedTaskChain:m.chain}));
vi.mock('./skill-candidate-audit',()=>({readSkillCandidateJournal:m.journal,prepareSkillModelJournalAudit:m.audit}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:m.query}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./skill-acceptance-candidate',()=>({validateStoredSkillAcceptanceCandidate:m.historical}));
vi.mock('./skill-safety-review',()=>({readSkillSafetyReviewCase:m.safety}));
import {readSkillProspectiveReviewCase} from './skill-prospective-review';
import {readSkillAcceptanceReview,readSkillAcceptanceReviewCase} from './skill-acceptance-review';

const owner='11111111-1111-4111-8111-111111111111',bundle='22222222-2222-4222-8222-222222222222';
const freeze='33333333-3333-4333-8333-333333333333',job='44444444-4444-4444-8444-444444444444';
const evaluation='55555555-5555-4555-8555-555555555555',run='66666666-6666-4666-8666-666666666666';
const receiptId='77777777-7777-4777-8777-777777777777',h=digest('hash');
const reference=()=>({caseId:'shadow',jobId:job,evaluationId:evaluation,runId:run,sourceProjectionHash:h,baselineProjectionHash:h,candidateProjectionHash:h});
const modelRows=[{id:'model-row',input:{system:'MUST_NOT_EXPOSE_SYSTEM'},output:{answer:'candidate answer'}}];
const observation=()=>({caseId:'shadow',baseline:{answerHash:digest('baseline answer')},candidate:{answerHash:digest('candidate answer'),modelReceiptHashes:modelRows.map(row=>digest(row))}});
const saved=()=>({id:bundle,artifactHash:h,sourcesCurrent:true,freezeStatus:{state:'active',freezeId:freeze},judgments:[],
 artifact:{sourceKind:'synthetic-fixture',plan:{pin:{version:1},cases:[{id:'shadow',category:'shadow',provenance:'prospective-task'}]},
  observations:[observation()],rawReceipts:{prospectiveSources:{shadow:reference()}}}});
const rebuilt=()=>({observation:observation(),reference:reference(),sourceKind:'synthetic-fixture',automaticActivation:false});
const receipt=()=>({id:receiptId,user_id:owner,run_id:run,tool_id:'mail_read',effect:'read',status:'completed',
 input:{messageId:job},output:{status:'success',data:{bodyText:'synthetic consumed evidence'}}});
const chain=()=>({turns:[{reply:{content:'baseline answer'}}],requests:[{body:{messages:[
 {role:'system',content:'MUST_NOT_EXPOSE_SYSTEM'},{role:'user',content:'synthetic question'}]},
 receiptBinding:{receipts:[{id:receiptId,hash:digest(receipt())}]}}]});
const audit=()=>({ordered:modelRows,selected:[{message:{content:'candidate answer'}}]});
const input={bundleId:bundle,caseId:'shadow'};
beforeEach(()=>{vi.resetAllMocks();m.evidence.mockResolvedValue(saved());m.rebuild.mockResolvedValue(rebuilt());
 m.chain.mockResolvedValue(chain());m.journal.mockResolvedValue(modelRows);m.audit.mockReturnValue(audit());m.query.mockResolvedValue([receipt()]);});
it('returns only the bound question, final answers and consumed evidence',async()=>{
 const out=await readSkillProspectiveReviewCase({userId:owner},input);
 expect(out).toMatchObject({question:'synthetic question',baseline:'baseline answer',candidate:'candidate answer',
  canPass:{baseline:true,candidate:true},automaticActivation:false,productionAgentEquivalent:false});
 expect(out.receipts).toEqual([{tool:'mail_read',input:receipt().input,output:receipt().output}]);
 expect(JSON.stringify(out)).not.toContain('MUST_NOT_EXPOSE_SYSTEM');
 expect(m.rebuild).toHaveBeenCalledTimes(2);expect(m.query.mock.calls[0][0]).toBe(owner);
});
it.each([{sourcesCurrent:false},{freezeStatus:{state:'revoked',freezeId:freeze}},
 {freezeStatus:{state:'active',freezeId:null}}])('rejects unavailable current source or freeze %j',async change=>{
 m.evidence.mockResolvedValue({...saved(),...change});
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('unavailable');expect(m.chain).not.toHaveBeenCalled();
});
it('rejects a wrong stored case reference and changed observation or source category',async()=>{
 const changed=saved();changed.artifact.rawReceipts.prospectiveSources.shadow.caseId='other';m.evidence.mockResolvedValue(changed);
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('binding');
 m.evidence.mockResolvedValue(saved());m.rebuild.mockResolvedValue({...rebuilt(),sourceKind:'production-runner-pending-verification'});
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('observation');
 m.rebuild.mockResolvedValue({...rebuilt(),observation:{...observation(),baseline:{answerHash:digest('changed')}}});
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('observation');
});
it('rejects changed answers, missing question and changed model receipt hashes',async()=>{
 m.chain.mockResolvedValue({...chain(),turns:[{reply:{content:'changed'}}]});
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('answer journal');
 m.chain.mockResolvedValue({...chain(),requests:[]});
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('answer journal');
 m.chain.mockResolvedValue(chain());m.audit.mockReturnValue({...audit(),ordered:[{changed:true}]});
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('answer journal');
});
it('rejects missing, changed or nonread consumed receipts',async()=>{
 m.query.mockResolvedValue([]);await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('evidence');
 m.query.mockResolvedValue([{...receipt(),output:{changed:true}}]);
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('evidence');
 const nonread={...receipt(),effect:'write'},request=chain();request.requests[0].receiptBinding.receipts[0].hash=digest(nonread);
 m.chain.mockResolvedValue(request);m.query.mockResolvedValue([nonread]);
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('evidence');
});
it('rejects final source revocation or review state changes before returning private material',async()=>{
 m.rebuild.mockResolvedValueOnce(rebuilt()).mockRejectedValueOnce(new Error('source revoked'));
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('revoked');
 m.rebuild.mockResolvedValue(rebuilt());m.evidence.mockResolvedValueOnce(saved()).mockResolvedValueOnce({...saved(),artifactHash:digest('changed')});
 await expect(readSkillProspectiveReviewCase({userId:owner},input)).rejects.toThrow('state changed');
});
it('routes a prospective case through the unified reader and advertises only valid stored references',async()=>{
 expect((await readSkillAcceptanceReview({userId:owner},bundle)).cases[0].materialAvailable).toBe(true);
 expect((await readSkillAcceptanceReviewCase({userId:owner},input)).candidate).toBe('candidate answer');
 expect(m.historical).not.toHaveBeenCalled();expect(m.safety).not.toHaveBeenCalled();
 const missing=saved();missing.artifact.rawReceipts.prospectiveSources={shadow:{...reference(),sourceProjectionHash:'invalid'}};
 m.evidence.mockResolvedValue(missing);expect((await readSkillAcceptanceReview({userId:owner},bundle)).cases[0].materialAvailable).toBe(false);
 const wrongCase=saved();wrongCase.artifact.rawReceipts.prospectiveSources.shadow.caseId='other';
 m.evidence.mockResolvedValue(wrongCase);expect((await readSkillAcceptanceReview({userId:owner},bundle)).cases[0].materialAvailable).toBe(false);
});
