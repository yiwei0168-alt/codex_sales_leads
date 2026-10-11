import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {assertRecordedToolContracts} from './recorded-tool-contracts';
import {defineTool,describeTool} from './tools';
import {result,type ModelMessage} from './contracts';
const execute=vi.fn(async()=>result({}));
const read=defineTool({id:'memory_read',description:'Read fixture',input:z.object({}).strict(),execute});
const admin={...read,id:'admin_read',role:'admin' as const};
const write={...read,id:'policy_save',effect:'publish' as const};
const context={userId:'owner',role:'member' as const,mode:'standard' as const};
const pair=(name:string,args:unknown,data:unknown):ModelMessage[]=>[
 {role:'assistant',content:null,tool_calls:[{id:'1',type:'function',function:{name,arguments:JSON.stringify(args)}}]},
 {role:'tool',tool_call_id:'1',content:JSON.stringify(result(data))},
];
afterEach(()=>{expect(execute).not.toHaveBeenCalled();vi.unstubAllEnvs();});
it('accepts exact current discovery and description metadata without execution',()=>{
 assertRecordedToolContracts(context,pair('discover_tools',{},[{id:read.id,description:read.description,effect:read.effect,cost:read.cost}]),[read]);
 assertRecordedToolContracts(context,pair('describe_tool',{tool:read.id},describeTool(read)),[read]);
 expect(()=>assertRecordedToolContracts(context,pair('describe_tool',{tool:read.id},{...describeTool(read),version:'old'}),[read])).toThrow('metadata changed');
});
it('enforces current role, mode, knowledge scope and feature flag',()=>{
 const check=(ctx:Parameters<typeof assertRecordedToolContracts>[0],tool=read)=>assertRecordedToolContracts(ctx,pair('execute_tool',{tool:tool.id,arguments:{}},{}),[tool]);
 expect(()=>check(context,admin)).toThrow('accessible');
 expect(()=>check({...context,mode:'quick'},{...read,id:'skill_read'})).toThrow('accessible');
 expect(()=>check({...context,knowledgeScope:['product']})).toThrow('accessible');
 vi.stubEnv('ENABLE_VECTORLESS_AGENT_SHADOW','0');expect(()=>check(context,{...read,id:'vectorless_read'})).toThrow('accessible');
});
it('rejects effects, injected identity and orphan outputs',()=>{
 expect(()=>assertRecordedToolContracts(context,pair('execute_tool',{tool:write.id,arguments:{}},{}),[write])).toThrow('adapter');
 expect(()=>assertRecordedToolContracts(context,pair('execute_tool',{tool:read.id,arguments:{userId:'other'}},{}),[read])).toThrow();
 expect(()=>assertRecordedToolContracts(context,pair('execute_tool',{tool:read.id,arguments:{}},{ }).slice(1),[read])).toThrow('preceding');
});
it('validates permitted arguments but never calls the business tool',()=>{
 assertRecordedToolContracts(context,pair('execute_tool',{tool:read.id,arguments:{}},{}),[read]);
});
