import {beforeEach,expect,it,vi} from 'vitest';
import type {ModelMessage} from './contracts';
import {decisionMemoryMessage} from './decision-memory-message';
const mocks=vi.hoisted(()=>({receipts:vi.fn(),load:vi.fn(),revalidate:vi.fn(),decision:vi.fn(),skill:vi.fn(),memory:vi.fn(),knowledge:vi.fn(),private:vi.fn()}));
vi.mock('./recorded-evidence-receipts',()=>({loadRecordedEvidenceReceipts:mocks.receipts}));
vi.mock('./model-request-source',()=>({loadRecordedModeRequest:mocks.load,revalidateRecordedModeRequest:mocks.revalidate}));
vi.mock('./memory-context',async importOriginal=>({...await importOriginal<typeof import('./memory-context')>(),loadDecisionMemory:mocks.decision}));
vi.mock('./skill-message-guard',()=>({assertCurrentSkillMessages:mocks.skill}));
vi.mock('./memory-message-guard',()=>({assertCurrentMemoryMessages:mocks.memory}));
vi.mock('./knowledge-message-guard',()=>({assertCurrentKnowledgeMessages:mocks.knowledge}));
vi.mock('./private-replay-guard',()=>({assertCurrentPrivateReplayMessages:mocks.private}));
import {assertRecordedEvidencePairs,validateRecordedRequestEvidence} from './model-request-evidence';
const context={userId:'owner'},selection={runId:'run',callId:'call'};
const pair=(tool='memory_read'):ModelMessage[]=>[
 {role:'assistant',content:null,tool_calls:[{id:'tool-1',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool,arguments:{}})}}]},
 {role:'tool',tool_call_id:'tool-1',content:JSON.stringify({status:'success',data:{synthetic:true}})},
];
beforeEach(()=>{
 for(const mock of Object.values(mocks))mock.mockReset();
 mocks.load.mockResolvedValue({body:{messages:[{role:'system',content:'Instructions'},decisionMemoryMessage([]),...pair()]},sourceHash:'bound',profile:{mode:'standard'},accountRole:'member',knowledgeScope:undefined,serverProvenanceVerified:true});
 mocks.decision.mockResolvedValue([]);mocks.receipts.mockResolvedValue({receiptHash:'bound-receipts',receipts:[]});
});
it('passes owner, original run and scope to guards, then rereads provenance without granting execution',async()=>{
 const result=await validateRecordedRequestEvidence(context,selection);
 expect(mocks.skill).toHaveBeenCalledWith({userId:'owner',runId:'run'},result.body.messages);
 expect(mocks.knowledge).toHaveBeenCalledWith('owner',result.body.messages,undefined);
 expect(mocks.memory).toHaveBeenCalledWith('owner',result.body.messages);
 expect(mocks.private).toHaveBeenCalledWith('owner',result.body.messages);
 expect(mocks.revalidate).toHaveBeenCalledWith(context,selection,'bound');
 expect(mocks.revalidate.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.private.mock.invocationCallOrder[0]);
 expect(result).toMatchObject({evidenceSnapshotRevalidated:true,sourcePermissionsRevalidated:false,executionAuthorized:false,qualityAccepted:false});
});
it.each(['skill','memory','knowledge','private','revalidate','receipts'] as const)('fails closed when %s changes or is unavailable',async name=>{
 mocks[name].mockRejectedValue(new Error('Changed source'));
 await expect(validateRecordedRequestEvidence(context,selection)).rejects.toThrow('Changed source');
});
it('rejects changed decision memory before evaluating other sources',async()=>{
 mocks.decision.mockResolvedValue([{content:'New policy'}]);
 await expect(validateRecordedRequestEvidence(context,selection)).rejects.toThrow('changed');expect(mocks.skill).not.toHaveBeenCalled();
});
it('rejects unsupported business tools while leaving metadata to the contract validator',()=>{
 expect(()=>assertRecordedEvidencePairs(pair('mail_send'))).toThrow('unsupported');
 const messages=pair();messages[0].tool_calls![0].function.name='describe_tool';
 expect(()=>assertRecordedEvidencePairs(messages)).not.toThrow();
});
it('requires ordered, complete, unique pairs and successful data',()=>{
 const messages=pair();
 for(const broken of [[messages[1]],[messages[0]],[messages[1],messages[0]],[...messages,...messages],
  [messages[0],{role:'user' as const,content:'interrupt'},messages[1]],
  [messages[0],{...messages[1],content:'{"status":"error","data":{}}'}],
  [messages[0],{...messages[1],content:'{"status":"success"}'}]])expect(()=>assertRecordedEvidencePairs(broken)).toThrow();
 expect(()=>assertRecordedEvidencePairs(messages)).not.toThrow();
});

it('rejects receipt changes during evidence checks',async()=>{
 mocks.receipts.mockResolvedValueOnce({receiptHash:'before'}).mockResolvedValueOnce({receiptHash:'after'});
 await expect(validateRecordedRequestEvidence(context,selection)).rejects.toThrow('receipts changed');
});
