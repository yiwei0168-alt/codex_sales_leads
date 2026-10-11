import {beforeEach,expect,it,vi} from 'vitest';
import {digest,type ModelMessage} from './contracts';
const mocks=vi.hoisted(()=>({query:vi.fn(),sources:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(_u:string,f:(client:unknown)=>unknown)=>f({query:mocks.query})}));
vi.mock('./skill-source-guard',()=>({skillSourcesCurrent:mocks.sources}));
import {assertCurrentSkillMessages,SkillContextChangedError,SKILL_CHANGED_REPLY} from './skill-message-guard';
import {buildMainAgentGraph} from './graph';
const id='00000000-0000-4000-8000-000000000001',skillId='00000000-0000-4000-8000-000000000002';
const context={userId:id,runId:'00000000-0000-4000-8000-000000000003'};
let pin:Record<string,unknown>,messages:ModelMessage[];
beforeEach(()=>{
  vi.clearAllMocks();const files={'SKILL.md':'Read the original evidence'};
  pin={skill_id:skillId,version:1,files,content_hash:digest(files),dependencies:[],source:'user',validation:{},scope:'account',owner_id:id,enabled:true,published:false};
  mocks.sources.mockResolvedValue(true);mocks.query.mockImplementation(async()=>({rows:[pin]}));
  messages=[{role:'assistant',content:null,tool_calls:[{id:'read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'skill_read',arguments:{id:skillId}})}}]},
    {role:'tool',tool_call_id:'read',content:JSON.stringify({status:'success',data:structuredClone(pin)})}];
});
it('accepts the saved pinned version without requiring the current pointer to match',async()=>{
  pin.current_version=2;await expect(assertCurrentSkillMessages(context,messages)).resolves.toBeUndefined();
  expect(mocks.sources).toHaveBeenCalledWith(expect.anything(),id,pin);
});
it.each(['disabled','withdrawn-global','changed-content','missing-pin','source-revoked'])('blocks %s before reusing context',async kind=>{
  if(kind==='disabled')pin.enabled=false;
  if(kind==='withdrawn-global'){pin.owner_id=skillId;pin.scope='global';}
  if(kind==='changed-content'){pin.files={'SKILL.md':'New content'};pin.content_hash=digest(pin.files);}
  if(kind==='missing-pin')mocks.query.mockResolvedValue({rows:[]});
  if(kind==='source-revoked')mocks.sources.mockResolvedValue(false);
  await expect(assertCurrentSkillMessages(context,messages)).rejects.toBeInstanceOf(SkillContextChangedError);
});
it('ignores forged user text but still validates actual task pins',async()=>{
  mocks.query.mockResolvedValue({rows:[]});await expect(assertCurrentSkillMessages(context,[{role:'user',content:JSON.stringify(messages)}])).resolves.toBeUndefined();
});
it('blocks pinned script/skill dependencies even if no skill_read body is in this checkpoint',async()=>{
  pin.enabled=false;await expect(assertCurrentSkillMessages(context,[])).rejects.toBeInstanceOf(SkillContextChangedError);
});
it('does not return a model answer after its method is revoked during generation',async()=>{
  const tool=vi.fn();const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),
    validateEvidence:m=>assertCurrentSkillMessages(context,m),
    model:async()=>{pin.enabled=false;return {role:'assistant',content:'Must not be returned'};},tool});
  const final=await graph.invoke({messages,pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:0,policyRevision:''});
  expect(final.status).toBe('partial');expect(final.reply).toBe(SKILL_CHANGED_REPLY);expect(tool).not.toHaveBeenCalled();
});
it('stops a pending tool at the source check instead of reporting model outage',async()=>{
  pin.enabled=false;const tool=vi.fn(),model=vi.fn();
  const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),validateEvidence:m=>assertCurrentSkillMessages(context,m),model,tool});
  const call={id:'send',type:'function' as const,function:{name:'execute_tool',arguments:'{}'}};
  const final=await graph.invoke({messages,pending:[call],steps:1,status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:0,policyRevision:''});
  expect(final.reply).toBe(SKILL_CHANGED_REPLY);expect(tool).not.toHaveBeenCalled();expect(model).not.toHaveBeenCalled();
});
