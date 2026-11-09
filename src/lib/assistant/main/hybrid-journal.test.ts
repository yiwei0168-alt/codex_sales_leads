import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
const storage=vi.hoisted(()=>({begin:vi.fn(),complete:vi.fn(),boundary:vi.fn(),event:vi.fn()}));
vi.mock('./repository',()=>({beginCall:storage.begin,completeCall:storage.complete,boundary:storage.boundary,event:storage.event,
  assertCurrentInstructions:vi.fn(),LeaseLostError:class extends Error{},InstructionsChangedError:class extends Error{}}));
vi.mock('./knowledge-message-guard',()=>({KnowledgeSourceChangedError:class extends Error{}}));
vi.mock('./memory-message-guard',()=>({MemoryContextChangedError:class extends Error{}}));
import { executeRegisteredTool } from './tool-execution';
import { executeHybridRead } from './hybrid-execution';
import { executeProgrammatic } from './programmatic-execution';
import { defineTool } from './tool-definition';
import { digest, result, type ToolResult } from './contracts';

const context={userId:'owner',runId:'run',leaseToken:'lease',role:'member' as const,mode:'quick' as const};
beforeEach(()=>{
 vi.clearAllMocks();storage.boundary.mockResolvedValue({control:null,instructions:[],execution_kind:'main-agent'});
 const journal=new Map<string,{id:string;hash:string;output?:ToolResult}>();
 storage.begin.mockImplementation(async(c,call)=>{
  const key=`${c.userId}:${c.runId}:${call.key}`,hash=digest(call.input),existing=journal.get(key);
  if(existing){if(existing.hash!==hash)throw Error('identity mismatch');return {...existing,fresh:false};}
  const created={id:randomUUID(),hash};journal.set(key,created);return {...created,fresh:true};
 });
 storage.complete.mockImplementation(async(_c,id,output)=>{for(const row of journal.values())if(row.id===id)row.output=output;});
});
it('uses the existing journal for parent and leaves and does not rerun a completed composite',async()=>{
 const read=vi.fn(async()=>result([{id:'saved'}]));
 const leaf=defineTool({id:'company_read',input:z.object({candidateId:z.string()}).strict(),description:'fixture',execute:read});
 const input={code:`return tools.call('company_read',{candidateId:'one'});`};
 const parent=defineTool({id:'programmatic_read',input:z.object({code:z.string()}),description:'fixture',recovery:'composite',
  execute:(args,c)=>executeHybridRead('interpreter',args,c,{allowed:new Set(['company_read']),validate:async()=>{},
   dispatch:(call,ctx)=>executeRegisteredTool(leaf,JSON.parse(call.function.arguments).arguments,call.id,ctx)})});
 const first=await executeRegisteredTool(parent,input,'parent-key',context);
 const second=await executeRegisteredTool(parent,input,'parent-key',context);
 expect(second).toEqual(first);expect(read).toHaveBeenCalledOnce();expect(storage.complete).toHaveBeenCalledTimes(2);
 expect(storage.boundary).toHaveBeenCalledTimes(3);
 expect(storage.begin.mock.calls.filter(([,call])=>call.tool==='company_read')[0][0]).toMatchObject({userId:'owner',mode:'quick'});
});
it('an existing leaf without a receipt returns unknown and is not silently rerun',async()=>{
 const read=vi.fn(async()=>result('unexpected'));
 const leaf=defineTool({id:'company_read',input:z.object({}),description:'fixture',execute:read});
 storage.begin.mockResolvedValue({id:randomUUID(),fresh:false});
 const out=await executeRegisteredTool(leaf,{},'uncertain',context);
 expect(out.status).toBe('unknown');expect(read).not.toHaveBeenCalled();expect(storage.complete).not.toHaveBeenCalled();
});
it('recovers an unfinished program parent by reusing completed concurrent leaf receipts',async()=>{
 const read=vi.fn(async(i:{query:string})=>result({query:i.query}));
 const leaf=defineTool({id:'search_channel',input:z.object({query:z.string()}),description:'fixture',execute:read});
 const parent=defineTool({id:'programmatic_tools',effect:'reversible',recovery:'composite',input:z.object({code:z.string()}),description:'fixture',
  execute:(args,c)=>executeProgrammatic(args,c,{allowed:new Set(['search_channel']),validate:async()=>{},
   dispatch:(call,ctx)=>executeRegisteredTool(leaf,JSON.parse(call.function.arguments).arguments,call.id,ctx)})});
 const input={code:`return tools.parallel(['one','two','three'].map(query=>({tool:'search_channel',arguments:{query}}))).map(r=>r.data);`};
 const save=storage.complete.getMockImplementation()!;let loseParent=true;
 storage.complete.mockImplementation(async(c,id,output)=>{
  if(loseParent&&output.data?.kind==='hybrid-program-v2'){loseParent=false;throw Error('parent save interrupted');}
  return save(c,id,output);
 });
 const deep={...context,mode:'deep' as const};
 await expect(executeRegisteredTool(parent,input,'program-key',deep)).rejects.toThrow('parent save interrupted');
 const recovered=await executeRegisteredTool(parent,input,'program-key',deep);
 expect(recovered.status).toBe('success');expect(read).toHaveBeenCalledTimes(3);
 expect(storage.begin.mock.calls.filter(([,c])=>c.tool==='search_channel')).toHaveLength(6);
});
