import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
const mocks=vi.hoisted(()=>({query:vi.fn(),guard:vi.fn(),sources:vi.fn(),generate:vi.fn(),generateAgent:vi.fn(),close:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(_u:string,f:(client:unknown)=>unknown)=>f({query:mocks.query})}));
vi.mock('./skill-source-guard',()=>({skillSourcesCurrent:mocks.sources}));
vi.mock('./knowledge-message-guard',()=>({assertCurrentKnowledgeMessages:mocks.guard}));
vi.mock('./skill-replay-local',()=>({localReplayModel:async()=>({generate:mocks.generate,generateAgent:mocks.generateAgent,close:mocks.close})}));
import {prepareHistoricalSkillReplay,runHistoricalSkillReplay} from './skill-replay-snapshot';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={userId:id(1)},input={skillId:id(2),version:1,runIds:[id(3)]};
let version:Record<string,unknown>,run:Record<string,unknown>,calls:Array<Record<string,unknown>>;
beforeEach(()=>{
  vi.clearAllMocks();mocks.sources.mockResolvedValue(true);mocks.guard.mockResolvedValue(undefined);mocks.generate.mockResolvedValue({kind:'answer',text:'Synthetic answer'});
  mocks.generateAgent.mockResolvedValue({role:'assistant',content:'Synthetic native answer'});
  const files={'SKILL.md':'Check original evidence.'};
  version={files,content_hash:digest(files),dependencies:[],source:'user',validation:{},scope:'account',owner_id:context.userId};
  run={content:'How many ports?',message_id:id(4),input:{content:'How many ports?'}};
  const args={question:'ports'};
  calls=[{id:id(5),tool_id:'knowledge_search',tool_version:'1',effect:'read',status:'completed',input:args,input_hash:digest(args),
    output:{status:'success',data:[{id:id(6),content:'Two ports'}]}}];
  mocks.query.mockImplementation(async(sql:string)=>({rows:sql.includes('from agent_skill')?[version]:sql.includes('from agent_run r')?[run]:calls}));
});
it('binds owned saved messages and receipts to a historical suite and checks current sources',async()=>{
  const snapshot=await prepareHistoricalSkillReplay(context,input);
  expect(snapshot.suite.cases[0]).toMatchObject({provenance:'historical',category:'replay',sourceRunId:id(3)});
  expect(snapshot.bindings[0].calls[0].id).toBe(id(5));expect(mocks.guard).toHaveBeenCalledWith(context.userId,expect.any(Array),undefined);
});
it.each(['effect','version','hash','status','unsupported','empty','oversized'] as const)('rejects %s receipt sets',async kind=>{
  if(kind==='effect')calls[0].effect='send';if(kind==='version')calls[0].tool_version='2';if(kind==='hash')calls[0].input_hash='wrong';
  if(kind==='status')calls[0].status='started';if(kind==='unsupported')calls[0].tool_id='mail_read';
  if(kind==='empty')calls=[];if(kind==='oversized')calls=Array(25).fill(calls[0]);
  await expect(prepareHistoricalSkillReplay(context,input)).rejects.toThrow();expect(mocks.generate).not.toHaveBeenCalled();
});
it('rejects source-message mismatch, missing evidence and revoked skill sources',async()=>{
  run.content='Changed';await expect(prepareHistoricalSkillReplay(context,input)).rejects.toThrow('source changed');
  run.content='How many ports?';calls[0].output={status:'success',data:[]};await expect(prepareHistoricalSkillReplay(context,input)).rejects.toThrow();
  mocks.sources.mockResolvedValue(false);await expect(prepareHistoricalSkillReplay(context,input)).rejects.toThrow('Skill snapshot');
});
it('never generates if current evidence is unavailable',async()=>{
  mocks.guard.mockRejectedValue(new Error('revoked'));
  await expect(runHistoricalSkillReplay(context,input,async()=>{},async()=>{})).rejects.toThrow('revoked');
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('discards model output if a source is revoked during generation and closes local transport',async()=>{
  mocks.generate.mockImplementation(async()=>{mocks.guard.mockRejectedValue(new Error('revoked'));return {kind:'answer',text:'Must not persist'};});
  const persist=vi.fn(async()=>{});
  await expect(runHistoricalSkillReplay(context,input,async()=>{},persist)).rejects.toThrow('snapshot changed');
  expect(mocks.generate).toHaveBeenCalledTimes(1);expect(persist).not.toHaveBeenCalled();expect(mocks.close).toHaveBeenCalled();
});
it('rejects changed receipt hashes between manifest and first model call',async()=>{
  await expect(runHistoricalSkillReplay(context,input,async()=>{calls[0].output={status:'success',data:[{id:id(6),content:'Changed evidence'}]};},async()=>{})).rejects.toThrow('snapshot changed');
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('persists an unchanged pair as pending review with no activation',async()=>{
  const persist=vi.fn(async()=>{}),result=await runHistoricalSkillReplay(context,input,async()=>{},persist);
  expect(persist).toHaveBeenCalledTimes(1);expect(result.autoEnable).toBe(false);expect(result.productionAgentEquivalent).toBe(false);
  expect(mocks.guard.mock.calls.length).toBeGreaterThanOrEqual(7);
});
it('routes the explicit graph engine through the native message adapter and source checks',async()=>{
  const persist=vi.fn(async()=>{}),output=await runHistoricalSkillReplay(context,input,async()=>{},persist,'main-graph');
  expect(output).toMatchObject({productionGraphReused:true,productionAgentEquivalent:false});
  expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.generateAgent).toHaveBeenCalledTimes(2);expect(persist).toHaveBeenCalledTimes(1);
});
it('binds main model receipts without exposing them as replay evidence',async()=>{
  const input={messages:[{role:'user',content:'Historical context'}],profile:{version:'mode-v1'}};
  calls.push({id:id(7),tool_id:'main_model',tool_version:'mode-v1',effect:'model',status:'completed',
    input,input_hash:digest(input),output:{status:'success',data:{value:'historical output'}}});
  const snapshot=await prepareHistoricalSkillReplay(context,{skillId:id(2),version:1,runIds:[id(3)]});
  expect(snapshot.suite.cases[0].receipts).toHaveLength(1);
  expect(snapshot.bindings[0].calls).toHaveLength(2);
  expect(snapshot.bindings[0].calls[1].effect).toBe('model');
  calls[1].input_hash='invalid';
  await expect(prepareHistoricalSkillReplay(context,{skillId:id(2),version:1,runIds:[id(3)]})).rejects.toThrow('model receipt invalid');
});
