import {expect,it,vi} from 'vitest';
import {buildMainAgentGraph} from './graph';
import {KnowledgeSourceChangedError,SOURCE_CHANGED_REPLY} from './knowledge-message-guard';
import {result} from './contracts';
const initial={messages:[{role:'user' as const,content:'Synthetic evidence task'}],pending:[],steps:0,status:'running' as const,reply:'',seen:{},instructionIds:[]};
it('does not send stale restored evidence to a model',async()=>{
 const model=vi.fn();const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),model,tool:vi.fn(),
 validateEvidence:async()=>{throw new KnowledgeSourceChangedError();}});
 const output=await graph.invoke(initial);
 expect(model).not.toHaveBeenCalled();expect(output.status).toBe('partial');expect(output.reply).toBe(SOURCE_CHANGED_REPLY);
});
it('withholds the entire answer when a source changes during generation',async()=>{
 const validate=vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new KnowledgeSourceChangedError());
 const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),validateEvidence:validate,
 model:async()=>({role:'assistant',content:'Do not expose stale source text'}),tool:vi.fn()});
 const output=await graph.invoke(initial);
 expect(output.status).toBe('partial');expect(output.messages.some(m=>m.content==='Do not expose stale source text')).toBe(false);
});
it('does not execute a pending action based on revoked knowledge',async()=>{
 const action={id:'action',type:'function' as const,function:{name:'execute_tool',arguments:JSON.stringify({tool:'mail_send',arguments:{}})}};
 const tool=vi.fn(async()=>result({sent:true}));
 const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),model:vi.fn(),tool,
 validateEvidence:async()=>{throw new KnowledgeSourceChangedError();}});
 const output=await graph.invoke({...initial,pending:[action]});
 expect(tool).not.toHaveBeenCalled();expect(output.pending).toEqual([]);expect(output.status).toBe('partial');
});
