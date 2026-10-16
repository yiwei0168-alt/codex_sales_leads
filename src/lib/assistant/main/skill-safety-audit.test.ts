import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import type {SkillCandidateCollector} from './skill-candidate-model';
const m=vi.hoisted(()=>({prepare:vi.fn(),validate:vi.fn(),read:vi.fn(),audit:vi.fn(),run:vi.fn(),used:undefined as unknown,reply:'Synthetic reply'}));
vi.mock('./skill-safety-candidate',()=>({prepareSkillSafetyCandidate:m.prepare,requireSkillSafetyBinding:m.validate}));
vi.mock('./skill-candidate-audit',()=>({readSkillCandidateJournal:m.read,prepareSkillModelJournalAudit:m.audit}));
vi.mock('./skill-candidate-runner',()=>({runSkillCandidateArm:m.run}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
import {auditSkillSafetyArm} from './skill-safety-audit';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',hash=digest('synthetic');
const frozen={freezeId:id,plan:{} as NonNullable<SkillCandidateCollector['frozen']>['plan']};
const selection={runId:id,skillId:id,version:1,caseId:'safety-ambiguous',evaluationId:id};
beforeEach(()=>{
 vi.clearAllMocks();m.used=true;m.reply='Synthetic reply';
 const row={step:0,route_index:0,input:{messages:[],profile:{},index:0},started_at:'2026-10-16T00:01:00Z',completed_at:'2026-10-16T00:02:00Z'};
 m.prepare.mockResolvedValue({sourceHash:hash,inputHash:hash,modelConfigHash:hash,caseId:selection.caseId,category:'negative',provenance:'safety-fixture',snapshot:{initialMessages:[{role:'user',content:'Synthetic question'}],receipts:[]}});
 m.validate.mockResolvedValue(undefined);m.read.mockResolvedValue([row]);
 m.audit.mockReturnValue({freezeId:id,snapshotHash:hash,sourceKind:'synthetic-fixture',ordered:[row],journalHash:hash,
  selected:[{row,message:{role:'assistant',content:'Synthetic reply'},request:{selectedRoute:{model:'synthetic'},originalResponse:{model:'synthetic',provider:'synthetic'},body:{tools:[]}}}]});
 m.run.mockImplementation(async(_snapshot,_arm,model)=>{
  await model({step:0,messages:[],profile:{}});
  return {status:'completed',stopReason:null,candidateSkillUsed:m.used,businessToolExecutions:0,reply:m.reply,trace:[]};
 });
});
it('accepts reconstructed candidate usage without granting quality or activation',async()=>{
 const result=await auditSkillSafetyArm({userId:owner},{...selection,arm:'candidate'},frozen);
 expect(result).toMatchObject({candidateSkillUsed:true,automaticActivation:false,productionAgentEquivalent:false});
 expect(result.projection.state).toBe('completed');
});
it.each([false,undefined,'true'])('rejects candidate usage flag %s despite a completed graph',async used=>{
 m.used=used;await expect(auditSkillSafetyArm({userId:owner},{...selection,arm:'candidate'},frozen)).rejects.toThrow('did not read the fixed Skill');
});
it('does not treat an answer claiming usage as graph evidence',async()=>{
 m.used=false;m.reply='I read and followed the fixed Skill.';
 await expect(auditSkillSafetyArm({userId:owner},{...selection,arm:'candidate'},frozen)).rejects.toThrow('did not read');
});
it('keeps baseline eligible without reading the candidate method',async()=>{
 m.used=false;expect(await auditSkillSafetyArm({userId:owner},{...selection,arm:'baseline'},frozen)).toMatchObject({candidateSkillUsed:false,automaticActivation:false});
});
